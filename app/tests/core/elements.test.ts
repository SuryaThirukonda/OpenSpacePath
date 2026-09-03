import { describe, expect, it } from 'vitest'
import { DEG } from '../../src/core/constants'
import {
  apoapsisAltitude, periapsisAltitude, rescaleToBody, semiMajorAxisFromPeriod, shapeFromAltitudes, validateElements, visViva,
} from '../../src/core/elements'
import { BODIES, BODY_BY_ID } from '../../src/data/bodies'
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
  it('accepts every preset around every body', () => {
    for (const body of BODIES) {
      for (const p of PRESETS) {
        expect(validateElements(presetElements(p, body), body.radius).ok, `${p.name} @ ${body.name}`).toBe(true)
      }
    }
  })
  it('synchronous preset matches GEO at Earth and the areostationary radius at Mars', () => {
    const sync = PRESETS.find((p) => p.id === 'sync')!
    expect(presetElements(sync, earth).a).toBeCloseTo(42164.17, 0)
    expect(presetElements(sync, BODY_BY_ID.mars).a).toBeCloseTo(20428, -1)
  })
  it('rejects sub-surface periapsis and e out of range', () => {
    expect(validateElements({ a: 6500, e: 0.1, i: 0, raan: 0, argp: 0, M0: 0 }, earth.radius).ok).toBe(false)
    expect(validateElements({ a: 7000, e: 1.2, i: 0, raan: 0, argp: 0, M0: 0 }, earth.radius).ok).toBe(false)
    expect(validateElements({ a: 7000, e: 0, i: 45 * DEG, raan: 0, argp: 0, M0: 0 }, earth.radius).ok).toBe(true)
  })
})

describe('altitude-based shape and rescaling between bodies', () => {
  it('recovers a and e from altitudes', () => {
    const { a, e } = shapeFromAltitudes(537.9, 39905.9, earth.radius)
    expect(a).toBeCloseTo(26600, 0)
    expect(e).toBeCloseTo(0.74, 4)
  })
  it('keeps periapsis and apoapsis altitudes when moving Earth ISS to Jupiter and back', () => {
    const jup = BODY_BY_ID.jupiter
    const el = { a: 6797.9, e: 0.0005, i: 0.9, raan: 1, argp: 2, M0: 3 }
    const onJup = rescaleToBody(el, earth.radius, jup.radius)
    expect(periapsisAltitude(onJup, jup.radius)).toBeCloseTo(periapsisAltitude(el, earth.radius), 6)
    expect(apoapsisAltitude(onJup, jup.radius)).toBeCloseTo(apoapsisAltitude(el, earth.radius), 6)
    expect(onJup.a).toBeGreaterThan(jup.radius)
    const back = rescaleToBody(onJup, jup.radius, earth.radius)
    expect(back.a).toBeCloseTo(el.a, 6)
    expect(back.e).toBeCloseTo(el.e, 9)
    expect(back.i).toBe(el.i)
  })
})
