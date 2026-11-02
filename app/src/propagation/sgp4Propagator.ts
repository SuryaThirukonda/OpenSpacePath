/**
 * SGP4 propagation through satellite.js for TLE satellites (Earth only).
 *
 * Frame note (research/track2): SGP4 returns TEME (true equator, mean equinox of date). The scene
 * treats TEME as its Earth-centred inertial frame; the difference from J2000 is about 0.37 deg in
 * 2026 and is accepted for v1. Earth's rotation is applied to the mesh with GMST so ground tracks
 * are right; positions are never converted to J2000 here.
 */
import * as satellite from 'satellite.js'
import { TWO_PI } from '../core/constants'
import type { OrbitalElements, StateVector, TleSatellite, Vec3 } from '../types'

/** WGS-72 gravitational parameter used inside SGP4 (satellite.js default), km^3/s^2. */
export const MU_WGS72 = 398600.8

export type Satrec = satellite.SatRec

interface TleParseResult {
  ok: boolean
  satrec?: Satrec
  error?: string
}

/** Standard TLE checksum: sum of digits, minus signs count 1, modulo 10 (CelesTrak tle-fmt). */
export function tleChecksum(line: string): number {
  let sum = 0
  for (const ch of line.slice(0, 68)) {
    if (ch >= '0' && ch <= '9') sum += ch.charCodeAt(0) - 48
    else if (ch === '-') sum += 1
  }
  return sum % 10
}

export function validateTleLines(line1: string, line2: string): string | null {
  if (line1.length < 69 || line2.length < 69) return 'each TLE line must be 69 characters'
  if (line1[0] !== '1' || line2[0] !== '2') return 'lines must start with 1 and 2'
  if (line1.slice(2, 7) !== line2.slice(2, 7)) return 'catalog numbers differ between lines'
  if (tleChecksum(line1) !== Number(line1[68])) return 'line 1 checksum mismatch'
  if (tleChecksum(line2) !== Number(line2[68])) return 'line 2 checksum mismatch'
  return null
}

const SGP4_ERRORS: Record<number, string> = {
  1: 'mean eccentricity outside 0..1',
  2: 'mean motion below zero',
  3: 'perturbed eccentricity outside 0..1',
  4: 'semi-latus rectum below zero',
  5: 'epoch elements are sub-orbital',
  6: 'satellite has decayed',
}

export function parseTle(line1: string, line2: string): TleParseResult {
  const problem = validateTleLines(line1, line2)
  if (problem) return { ok: false, error: problem }
  try {
    const satrec = satellite.twoline2satrec(line1, line2)
    if (satrec.error) return { ok: false, error: SGP4_ERRORS[satrec.error] ?? `sgp4 error ${satrec.error}` }
    return { ok: true, satrec }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

const cache = new Map<string, Satrec>()
/** A catalogue of TLEs would otherwise grow the cache without end; the oldest entries leave first. */
const CACHE_LIMIT = 500

/** Cached satrec for a TLE satellite (twoline2satrec is cheap but the cache keeps the RAF loop tidy). */
export function satrecFor(sat: TleSatellite): Satrec | null {
  const key = sat.line1 + '\n' + sat.line2
  let rec = cache.get(key)
  if (!rec) {
    const res = parseTle(sat.line1, sat.line2)
    if (!res.ok || !res.satrec) return null
    rec = res.satrec
    cache.set(key, rec)
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  }
  return rec
}

/** TEME state at an absolute UTC date, km and km/s, or null if SGP4 fails (decay etc.). */
export function sgp4StateAt(satrec: Satrec, date: Date): StateVector | null {
  const pv = satellite.propagate(satrec, date)
  if (!pv || typeof pv.position !== 'object' || typeof pv.velocity !== 'object') return null
  const p = pv.position as Vec3
  const v = pv.velocity as Vec3
  return { r: { x: p.x, y: p.y, z: p.z }, v: { x: v.x, y: v.y, z: v.z } }
}

/** Orbital period from the SGP4 (Brouwer) mean motion, seconds. */
export function sgp4Period(satrec: Satrec): number {
  return TWO_PI / (satrec.no / 60)
}

/** Epoch of the element set as a Date. satrec.jdsatepoch is a Julian date (UTC). */
export function sgp4Epoch(satrec: Satrec): Date {
  return new Date((satrec.jdsatepoch - 2440587.5) * 86400000)
}

/** Mean elements from the satrec for the elements panel (km, rad). a from the un-Kozai'd mean motion. */
export function satrecToElements(satrec: Satrec): OrbitalElements {
  const n = satrec.no / 60 // rad/s, Brouwer mean motion (satellite.js overwrites no during sgp4init)
  const a = Math.cbrt(MU_WGS72 / (n * n))
  return { a, e: satrec.ecco, i: satrec.inclo, raan: satrec.nodeo, argp: satrec.argpo, M0: satrec.mo }
}

/** One period of TEME positions starting at date, sampled uniformly in time (n + 1 points). */
export function sgp4PathSamples(satrec: Satrec, date: Date, n = 240): Vec3[] {
  const T = sgp4Period(satrec)
  const out: Vec3[] = []
  for (let k = 0; k <= n; k++) {
    const s = sgp4StateAt(satrec, new Date(date.getTime() + (k / n) * T * 1000))
    if (s) out.push(s.r)
  }
  return out
}

/** Greenwich mean sidereal time, rad, for rotating the Earth mesh. */
export function gmst(date: Date): number {
  return satellite.gstime(date)
}
