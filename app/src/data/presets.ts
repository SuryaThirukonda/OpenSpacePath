/**
 * Satellite presets, defined by altitude above the surface so they apply to any central body
 * (multiplied by the body's altitudeScale, which only the Sun sets, so orbits there keep
 * Earth-like proportions instead of vanishing against a surface a hundred times larger).
 * Earth values come from research/track1_orbital_mechanics.md section 3.3 (ISS-class LEO, GPS MEO,
 * GEO, Molniya, sun-synchronous 700 km). "Synchronous" derives its radius from the body's rotation
 * period, so it is GEO at Earth, areostationary at Mars, and so on. Angles in degrees here.
 */
import { DEG } from '../core/constants'
import { semiMajorAxisFromPeriod, shapeFromAltitudes } from '../core/elements'
import type { CentralBody, KeplerSatellite, OrbitalElements, TleSatellite } from '../types'

export interface Preset {
  id: string
  name: string
  color: string
  description: string
  /** Periapsis and apoapsis altitude, km above the surface; ignored when `synchronous` is set. */
  periAlt: number
  apoAlt: number
  /** Circular equatorial orbit whose period equals the body's rotation period. */
  synchronous?: boolean
  i: number
  raan: number
  argp: number
  nu0: number
}

export const PRESETS: Preset[] = [
  {
    id: 'iss', name: 'Low orbit (ISS-class)', color: '#7cf5ff',
    description: '416 x 423 km, inclined 51.6 deg; the ISS orbit at Earth (period 93 min there)',
    periAlt: 416.4, apoAlt: 423.2, i: 51.6312, raan: 282.3953, argp: 96.474, nu0: 263.6,
  },
  {
    id: 'polar', name: 'Low polar orbit', color: '#b8f28b',
    description: '700 km circular at 98.2 deg; sun-synchronous at Earth, a mapping orbit anywhere',
    periAlt: 700, apoAlt: 700, i: 98.19, raan: 90, argp: 0, nu0: 0,
  },
  {
    id: 'meo', name: 'Medium orbit (GPS-class)', color: '#ffd166',
    description: '20,184 km circular at 55 deg; half a sidereal day at Earth',
    periAlt: 20184, apoAlt: 20184, i: 55, raan: 30, argp: 0, nu0: 0,
  },
  {
    id: 'sync', name: 'Synchronous equatorial', color: '#f9a8d4',
    description: 'Circular equatorial orbit with the body\'s rotation period (GEO at Earth, areostationary at Mars)',
    periAlt: 0, apoAlt: 0, synchronous: true, i: 0, raan: 0, argp: 0, nu0: 0,
  },
  {
    id: 'molniya', name: 'Highly elliptical (Molniya-class)', color: '#ff8a5c',
    description: '538 x 39,906 km at 63.4 deg (the critical inclination), apoapsis over the north',
    periAlt: 537.9, apoAlt: 39905.9, i: 63.4, raan: 0, argp: 270, nu0: 0,
  },
  {
    id: 'low-polar-100', name: 'Very low polar (100 km)', color: '#c4b5fd',
    description: '100 km circular polar orbit; a low lunar or Mars science orbit',
    periAlt: 100, apoAlt: 100, i: 90, raan: 0, argp: 0, nu0: 0,
  },
  {
    id: 'science', name: 'Elliptical science orbit', color: '#ffffff',
    description: '300 x 3,000 km at 60 deg; a stand-in for an eccentric mapping orbit',
    periAlt: 300, apoAlt: 3000, i: 60, raan: 0, argp: 90, nu0: 0,
  },
]

export function presetElements(p: Preset, body: CentralBody): OrbitalElements {
  const scale = body.altitudeScale ?? 1
  const shape = p.synchronous
    ? { a: semiMajorAxisFromPeriod(Math.abs(body.rotationPeriod), body.mu), e: 0 }
    : shapeFromAltitudes(p.periAlt * scale, p.apoAlt * scale, body.radius)
  return {
    a: shape.a, e: shape.e,
    i: p.i * DEG, raan: p.raan * DEG, argp: p.argp * DEG, M0: p.nu0 * DEG, // e is small or 0 for nu0 != 0 presets
  }
}

let counter = 0
export function newId(prefix = 'sat'): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}

export function satelliteFromPreset(p: Preset, body: CentralBody): KeplerSatellite {
  const name = p.synchronous ? `${p.name} (${body.name})` : p.name
  return { id: newId(p.id), kind: 'kepler', name, color: p.color, elements: presetElements(p, body) }
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
