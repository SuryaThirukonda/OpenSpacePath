/**
 * The whole tour as one thick line, split each frame into the part already flown (solid) and
 * the part still to come (dashed, dimmer), plus burn markers with labels and dwell badges.
 * The remaining line stores its samples in reverse so that limiting the instance count draws
 * the tail of the tour back to the ship. The labels are placed by the scene's label layout
 * (labels.ts); this class says which ones matter most.
 */
import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { ASCENT_COLOR, LEG_COLORS } from '../data/legColors'
import type { FlatPlan } from '../mission/state'
import { flownCount } from '../mission/state'
import type { MissionPlan } from '../mission/types'
import { pathNormal } from './cameraViews'
import { kmToScene } from './frame'
import { drawOnTop, type LabelItem } from './labels'
import { drawOnce, makeLineMaterial, segmentCounts } from './lines'
import { disposeSprite, getGlowTexture, makeLabelSprite, worldPerPixel } from './textures'

export { ASCENT_COLOR, LEG_COLORS }

/** What a fixed camera needs to frame a stretch of the tour: where it is and the plane it lies in. */
export interface RouteView {
  sphere: THREE.Sphere
  normal: THREE.Vector3
}

interface Marker {
  t: number
  leg: number
  point: THREE.Points
  pointMat: THREE.PointsMaterial
  label: THREE.Sprite
  item: LabelItem
  position: THREE.Vector3
  /** a wait while the ship keeps station, not a burn or a launch event */
  wait: boolean
}

/** Dash and gap of the remaining line, in pixels on screen at the distance the camera is looking at. */
const DASH_PX = 9
const GAP_PX = 6

/** A coast drawn on its own: the samples [start, end) of the flat plan, split into flown and remaining. */
interface Stretch {
  start: number
  end: number
  leg: number
  flown: Line2
  remaining: Line2
  flownGeo: LineGeometry
  remainingGeo: LineGeometry
}

export class MissionPath {
  readonly group = new THREE.Group()
  private stretches: Stretch[] = []
  private flownMat?: LineMaterial
  private remainingMat?: LineMaterial
  private markers: Marker[] = []
  private flat: FlatPlan | null = null
  private legSpheres: THREE.Sphere[] = []
  private legViews: RouteView[] = []
  private ascent: RouteView | null = null
  /** scene-space positions and colours of the samples, kept for the segment that reaches the ship */
  private pos: Float32Array | null = null
  private col: Float32Array | null = null
  /** from the last flown sample to the ship, so the solid line reaches the ship between samples */
  private tail: Line2 | null = null
  private tailGeo: LineGeometry | null = null
  /** a typical radius of the tour and its longest coast, for sizing dashes (scene units) */
  private rTypical = 1
  private longest = 0

