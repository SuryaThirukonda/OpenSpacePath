import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Attitude, orientationFrom, SHIP_ATTITUDE } from '../../src/scene/attitude'

const angleBetween = (a: THREE.Quaternion, b: THREE.Quaternion) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))))

describe('the ship turns like a vehicle', () => {
  it('builds an orientation whose nose and belly are as asked', () => {
    const q = orientationFrom(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1))
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(q).distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-9)
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-9)
    // an up that is not perpendicular is made so; one parallel to the nose still gives a valid frame
    const q2 = orientationFrom(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 1))
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q2).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-9)
    const q3 = orientationFrom(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1))
    expect(Math.abs(q3.length() - 1)).toBeLessThan(1e-9)
  })

  it('reaches a 90 degree target smoothly, within the rate and acceleration limits, without overshoot', () => {
    const att = new Attitude({ maxRate: 2.0, maxAccel: 4.0, gain: 5.0 })
    att.snap(orientationFrom(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)))
    const target = orientationFrom(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))
    const dt = 1 / 120
    let maxRate = 0
    let prevRate = 0
    let maxAccel = 0
    let minAngle = Infinity
    let settled = -1
    for (let k = 0; k < 600; k++) {
      att.advance(target, dt)
      const rate = att.rate.length()
      maxRate = Math.max(maxRate, rate)
      maxAccel = Math.max(maxAccel, Math.abs(rate - prevRate) / dt)
      prevRate = rate
      const angle = angleBetween(att.q, target)
      minAngle = Math.min(minAngle, angle)
      if (settled < 0 && angle < 0.01) settled = k * dt
    }
    expect(maxRate).toBeLessThanOrEqual(2.0 + 1e-9)
    expect(maxAccel).toBeLessThanOrEqual(4.0 + 1e-6)
    expect(settled).toBeGreaterThan(0.6)        // a real turn, not a snap
    expect(settled).toBeLessThan(2.0)           // but over in a couple of seconds
    expect(angleBetween(att.q, target)).toBeLessThan(0.01)
    expect(att.rate.length()).toBeLessThan(0.05) // at rest once there
  })

  it('snaps at once when asked and ignores a non-positive step', () => {
    const att = new Attitude()
    const target = orientationFrom(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1))
    att.snap(target)
    expect(angleBetween(att.q, target)).toBeLessThan(1e-12)
    const before = att.q.clone()
    att.advance(orientationFrom(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)), 0)
    expect(att.q.equals(before)).toBe(true)
  })

  it('swings onto a new direction of flight within a second while the orbit keeps turning', () => {
    // the direction of flight turns at 3 rad/s of wall time (a low orbit played fast); a burn then
    // knocks it 90 degrees off. Carrying the orbit's turn, the slew only has the 90 degrees to remove
    const att = new Attitude(SHIP_ATTITUDE)
    const up = new THREE.Vector3(0, 1, 0)
    const dirAt = (a: number) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a))
    const dt = 1 / 60
    let last = orientationFrom(dirAt(0), up)
    att.snap(last)
    let settled = -1
    for (let k = 1; k <= 120; k++) {
      const a = 3 * k * dt + Math.PI / 2          // the burn's 90 degrees, then the orbit's turn
      const target = orientationFrom(dirAt(a), up)
      if (k > 1) att.carry(last, target)            // not the burn's jump itself
      att.advance(target, dt)
      last = target
      if (settled < 0 && att.angleTo(target) < 0.01) settled = k * dt
    }
    expect(settled).toBeGreaterThan(0.2)
    expect(settled).toBeLessThan(1.0)
    expect(att.angleTo(last)).toBeLessThan(0.01)     // and it stays on it
  })
})
