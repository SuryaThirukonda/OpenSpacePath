/**
 * Owns the renderer, camera, controls and animation loop. Reads the zustand store directly every
 * frame; React never re-renders the canvas. Everything orbital lives under `inertial` (see frame.ts).
 *
 * The view is centred on the part of the window the panels leave free (a camera view offset), the
 * framing buttons fly the camera there instead of jumping, objects can be picked with the mouse,
 * and every label goes through one screen-space layout pass (labels.ts) once the camera is final.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TWO_PI } from '../core/constants'
import { advanceTime } from '../core/time'
import { getBody } from '../data/bodies'
import { keplerPathSamples, keplerStateAt } from '../propagation/keplerPropagator'
import { gmst, satrecFor, sgp4PathSamples, sgp4Period, sgp4StateAt } from '../propagation/sgp4Propagator'
import { flattenPlan, shipStateAt, type FlatPlan, type ShipState } from '../mission/state'
import type { MissionPlan } from '../mission/types'
import { epochMs, isRenderable, useStore, type AppState, type CameraMode } from '../store/store'
import type { CentralBody, Satellite, StateVector } from '../types'
import { ascentFrame, ascentHeading, type AscentFrame } from './ascent'
import { InertialAxes } from './AxesHelper'
import { BurnEffect } from './BurnEffect'
import { birdsEyePose, chaseDistanceKm, chasePose, chaseUp, perpendicular } from './cameraViews'
import { MissionPath } from './MissionPath'
import { ShipMarker } from './ShipMarker'
import { CentralBodyMesh } from './CentralBodyMesh'
import { kmScalarToScene, kmToScene, makeInertialGroup } from './frame'
import { LabelLayout, occludedBySphere, type LabelItem } from './labels'
import { OrbitPath } from './OrbitPath'
import { companionReach } from './models'
import { SatelliteMarker } from './SatelliteMarker'

interface SatVisual {
  key: string
  path: OrbitPath
  marker: SatelliteMarker
  /** For TLE satellites: simulated time (s) at which the one-period path starts. */
  pathT0: number
  /** wall time of the last path rebuild, so a fast clock does not rebuild a TLE path every frame */
  builtAt: number
}

