/**
 * A rigid-body attitude for the ship, so it turns like a vehicle instead of snapping: a target
 * orientation is approached with a bounded turn rate and a bounded angular acceleration, in wall
 * time, so a slew looks the same at any playback rate. Pure maths, testable without a renderer.
 */
import * as THREE from 'three'

export interface AttitudeLimits {
  /** rad/s, the fastest the ship turns */
  maxRate: number
  /** rad/s^2, how quickly the turn rate can change */
  maxAccel: number
  /** 1/s, how strongly the rate follows the remaining angle (the proportional gain) */
  gain: number
}

/** brisk: the ship only slews after a burn, and should be back on its direction of flight within a second */
export const SHIP_ATTITUDE: AttitudeLimits = { maxRate: 4.0, maxAccel: 16.0, gain: 8.0 }

const FORWARD = new THREE.Vector3(0, 0, 1)
const UP = new THREE.Vector3(0, 1, 0)

/** The orientation whose +z is `forward` and whose +y is as close to `up` as it can be. */
export function orientationFrom(forward: THREE.Vector3, up: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
  const f = forward.clone().normalize()
  let u = up.clone().addScaledVector(f, -up.dot(f))
  if (u.lengthSq() < 1e-10) u = new THREE.Vector3(0, 0, 1).addScaledVector(f, -f.z)
  if (u.lengthSq() < 1e-10) u = new THREE.Vector3(1, 0, 0).addScaledVector(f, -f.x)
  u.normalize()
  const r = u.clone().cross(f).normalize()   // right-handed: x = y cross z
  const m = new THREE.Matrix4().makeBasis(r, u, f)
  return out.setFromRotationMatrix(m)
}

export class Attitude {
  readonly q = new THREE.Quaternion()
  readonly rate = new THREE.Vector3()
  private readonly err = new THREE.Quaternion()
  private readonly axis = new THREE.Vector3()
  private readonly want = new THREE.Vector3()
  private readonly step = new THREE.Quaternion()
  private readonly inv = new THREE.Quaternion()

  readonly limits: AttitudeLimits

  constructor(limits: AttitudeLimits = SHIP_ATTITUDE) {
    this.limits = limits
  }

  /** Take the target orientation at once, at rest; used when time jumps. */
  snap(target: THREE.Quaternion): void {
    this.q.copy(target)
    this.rate.set(0, 0, 0)
  }

  /** Advance by `dt` seconds of wall time towards `target`. */
  advance(target: THREE.Quaternion, dt: number): void {
    if (!(dt > 0)) return
    // the rotation still to make, as an axis and an angle (the short way round)
    this.inv.copy(this.q).invert()
    this.err.copy(target).multiply(this.inv)
    if (this.err.w < 0) this.err.set(-this.err.x, -this.err.y, -this.err.z, -this.err.w)
    const s = Math.sqrt(Math.max(0, 1 - this.err.w * this.err.w))
    const angle = 2 * Math.atan2(s, this.err.w)
    if (s > 1e-9) this.axis.set(this.err.x / s, this.err.y / s, this.err.z / s)
    else this.axis.set(0, 0, 0)
    // the rate the controller wants: proportional to the angle, capped, and never so fast that
    // it cannot stop in time (v^2 <= 2 a theta)
    const wanted = Math.min(this.limits.maxRate, this.limits.gain * angle, Math.sqrt(2 * this.limits.maxAccel * angle))
    this.want.copy(this.axis).multiplyScalar(wanted)
    // the rate can only change by maxAccel * dt
    const dx = this.want.x - this.rate.x, dy = this.want.y - this.rate.y, dz = this.want.z - this.rate.z
    const need = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const can = this.limits.maxAccel * dt
    if (need <= can) this.rate.copy(this.want)
    else this.rate.set(this.rate.x + (dx / need) * can, this.rate.y + (dy / need) * can, this.rate.z + (dz / need) * can)
    // integrate: rotate by rate * dt
    const w = this.rate.length()
    if (w * dt > 1e-9) {
      const turn = Math.min(w * dt, angle > 0 ? Math.max(angle, 1e-6) : w * dt)
      this.step.setFromAxisAngle(this.axis.lengthSq() > 0 ? this.axis : this.rate.clone().normalize(), turn)
      this.q.premultiply(this.step).normalize()
    }
  }

  /**
   * Turn along with a target that is itself turning, from `from` to `to`: the orbit's own curve,
   * so a slew in progress removes only the remaining error and never lags behind the flight.
   */
  carry(from: THREE.Quaternion, to: THREE.Quaternion): void {
    this.inv.copy(from).invert()
    this.step.copy(to).multiply(this.inv)
    this.q.premultiply(this.step).normalize()
  }

  /** The angle, in radians, between the current orientation and `target`. */
  angleTo(target: THREE.Quaternion): number {
    return 2 * Math.acos(Math.min(1, Math.abs(this.q.dot(target))))
  }

  /** The direction the nose points. */
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(FORWARD).applyQuaternion(this.q)
  }

  up(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(UP).applyQuaternion(this.q)
  }
}
