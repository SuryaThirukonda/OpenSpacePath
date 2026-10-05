/**
 * The whole tour as one thick line, split each frame into the part already flown (solid) and
 * the part still to come (dashed, dimmer), plus burn markers with labels and dwell badges.
 * The remaining line stores its samples in reverse so that limiting the instance count draws
 * the tail of the tour back to the ship.
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
import { makeLineMaterial, segmentCounts } from './lines'
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
  labelAspect: number
  position: THREE.Vector3
}

export class MissionPath {
  readonly group = new THREE.Group()
  private flown?: Line2
  private remaining?: Line2
  private flownGeo?: LineGeometry
  private remainingGeo?: LineGeometry
  private flownMat?: LineMaterial
  private remainingMat?: LineMaterial
  private markers: Marker[] = []
  private flat: FlatPlan | null = null
  private legSpheres: THREE.Sphere[] = []
  private legViews: RouteView[] = []
  private ascent: RouteView | null = null

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
      if (flat.kind[i] === 1) c.multiplyScalar(0.7) // rides a little dimmer than coasts
      col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b
    }
    if (n >= 2) {
      const rpos = new Float32Array(3 * n)
      const rcol = new Float32Array(3 * n)
      for (let i = 0; i < n; i++) {
        const j = n - 1 - i
        rpos[3 * i] = pos[3 * j]; rpos[3 * i + 1] = pos[3 * j + 1]; rpos[3 * i + 2] = pos[3 * j + 2]
        rcol[3 * i] = col[3 * j]; rcol[3 * i + 1] = col[3 * j + 1]; rcol[3 * i + 2] = col[3 * j + 2]
      }
      this.flownGeo = new LineGeometry()
      this.flownGeo.setPositions(pos)
      this.flownGeo.setColors(col)
      this.remainingGeo = new LineGeometry()
      this.remainingGeo.setPositions(rpos)
      this.remainingGeo.setColors(rcol)
      this.flownMat = makeLineMaterial({ vertexColors: true, width: 3, opacity: 1 })
      this.remainingMat = makeLineMaterial({ vertexColors: true, width: 2.2, opacity: 0.45, dashed: { dashSize: 0.35, gapSize: 0.22 } })
      this.flown = new Line2(this.flownGeo, this.flownMat)
      this.remaining = new Line2(this.remainingGeo, this.remainingMat)
      this.remaining.computeLineDistances()
      this.flown.frustumCulled = this.remaining.frustumCulled = false
      this.group.add(this.flown, this.remaining)
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
        this.addMarker(ev.t, 0, kmToScene({ x: r[0], y: r[1], z: r[2] }), text, ASCENT_COLOR, ev.label !== 'liftoff')
      }
    }
    plan.legs.forEach((leg, k) => {
      const color = LEG_COLORS[k % LEG_COLORS.length]
      for (const b of leg.burns) {
        const dur = b.duration >= 60 ? `${(b.duration / 60).toFixed(1)} min` : `${b.duration.toFixed(0)} s`
        this.addMarker(b.t, k, kmToScene({ x: b.r[0], y: b.r[1], z: b.r[2] }), `${b.label} ${(b.magnitude * 1000).toFixed(0)} m/s, ${dur}`, color)
      }
      if (leg.ride && leg.ride.t1 > leg.ride.t0) {
        const s = leg.ride.samples
        const mid = s.r[Math.floor(s.r.length / 2)]
        const wait = leg.ride.t1 - leg.ride.t0
        const txt = wait >= 3600 ? `wait ${(wait / 3600).toFixed(1)} h` : `wait ${(wait / 60).toFixed(0)} min`
        this.addMarker((leg.ride.t0 + leg.ride.t1) / 2, k, kmToScene({ x: mid[0], y: mid[1], z: mid[2] }), txt, color, false)
      }
    })
  }

  private addMarker(t: number, leg: number, position: THREE.Vector3, text: string, color: string, glow = true): void {
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
    this.group.add(point, sprite)
    this.markers.push({ t, leg, point, pointMat, label: sprite, labelAspect: aspect, position })
  }

  /** Per-frame: split flown/remaining at t, dim passed markers, size labels. */
  update(t: number, opts: { showRemaining: boolean; showLabels: boolean; selectedLeg: number | null },
         cameraPos: THREE.Vector3, viewportHeight: number, fovRad: number, toWorld: (v: THREE.Vector3) => THREE.Vector3): void {
    if (!this.flat) return
    if (this.flownGeo && this.remainingGeo && this.remaining) {
      const k = flownCount(this.flat, t)
      const counts = segmentCounts(this.flat.n, k)
      this.flownGeo.instanceCount = counts.flown
      this.remainingGeo.instanceCount = counts.remaining
      this.remaining.visible = opts.showRemaining && counts.remaining > 0
    }
    for (const m of this.markers) {
      const passed = m.t <= t
      const dim = opts.selectedLeg !== null && opts.selectedLeg !== m.leg
      m.pointMat.opacity = (passed ? 0.35 : 1) * (dim ? 0.4 : 1)
      m.label.visible = opts.showLabels && !dim
      const h = 16 * worldPerPixel(cameraPos.distanceTo(toWorld(m.position.clone())), viewportHeight, fovRad)
      m.label.scale.set(h * m.labelAspect, h, 1)
      ;(m.label.material as THREE.SpriteMaterial).opacity = passed ? 0.55 : 0.95
    }
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
    for (const o of [this.flown, this.remaining]) if (o) this.group.remove(o)
    this.flownGeo?.dispose()
    this.remainingGeo?.dispose()
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
    this.flown = this.remaining = undefined
  }

  dispose(): void {
    this.clear()
  }
}
