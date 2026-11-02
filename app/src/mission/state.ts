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

/**
 * The largest angle at the central body between consecutive samples, about 1.2 degrees, so a
 * revolution is drawn as a 300-gon. The planner samples each coast at a fixed count, which is
 * sparse on a coast that circles the body several times: drawn as is, every lap was a different
 * polygon and the path looked like a bundle of strands. Sub-samples come from the same cubic
 * Hermite interpolation that places the ship, so the line passes through every position it takes.
 */
export const MAX_SAMPLE_ANGLE = (1.2 * Math.PI) / 180
const MAX_SPLIT = 32

/** How many pieces the interval between two samples is drawn in, from the angle it spans at the body. */
export function splitCount(r0: ArrayLike<number>, r1: ArrayLike<number>, dt: number): number {
  if (!(dt > 0)) return 1
  const a0 = Math.hypot(r0[0], r0[1], r0[2])
  const a1 = Math.hypot(r1[0], r1[1], r1[2])
  if (a0 === 0 || a1 === 0) return 1
  const c = (r0[0] * r1[0] + r0[1] * r1[1] + r0[2] * r1[2]) / (a0 * a1)
  const angle = Math.acos(Math.min(1, Math.max(-1, c)))
  return Math.min(MAX_SPLIT, Math.max(1, Math.ceil(angle / MAX_SAMPLE_ANGLE)))
}

/** Cubic Hermite between two states a time dt apart, at the fraction s of the way; position and velocity. */
function hermite(p0: ArrayLike<number>, v0: ArrayLike<number>, p1: ArrayLike<number>, v1: ArrayLike<number>, dt: number, s: number): { r: number[]; v: number[] } {
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
    const m0 = v0[a] * dt, m1 = v1[a] * dt
    r[a] = h00 * p0[a] + h10 * m0 + h01 * p1[a] + h11 * m1
    v[a] = (d00 * p0[a] + d10 * m0 + d01 * p1[a] + d11 * m1) / dt
  }
  return { r, v }
}

export function flattenPlan(plan: MissionPlan): FlatPlan {
  const parts: Array<{ t: number[]; r: number[][]; v: number[][]; leg: number; kind: 0 | 1 | 2 }> = []
  if (plan.launch && plan.launch.samples.t.length > 0) parts.push({ ...plan.launch.samples, leg: 0, kind: 2 })
  if (plan.prelude && plan.prelude.samples.t.length > 0) parts.push({ ...plan.prelude.samples, leg: 0, kind: 1 })
  plan.legs.forEach((leg, k) => {
    for (const arc of leg.arcs) parts.push({ ...arc.samples, leg: k, kind: 0 })
    if (leg.ride && leg.ride.samples.t.length > 0) parts.push({ ...leg.ride.samples, leg: k, kind: 1 })
  })
  const t: number[] = [], r: number[] = [], v: number[] = [], leg: number[] = [], kind: number[] = []
  const legStart: number[] = []
  const push = (tt: number, rr: ArrayLike<number>, vv: ArrayLike<number>, lg: number, kd: number): void => {
    t.push(tt); r.push(rr[0], rr[1], rr[2]); v.push(vv[0], vv[1], vv[2]); leg.push(lg); kind.push(kd)
  }
  let lastLeg = -1
  for (const p of parts) {
    if (p.leg !== lastLeg) {
      legStart.push(t.length)
      lastLeg = p.leg
    }
    for (let k = 0; k < p.t.length; k++) {
      push(p.t[k], p.r[k], p.v[k], p.leg, p.kind)
      if (k + 1 >= p.t.length) continue
      const dt = p.t[k + 1] - p.t[k]
      const m = splitCount(p.r[k], p.r[k + 1], dt)
      for (let q = 1; q < m; q++) {
        const s = q / m
        const h = hermite(p.r[k], p.v[k], p.r[k + 1], p.v[k + 1], dt, s)
        push(p.t[k] + s * dt, h.r, h.v, p.leg, p.kind)
      }
    }
  }
  const n = t.length
  return {
    n, t: Float64Array.from(t), r: Float64Array.from(r), v: Float64Array.from(v),
    leg: Uint16Array.from(leg), kind: Uint8Array.from(kind), legStart, tStart: n ? t[0] : 0, tEnd: n ? t[n - 1] : 0,
  }
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
  // no interpolation across a change of leg and kind at once: those samples share a time anyway
  if (dt <= 0 || (flat.leg[i] !== flat.leg[j] && flat.kind[i] !== flat.kind[j])) return pick(i)
  const { r, v } = hermite(flat.r.subarray(3 * i, 3 * i + 3), flat.v.subarray(3 * i, 3 * i + 3),
                           flat.r.subarray(3 * j, 3 * j + 3), flat.v.subarray(3 * j, 3 * j + 3), dt, (t - flat.t[i]) / dt)
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
