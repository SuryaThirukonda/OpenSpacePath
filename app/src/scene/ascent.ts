/**
 * Which way a rocket points during the ascent. The planner (api/launch.py) integrates the ascent
 * in the launch plane: it keeps the part of the pad's eastward speed that lies in that plane and
 * lets the air turn with it (`vt_air = vt - vt0 r / r0`). The first sample still carries the pad's
 * whole velocity, so "velocity minus Earth's spin" points sideways for the first seconds and laid
 * the rocket on its side. The nose instead follows the velocity relative to the planner's own
 * turning air, which is vertical at liftoff and pitches over as the rocket gains speed.
 */
import type { Vec3 } from '../types'

export interface AscentFrame {
  /** unit normal of the launch plane */
  n: Vec3
  /** rad/s about n at which the planner's air turns with the pad */
  rate: number
}

interface Samples {
  r: number[][]
  v: number[][]
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const vec = (a: number[]): Vec3 => ({ x: a[0], y: a[1], z: a[2] })
const norm = (a: Vec3) => Math.sqrt(dot(a, a))

/** The launch plane and the air's turn rate from the ascent samples, or null when there are too few. */
export function ascentFrame(samples: Samples): AscentFrame | null {
  if (samples.r.length < 2) return null
  // the plane of the integrated motion, from the first sample after liftoff
  const nRaw = cross(vec(samples.r[1]), vec(samples.v[1]))
  const nLen = norm(nRaw)
  if (nLen === 0) return null
  const n = { x: nRaw.x / nLen, y: nRaw.y / nLen, z: nRaw.z / nLen }
  // the pad's speed along the plane at liftoff, which the planner keeps; the part across it is dropped
  const r0 = vec(samples.r[0])
  const v0 = vec(samples.v[0])
  const r0Len = norm(r0)
  if (r0Len === 0) return null
  const tangent = cross(n, r0)
  const vt0 = dot(v0, tangent) / r0Len
  return { n, rate: vt0 / r0Len }
}

/**
 * The nose direction at a state on the ascent (unit vector), in the same frame as the samples:
 * the velocity relative to the turning air, kept in the launch plane; straight up while that is
 * slower than `minSpeed` km/s (on the pad and the first moments after liftoff).
 */
export function ascentHeading(frame: AscentFrame, r: Vec3, v: Vec3, minSpeed = 0.02): Vec3 {
  const spin = cross(frame.n, r)
  const rel = { x: v.x - frame.rate * spin.x, y: v.y - frame.rate * spin.y, z: v.z - frame.rate * spin.z }
  const across = dot(rel, frame.n)
  rel.x -= across * frame.n.x
  rel.y -= across * frame.n.y
  rel.z -= across * frame.n.z
  const speed = norm(rel)
  if (speed >= minSpeed) return { x: rel.x / speed, y: rel.y / speed, z: rel.z / speed }
  const rLen = norm(r) || 1
  return { x: r.x / rLen, y: r.y / rLen, z: r.z / rLen }
}