/** Visual keys by satellite record: records are immutable, so the key is worked out once per record, not per frame. */
const keyCache = new WeakMap<Satellite, string>()

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

  // mission visuals
  private readonly missionPath = new MissionPath()
  private readonly burnEffect = new BurnEffect()
  private ship: ShipMarker | null = null
  private flat: FlatPlan | null = null
  private planRef: MissionPlan | null = null
  private firedBurns = new Set<string>()
  private prevT = Number.NaN
  private prevKind: ShipState['kind'] | null = null
  private followLeg = -1

  // camera views: in chase and bird's-eye the scene owns the camera and OrbitControls stand down
  private managedCamera = false
  private lastMode: CameraMode = 'follow'
  private viewZoom = 1
  private readonly chaseF = new THREE.Vector3()
  private readonly chaseU = new THREE.Vector3()
  private chaseReady = false
  private readonly birdTarget = new THREE.Vector3()
  private birdReady = false
  /** pixels of the viewport covered by panels on each side, measured from the DOM a few times a second */
  private insets = { left: 0, right: 0, top: 0, bottom: 0 }
  private insetAt = -Infinity
  /** the view offset in use (px), eased toward the centre of the free area */
  private readonly shift = new THREE.Vector2()
  private shiftReady = false
  /** a framing move in progress: the camera flies there instead of jumping */
  private flight: { from: THREE.Vector3; fromTarget: THREE.Vector3; fromUp: THREE.Vector3; to: THREE.Vector3; toTarget: THREE.Vector3; t0: number; dur: number } | null = null
  private readonly labelLayout = new LabelLayout()
  private readonly labelItems: LabelItem[] = []
  private ascentRef: AscentFrame | null = null
  private pointerDown: { x: number; y: number; t: number; button: number } | null = null
  private hover: { x: number; y: number } | null = null
  /** the satellite or asteroid under the pointer: its orbit brightens and its name shows */
  private hoverId: string | null = null
  /** In a close view, the satellite the ship is heading for and the ship's size on screen. */
  private companionId: string | null = null
  /** the body the ship is with or heading for; the other orbits are drawn quietly while a route is shown */
  private focusId: string | null = null
  private readonly aim = new THREE.Vector3()
  private readonly upRef = new THREE.Vector3()
  private shipPixelsPerUnit = 0
  private readonly scratch = new THREE.Vector3()
  private readonly scratch2 = new THREE.Vector3()
  private readonly scratchV = new THREE.Vector3()
  private readonly starfield: THREE.Points
  private readonly sunLight: THREE.DirectionalLight
  private readonly sunPoint: THREE.PointLight
  private lastNormal: THREE.Vector3 | null = null
  private shipName = ''

  constructor(container: HTMLElement) {
    this.container = container
    // a logarithmic depth buffer: the scene spans metres-scale models to astronomical units, and with a
    // linear one the coastlines, the grid and the ship's thin shells fight each other at distance
    // and a stencil buffer, so a translucent line draws each pixel once (lines.ts drawOnce)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', logarithmicDepthBuffer: true, stencil: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(0x06080d, 1)
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2e7)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.zoomSpeed = 0.8
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: true })
    // the user takes the camera back from a framing move by touching the controls
    this.controls.addEventListener('start', this.onControlsStart)
    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerleave', this.onPointerLeave)
    el.addEventListener('dblclick', this.onDoubleClick)

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35))
    // around a planet the light comes from far away in a fixed direction; around the Sun it comes from the Sun
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.6)
    this.sunLight.position.set(1, 0.4, 0.6)
    this.scene.add(this.sunLight)
    this.sunPoint = new THREE.PointLight(0xffffff, 2.2, 0, 0)
    this.sunPoint.visible = false
    this.scene.add(this.sunPoint)
    this.starfield = makeStarfield()
    this.scene.add(this.starfield)

    this.inertial.add(this.bodyMesh.group)
    this.inertial.add(this.axes.group)
    this.inertial.add(this.missionPath.group)
    this.inertial.add(this.burnEffect.group)
    this.scene.add(this.inertial)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()

    this.syncBody(useStore.getState())
    this.frameBody(getBody(useStore.getState().scenario.bodyId), false)
    this.lastNow = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  /** In the managed views the wheel moves the camera closer or further instead of driving OrbitControls. */
  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.managedCamera) return
    this.viewZoom = Math.min(6, Math.max(0.4, this.viewZoom * Math.exp(e.deltaY * 0.0012)))
  }

  private readonly onControlsStart = (): void => {
    this.flight = null
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button }
  }

  /**
   * A click (a press and release without a drag) on a satellite, an asteroid or its label selects
   * it; a click on empty space clears the selection.
   */
  private readonly onPointerUp = (e: PointerEvent): void => {
    const d = this.pointerDown
    this.pointerDown = null
    if (!d || d.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 600) return
    const id = this.pickAt(e.clientX, e.clientY)
    const s = useStore.getState()
    if (id) s.select(id)
    else if (s.selectedId !== null) s.select(null)
  }

  /** A double click on one selects it and flies to its orbit. */
  private readonly onDoubleClick = (e: MouseEvent): void => {
    const id = this.pickAt(e.clientX, e.clientY)
    if (!id) return
    const s = useStore.getState()
    s.select(id)
    s.requestCamera('orbit')
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    this.hover = this.pointerDown ? null : { x: e.clientX, y: e.clientY }
  }

  private readonly onPointerLeave = (): void => {
    this.hover = null
    this.hoverId = null
    this.renderer.domElement.style.cursor = ''
  }

  /** The satellite or asteroid under a point of the window: its label, or its marker within a few pixels. */
  private pickAt(clientX: number, clientY: number): string | null {
    const box = this.container.getBoundingClientRect()
    const x = clientX - box.left
    const y = clientY - box.top
    for (const p of this.labelLayout.placed) {
      if (p.item.pick && x >= p.rect.left && x <= p.rect.right && y >= p.rect.top && y <= p.rect.bottom) return p.item.pick
    }
    const w = box.width || 1
    const h = box.height || 1
    const body = getBody(useStore.getState().scenario.bodyId)
    const R = kmScalarToScene(body.radius) * (1 - (body.flattening ?? 0)) * 0.995
    const eye = this.camera.position
    let best: string | null = null
    let bestD = 18
    for (const [id, v] of this.visuals) {
      if (!v.marker.group.visible) continue
      const world = v.marker.group.getWorldPosition(this.scratch)
      if (occludedBySphere(eye, world, ORIGIN, R)) continue
      const p = world.project(this.camera)
      if (p.z > 1) continue
      const d = Math.hypot(((p.x + 1) / 2) * w - x, ((1 - p.y) / 2) * h - y)
      if (d < bestD) {
        bestD = d
        best = id
      }
    }
    return best
  }

  /**
   * Pixels of the viewport covered by the panels on each side. A panel spanning most of the width
   * covers the top or the bottom (the timeline, and the sheets on a phone); one spanning much of the
   * height covers the left or the right (the side panels); small ones (the toolbar, a collapsed tab)
   * cover nothing that matters. Measured from the DOM a few times a second, since the panels
   * collapse, wrap and resize on their own.
   */
  private measureInsets(nowMs: number): { left: number; right: number; top: number; bottom: number } {
    if (nowMs - this.insetAt < 250) return this.insets
    this.insetAt = nowMs
    const box = this.container.getBoundingClientRect()
    const ins = { left: 0, right: 0, top: 0, bottom: 0 }
    if (box.width > 0 && box.height > 0) {
      for (const el of document.querySelectorAll('.panel')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const cx = (r.left + r.right) / 2 - box.left
        const cy = (r.top + r.bottom) / 2 - box.top
        if (r.width > box.width * 0.6) {
          if (cy > box.height / 2) ins.bottom = Math.max(ins.bottom, box.bottom - r.top)
          else ins.top = Math.max(ins.top, r.bottom - box.top)
        } else if (r.height > box.height * 0.4) {
          if (cx < box.width / 2) ins.left = Math.max(ins.left, r.right - box.left)
          else ins.right = Math.max(ins.right, box.right - r.left)
        }
      }
      // at least 45% of each side stays free
      const sx = Math.min(1, (box.width * 0.55) / Math.max(1, ins.left + ins.right))
      const sy = Math.min(1, (box.height * 0.55) / Math.max(1, ins.top + ins.bottom))
      ins.left *= sx; ins.right *= sx; ins.top *= sy; ins.bottom *= sy
    }
    this.insets = ins
    return ins
  }

  /**
   * Centre the view on the free part of the window: a view offset moves the picture so the point the
   * camera looks at sits in the middle of the area between the panels. Eased, so collapsing a panel
   * slides the scene over instead of jumping.
   */
  private applyViewOffset(nowMs: number, dtMs: number): void {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    const ins = this.measureInsets(nowMs)
    const ox = (ins.left - ins.right) / 2
    const oy = (ins.top - ins.bottom) / 2
    const a = this.shiftReady ? 1 - Math.exp(-dtMs / 160) : 1
    this.shiftReady = true
    const nx = this.shift.x + (ox - this.shift.x) * a
    const ny = this.shift.y + (oy - this.shift.y) * a
    const view = this.camera.view
    if (view && view.enabled && view.fullWidth === w && view.fullHeight === h && Math.abs(nx - this.shift.x) < 0.01 && Math.abs(ny - this.shift.y) < 0.01) return
    this.shift.set(nx, ny)
    this.camera.setViewOffset(w, h, -nx, -ny, w, h)
  }

  /** The fraction of the width and of the height the panels leave free. */
  private freeFraction(): { w: number; h: number } {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    const ins = this.measureInsets(performance.now())
    return { w: Math.max(0.3, (w - ins.left - ins.right) / w), h: Math.max(0.3, (h - ins.top - ins.bottom) / h) }
  }

  /** Distance at which a sphere of `radius` fits the free part of the window, with a margin. */
  private fitDistance(radius: number, margin = 1.12): number {
    const free = this.freeFraction()
    const tanV = Math.tan((this.camera.fov * Math.PI) / 360)
    const halfV = Math.atan(tanV * free.h)
    const halfH = Math.atan(tanV * this.camera.aspect * free.w)
    return (Math.max(radius, 1e-6) * margin) / Math.sin(Math.min(halfV, halfH))
  }

  /** Move the camera to look at `target` from `position`: a short flight (eased, through log distance), or a cut. */
  private flyTo(position: THREE.Vector3, target: THREE.Vector3, animate: boolean): void {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!animate || reduced || this.camera.position.distanceToSquared(this.controls.target) === 0) {
      this.flight = null
      this.controls.target.copy(target)
      this.camera.position.copy(position)
      this.camera.up.copy(WORLD_POLE)
      this.camera.lookAt(target)
      this.controls.update()
      return
    }
    const ratio = Math.abs(Math.log(Math.max(position.distanceTo(target), 1e-9) / Math.max(this.camera.position.distanceTo(this.controls.target), 1e-9)))
    this.flight = {
      from: this.camera.position.clone(), fromTarget: this.controls.target.clone(), fromUp: this.camera.up.clone(),
      to: position.clone(), toTarget: target.clone(),
      t0: performance.now(), dur: Math.min(1400, 700 + 160 * ratio),
    }
  }

  /** One step of a framing flight. */
  private stepFlight(nowMs: number): void {
    const f = this.flight
    if (!f) return
    const p = Math.min(1, Math.max(0, (nowMs - f.t0) / f.dur))
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
    const target = this.scratch2.copy(f.fromTarget).lerp(f.toTarget, e)
    const d0 = f.from.clone().sub(f.fromTarget)
    const d1 = f.to.clone().sub(f.toTarget)
    const r0 = Math.max(d0.length(), 1e-9)
    const r1 = Math.max(d1.length(), 1e-9)
    const u0 = d0.divideScalar(r0)
    const u1 = d1.divideScalar(r1)
    const turn = new THREE.Quaternion().setFromUnitVectors(u0, u1)
    const dir = u0.applyQuaternion(new THREE.Quaternion().slerp(turn, e))
    const r = Math.exp(Math.log(r0) + (Math.log(r1) - Math.log(r0)) * e)
    this.controls.target.copy(target)
    this.camera.position.copy(target).addScaledVector(dir, r)
    // a flight out of the chase view also turns the camera's roll back to the pole's up
    this.camera.up.copy(f.fromUp).lerp(WORLD_POLE, e)
    if (this.camera.up.lengthSq() < 1e-6) this.camera.up.copy(WORLD_POLE)
    this.camera.up.normalize()
    if (p >= 1) {
      this.camera.up.copy(WORLD_POLE)
      this.flight = null
    }
  }

  private resize(): void {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.insetAt = -Infinity
    this.camera.aspect = w / h
    if (this.camera.view?.enabled) this.camera.setViewOffset(w, h, -this.shift.x, -this.shift.y, w, h)
    this.camera.updateProjectionMatrix()
  }

  private readonly failed = new Set<string>()

  /** Run one part of the frame; an exception is logged once per part instead of ending the animation loop. */
  private guard(part: string, fn: () => void): void {
    try {
      fn()
      this.failed.delete(part)
    } catch (e) {
      if (!this.failed.has(part)) console.error(`${part} sync failed`, e)
      this.failed.add(part)
    }
  }

  private readonly tick = (now: number): void => {
    if (this.disposed) return
    const dt = Math.min(now - this.lastNow, 100)
    this.lastNow = now
    const s = useStore.getState()

    if (s.playing) {
      s.setT(advanceTime({ epochMs: 0, t: s.t, playing: true, rate: s.scenario.rate, spanSeconds: s.scenario.spanSeconds }, dt).t)
    }
    const state = useStore.getState()
    // one bad satellite or plan must not stop the loop: the rest of the scene keeps drawing
    this.guard('body', () => this.syncBody(state))
    this.guard('satellites', () => this.syncSatellites(state))
    this.guard('mission', () => this.syncMission(state, now, dt))
    this.handleCameraRequest(state)

    this.axes.group.visible = state.showAxes
    this.applyViewOffset(now, dt)
    if (!this.managedCamera) {
      this.stepFlight(now)
      this.controls.update()
    } else this.flight = null
    this.camera.updateMatrixWorld()   // projections below use this frame's camera, not last frame's
    // the stars are infinitely far: they travel with the camera, so orbiting never shows parallax or the shell's edge
    this.starfield.position.copy(this.camera.position)
    // everything held at a constant size on screen is sized last, once the camera for this frame is final
    const viewH = this.container.clientHeight || 1
    const fovRad = (this.camera.fov * Math.PI) / 180
    this.bodyMesh.updateLabels(this.camera.position, viewH, fovRad, state.showLabels)
    for (const [id, v] of this.visuals) {
      if (!v.marker.group.visible) continue
      v.marker.group.getWorldPosition(this.scratch)
      const companion = state.plan !== null && id === this.companionId
      v.marker.updateScale(this.camera.position.distanceTo(this.scratch), viewH, fovRad, companion ? this.shipPixelsPerUnit : 0)
    }
    this.layoutLabels(state)
    this.updateHover()
    this.renderer.render(this.scene, this.camera)
    this.raf = requestAnimationFrame(this.tick)
  }

  /** Gather every label in the scene and let the layout decide which show and where. */
  private layoutLabels(s: AppState): void {
    const items = this.labelItems
    items.length = 0
    this.bodyMesh.labelItems(items)
    for (const [id, v] of this.visuals) {
      const item = v.marker.labelItem
      item.pick = id
      // the hovered one names itself even with the labels off, like a tooltip
      const hovered = id === this.hoverId
      item.wanted = (s.showLabels || hovered) && v.marker.group.visible
      item.priority = hovered ? 95 : id === s.selectedId ? 90 : id === this.focusId ? 80 : 50
      items.push(item)
    }
    this.missionPath.labelItems(items)
    if (this.ship && s.plan) items.push(this.ship.labelItem)
    const body = getBody(s.scenario.bodyId)
    this.labelLayout.run(items, {
      camera: this.camera,
      width: this.container.clientWidth || 1,
      height: this.container.clientHeight || 1,
      // the polar radius, a little inside the surface, so a label at the limb is not hidden by rounding
      occluder: { center: ORIGIN, radius: kmScalarToScene(body.radius) * (1 - (body.flattening ?? 0)) * 0.995 },
    })
  }

  /** A pointer over something that can be picked shows the hand, and that object is highlighted. */
  private updateHover(): void {
    if (!this.hover) return
    this.hoverId = this.pickAt(this.hover.x, this.hover.y)
    this.hover = null
    this.renderer.domElement.style.cursor = this.hoverId ? 'pointer' : ''
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
      const heliocentric = body.id === 'sun'
      this.sunPoint.visible = heliocentric
      this.sunLight.visible = !heliocentric
      for (const v of this.visuals.values()) v.key = '' // force path rebuild in the new field
    }
    const date = new Date(epochMs(s) + s.t * 1000)
    const spin = body.id === 'earth' ? gmst(date) : (TWO_PI * s.t) / body.rotationPeriod
    this.bodyMesh.setSpin(spin)
    const start = s.scenario.mission?.start
    this.bodyMesh.setSurfaceMarker(start?.kind === 'launch' ? start.launch.site : null)
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
      let key = keyCache.get(sat)
      if (key === undefined || !key.startsWith(`${body.id}|`)) {
        key = visualKey(sat, body.id)
        keyCache.set(sat, key)
      }
      if (v && v.key !== key && v.key !== '') {
        this.removeVisual(sat.id)
        v = undefined
      }
      if (!v) {
        v = { key, path: new OrbitPath(sat.color), marker: new SatelliteMarker(sat.name, sat.color, sat.kind === 'kepler' ? sat.shape : undefined), pathT0: s.t, builtAt: 0 }
        this.inertial.add(v.path.line)
        this.inertial.add(v.marker.group)
        this.visuals.set(sat.id, v)
        this.rebuildPath(v, sat, body, s.t, date)
      } else if (v.key === '') {
        v.key = key
        this.rebuildPath(v, sat, body, s.t, date)
      }

      const state = this.stateOf(sat, body, s.t, date)
      if (state) {
        v.marker.group.visible = true
        v.marker.setState(kmToScene(state.r, this.scratch), this.scratchV.set(state.v.x, state.v.y, state.v.z))
      } else {
        v.marker.group.visible = false
      }
      if (sat.kind === 'tle') {
        const rec = satrecFor(sat)
        if (rec) {
          const T = sgp4Period(rec)
          const now = performance.now()
          if (Math.abs(s.t - v.pathT0) > T * 0.5 && now - v.builtAt > 250) {
            v.builtAt = now
            this.rebuildPath(v, sat, body, s.t, date)
          }
        }
      }
      const selected = sat.id === s.selectedId
      const hovered = sat.id === this.hoverId
      const quiet = s.plan !== null && this.focusId !== null && sat.id !== this.focusId
      v.path.setEmphasis(selected, anySelected, quiet, hovered)
      v.marker.setEmphasis(selected || hovered, anySelected)
      v.marker.setLabelVisible(s.showLabels)
    }
    for (const id of [...this.visuals.keys()]) if (!live.has(id)) this.removeVisual(id)
  }

  private stateOf(sat: Satellite, body: CentralBody, t: number, date: Date): StateVector | null {
    if (sat.kind === 'kepler') return keplerStateAt(sat, body, t)
    const rec = satrecFor(sat)
    if (!rec) return null
    return sgp4StateAt(rec, date)
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
    // a world switch or a reset cuts; the framing buttons fly
    const animate = !req.keepMode && req.kind !== 'reset'
    if (req.kind === 'body' || req.kind === 'reset') {
      this.frameBody(body, animate)
    } else if (req.kind === 'all') {
      // every orbit and the tour, for a scene whose orbits dwarf the body (a heliocentric one)
      let all: THREE.Sphere | null = null
      for (const sp of [...[...this.visuals.values()].map((v) => v.path.boundingSphere()), this.missionPath.wholeSphere()]) {
        if (!sp) continue
        if (all) all.union(sp)
        else all = sp.clone()
      }
      if (all) this.frameSphere(all, undefined, animate)
      else this.frameBody(body, animate)
    } else if (req.kind === 'ship') {
      const sphere = s.selectedLeg !== null ? this.missionPath.legSphere(s.selectedLeg) : this.missionPath.wholeSphere()
      if (sphere) this.frameSphere(sphere, undefined, animate)
      else this.frameBody(body, animate)
    } else if (req.kind === 'orbit') {
      const v = s.selectedId ? this.visuals.get(s.selectedId) : undefined
      const sphere = v?.path.boundingSphere()
      if (!v || !sphere) {
        this.frameBody(body, animate)
        return
      }
      const sat = s.scenario.satellites.find((x) => x.id === s.selectedId)
      this.frameSphere(sphere, sat, animate)
    }
  }

  private frameBody(body: CentralBody, animate = true): void {
    const d = kmScalarToScene(body.frameDistance)
    this.flyTo(new THREE.Vector3(d * 0.55, d * 0.45, d * 0.7), ORIGIN, animate)
  }

  /**
   * Frame a bounding sphere (in inertial-local coordinates), viewing from above the orbit plane. It
   * is fitted to the part of the window the panels leave free, in the narrower of its two half-angles.
   */
  private frameSphere(sphere: THREE.Sphere, sat?: Satellite, animate = true): void {
    const center = this.inertial.localToWorld(sphere.center.clone())
    const dist = this.fitDistance(sphere.radius)
    let dir = new THREE.Vector3(0.5, 0.6, 0.65)
    if (sat?.kind === 'kepler') {
      // Angular momentum direction in the inertial frame, then into world coordinates.
      const { i, raan } = sat.elements
      const h = new THREE.Vector3(Math.sin(raan) * Math.sin(i), -Math.cos(raan) * Math.sin(i), Math.cos(i))
      dir = h.applyQuaternion(this.inertial.quaternion).add(new THREE.Vector3(0.35, 0.15, 0.3)).normalize()
    }
    // orbits can be far larger than the body the zoom limit was set for (asteroids around the Sun)
    this.controls.maxDistance = Math.max(this.controls.maxDistance, dist * 6)
    this.flyTo(center.clone().add(dir.multiplyScalar(dist)), center, animate)
  }

  /** Ship, path, burn flares and the follow camera, all driven by the plan in the store and the current time. */
  private syncMission(s: AppState, nowMs: number, dtMs: number): void {
    if (s.plan !== this.planRef) {
      this.planRef = s.plan
      this.firedBurns.clear()
      this.followLeg = -1
      if (s.plan) {
        this.flat = flattenPlan(s.plan)
        this.missionPath.setPlan(this.flat, s.plan)
        this.ascentRef = s.plan.launch ? ascentFrame(s.plan.launch.samples) : null
        const name = s.scenario.mission?.ship.name ?? 'Ship'
        if (this.ship && name !== this.shipName) {
          this.inertial.remove(this.ship.group)
          this.ship.dispose()
          this.ship = null
        }
        if (!this.ship) {
          this.ship = new ShipMarker(name, '#ffffff')
          this.shipName = name
          this.inertial.add(this.ship.group)
        }
        const start = s.scenario.mission?.start
        this.ship.setVehicle(start?.kind === 'launch' ? start.launch.vehicle : null)
      } else {
        this.flat = null
        this.missionPath.clear()
        if (this.ship) {
          this.inertial.remove(this.ship.group)
          this.ship.dispose()
          this.ship = null
        }
        this.burnEffect.group.visible = false
      }
    }
    // Which camera is in charge. A framing request (Frame body, Frame tour, ...) takes it back from a managed view.
    const pending = s.cameraRequest !== null && s.cameraRequest.seq !== this.lastCameraSeq && !s.cameraRequest.keepMode
    let mode = s.cameraMode
    if (pending && (mode === 'chase' || mode === 'birdseye' || mode === 'follow')) {
      s.setCameraMode('free')
      mode = 'free'
    }
    const managed = s.plan !== null && (mode === 'chase' || mode === 'birdseye')
    if (managed !== this.managedCamera || mode !== this.lastMode) {
      const wasManaged = this.managedCamera
      this.managedCamera = managed
      this.lastMode = mode
      this.controls.enabled = !managed
      this.viewZoom = 1
      this.chaseReady = this.birdReady = false
      if (wasManaged && !managed) {
        this.followLeg = -1
        // the way out starts from what the managed camera was looking at, so a flight from here does not jump
        const look = this.camera.getWorldDirection(this.scratch)
        this.controls.target.copy(this.camera.position).addScaledVector(look, Math.max(1e-3, this.camera.position.length() * 0.05))
        if (mode === 'follow') {
          this.camera.up.copy(WORLD_POLE)   // the follow camera frames the leg itself
        } else if (!pending) {
          const sphere = s.plan ? this.missionPath.wholeSphere() : null
          if (sphere) this.frameSphere(sphere, undefined, true)
          else this.frameBody(getBody(s.scenario.bodyId), true)
        }
      }
    }
    if (!s.plan || !this.flat || !this.ship) {
      this.prevT = s.t
      this.companionId = null
      this.focusId = null
      return
    }
    const st = shipStateAt(this.flat, s.t)
    if (!st) return
    const ridingWith = st.kind !== 'ride' ? null
      : s.plan.prelude && s.t <= s.plan.prelude.t1 ? s.plan.prelude.satelliteId
      : (s.plan.legs[st.leg]?.ride?.satelliteId ?? null)
    // while riding, the ship is where its companion is drawn: the plan samples a long dwell coarsely,
    // and its interpolation would drift from the body's own propagation
    const companionVisual = ridingWith ? this.visuals.get(ridingWith) : undefined
    const withCompanion = companionVisual?.marker.group.visible === true
    const pos = withCompanion ? companionVisual.marker.group.position.clone() : kmToScene(st.r)
    // and it moves as its companion does, so it points the way the companion is going
    const vel = withCompanion ? companionVisual.marker.velocity.clone() : new THREE.Vector3(st.v.x, st.v.y, st.v.z)
    // ease the managed cameras only while time flows; a scrub or a jump snaps them
    const maxStep = 2 * (dtMs / 1000) * s.scenario.rate + 1
    const continuous = Number.isFinite(this.prevT) && Math.abs(s.t - this.prevT) <= maxStep
    // the nose points the way the ship is moving; a rocket, the way it moves through the planner's
    // turning air (ascent.ts), which on the pad is straight up rather than the body's spin
    const forward = this.aim.copy(vel)
    if (st.kind === 'ascent' && this.ascentRef) {
      const h = ascentHeading(this.ascentRef, st.r, st.v)
      forward.set(h.x, h.y, h.z)
    }
    // the direction of flight jumps at a burn and at a change of segment; the ship swings onto it there
    const kicked = continuous && (st.kind !== this.prevKind || this.burnBetween(s.plan, this.prevT, s.t))
    this.prevKind = st.kind
    this.upRef.copy(pos).normalize()
    this.ship.setState(pos, forward, this.upRef, dtMs, !continuous, kicked)
    this.ship.setLabelVisible(s.showLabels)
    // the launch vehicle sheds a stage at each separation; once in orbit the spacecraft flies on
    const dropped = s.plan.launch ? s.plan.launch.events.filter((e) => e.label.includes('separation') && e.t <= s.t).length : 0
    this.ship.setPhase(st.kind === 'ascent', dropped)
    const worldPos = this.inertial.localToWorld(pos.clone())
    const fov = (this.camera.fov * Math.PI) / 180
    const h = this.container.clientHeight || 1
    if (!continuous) this.chaseReady = this.birdReady = false
    if (this.managedCamera && mode === 'chase') this.chaseCamera(st, worldPos, vel, dtMs)
    else if (this.managedCamera) this.birdsEyeCamera(st, dtMs, fov)
    else if (mode === 'follow') this.followCamera(s, st, worldPos, fov)
    else this.followLeg = -1
    const dist = this.camera.position.distanceTo(worldPos)
    // the close views draw the ship larger so it reads as an object, not a marker
    const shipScale = this.managedCamera ? (mode === 'chase' ? 3.5 : 1.5) : 1
    this.ship.updateScale(dist, h, fov, shipScale)
    // the satellite drawn at the ship's scale is the one the ship is riding with; a target still far
    // ahead stays a marker, or it would loom over the scene at a fixed size on screen. Only the chase
    // view, which sits next to the ship, draws that body at the ship's scale, and the ship then rides
    // clear of it
    this.companionId = this.managedCamera && mode === 'chase' ? ridingWith : null
    const companionKind = this.companionId ? this.visuals.get(this.companionId)?.marker.kind : undefined
    this.ship.setRiding(st.kind === 'ride', companionKind ? companionReach(companionKind) : undefined)
    this.focusId = ridingWith ?? s.scenario.mission?.stops[st.leg]?.satelliteId ?? null
    this.shipPixelsPerUnit = 15 * shipScale
    // the close views sit among the lines: chase and follow show what is still to come on this leg only,
    // or the later legs' dashed paths, running alongside, read as a shower of bars
    this.camera.updateMatrixWorld()
    const close = (mode === 'chase' && this.managedCamera) || mode === 'follow'
    const focusDistance = this.managedCamera ? dist : this.camera.position.distanceTo(this.controls.target)
    this.missionPath.update(s.t, { showRemaining: s.showRemaining, showLabels: s.showBurnLabels, selectedLeg: s.selectedLeg, currentLeg: st.outside ? null : st.leg,
      remainingOnlyLeg: close && !st.outside ? st.leg : null },
      this.camera, h, fov, (v) => this.inertial.localToWorld(v), st.kind === 'ride' ? null : pos, focusDistance)

    // burns: fire when the clock crosses one while playing, not when scrubbing across it
    if (Number.isFinite(this.prevT) && s.playing && s.t > this.prevT && s.t - this.prevT <= maxStep) {
      s.plan.legs.forEach((leg, li) =>
        leg.burns.forEach((b, bi) => {
          const key = `${li}:${bi}`
          if (this.prevT < b.t && b.t <= s.t && !this.firedBurns.has(key)) {
            this.firedBurns.add(key)
            const exhaust = this.ship!.nose(new THREE.Vector3()).negate()
            const wallMs = s.scenario.rate <= 60 ? Math.max(400, (b.duration / s.scenario.rate) * 1000) : 800
            this.burnEffect.trigger(exhaust, wallMs, nowMs)
          }
        }),
      )
    }
    if (s.t < this.prevT) this.firedBurns.clear() // scrubbed back: burns can fire again
    // powered ascent: the engines stay lit for the whole interval
    if (s.plan.launch && s.playing && st.kind === 'ascent' && s.plan.launch.burnIntervals.some((b) => b.t0 <= s.t && s.t < b.t1)) {
      this.burnEffect.sustain(this.ship.nose(new THREE.Vector3()).negate(), nowMs)
    }
    this.prevT = s.t
    this.ship.exhaustPosition(this.burnEffect.group.position)
    // the flame leaves the tail, wherever the nose has turned since it lit
    if (this.burnEffect.active) this.burnEffect.point(this.ship.nose(this.scratchV).negate())
    this.burnEffect.update(nowMs, dist * shipScale, h, fov)
  }

  /** Whether the clock passed a burn between `t0` and `t1`, in either direction. */
  private burnBetween(plan: MissionPlan, t0: number, t1: number): boolean {
    const lo = Math.min(t0, t1), hi = Math.max(t0, t1)
    return plan.legs.some((leg) => leg.burns.some((b) => b.magnitude > 0 && lo < b.t && b.t <= hi))
  }


  /** Follow: keep the ship at the controls' target while it coasts and carry the camera along; the user can still orbit and zoom. */
  private followCamera(s: AppState, st: ShipState, worldPos: THREE.Vector3, fov: number): void {
    if (st.kind === 'ride' || st.outside) {
      this.followLeg = -1
      return
    }
    if (this.followLeg !== st.leg) {
      this.followLeg = st.leg
      const sphere = this.missionPath.legSphere(st.leg)
      if (sphere) {
        const d = Math.max((sphere.radius * 1.2) / Math.sin(fov / 2), kmScalarToScene(getBody(s.scenario.bodyId).radius) * 3)
        const dir = this.camera.position.clone().sub(this.controls.target).normalize()
        if (dir.lengthSq() === 0) dir.set(0.5, 0.6, 0.65).normalize()
        this.controls.maxDistance = Math.max(this.controls.maxDistance, d * 6)
        this.controls.target.copy(worldPos)
        this.camera.position.copy(worldPos).add(dir.multiplyScalar(d))
        return
      }
    }
    const delta = worldPos.clone().sub(this.controls.target)
    this.controls.target.copy(worldPos)
    this.camera.position.add(delta)
  }

  /**
   * Chase: third person, locked to the ship. The camera sits behind it along the velocity and a
   * little toward "up" (away from the body), so the ship flies into the screen with the body
   * below. Heading changes are eased over a fraction of a second; position is never eased, so
   * the ship cannot leave the frame at any playback rate.
   */
  private chaseCamera(st: ShipState, worldPos: THREE.Vector3, vel: THREE.Vector3, dtMs: number): void {
    const f = vel.clone().applyQuaternion(this.inertial.quaternion)
    if (f.lengthSq() < 1e-12) f.copy(this.chaseReady ? this.chaseF : WORLD_X)
    f.normalize()
    const u = chaseUp(worldPos, f, WORLD_POLE)
    const a = this.chaseReady ? 1 - Math.exp(-dtMs / 180) : 1
    this.chaseF.lerp(f, a)
    if (this.chaseF.lengthSq() < 1e-6) this.chaseF.copy(f)
    this.chaseF.normalize()
    this.chaseU.copy(perpendicular(this.chaseF, this.chaseU.lerp(u, a), u))
    this.chaseReady = true
    const d = kmScalarToScene(chaseDistanceKm(Math.hypot(st.r.x, st.r.y, st.r.z))) * this.viewZoom
    const pose = chasePose(worldPos, this.chaseF, this.chaseU, d)
    this.camera.position.copy(pose.position)
    this.camera.up.copy(pose.up)
    this.camera.lookAt(pose.target)
  }

  /**
   * Bird's-eye: a fixed camera straight above the plane of the route the ship is on (the ascent,
   * then each leg), far enough to fit all of it. It only moves, with a short ease, when the ship
   * starts a new stretch or the wheel changes the zoom; otherwise the ship crosses a still frame.
   */
  private birdsEyeCamera(st: ShipState, dtMs: number, fov: number): void {
    const view = (st.kind === 'ascent' ? this.missionPath.ascentView() : null) ?? this.missionPath.legView(st.leg)
    if (!view) return
    const center = this.inertial.localToWorld(view.sphere.center.clone())
    const normal = view.normal.clone().applyQuaternion(this.inertial.quaternion)
    // a near-polar leg's normal can point either way of the pole; keep looking from the side used for the
    // last leg, so the view does not flip into its mirror image between legs
    const pole = this.lastNormal && Math.abs(normal.dot(WORLD_POLE)) < 0.3 ? this.lastNormal : WORLD_POLE
    if (normal.dot(pole) < 0) normal.negate()
    this.lastNormal = normal.clone()
    const pose = birdsEyePose(center, normal, view.sphere.radius, fov, this.camera.aspect, WORLD_POLE, this.viewZoom, this.freeFraction(), true)
    const a = this.birdReady ? 1 - Math.exp(-dtMs / 260) : 1
    this.camera.position.lerp(pose.position, a)
    this.birdTarget.lerp(pose.target, a)
    this.camera.up.lerp(pose.up, a)
    if (this.camera.up.lengthSq() < 1e-6) this.camera.up.copy(pose.up)
    this.camera.up.normalize()
    this.camera.lookAt(this.birdTarget)
    this.birdReady = true
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    const el = this.renderer.domElement
    el.removeEventListener('wheel', this.onWheel)
    el.removeEventListener('pointerdown', this.onPointerDown)
    el.removeEventListener('pointerup', this.onPointerUp)
    el.removeEventListener('pointermove', this.onPointerMove)
    el.removeEventListener('pointerleave', this.onPointerLeave)
    el.removeEventListener('dblclick', this.onDoubleClick)
    this.controls.removeEventListener('start', this.onControlsStart)
    for (const id of [...this.visuals.keys()]) this.removeVisual(id)
    this.bodyMesh.dispose()
    this.missionPath.dispose()
    this.burnEffect.dispose()
    this.ship?.dispose()
    this.axes.dispose()
    this.starfield.geometry.dispose()
    ;(this.starfield.material as THREE.Material).dispose()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()   // hot reloads and remounts would otherwise pile up WebGL contexts
    this.renderer.domElement.remove()
  }
}

/** The body's pole and a reference axis in three.js world space (the inertial group turns z up to y). */
const WORLD_POLE = new THREE.Vector3(0, 1, 0)
const WORLD_X = new THREE.Vector3(1, 0, 0)
const ORIGIN = new THREE.Vector3(0, 0, 0)

function visualKey(sat: Satellite, bodyId: string): string {
  return sat.kind === 'kepler'
    ? `${bodyId}|${sat.color}|${sat.name}|${sat.shape ?? ''}|${JSON.stringify(sat.elements)}`
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
