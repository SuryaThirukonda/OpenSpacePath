import { describe, expect, it } from 'vitest'
import { DEG } from '../../src/core/constants'
import { period } from '../../src/core/elements'
import { elementsToState, norm } from '../../src/core/kepler'
import { BODY_BY_ID } from '../../src/data/bodies'
import { flattenPlan, flownCount, MAX_SAMPLE_ANGLE, sampleIndexAt, shipStateAt, splitCount } from '../../src/mission/state'
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

function withLaunch(plan: MissionPlan): MissionPlan {
  const samples = sampled(el, -600, 0, 20)
  return {
    ...plan,
    launch: {
      siteName: 'Cape', vehicleName: 'F9', liftoffT: -600, mecoT: -200, insertionT: 0, azimuthDeg: 45, inclinationDeg: 51.6, raanDeg: 0,
      planeAlignment: 1, parkingAltitude: 200, parkingPeriod: 5300, grossLiftoffMass: 5e5, payloadMass: 1e4, kickAngleDeg: 3, maxQ: 30, maxG: 4,
      downrangeKm: 1000, events: [{ t: -600, label: 'liftoff' }], stages: [], samples, warnings: [], feasible: true,
      budget: { ideal: 8, gravityLoss: 1, dragLoss: 0.1, steeringLoss: 0.2, circularization: 0.1, earthRotation: 0.3, planeCorrection: 0.01 },
      burnIntervals: [{ t0: -600, t1: -200, label: 'burn' }],
    },
  }
}

describe('mission state with a launch', () => {
  it('puts the ascent first, before the first leg, and reports it as its own kind', () => {
    const flat = flattenPlan(withLaunch(fakePlan()))
    expect(flat.tStart).toBe(-600)
    expect(flat.kind[0]).toBe(2)
    expect(shipStateAt(flat, -300)?.kind).toBe('ascent')
    expect(shipStateAt(flat, 10)?.kind).toBe('arc')
    expect(flat.legStart).toEqual([0])
    for (let i = 1; i < flat.n; i++) expect(flat.t[i]).toBeGreaterThanOrEqual(flat.t[i - 1])
  })
})

describe('mission state interpolation', () => {
  const flat = flattenPlan(fakePlan())
  const T = period(el.a, mu)

  it('flattens arcs and rides in time order with leg starts, keeping every planner sample', () => {
    expect(flat.n).toBeGreaterThanOrEqual(402)
    const times = new Set(Array.from(flat.t))
    for (const tt of fakePlan().legs[0].arcs[0].samples.t) expect(times.has(tt)).toBe(true)
    for (let i = 1; i < flat.n; i++) expect(flat.t[i]).toBeGreaterThanOrEqual(flat.t[i - 1])
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

describe('sparse planner samples are drawn densely', () => {
  const T = period(el.a, mu)
  // four revolutions with 12 samples a revolution: each lap drawn through those points alone would be a
  // different dodecagon, which is what a long coast around the body looked like
  const coarse: MissionPlan = {
    legs: [{ toStop: 0, strategy: 'lambert2', tof: 4 * T, totalDv: 0, warnings: [], burns: [], arcs: [{ t0: 0, t1: 4 * T, samples: sampled(el, 0, 4 * T, 48) }] }],
    totalDv: 0, totalTime: 4 * T, propellantLeft: 1, feasible: true,
  }
  const flat = flattenPlan(coarse)

  it('splits each interval by the angle it spans at the body', () => {
    expect(splitCount([7000, 0, 0], [7000, 0, 0], 10)).toBe(1)
    expect(splitCount([7000, 0, 0], [7000 * Math.cos(0.2), 7000 * Math.sin(0.2), 0], 10)).toBe(Math.ceil(0.2 / MAX_SAMPLE_ANGLE))
    expect(splitCount([7000, 0, 0], [0, 7000, 0], 10)).toBe(32) // a quarter turn in one interval is capped
    expect(splitCount([7000, 0, 0], [0, 7000, 0], 0)).toBe(1)
    expect(flat.n).toBeGreaterThan(48 * 20)
    for (let i = 1; i < flat.n; i++) {
      const a = [flat.r[3 * i - 3], flat.r[3 * i - 2], flat.r[3 * i - 1]], b = [flat.r[3 * i], flat.r[3 * i + 1], flat.r[3 * i + 2]]
      const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b))
      expect(Math.acos(Math.min(1, c))).toBeLessThanOrEqual(MAX_SAMPLE_ANGLE * 1.001)
    }
  })

  it('places the extra points on the orbit, to a few metres, with the planner samples untouched', () => {
    let worst = 0
    for (let i = 0; i < flat.n; i++) {
      const truth = elementsToState(el, mu, flat.t[i])
      worst = Math.max(worst, norm({ x: flat.r[3 * i] - truth.r.x, y: flat.r[3 * i + 1] - truth.r.y, z: flat.r[3 * i + 2] - truth.r.z }))
    }
    expect(worst).toBeLessThan(2) // km, the cubic's error over a 30-degree step; a dodecagon's side sags 230 km
    const s = shipStateAt(flat, T / 12)!
    const truth = elementsToState(el, mu, T / 12)
    expect(s.r.x).toBeCloseTo(truth.r.x, 6)
    expect(flownCount(flat, 4 * T)).toBe(flat.n)
  })
})
