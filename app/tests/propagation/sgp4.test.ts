import { describe, expect, it } from 'vitest'
import { DEG } from '../../src/core/constants'
import { ISS_TLE } from '../../src/data/presets'
import {
  gmst, parseTle, satrecToElements, sgp4Epoch, sgp4PathSamples, sgp4Period, sgp4StateAt, tleChecksum,
  validateTleLines,
} from '../../src/propagation/sgp4Propagator'

describe('TLE parsing', () => {
  it('checksums the bundled ISS lines', () => {
    expect(tleChecksum(ISS_TLE.line1)).toBe(2)
    expect(tleChecksum(ISS_TLE.line2)).toBe(5)
    expect(validateTleLines(ISS_TLE.line1, ISS_TLE.line2)).toBeNull()
  })
  it('rejects a corrupted line', () => {
    const bad = ISS_TLE.line2.slice(0, 20) + '9' + ISS_TLE.line2.slice(21)
    expect(validateTleLines(ISS_TLE.line1, bad)).toMatch(/checksum/)
    expect(parseTle(ISS_TLE.line1, bad).ok).toBe(false)
  })
})

describe('SGP4 against the research cross-check (satellite.js 7.1.0 vs python-sgp4 2.27)', () => {
  const rec = parseTle(ISS_TLE.line1, ISS_TLE.line2).satrec!
  const date = new Date('2026-09-01T12:00:00Z')
  it('TEME position and velocity at 2026-09-01 12:00 UTC', () => {
    const s = sgp4StateAt(rec, date)!
    expect(s.r.x).toBeCloseTo(2038.3065, 3)
    expect(s.r.y).toBeCloseTo(-6439.0583, 3)
    expect(s.r.z).toBeCloseTo(769.2834, 3)
    expect(s.v.x).toBeCloseTo(4.35345, 4)
    expect(s.v.y).toBeCloseTo(2.09991, 4)
    expect(s.v.z).toBeCloseTo(5.94407, 4)
  })
  it('GMST matches the Vallado port', () => {
    expect(gmst(date)).toBeCloseTo(2.8041505841, 8)
  })
  it('epoch, period and mean elements', () => {
    expect(sgp4Epoch(rec).toISOString().slice(0, 16)).toBe('2026-09-01T11:57')
    expect(sgp4Period(rec) / 60).toBeCloseTo(92.976, 2)
    const el = satrecToElements(rec)
    expect(el.i / DEG).toBeCloseTo(51.6312, 3)
    expect(el.e).toBeCloseTo(0.0005055, 6)
    expect(el.a).toBeCloseTo(6798.4, 0)
  })
  it('one-period path nearly closes (J2 nodal regression moves it about 35 km per orbit)', () => {
    const pts = sgp4PathSamples(rec, date, 120)
    expect(pts.length).toBe(121)
    const a = pts[0], b = pts[120]
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(60)
  })
})
