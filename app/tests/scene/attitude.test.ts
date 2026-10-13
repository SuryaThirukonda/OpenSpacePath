import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Attitude, orientationFrom } from '../../src/scene/attitude'

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
})
