import { describe, expect, it } from 'vitest'
import { DEG } from '../../src/core/constants'
import {
  apoapsisAltitude, periapsisAltitude, semiMajorAxisFromPeriod, validateElements, visViva,
} from '../../src/core/elements'
import { BODY_BY_ID } from '../../src/data/bodies'
import { PRESETS, presetElements } from '../../src/data/presets'

const earth = BODY_BY_ID.earth

describe('derived quantities', () => {
  it('Molniya periapsis and apoapsis altitudes', () => {
    const el = { a: 26600, e: 0.74 }
    expect(periapsisAltitude(el, earth.radius)).toBeCloseTo(537.9, 0)
    expect(apoapsisAltitude(el, earth.radius)).toBeCloseTo(39905.9, 0)
  })
  it('vis-viva for a circular 400 km orbit is about 7.67 km/s', () => {
    const r = earth.radius + 400
    expect(visViva(r, r, earth.mu)).toBeCloseTo(7.669, 2)
  })
  it('semi-major axis from the sidereal day is GEO', () => {
    expect(semiMajorAxisFromPeriod(86164.0905, earth.mu)).toBeCloseTo(42164.17, 1)
  })
  it('areostationary radius is about 20428 km', () => {
    const mars = BODY_BY_ID.mars
    expect(semiMajorAxisFromPeriod(mars.rotationPeriod, mars.mu)).toBeCloseTo(20428, -1)
  })
})

describe('validation', () => {
  it('accepts every preset against its own body', () => {
    for (const p of PRESETS) {
      const body = BODY_BY_ID[p.bodyId]
      expect(validateElements(presetElements(p), body.radius).ok, p.name).toBe(true)
    }
  })
  it('rejects sub-surface periapsis and e out of range', () => {
    expect(validateElements({ a: 6500, e: 0.1, i: 0, raan: 0, argp: 0, M0: 0 }, earth.radius).ok).toBe(false)
    expect(validateElements({ a: 7000, e: 1.2, i: 0, raan: 0, argp: 0, M0: 0 }, earth.radius).ok).toBe(false)
    expect(validateElements({ a: 7000, e: 0, i: 45 * DEG, raan: 0, argp: 0, M0: 0 }, earth.radius).ok).toBe(true)
  })
})
