/**
 * Satellite presets. Element values come from research/track1_orbital_mechanics.md section 3.3
 * (ISS-class LEO, GPS MEO, GEO, Molniya, sun-synchronous 700 km). Angles are given in degrees here
 * and converted once, at the bottom, so the table reads like the professor's lecture notes.
 */
import { DEG } from '../core/constants'
import { semiMajorAxisFromPeriod } from '../core/elements'
import type { KeplerSatellite, OrbitalElements, TleSatellite } from '../types'
import { BODY_BY_ID } from './bodies'

export interface Preset {
  id: string
  name: string
  bodyId: string
  color: string
  description: string
  /** a in km; angles in degrees. */
  el: { a: number; e: number; i: number; raan: number; argp: number; M0: number }
}

const mars = BODY_BY_ID.mars
const moon = BODY_BY_ID.moon

export const PRESETS: Preset[] = [
  {
    id: 'iss', name: 'ISS-class LEO', bodyId: 'earth', color: '#7cf5ff',
    description: 'a 6797.9 km, e 0.0005, i 51.6 deg; elements from the 2026-09-01 TLE, period 93.0 min',
    el: { a: 6797.9, e: 0.0005, i: 51.6312, raan: 282.3953, argp: 96.474, M0: 263.6824 },
  },
  {
    id: 'gps', name: 'GPS MEO', bodyId: 'earth', color: '#ffd166',
    description: 'a 26561.8 km, i 55 deg, half a sidereal day (718 min)',
    el: { a: 26561.8, e: 0.01, i: 55, raan: 30, argp: 0, M0: 0 },
  },
  {
    id: 'geo', name: 'GEO', bodyId: 'earth', color: '#f9a8d4',
    description: 'a 42164.17 km, circular, equatorial; period one sidereal day (86164.09 s)',
    el: { a: 42164.17, e: 0, i: 0, raan: 0, argp: 0, M0: 0 },
  },
  {
    id: 'molniya', name: 'Molniya', bodyId: 'earth', color: '#ff8a5c',
    description: 'a 26600 km, e 0.74, i 63.4 deg (critical inclination), apogee over the north',
    el: { a: 26600, e: 0.74, i: 63.4, raan: 0, argp: 270, M0: 0 },
  },
  {
    id: 'sso', name: 'Sun-synchronous 700 km', bodyId: 'earth', color: '#b8f28b',
    description: 'a 7078.1 km, circular, i 98.19 deg (retrograde), period 98.8 min',
    el: { a: 7078.137, e: 0, i: 98.19, raan: 90, argp: 0, M0: 0 },
  },
  {
    id: 'areo', name: 'Areostationary', bodyId: 'mars', color: '#ffd166',
    description: 'Mars-synchronous circular equatorial orbit, period one Martian sidereal day (24.62 h)',
    el: { a: semiMajorAxisFromPeriod(mars.rotationPeriod, mars.mu), e: 0, i: 0, raan: 0, argp: 0, M0: 0 },
  },
  {
    id: 'mars-low', name: 'Low Mars orbit', bodyId: 'mars', color: '#7cf5ff',
    description: '400 km circular near-polar orbit, period about 2 h',
    el: { a: mars.radius + 400, e: 0, i: 93, raan: 45, argp: 0, M0: 0 },
  },
  {
    id: 'llo', name: 'Low lunar orbit', bodyId: 'moon', color: '#7cf5ff',
    description: '100 km circular polar orbit, period about 118 min',
    el: { a: moon.radius + 100, e: 0, i: 90, raan: 0, argp: 0, M0: 0 },
  },
  {
    id: 'lunar-frozen', name: 'Lunar elliptical', bodyId: 'moon', color: '#ff8a5c',
    description: 'a 3000 km, e 0.3, i 60 deg, a stand-in for an eccentric lunar science orbit',
    el: { a: 3000, e: 0.3, i: 60, raan: 0, argp: 90, M0: 0 },
  },
]

export function presetElements(p: Preset): OrbitalElements {
  return {
    a: p.el.a, e: p.el.e,
    i: p.el.i * DEG, raan: p.el.raan * DEG, argp: p.el.argp * DEG, M0: p.el.M0 * DEG,
  }
}

let counter = 0
export function newId(prefix = 'sat'): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}

export function satelliteFromPreset(p: Preset): KeplerSatellite {
  return { id: newId(p.id), kind: 'kepler', name: p.name, color: p.color, elements: presetElements(p) }
}

/** ISS element set from CelesTrak, epoch 2026-09-01 11:57:51 UTC (research/data/iss_tle_2026-09-01.txt). */
export const ISS_TLE = {
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   26244.49851260  .00003910  00000+0  79223-4 0  9992',
  line2: '2 25544  51.6312 282.3953 0005055  96.4740 263.6824 15.48958602583585',
}

export function issTleSatellite(): TleSatellite {
  return { id: newId('tle'), kind: 'tle', name: ISS_TLE.name, color: '#ffffff', line1: ISS_TLE.line1, line2: ISS_TLE.line2 }
}

/** Scenario epoch that matches the bundled TLE closely so both ISS models agree at t = 0. */
export const DEFAULT_EPOCH = '2026-09-01T11:57:51Z'
