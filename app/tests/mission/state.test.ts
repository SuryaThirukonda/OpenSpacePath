import { describe, expect, it } from 'vitest'
import { DEG } from '../../src/core/constants'
import { period } from '../../src/core/elements'
import { elementsToState, norm } from '../../src/core/kepler'
import { BODY_BY_ID } from '../../src/data/bodies'
import { flattenPlan, flownCount, sampleIndexAt, shipStateAt } from '../../src/mission/state'
import type { MissionPlan, Samples } from '../../src/mission/types'

const mu = BODY_BY_ID.earth.mu
const el = { a: 6798, e: 0.0005, i: 51.6 * DEG, raan: 282.4 * DEG, argp: 96.5 * DEG, M0: 0 }
const molniya = { a: 26600, e: 0.74, i: 63.4 * DEG, raan: 0, argp: 270 * DEG, M0: 0 }

function sampled(elements: typeof el, t0: number, t1: number, n = 200): Samples {
  const s: Samples = { t: [], r: [], v: [] }
  for (let k = 0; k <= n; k++) {
    const t = t0 + ((t1 - t0) * k) / n
    const st = elementsToState(elements, mu, t)
    s.t.push(t); s.r.push([st.r.x, st.r.y, st.r.z]); s.v.push([st.v.x, st.v.y, st.v.z])
  }
  return s
}

function fakePlan(): MissionPlan {
  const T = period(el.a, mu)
  const arc = sampled(el, 0, T)
  const ride = sampled(molniya, T, T + 1800)
  return {
    legs: [{
      toStop: 0, strategy: 'lambert2', tof: T, totalDv: 1, warnings: [],
      burns: [{ t: 0, r: arc.r[0], dv: [0, 0, 0], magnitude: 0, duration: 0, propellant: 0, label: 'depart' },
              { t: T, r: arc.r[200], dv: [0, 0, 0], magnitude: 0, duration: 0, propellant: 0, label: 'arrive' }],
      arcs: [{ t0: 0, t1: T, samples: arc }],
      ride: { t0: T, t1: T + 1800, satelliteId: 'x', samples: ride },
    }],
    totalDv: 1, totalTime: T + 1800, propellantLeft: 1, feasible: true,
  }
}

describe('mission state interpolation', () => {
  const flat = flattenPlan(fakePlan())
  const T = period(el.a, mu)

  it('flattens arcs and rides in time order with leg starts', () => {
    expect(flat.n).toBe(402)
    expect(flat.legStart).toEqual([0])
    expect(flat.tStart).toBe(0)
    expect(flat.tEnd).toBeCloseTo(T + 1800, 9)
  })

  it('interpolates within a metre and a millimetre per second at sample midpoints', () => {
    let worstR = 0, worstV = 0
    for (let k = 0; k < 200; k++) {
      const t = (T * (k + 0.5)) / 200
      const s = shipStateAt(flat, t)!
      const truth = elementsToState(el, mu, t)
      worstR = Math.max(worstR, norm({ x: s.r.x - truth.r.x, y: s.r.y - truth.r.y, z: s.r.z - truth.r.z }))
      worstV = Math.max(worstV, norm({ x: s.v.x - truth.v.x, y: s.v.y - truth.v.y, z: s.v.z - truth.v.z }))
      expect(s.kind).toBe('arc')
    }
    expect(worstR).toBeLessThan(1e-3)
    expect(worstV).toBeLessThan(1e-6)
  })

  it('takes the post-burn sample at a burn instant and clamps outside the tour', () => {
    expect(flat.kind[sampleIndexAt(flat, T)]).toBe(1)
    expect(shipStateAt(flat, T)!.kind).toBe('ride')
    expect(shipStateAt(flat, -10)!.outside).toBe(true)
    expect(shipStateAt(flat, T + 5000)!.outside).toBe(true)
    expect(shipStateAt(flat, T + 5000)!.r.x).toBe(flat.r[3 * (flat.n - 1)])
  })

  it('counts flown samples monotonically', () => {
    expect(flownCount(flat, -1)).toBe(0)
    expect(flownCount(flat, 0)).toBe(1)
    expect(flownCount(flat, T / 2)).toBeGreaterThan(90)
    expect(flownCount(flat, T + 1800)).toBe(flat.n)
  })
})
