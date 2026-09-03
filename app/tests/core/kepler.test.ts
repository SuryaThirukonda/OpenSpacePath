import { describe, expect, it } from 'vitest'
import { DEG, TWO_PI, wrapPi } from '../../src/core/constants'
import {
  elementsToState, meanToTrue, norm, solveKepler, stateFromTrueAnomaly, trueToMean,
} from '../../src/core/kepler'
import { period } from '../../src/core/elements'
import { BODY_BY_ID } from '../../src/data/bodies'

const MU = 398600.4418

function close(v: { x: number; y: number; z: number }, e: [number, number, number], tol: number) {
  expect(Math.abs(v.x - e[0])).toBeLessThan(tol)
  expect(Math.abs(v.y - e[1])).toBeLessThan(tol)
  expect(Math.abs(v.z - e[2])).toBeLessThan(tol)
}

describe('perifocal to inertial rotation (Curtis Example 4.7)', () => {
  it('reproduces the printed state vector', () => {
    // h = 80000 km^2/s, e = 1.4, i = 30, RAAN = 40, argp = 60, theta = 30 deg, mu = 398600
    const mu = 398600
    const p = (80000 * 80000) / mu
    const s = stateFromTrueAnomaly(p, 1.4, 30 * DEG, 40 * DEG, 60 * DEG, 30 * DEG, mu)
    close(s.r, [-4040, 4815, 3629], 1.0)
    close(s.v, [-10.39, -4.772, 1.744], 0.01)
  })
})

describe('circular hand cases at a = 7000 km', () => {
  const el = (i: number, raan: number, argp: number, nu: number) =>
    stateFromTrueAnomaly(7000, 0, i * DEG, raan * DEG, argp * DEG, nu * DEG, MU).r
  it('equatorial, theta 60', () => close(el(0, 0, 0, 60), [3500, 6062.18, 0], 0.01))
  it('i 30, theta 90', () => close(el(30, 0, 0, 90), [0, 6062.18, 3500], 0.01))
  it('polar over the pole', () => close(el(90, 90, 0, 90), [0, 0, 7000], 1e-6))
  it('i 5, RAAN 30, theta 60', () => close(el(5, 30, 0, 60), [11.53, 6980.02, 528.35], 0.01))
})

describe('ISS-like orbit', () => {
  const el = { a: 6795, e: 0.0005, i: 51.6 * DEG, raan: 0, argp: 0, M0: 0 }
  it('stays within the expected radius and speed bands over one revolution', () => {
    const T = period(el.a, MU)
    for (let k = 0; k <= 50; k++) {
      const s = elementsToState(el, MU, (k / 50) * T)
      const r = norm(s.r)
      const v = norm(s.v)
      expect(r).toBeGreaterThan(6791.6 - 0.05)
      expect(r).toBeLessThan(6798.4 + 0.05)
      expect(v).toBeGreaterThan(7.655 - 0.002)
      expect(v).toBeLessThan(7.663 + 0.002)
    }
  })
  it('returns to the start after one period', () => {
    const T = period(el.a, MU)
    const a = elementsToState(el, MU, 0).r
    const b = elementsToState(el, MU, T).r
    close(b, [a.x, a.y, a.z], 1e-6)
  })
})

describe('periods', () => {
  it('GEO period is one sidereal day', () => {
    expect(Math.abs(period(42164.17, MU) - 86164.09)).toBeLessThan(0.1)
  })
  it('ISS period is about 92.9 min', () => {
    expect(period(6795, BODY_BY_ID.earth.mu) / 60).toBeCloseTo(92.91, 1)
  })
})

describe('Kepler equation solver', () => {
  it('converges for a dense (M, e) grid up to e = 0.999', () => {
    for (const e of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 0.95, 0.99, 0.999]) {
      for (let k = 0; k < 720; k++) {
        const M = (k / 720) * TWO_PI - Math.PI
        const E = solveKepler(M, e)
        expect(Math.abs(wrapPi(E - e * Math.sin(E) - M))).toBeLessThan(1e-9)
      }
    }
  })
  it('true <-> mean anomaly round trips', () => {
    for (const e of [0, 0.2, 0.74, 0.95]) {
      for (let k = 0; k < 36; k++) {
        const M = (k / 36) * TWO_PI - Math.PI
        const nu = meanToTrue(M, e)
        const back = trueToMean(nu, e)
        expect(Math.abs(wrapPi(back - M))).toBeLessThan(1e-9)
      }
    }
  })
  it('Molniya angular rate ratio periapsis/apoapsis is ((1+e)/(1-e))^2', () => {
    const e = 0.74
    const el = { a: 26600, e, i: 63.4 * DEG, raan: 0, argp: 270 * DEG, M0: 0 }
    const T = period(el.a, MU)
    const dt = 0.5
    const rate = (t: number) => {
      const a = meanToTrue(el.M0 + (TWO_PI / T) * t, e)
      const b = meanToTrue(el.M0 + (TWO_PI / T) * (t + dt), e)
      return wrapPi(b - a) / dt
    }
    const ratio = rate(0) / rate(T / 2)
    expect(ratio).toBeCloseTo(((1 + e) / (1 - e)) ** 2, 1)
  })
})
