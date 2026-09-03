/**
 * Owns the renderer, camera, controls and animation loop. Reads the zustand store directly every
 * frame; React never re-renders the canvas. Everything orbital lives under `inertial` (see frame.ts).
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TWO_PI } from '../core/constants'
import { getBody } from '../data/bodies'
import { keplerPathSamples, keplerStateAt } from '../propagation/keplerPropagator'
import { gmst, satrecFor, sgp4PathSamples, sgp4Period, sgp4StateAt } from '../propagation/sgp4Propagator'
import { epochMs, isRenderable, useStore, type AppState } from '../store/store'
import type { CentralBody, Satellite, Vec3 } from '../types'
import { InertialAxes } from './AxesHelper'
import { CentralBodyMesh } from './CentralBodyMesh'
import { kmScalarToScene, kmToScene, makeInertialGroup } from './frame'
import { OrbitPath } from './OrbitPath'
import { SatelliteMarker } from './SatelliteMarker'

interface SatVisual {
  key: string
  path: OrbitPath
  marker: SatelliteMarker
  /** For TLE satellites: simulated time (s) at which the one-period path starts. */
  pathT0: number
}

export class SceneManager {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly inertial = makeInertialGroup()
  private readonly bodyMesh = new CentralBodyMesh()
  private readonly axes = new InertialAxes()
  private readonly visuals = new Map<string, SatVisual>()
  private readonly resizeObserver: ResizeObserver
  private raf = 0
  private lastNow = 0
  private bodyId = ''
  private lastCameraSeq = 0
  private disposed = false
  private readonly container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x06080d, 1)
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2e7)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.zoomSpeed = 0.8

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(1, 0.4, 0.6)
    this.scene.add(sun)
    this.scene.add(makeStarfield())

    this.inertial.add(this.bodyMesh.group)
    this.inertial.add(this.axes.group)
    this.scene.add(this.inertial)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()

    this.syncBody(useStore.getState())
    this.frameBody(getBody(useStore.getState().scenario.bodyId))
    this.lastNow = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  private resize(): void {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private readonly tick = (now: number): void => {
    if (this.disposed) return
    const dt = Math.min(now - this.lastNow, 100)
    this.lastNow = now
    const s = useStore.getState()

    if (s.playing) {
      let t = s.t + (dt / 1000) * s.scenario.rate
      const span = s.scenario.spanSeconds
      if (span > 0 && t > span) t = t % span
      s.setT(t)
    }
    const state = useStore.getState()
    this.syncBody(state)
    this.syncSatellites(state)
    this.handleCameraRequest(state)

    this.axes.group.visible = state.showAxes
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.raf = requestAnimationFrame(this.tick)
  }

  private syncBody(s: AppState): void {
    const body = getBody(s.scenario.bodyId)
    if (this.bodyId !== body.id) {
      this.bodyId = body.id
      this.bodyMesh.setBody(body)
      this.axes.setLength(kmScalarToScene(body.radius * 1.8))
      const R = kmScalarToScene(body.radius)
      this.controls.minDistance = R * 1.08
      this.controls.maxDistance = kmScalarToScene(body.frameDistance) * 60
      this.camera.near = R * 0.01
      this.camera.updateProjectionMatrix()
      for (const v of this.visuals.values()) v.key = '' // force path rebuild in the new field
    }
    const date = new Date(epochMs(s) + s.t * 1000)
    const spin = body.id === 'earth' ? gmst(date) : (TWO_PI * s.t) / body.rotationPeriod
    this.bodyMesh.setSpin(spin)
  }

  private syncSatellites(s: AppState): void {
    const body = getBody(s.scenario.bodyId)
    const live = new Set<string>()
    const anySelected = s.selectedId !== null
    const date = new Date(epochMs(s) + s.t * 1000)

    for (const sat of s.scenario.satellites) {
      if (!isRenderable(sat, body.id)) continue
      live.add(sat.id)
      let v = this.visuals.get(sat.id)
      const key = visualKey(sat, body.id)
      if (v && v.key !== key && v.key !== '') {
        this.removeVisual(sat.id)
        v = undefined
      }
      if (!v) {
        v = { key, path: new OrbitPath(sat.color), marker: new SatelliteMarker(sat.name, sat.color), pathT0: s.t }
        this.inertial.add(v.path.line)
        this.inertial.add(v.marker.group)
        this.visuals.set(sat.id, v)
        this.rebuildPath(v, sat, body, s.t, date)
      } else if (v.key === '') {
        v.key = key
        this.rebuildPath(v, sat, body, s.t, date)
      }

      const pos = this.positionOf(sat, body, s.t, date)
      if (pos) {
        v.marker.group.visible = true
        v.marker.setPosition(kmToScene(pos))
      } else {
        v.marker.group.visible = false
      }
      if (sat.kind === 'tle') {
        const rec = satrecFor(sat)
        if (rec) {
          const T = sgp4Period(rec)
          if (Math.abs(s.t - v.pathT0) > T * 0.5) this.rebuildPath(v, sat, body, s.t, date)
        }
      }
      const selected = sat.id === s.selectedId
      v.path.setEmphasis(selected, anySelected)
      v.marker.setEmphasis(selected, anySelected)
      v.marker.setLabelVisible(s.showLabels)
      const worldPos = v.marker.group.getWorldPosition(new THREE.Vector3())
      v.marker.updateLabelScale(
        this.camera.position.distanceTo(worldPos), this.container.clientHeight || 1,
        (this.camera.fov * Math.PI) / 180,
      )
    }
    for (const id of [...this.visuals.keys()]) if (!live.has(id)) this.removeVisual(id)
  }

  private positionOf(sat: Satellite, body: CentralBody, t: number, date: Date): Vec3 | null {
    if (sat.kind === 'kepler') return keplerStateAt(sat, body, t).r
    const rec = satrecFor(sat)
    if (!rec) return null
    return sgp4StateAt(rec, date)?.r ?? null
  }

  private rebuildPath(v: SatVisual, sat: Satellite, body: CentralBody, t: number, date: Date): void {
    if (sat.kind === 'kepler') {
      v.path.setPoints(keplerPathSamples(sat.elements, body.mu, 360))
    } else {
      const rec = satrecFor(sat)
      v.path.setPoints(rec ? sgp4PathSamples(rec, date, 240) : [])
      v.pathT0 = t
    }
    v.path.setColor(sat.color)
  }

  private removeVisual(id: string): void {
    const v = this.visuals.get(id)
    if (!v) return
    this.inertial.remove(v.path.line)
    this.inertial.remove(v.marker.group)
    v.path.dispose()
    v.marker.dispose()
    this.visuals.delete(id)
  }

  private handleCameraRequest(s: AppState): void {
    const req = s.cameraRequest
    if (!req || req.seq === this.lastCameraSeq) return
    this.lastCameraSeq = req.seq
    const body = getBody(s.scenario.bodyId)
    if (req.kind === 'body' || req.kind === 'reset') {
      this.frameBody(body)
    } else if (req.kind === 'orbit') {
      const v = s.selectedId ? this.visuals.get(s.selectedId) : undefined
      const sphere = v?.path.boundingSphere()
      if (!v || !sphere) {
        this.frameBody(body)
        return
      }
      const sat = s.scenario.satellites.find((x) => x.id === s.selectedId)
      this.frameSphere(sphere, sat)
    }
  }

  private frameBody(body: CentralBody): void {
    const d = kmScalarToScene(body.frameDistance)
    this.controls.target.set(0, 0, 0)
    this.camera.position.set(d * 0.55, d * 0.45, d * 0.7)
    this.camera.lookAt(0, 0, 0)
    this.controls.update()
  }

  /** Frame a bounding sphere (in inertial-local coordinates), viewing from above the orbit plane. */
  private frameSphere(sphere: THREE.Sphere, sat?: Satellite): void {
    const center = this.inertial.localToWorld(sphere.center.clone())
    const fov = (this.camera.fov * Math.PI) / 180
    const dist = (sphere.radius * 1.25) / Math.sin(fov / 2)
    let dir = new THREE.Vector3(0.5, 0.6, 0.65)
    if (sat?.kind === 'kepler') {
      // Angular momentum direction in the inertial frame, then into world coordinates.
      const { i, raan } = sat.elements
      const h = new THREE.Vector3(Math.sin(raan) * Math.sin(i), -Math.cos(raan) * Math.sin(i), Math.cos(i))
      dir = h.applyQuaternion(this.inertial.quaternion).add(new THREE.Vector3(0.35, 0.15, 0.3)).normalize()
    }
    this.controls.target.copy(center)
    this.camera.position.copy(center).add(dir.multiplyScalar(dist))
    this.camera.lookAt(center)
    this.controls.update()
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    for (const id of [...this.visuals.keys()]) this.removeVisual(id)
    this.bodyMesh.dispose()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

function visualKey(sat: Satellite, bodyId: string): string {
  return sat.kind === 'kepler'
    ? `${bodyId}|${sat.color}|${sat.name}|${JSON.stringify(sat.elements)}`
    : `${bodyId}|${sat.color}|${sat.name}|${sat.line1}|${sat.line2}`
}

function makeStarfield(): THREE.Points {
  const n = 2500
  const arr = new Float32Array(n * 3)
  const R = 5e6
  for (let k = 0; k < n; k++) {
    const u = Math.random() * 2 - 1
    const phi = Math.random() * TWO_PI
    const s = Math.sqrt(1 - u * u)
    arr[k * 3] = R * s * Math.cos(phi)
    arr[k * 3 + 1] = R * s * Math.sin(phi)
    arr[k * 3 + 2] = R * u
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
  const mat = new THREE.PointsMaterial({ color: 0x9fb3c8, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7 })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  return pts
}
