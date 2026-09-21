import { describe, expect, it } from 'vitest'
import { DEG } from '../../src/core/constants'
import {
  altitudeFactor, apoapsisAltitude, periapsisAltitude, rescaleToBody, semiMajorAxisFromPeriod, shapeFromAltitudes, validateElements, visViva,
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
  it('scales altitudes by the radius ratio when moving Earth ISS to the Sun and back', () => {
    const earth = BODY_BY_ID.earth
    const sun = BODY_BY_ID.sun
    const el = presetElements(PRESETS.find((p) => p.id === 'iss')!, earth)
    const factor = altitudeFactor(earth, sun)
    expect(factor).toBeCloseTo(695700 / 6378.137, 6)
    const onSun = rescaleToBody(el, earth.radius, sun.radius, factor)
    expect(periapsisAltitude(onSun, sun.radius)).toBeCloseTo(416.4 * factor, 6)
    expect(apoapsisAltitude(onSun, sun.radius)).toBeCloseTo(423.2 * factor, 6)
    // the orbit keeps Earth-like proportions: same altitude-to-radius ratio, same eccentricity
    expect(periapsisAltitude(onSun, sun.radius) / sun.radius).toBeCloseTo(416.4 / earth.radius, 9)
    expect(onSun.e).toBeCloseTo(el.e, 9)
    const back = rescaleToBody(onSun, sun.radius, earth.radius, altitudeFactor(sun, earth))
    expect(periapsisAltitude(back, earth.radius)).toBeCloseTo(416.4, 6)
    expect(apoapsisAltitude(back, earth.radius)).toBeCloseTo(423.2, 6)
  })

  it('Sun presets keep Earth proportions: a fresh ISS-class orbit sits 6.5% above the photosphere', () => {
    const sun = BODY_BY_ID.sun
    const el = presetElements(PRESETS.find((p) => p.id === 'iss')!, sun)
    expect(periapsisAltitude(el, sun.radius) / sun.radius).toBeCloseTo(416.4 / 6378.137, 9)
    expect(validateElements(el, sun.radius).ok).toBe(true)
  })

  it('keeps the orbit shape when moving Earth ISS to Jupiter and back', () => {
    const earth = BODY_BY_ID.earth
    const jup = BODY_BY_ID.jupiter
    const el = presetElements(PRESETS.find((p) => p.id === 'iss')!, earth)
    const factor = altitudeFactor(earth, jup)
    expect(factor).toBeCloseTo(jup.radius / earth.radius, 9)
    const onJup = rescaleToBody(el, earth.radius, jup.radius, factor)
    expect(periapsisAltitude(onJup, jup.radius) / jup.radius).toBeCloseTo(416.4 / earth.radius, 9)
    expect(onJup.e).toBeCloseTo(el.e, 9)
    const back = rescaleToBody(onJup, jup.radius, earth.radius, altitudeFactor(jup, earth))
    expect(periapsisAltitude(back, earth.radius)).toBeCloseTo(416.4, 6)
    expect(apoapsisAltitude(back, earth.radius)).toBeCloseTo(423.2, 6)
  })

  it('a Molniya orbit stays as eccentric on every body as it is at Earth', () => {
    const earth = BODY_BY_ID.earth
    const molniya = PRESETS.find((p) => p.id === 'molniya')!
    const eEarth = presetElements(molniya, earth).e
    expect(eEarth).toBeCloseTo(0.74, 2)
    for (const body of BODIES) {
      expect(presetElements(molniya, body).e).toBeCloseTo(eEarth, 9)
      const carried = rescaleToBody(presetElements(molniya, earth), earth.radius, body.radius, altitudeFactor(earth, body))
      expect(carried.e).toBeCloseTo(eEarth, 9)
    }
  })
})
