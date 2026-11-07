import { describe, expect, it } from 'vitest'
import { ascentFrame, ascentHeading } from '../../src/scene/ascent'

// An equatorial launch eastward: the pad at (R, 0, 0) moving +y at the in-plane speed, plus a
// sideways part (the pad's velocity across the plane) that the planner drops after liftoff.
const R = 6378
const vt0 = 0.29
const samples = {
  r: [[R, 0, 0], [R + 0.05, vt0 * 2, 0], [R + 3, vt0 * 40 + 0.4, 0]],
  v: [[0, vt0, 0.2], [0.05, vt0, 0], [0.12, vt0 + 0.02, 0]],
}

describe('rocket heading on the ascent', () => {
  const frame = ascentFrame(samples)!
  it('finds the launch plane and the rate the air turns with the pad', () => {
    expect(frame.n.z).toBeCloseTo(1, 9)
    expect(frame.rate).toBeCloseTo(vt0 / R, 12)
  })

  it('stands up on the pad even though the first sample carries the sideways speed', () => {
    const h = ascentHeading(frame, { x: R, y: 0, z: 0 }, { x: 0, y: vt0, z: 0.2 })
    expect(h.x).toBeCloseTo(1, 9)
  })

  it('climbs nearly vertically just after liftoff and stays in the launch plane', () => {
    const r = { x: R + 0.05, y: vt0 * 2, z: 0 }
    const h = ascentHeading(frame, r, { x: 0.05, y: vt0, z: 0 })
    expect(h.x).toBeGreaterThan(0.99)
    expect(Math.abs(h.z)).toBeLessThan(1e-12)
  })

  it('pitches over once the horizontal speed over the turning air builds up', () => {
    const r = { x: R + 20, y: 300, z: 0 }
    const h = ascentHeading(frame, r, { x: 0.3, y: vt0 * (1 + 20 / R) + 0.5, z: 0 })
    expect(h.y).toBeGreaterThan(0.8)
  })
})
