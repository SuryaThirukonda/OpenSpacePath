/**
 * The ship's state at any simulated time, from the dense samples the planner returns. Cubic
 * Hermite interpolation with the sampled velocities keeps the ship smooth between samples
 * without any propagator on the client. Pure functions: no store, no scene.
 */
import type { StateVector, Vec3 } from '../types'
import type { MissionPlan } from './types'

export type SegmentKind = 'arc' | 'ride' | 'ascent'

/** All samples of a plan concatenated in time order, as typed arrays for per-frame use. */
export interface FlatPlan {
  n: number
  t: Float64Array
  r: Float64Array
  v: Float64Array
  /** leg index per sample */
  leg: Uint16Array
  /** 0 = coast arc, 1 = ride with a target, 2 = powered ascent from the pad */
  kind: Uint8Array
  /** sample index where each leg starts */
  legStart: number[]
  tStart: number
  tEnd: number
}

export function flattenPlan(plan: MissionPlan): FlatPlan {
  const parts: Array<{ t: number[]; r: number[][]; v: number[][]; leg: number; kind: 0 | 1 | 2 }> = []
  if (plan.launch && plan.launch.samples.t.length > 0) parts.push({ ...plan.launch.samples, leg: 0, kind: 2 })
  plan.legs.forEach((leg, k) => {
    for (const arc of leg.arcs) parts.push({ ...arc.samples, leg: k, kind: 0 })
    if (leg.ride && leg.ride.samples.t.length > 0) parts.push({ ...leg.ride.samples, leg: k, kind: 1 })
  })
  const n = parts.reduce((s, p) => s + p.t.length, 0)
  const out: FlatPlan = {
    n, t: new Float64Array(n), r: new Float64Array(3 * n), v: new Float64Array(3 * n),
    leg: new Uint16Array(n), kind: new Uint8Array(n), legStart: [], tStart: 0, tEnd: 0,
  }
  let i = 0
  let lastLeg = -1
  for (const p of parts) {
    if (p.leg !== lastLeg) {
      out.legStart.push(i)
      lastLeg = p.leg
    }
    for (let k = 0; k < p.t.length; k++, i++) {
      out.t[i] = p.t[k]
      out.r[3 * i] = p.r[k][0]; out.r[3 * i + 1] = p.r[k][1]; out.r[3 * i + 2] = p.r[k][2]
      out.v[3 * i] = p.v[k][0]; out.v[3 * i + 1] = p.v[k][1]; out.v[3 * i + 2] = p.v[k][2]
      out.leg[i] = p.leg
      out.kind[i] = p.kind
    }
  }
  out.tStart = n ? out.t[0] : 0
  out.tEnd = n ? out.t[n - 1] : 0
  return out
}

/** Index of the last sample with time <= t (so at a burn instant the post-burn sample wins). */
export function sampleIndexAt(flat: FlatPlan, t: number): number {
  let lo = 0
  let hi = flat.n - 1
  if (t <= flat.t[0]) return 0
  if (t >= flat.t[hi]) return hi
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (flat.t[mid] <= t) lo = mid
    else hi = mid
  }
  return lo
}

/** Number of samples already flown at time t, for the drawn "flown" range. */
export function flownCount(flat: FlatPlan, t: number): number {
  if (flat.n === 0 || t < flat.t[0]) return 0
  return sampleIndexAt(flat, t) + 1
}

export interface ShipState extends StateVector {
  leg: number
  kind: SegmentKind
  /** true before the tour starts or after it ends */
  outside: boolean
}

export function shipStateAt(flat: FlatPlan, t: number): ShipState | null {
  if (flat.n === 0) return null
  const i = sampleIndexAt(flat, t)
  const pick = (k: number): ShipState => ({
    r: { x: flat.r[3 * k], y: flat.r[3 * k + 1], z: flat.r[3 * k + 2] },
    v: { x: flat.v[3 * k], y: flat.v[3 * k + 1], z: flat.v[3 * k + 2] },
    leg: flat.leg[k], kind: kindName(flat.kind[k]), outside: t < flat.tStart || t > flat.tEnd,
  })
  if (i >= flat.n - 1 || t <= flat.t[0]) return pick(i)
  const j = i + 1
  const dt = flat.t[j] - flat.t[i]
  if (dt <= 0 || flat.leg[i] !== flat.leg[j] && flat.kind[i] !== flat.kind[j]) return pick(i)
  const s = (t - flat.t[i]) / dt
  const s2 = s * s
  const s3 = s2 * s
  const h00 = 2 * s3 - 3 * s2 + 1
  const h10 = s3 - 2 * s2 + s
  const h01 = -2 * s3 + 3 * s2
  const h11 = s3 - s2
  const d00 = 6 * s2 - 6 * s
  const d10 = 3 * s2 - 4 * s + 1
  const d01 = -6 * s2 + 6 * s
  const d11 = 3 * s2 - 2 * s
  const r = [0, 0, 0]
  const v = [0, 0, 0]
  for (let a = 0; a < 3; a++) {
    const p0 = flat.r[3 * i + a], p1 = flat.r[3 * j + a]
    const m0 = flat.v[3 * i + a] * dt, m1 = flat.v[3 * j + a] * dt
    r[a] = h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1
    v[a] = (d00 * p0 + d10 * m0 + d01 * p1 + d11 * m1) / dt
  }
  return {
    r: { x: r[0], y: r[1], z: r[2] }, v: { x: v[0], y: v[1], z: v[2] },
    leg: flat.leg[i], kind: kindName(flat.kind[i]), outside: false,
  }
}

function kindName(k: number): SegmentKind {
  return k === 0 ? 'arc' : k === 1 ? 'ride' : 'ascent'
}

export function toVec3(a: [number, number, number]): Vec3 {
  return { x: a[0], y: a[1], z: a[2] }
}