  setPlan(flat: FlatPlan, plan: MissionPlan): void {
    this.clear()
    this.flat = flat
    const n = flat.n
    const pos = new Float32Array(3 * n)
    const col = new Float32Array(3 * n)
    const v = new THREE.Vector3()
    const c = new THREE.Color()
    for (let i = 0; i < n; i++) {
      kmToScene({ x: flat.r[3 * i], y: flat.r[3 * i + 1], z: flat.r[3 * i + 2] }, v)
      pos[3 * i] = v.x; pos[3 * i + 1] = v.y; pos[3 * i + 2] = v.z
      c.set(flat.kind[i] === 2 ? ASCENT_COLOR : LEG_COLORS[flat.leg[i] % LEG_COLORS.length])
      col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b
    }
    // the coasts, each as its own pair of lines (flown, remaining). Rides are not drawn: the ship
    // keeps station with a body then, and the body's own orbit already shows where it goes.
    // Dashes are sized from the tour's own scale (5% of a typical radius), so they read the same
    // around a planet and around the Sun, where fixed sizes would be far below a pixel
    let rsum = 0
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 200))) rsum += Math.hypot(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2])
    const rTypical = Math.max(1e-3, rsum / Math.ceil(n / Math.max(1, Math.floor(n / 200))))
    this.rTypical = rTypical
    this.longest = 0
    this.flownMat = makeLineMaterial({ vertexColors: true, width: 3, opacity: 1 })
    this.remainingMat = makeLineMaterial({ vertexColors: true, width: 2.2, opacity: 0.5, dashed: { dashSize: 0.05 * rTypical, gapSize: 0.032 * rTypical } })
    // each line draws a pixel once, so a translucent line shows no brighter beads where its segments' round ends overlap
    drawOnce(this.flownMat)
    drawOnce(this.remainingMat)
    this.pos = pos
    this.col = col
    this.tailGeo = new LineGeometry()
    this.tailGeo.setPositions([0, 0, 0, 0, 0, 0])
    this.tailGeo.setColors([1, 1, 1, 1, 1, 1])
    this.tail = new Line2(this.tailGeo, this.flownMat)
    this.tail.frustumCulled = false
    this.tail.visible = false
    this.group.add(this.tail)
    let start = 0
    while (start < n) {
      let end = start + 1
      while (end < n && flat.kind[end] === flat.kind[start] && flat.leg[end] === flat.leg[start]) end++
      if (flat.kind[start] !== 1 && end - start >= 2) {
        const len = end - start
        const fpos = pos.subarray(3 * start, 3 * end)
        const fcol = col.subarray(3 * start, 3 * end)
        const rpos = new Float32Array(3 * len)
        const rcol = new Float32Array(3 * len)
        for (let i = 0; i < len; i++) {
          const j = len - 1 - i
          rpos[3 * i] = fpos[3 * j]; rpos[3 * i + 1] = fpos[3 * j + 1]; rpos[3 * i + 2] = fpos[3 * j + 2]
          rcol[3 * i] = fcol[3 * j]; rcol[3 * i + 1] = fcol[3 * j + 1]; rcol[3 * i + 2] = fcol[3 * j + 2]
        }
        const flownGeo = new LineGeometry()
        flownGeo.setPositions(fpos)
        flownGeo.setColors(fcol)
        const remainingGeo = new LineGeometry()
        remainingGeo.setPositions(rpos)
        remainingGeo.setColors(rcol)
        const flown = new Line2(flownGeo, this.flownMat)
        const remaining = new Line2(remainingGeo, this.remainingMat)
        remaining.computeLineDistances()
        const dist = remainingGeo.getAttribute('instanceDistanceEnd') as THREE.InterleavedBufferAttribute | undefined
        if (dist && dist.count > 0) this.longest = Math.max(this.longest, dist.getX(dist.count - 1))
        flown.frustumCulled = remaining.frustumCulled = false
        this.group.add(flown, remaining)
        this.stretches.push({ start, end, leg: flat.leg[start], flown, remaining, flownGeo, remainingGeo })
      }
      start = end
    }

    // one bounding sphere per leg, for framing
    this.legSpheres = flat.legStart.map((start, k) => {
      const end = k + 1 < flat.legStart.length ? flat.legStart[k + 1] : n
      const pts: THREE.Vector3[] = []
      for (let i = start; i < end; i += 4) pts.push(new THREE.Vector3(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]))
      return new THREE.Sphere().setFromPoints(pts)
    })

    // route views for the bird's-eye camera: each leg without the ascent, and the ascent on its own
    const viewOf = (a: number, b: number): RouteView => {
      const pts: THREE.Vector3[] = []
      const step = Math.max(1, Math.floor((b - a) / 120))
      for (let i = a; i < b; i += step) pts.push(new THREE.Vector3(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]))
      return { sphere: new THREE.Sphere().setFromPoints(pts), normal: pathNormal(pos, a, b) }
    }
    this.legViews = flat.legStart.map((start, k) => {
      const end = k + 1 < flat.legStart.length ? flat.legStart[k + 1] : n
      let a = start
      while (a < end && flat.kind[a] === 2) a++
      return viewOf(a < end - 1 ? a : start, end)
    })
    let ascentEnd = 0
    while (ascentEnd < n && flat.kind[ascentEnd] === 2) ascentEnd++
    this.ascent = ascentEnd >= 2 ? viewOf(0, ascentEnd) : null

    if (plan.launch) {
      const s = plan.launch.samples
      for (const ev of plan.launch.events) {
        let best = 0
        for (let i = 1; i < s.t.length; i++) if (Math.abs(s.t[i] - ev.t) < Math.abs(s.t[best] - ev.t)) best = i
        const r = s.r[best]
        const text = ev.label
        this.addMarker(ev.t, 0, kmToScene({ x: r[0], y: r[1], z: r[2] }), text, ASCENT_COLOR, ev.label !== 'liftoff', false)
      }
    }
    plan.legs.forEach((leg, k) => {
      const color = LEG_COLORS[k % LEG_COLORS.length]
      for (const b of leg.burns) {
        // a route without a ship model has impulsive burns of no duration; say only how big they are
        const dur = b.duration <= 0 ? '' : b.duration >= 60 ? `, ${(b.duration / 60).toFixed(1)} min` : `, ${b.duration.toFixed(0)} s`
        const size = b.magnitude >= 10 ? `${b.magnitude.toFixed(2)} km/s` : `${(b.magnitude * 1000).toFixed(0)} m/s`
        this.addMarker(b.t, k, kmToScene({ x: b.r[0], y: b.r[1], z: b.r[2] }), `${b.label} ${size}${dur}`, color)
      }
      if (leg.ride && leg.ride.t1 > leg.ride.t0) {
        const s = leg.ride.samples
        const mid = s.r[Math.floor(s.r.length / 2)]
        const wait = leg.ride.t1 - leg.ride.t0
        const txt = wait >= 2 * 86400 ? `wait ${(wait / 86400).toFixed(wait >= 10 * 86400 ? 0 : 1)} d` : wait >= 3600 ? `wait ${(wait / 3600).toFixed(1)} h` : `wait ${(wait / 60).toFixed(0)} min`
        this.addMarker((leg.ride.t0 + leg.ride.t1) / 2, k, kmToScene({ x: mid[0], y: mid[1], z: mid[2] }), txt, color, false, true)
      }
    })
  }

  private addMarker(t: number, leg: number, position: THREE.Vector3, text: string, color: string, glow = true, wait = false): void {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3))
    const pointMat = new THREE.PointsMaterial({
      size: glow ? 12 : 6, sizeAttenuation: false, map: getGlowTexture(), color: new THREE.Color(color),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    const point = new THREE.Points(geo, pointMat)
    point.frustumCulled = false
    point.position.copy(position)
    const { sprite, aspect } = makeLabelSprite(text, color)
    sprite.position.copy(position)
    drawOnTop(sprite)
    this.group.add(point, sprite)
    const item: LabelItem = { sprite, priority: 40, wanted: false, height: 16, aspect, base: new THREE.Vector2(-0.08, 0.5), movable: true }
    this.markers.push({ t, leg, point, pointMat, label: sprite, item, position, wait })
  }

  /**
   * Per-frame: split flown/remaining at t, size the labels and the dashes, and keep the clutter
   * down: labels belong to the selected leg, or else to the leg in play (`currentLeg`); the others
   * are dim and unlabelled. `focusDistance` is how far the camera is from what it looks at, so the
   * dashes keep about the same length on screen at any zoom.
   */
  update(t: number, opts: { showRemaining: boolean; showLabels: boolean; selectedLeg: number | null; currentLeg: number | null; remainingOnlyLeg?: number | null },
         camera: THREE.PerspectiveCamera, viewportHeight: number, fovRad: number, toWorld: (v: THREE.Vector3) => THREE.Vector3,
         ship: THREE.Vector3 | null, focusDistance: number): void {
    if (!this.flat) return
    const cameraPos = camera.position
    const k = flownCount(this.flat, t)
    this.updateTail(k, ship)
    for (const st of this.stretches) {
      const len = st.end - st.start
      const counts = segmentCounts(len, Math.min(Math.max(k - st.start, 0), len))
      st.flownGeo.instanceCount = counts.flown
      st.remainingGeo.instanceCount = counts.remaining
      st.remaining.visible = opts.showRemaining && counts.remaining > 0 && (opts.remainingOnlyLeg == null || st.leg === opts.remainingOnlyLeg)
    }
    if (this.remainingMat) {
      // a fixed size in kilometres read as long bars up close and as noise from afar; the floor keeps
      // the pattern above float precision along the longest coast, the cap is the old whole-tour size
      const wpp = worldPerPixel(focusDistance, viewportHeight, fovRad)
      const floor = this.longest * 4e-6
      const dash = Math.min(Math.max(DASH_PX * wpp, floor), 0.05 * this.rTypical)
      this.remainingMat.dashSize = dash
      this.remainingMat.gapSize = dash * (GAP_PX / DASH_PX)
    }
    const focus = opts.selectedLeg ?? opts.currentLeg
    let upcoming = 0
    for (const m of this.markers) {
      const passed = m.t <= t
      const dim = focus !== null && focus !== m.leg
      m.pointMat.opacity = (passed ? 0.35 : 1) * (dim ? 0.4 : 1)
      m.item.wanted = opts.showLabels && !dim
      // the next burns of the leg in play matter most, in time order; a wait or a burn already done least
      m.item.priority = passed ? 30 : m.wait ? 45 : 70 - 0.01 * upcoming++
      const world = toWorld(m.position.clone())
      const h = m.item.height * worldPerPixel(cameraPos.distanceTo(world), viewportHeight, fovRad)
      m.label.scale.set(h * m.item.aspect, h, 1)
      ;(m.label.material as THREE.SpriteMaterial).opacity = passed ? 0.6 : 0.95
    }
  }

  /** The burn, launch-event and wait labels, for the scene's label layout. */
  labelItems(out: LabelItem[]): void {
    for (const m of this.markers) out.push(m.item)
  }

  /** The segment from the last flown sample to the ship, while the ship is between two samples of one coast. */
  private updateTail(k: number, ship: THREE.Vector3 | null): void {
    const flat = this.flat
    if (!this.tail || !this.tailGeo || !flat || !this.pos || !this.col) return
    const i = k - 1
    const inside = ship !== null && i >= 0 && i + 1 < flat.n && flat.kind[i] !== 1 && flat.kind[i] === flat.kind[i + 1] && flat.leg[i] === flat.leg[i + 1]
    this.tail.visible = inside
    if (!inside || !ship) return
    const start = this.tailGeo.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute
    const buf = start.data
    buf.array.set([this.pos[3 * i], this.pos[3 * i + 1], this.pos[3 * i + 2], ship.x, ship.y, ship.z])
    buf.needsUpdate = true
    const cstart = this.tailGeo.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute
    const c = this.col
    cstart.data.array.set([c[3 * i], c[3 * i + 1], c[3 * i + 2], c[3 * i], c[3 * i + 1], c[3 * i + 2]])
    cstart.data.needsUpdate = true
  }

  legSphere(leg: number): THREE.Sphere | null {
    return this.legSpheres[leg] ?? null
  }

  legView(leg: number): RouteView | null {
    return this.legViews[leg] ?? null
  }

  ascentView(): RouteView | null {
    return this.ascent
  }

  wholeSphere(): THREE.Sphere | null {
    if (!this.legSpheres.length) return null
    const s = this.legSpheres[0].clone()
    for (const o of this.legSpheres.slice(1)) s.union(o)
    return s
  }

  clear(): void {
    if (this.tail) {
      this.group.remove(this.tail)
      this.tailGeo?.dispose()
      this.tail = null
      this.tailGeo = null
    }
    this.pos = null
    this.col = null
    for (const st of this.stretches) {
      this.group.remove(st.flown, st.remaining)
      st.flownGeo.dispose()
      st.remainingGeo.dispose()
    }
    this.stretches = []
    this.flownMat?.dispose()
    this.remainingMat?.dispose()
    for (const m of this.markers) {
      this.group.remove(m.point, m.label)
      m.point.geometry.dispose()
      m.pointMat.dispose()
      disposeSprite(m.label)
    }
    this.markers = []
    this.flat = null
    this.legSpheres = []
    this.legViews = []
    this.ascent = null
  }

  dispose(): void {
    this.clear()
  }
}
