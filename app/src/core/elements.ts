/** Derived quantities from classical elements. Units: km, s, rad. */
import type { OrbitalElements } from '../types'
import { TWO_PI } from './constants'
import { meanMotion } from './kepler'

/** Orbital period, seconds. */
export function period(a: number, mu: number): number {
  return TWO_PI / meanMotion(a, mu)
}

export function periapsisRadius(el: Pick<OrbitalElements, 'a' | 'e'>): number {
  return el.a * (1 - el.e)
}

export function apoapsisRadius(el: Pick<OrbitalElements, 'a' | 'e'>): number {
  return el.a * (1 + el.e)
}

export function periapsisAltitude(el: Pick<OrbitalElements, 'a' | 'e'>, bodyRadius: number): number {
  return periapsisRadius(el) - bodyRadius
}

export function apoapsisAltitude(el: Pick<OrbitalElements, 'a' | 'e'>, bodyRadius: number): number {
  return apoapsisRadius(el) - bodyRadius
}

/** Speed from the vis-viva equation, km/s. */
export function visViva(r: number, a: number, mu: number): number {
  return Math.sqrt(mu * (2 / r - 1 / a))
}

/** Semi-major axis from a period, km. */
export function semiMajorAxisFromPeriod(T: number, mu: number): number {
  return Math.cbrt(mu * (T / TWO_PI) ** 2)
}

/** Semi-major axis for a circular orbit at a given altitude, km. */
export function semiMajorAxisFromAltitude(alt: number, bodyRadius: number): number {
  return bodyRadius + alt
}

/** a and e from periapsis and apoapsis altitudes above the surface (km). */
export function shapeFromAltitudes(periAlt: number, apoAlt: number, bodyRadius: number): { a: number; e: number } {
  const rp = bodyRadius + Math.min(periAlt, apoAlt)
  const ra = bodyRadius + Math.max(periAlt, apoAlt)
  return { a: (rp + ra) / 2, e: (ra - rp) / (ra + rp) }
}

/**
 * Move an orbit to another central body while keeping its periapsis and apoapsis ALTITUDES
 * (distance above the surface) unchanged, so satellites stay visible when the planet changes.
 * Angles are kept as they are; a and e are recomputed.
 */
export function rescaleToBody(el: OrbitalElements, oldRadius: number, newRadius: number): OrbitalElements {
  const periAlt = periapsisAltitude(el, oldRadius)
  const apoAlt = apoapsisAltitude(el, oldRadius)
  const { a, e } = shapeFromAltitudes(periAlt, apoAlt, newRadius)
  return { ...el, a, e }
}

export interface ElementsValidation {
  ok: boolean
  problems: string[]
}

/** Sanity limits for v1: closed elliptic orbits above the surface, e capped away from 1. */
export function validateElements(el: OrbitalElements, bodyRadius: number, maxE = 0.95): ElementsValidation {
  const problems: string[] = []
  if (!(el.a > 0) || !Number.isFinite(el.a)) problems.push('semi-major axis must be positive')
  if (!(el.e >= 0) || !(el.e <= maxE)) problems.push(`eccentricity must be between 0 and ${maxE}`)
  if (Number.isFinite(el.a) && el.e >= 0 && el.e < 1 && periapsisRadius(el) <= bodyRadius) {
    problems.push('periapsis is below the surface')
  }
  for (const k of ['i', 'raan', 'argp', 'M0'] as const) {
    if (!Number.isFinite(el[k])) problems.push(`${k} is not a number`)
  }
  return { ok: problems.length === 0, problems }
}
