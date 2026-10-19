/**
 * Owns the renderer, camera, controls and animation loop. Reads the zustand store directly every
 * frame; React never re-renders the canvas. Everything orbital lives under `inertial` (see frame.ts).
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TWO_PI } from '../core/constants'
import { advanceTime } from '../core/time'
import { getBody } from '../data/bodies'
import { keplerPathSamples, keplerStateAt } from '../propagation/keplerPropagator'
import { gmst, satrecFor, sgp4PathSamples, sgp4Period, sgp4StateAt } from '../propagation/sgp4Propagator'
import { flattenPlan, shipStateAt, type FlatPlan, type ShipState } from '../mission/state'
import type { Burn, MissionPlan } from '../mission/types'
import { epochMs, isRenderable, useStore, type AppState, type CameraMode } from '../store/store'
import type { CentralBody, Satellite, StateVector } from '../types'
import { InertialAxes } from './AxesHelper'
import { BurnEffect } from './BurnEffect'
import { birdsEyePose, chaseDistanceKm, chasePose, chaseUp, perpendicular } from './cameraViews'
import { MissionPath } from './MissionPath'
import { ShipMarker } from './ShipMarker'
import { CentralBodyMesh } from './CentralBodyMesh'
import { kmScalarToScene, kmToScene, makeInertialGroup } from './frame'
import { LINE_RESOLUTION } from './lines'
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

  // mission visuals
  private readonly missionPath = new MissionPath()
  private readonly burnEffect = new BurnEffect()
  private ship: ShipMarker | null = null
  private flat: FlatPlan | null = null
  private planRef: MissionPlan | null = null
  private firedBurns = new Set<number>()
  private prevT = Number.NaN
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
  private insetValue = 0
  private insetAt = -Infinity
  /** In a close view, the satellite the ship is heading for and the ship's size on screen. */
  private companionId: string | null = null
  /** the body the ship is with or heading for; the other orbits are drawn quietly while a route is shown */
  private focusId: string | null = null
  private readonly aim = new THREE.Vector3()
  private readonly upRef = new THREE.Vector3()
  private shipPixelsPerUnit = 0
  private readonly scratch = new THREE.Vector3()

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
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: true })

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(1, 0.4, 0.6)
    this.scene.add(sun)
    this.scene.add(makeStarfield())

    this.inertial.add(this.bodyMesh.group)
    this.inertial.add(this.axes.group)
    this.inertial.add(this.missionPath.group)
    this.inertial.add(this.burnEffect.group)
    this.scene.add(this.inertial)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()

    this.syncBody(useStore.getState())
    this.frameBody(getBody(useStore.getState().scenario.bodyId))
    this.lastNow = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  /** In the managed views the wheel moves the camera closer or further instead of driving OrbitControls. */
  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.managedCamera) return
    this.viewZoom = Math.min(6, Math.max(0.4, this.viewZoom * Math.exp(e.deltaY * 0.0012)))
  }

  /**
   * Fraction of the viewport height hidden by panels that span the bottom of the screen (the
   * timeline, and on narrow screens the button row above it). Measured from the DOM a few times
   * a second, since the panels collapse, wrap and resize on their own.
   */
  private bottomInset(nowMs: number): number {
    if (nowMs - this.insetAt < 300) return this.insetValue
    this.insetAt = nowMs
    const box = this.container.getBoundingClientRect()
    let covered = 0
    if (box.height > 0) {
      for (const el of document.querySelectorAll('.panel.bottom, .panel.topright')) {
        const r = el.getBoundingClientRect()
        if (r.width > box.width * 0.6 && r.top > box.top + box.height * 0.45) covered = Math.max(covered, box.bottom - r.top)
      }
    }
    this.insetValue = box.height > 0 ? Math.min(0.6, Math.max(0, covered / box.height)) : 0
    return this.insetValue
  }

  private resize(): void {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h, false)
    LINE_RESOLUTION.set(w, h)
    this.insetAt = -Infinity
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
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
    this.syncBody(state)
    this.syncSatellites(state)
    try {
      this.syncMission(state, now, dt)
    } catch (e) {
      console.error('mission sync failed', e)
    }
    this.handleCameraRequest(state)

    this.axes.group.visible = state.showAxes
    if (!this.managedCamera) this.controls.update()
    // everything held at a constant size on screen is sized last, once the camera for this frame is final
    const viewH = this.container.clientHeight || 1
    const fovRad = (this.camera.fov * Math.PI) / 180
    this.bodyMesh.updateLabels(this.camera.position, viewH, fovRad)
    for (const [id, v] of this.visuals) {
      if (!v.marker.group.visible) continue
      v.marker.group.getWorldPosition(this.scratch)
      const companion = state.plan !== null && id === this.companionId
      v.marker.updateScale(this.camera.position.distanceTo(this.scratch), viewH, fovRad, companion ? this.shipPixelsPerUnit : 0)
    }
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
      const key = visualKey(sat, body.id)
      if (v && v.key !== key && v.key !== '') {
        this.removeVisual(sat.id)
        v = undefined
      }
      if (!v) {
        v = { key, path: new OrbitPath(sat.color), marker: new SatelliteMarker(sat.name, sat.color, sat.kind === 'kepler' ? sat.shape : undefined), pathT0: s.t }
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
        v.marker.setState(kmToScene(state.r), new THREE.Vector3(state.v.x, state.v.y, state.v.z))
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
      const quiet = s.plan !== null && this.focusId !== null && sat.id !== this.focusId
      v.path.setEmphasis(selected, anySelected, quiet)
      v.marker.setEmphasis(selected, anySelected)
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
    if (req.kind === 'body' || req.kind === 'reset') {
      this.frameBody(body)
    } else if (req.kind === 'all') {
      // every orbit and the tour, for a scene whose orbits dwarf the body (a heliocentric one)
      let all: THREE.Sphere | null = null
      for (const sp of [...[...this.visuals.values()].map((v) => v.path.boundingSphere()), this.missionPath.wholeSphere()]) {
        if (!sp) continue
        if (all) all.union(sp)
        else all = sp.clone()
      }
      if (all) this.frameSphere(all)
      else this.frameBody(body)
    } else if (req.kind === 'ship') {
      const sphere = s.selectedLeg !== null ? this.missionPath.legSphere(s.selectedLeg) : this.missionPath.wholeSphere()
      if (sphere) this.frameSphere(sphere)
      else this.frameBody(body)
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
    // orbits can be far larger than the body the zoom limit was set for (asteroids around the Sun)
    this.controls.maxDistance = Math.max(this.controls.maxDistance, dist * 6)
    this.controls.target.copy(center)
    this.camera.position.copy(center).add(dir.multiplyScalar(dist))
    this.camera.lookAt(center)
    this.controls.update()
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
        if (!this.ship) {
          this.ship = new ShipMarker(s.scenario.mission?.ship.name ?? 'Ship', '#ffffff')
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
    const pending = s.cameraRequest !== null && s.cameraRequest.seq !== this.lastCameraSeq
    let mode = s.cameraMode
    if (pending && (mode === 'chase' || mode === 'birdseye')) {
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
        this.camera.up.set(0, 1, 0)
        this.followLeg = -1
        if (!pending) {
          const sphere = s.plan ? this.missionPath.wholeSphere() : null
          if (sphere) this.frameSphere(sphere)
          else this.frameBody(getBody(s.scenario.bodyId))
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
    const pos = kmToScene(st.r)
    const vel = new THREE.Vector3(st.v.x, st.v.y, st.v.z)
    // ease the managed cameras only while time flows; a scrub or a jump snaps them
    const maxStep = 2 * (dtMs / 1000) * s.scenario.rate + 1
    const continuous = Number.isFinite(this.prevT) && Math.abs(s.t - this.prevT) <= maxStep
    // the nose points along the next burn while one is near, else along the flight; belly to the body
    const burn = this.burnNear(s.plan, s.t)
    const aim = burn ? this.aim.set(burn.dv[0], burn.dv[1], burn.dv[2]) : null
    this.upRef.copy(pos).normalize()
    this.ship.setState(pos, vel, aim, this.upRef, dtMs, !continuous)
    this.ship.setLabelVisible(s.showLabels)
    // the launch vehicle sheds a stage at each separation; once in orbit the spacecraft flies on
    const dropped = s.plan.launch ? s.plan.launch.events.filter((e) => e.label.includes('separation') && e.t <= s.t).length : 0
    this.ship.setPhase(st.kind === 'ascent', dropped)
    this.ship.setRiding(st.kind === 'ride')
    const worldPos = this.inertial.localToWorld(pos.clone())
    const fov = (this.camera.fov * Math.PI) / 180
    const h = this.container.clientHeight || 1
    if (!continuous) this.chaseReady = this.birdReady = false
    if (this.managedCamera && mode === 'chase') this.chaseCamera(st, worldPos, vel, dtMs)
    else if (this.managedCamera) this.birdsEyeCamera(st, nowMs, dtMs, fov)
    else if (mode === 'follow') this.followCamera(s, st, worldPos, fov)
    else this.followLeg = -1
    const dist = this.camera.position.distanceTo(worldPos)
    // the close views draw the ship larger so it reads as an object, not a marker
    const shipScale = this.managedCamera ? (mode === 'chase' ? 3.5 : 1.5) : 1
    this.ship.updateScale(dist, h, fov, shipScale)
    // the satellite drawn at the ship's scale is the one the ship is riding with; a target still far
    // ahead stays a marker, or it would loom over the scene at a fixed size on screen
    const ridingWith = st.kind !== 'ride' ? null
      : s.plan.prelude && s.t <= s.plan.prelude.t1 ? s.plan.prelude.satelliteId
      : (s.plan.legs[st.leg]?.ride?.satelliteId ?? null)
    // only the chase view, which sits next to the ship, draws that body at the ship's scale
    this.companionId = this.managedCamera && mode === 'chase' ? ridingWith : null
    this.focusId = ridingWith ?? s.scenario.mission?.stops[st.leg]?.satelliteId ?? null
    this.shipPixelsPerUnit = 15 * shipScale
    this.missionPath.update(s.t, { showRemaining: s.showRemaining, showLabels: s.showBurnLabels, selectedLeg: s.selectedLeg, currentLeg: st.outside ? null : st.leg },
      this.camera, this.container.clientWidth || 1, h, fov, (v) => this.inertial.localToWorld(v))

    // burns: fire when the clock crosses one while playing, not when scrubbing across it
    if (Number.isFinite(this.prevT) && s.playing && s.t > this.prevT && s.t - this.prevT <= maxStep) {
      s.plan.legs.forEach((leg, li) =>
        leg.burns.forEach((b, bi) => {
          const key = li * 10 + bi
          if (this.prevT < b.t && b.t <= s.t && !this.firedBurns.has(key)) {
            this.firedBurns.add(key)
            const exhaust = new THREE.Vector3(-b.dv[0], -b.dv[1], -b.dv[2])
            const wallMs = s.scenario.rate <= 60 ? Math.max(400, (b.duration / s.scenario.rate) * 1000) : 800
            this.burnEffect.trigger(exhaust, wallMs, nowMs)
          }
        }),
      )
    }
    if (s.t < this.prevT) this.firedBurns.clear() // scrubbed back: burns can fire again
    // powered ascent: the engines stay lit for the whole interval
    if (s.plan.launch && s.playing && st.kind === 'ascent' && s.plan.launch.burnIntervals.some((b) => b.t0 <= s.t && s.t < b.t1)) {
      this.burnEffect.sustain(vel.clone().negate(), nowMs)
    }
    this.prevT = s.t
    this.ship.exhaustPosition(this.burnEffect.group.position)
    this.burnEffect.update(nowMs, dist * shipScale, h, fov)
  }

  /**
   * The burn the ship should be pointing at: one within its window around `t`, the window being a
   * share of the leg's flight time before the burn (turning to it) and after (turning back).
   */
  private burnNear(plan: MissionPlan, t: number): Burn | null {
    let best: Burn | null = null
    let bestGap = Infinity
    for (const leg of plan.legs) {
      const pre = 0.06 * Math.max(leg.tof, 1)
      const post = 0.04 * Math.max(leg.tof, 1)
      for (const b of leg.burns) {
        if (t < b.t - pre || t > b.t + post || b.magnitude <= 0) continue
        const gap = Math.abs(t - b.t)
        if (gap < bestGap) { best = b; bestGap = gap }
      }
    }
    return best
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
  private birdsEyeCamera(st: ShipState, nowMs: number, dtMs: number, fov: number): void {
    const view = (st.kind === 'ascent' ? this.missionPath.ascentView() : null) ?? this.missionPath.legView(st.leg)
    if (!view) return
    const center = this.inertial.localToWorld(view.sphere.center.clone())
    const normal = view.normal.clone().applyQuaternion(this.inertial.quaternion)
    const pose = birdsEyePose(center, normal, view.sphere.radius, fov, this.camera.aspect, WORLD_POLE, this.viewZoom, this.bottomInset(nowMs))
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
    this.renderer.domElement.removeEventListener('wheel', this.onWheel)
    for (const id of [...this.visuals.keys()]) this.removeVisual(id)
    this.bodyMesh.dispose()
    this.missionPath.dispose()
    this.burnEffect.dispose()
    this.ship?.dispose()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

/** The body's pole and a reference axis in three.js world space (the inertial group turns z up to y). */
const WORLD_POLE = new THREE.Vector3(0, 1, 0)
const WORLD_X = new THREE.Vector3(1, 0, 0)

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
