/**
 * Two-body Keplerian propagation from classical orbital elements.
 *
 * The pipeline of docs/mathematics.md sections 4 and 5:
 *   - the perifocal -> inertial rotation is Q = Rz(raan) Rx(i) Rz(argp) (active convention),
 *     verified against Curtis Example 4.7 and the standard perifocal-to-geocentric matrix;
 *   - Kepler's equation is seeded with Vallado's E0 = M - e (M in (-pi, 0)) or M + e (otherwise),
 *     which converged for every tested (M, e) up to e = 0.9999.
 *
 * Nothing in this file knows about rendering. Units: km, s, rad.
 */
import type { OrbitalElements, StateVector, Vec3 } from '../types'
import { wrapPi } from './constants'

/**
 * Solve Kepler's equation M = E - e sin E for the eccentric anomaly E (elliptic orbits, 0 <= e < 1).
 * Returns E in the same "branch" as M (M is wrapped to (-pi, pi] first, so E is in (-pi, pi]).
 */
export function solveKepler(M: number, e: number, tol = 1e-12, maxIter = 60): number {
  if (e < 0 || e >= 1) throw new RangeError(`solveKepler: eccentricity ${e} outside [0, 1)`)
  const m = wrapPi(M)
  let E = m > -Math.PI && m < 0 ? m - e : m + e
  for (let k = 0; k < maxIter; k++) {
    const f = E - e * Math.sin(E) - m
    const fp = 1 - e * Math.cos(E)
    const d = f / fp
    E -= d
    if (Math.abs(d) < tol) return E
  }
  return E
}

/** True anomaly from eccentric anomaly (elliptic). */
export function eccentricToTrue(E: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
}

/** Eccentric anomaly from true anomaly (elliptic). */
export function trueToEccentric(nu: number, e: number): number {
  return 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2))
}

/** Mean anomaly from eccentric anomaly. */
export function eccentricToMean(E: number, e: number): number {
  return E - e * Math.sin(E)
}

/** Mean anomaly from true anomaly (elliptic). */
export function trueToMean(nu: number, e: number): number {
  return eccentricToMean(trueToEccentric(nu, e), e)
}

/** True anomaly from mean anomaly (elliptic). */
export function meanToTrue(M: number, e: number): number {
  return eccentricToTrue(solveKepler(M, e), e)
}

/**
 * Rotate a perifocal-frame vector into the body-centred inertial frame.
 * Q = Rz(raan) Rx(i) Rz(argp); column form written out as in Curtis eq. 4.49.
 */
export function perifocalToInertial(p: Vec3, i: number, raan: number, argp: number): Vec3 {
  const cO = Math.cos(raan), sO = Math.sin(raan)
  const ci = Math.cos(i), si = Math.sin(i)
  const cw = Math.cos(argp), sw = Math.sin(argp)
  return {
    x: (cO * cw - sO * sw * ci) * p.x + (-cO * sw - sO * cw * ci) * p.y + (sO * si) * p.z,
    y: (sO * cw + cO * sw * ci) * p.x + (-sO * sw + cO * cw * ci) * p.y + (-cO * si) * p.z,
    z: (sw * si) * p.x + (cw * si) * p.y + ci * p.z,
  }
}

/**
 * State vector from the conic geometry at a given true anomaly. Works for any conic because it
 * takes the semi-latus rectum p = h^2 / mu directly (p = a(1 - e^2) for an ellipse).
 */
export function stateFromTrueAnomaly(
  p: number, e: number, i: number, raan: number, argp: number, nu: number, mu: number,
): StateVector {
  const r = p / (1 + e * Math.cos(nu))
  const rp: Vec3 = { x: r * Math.cos(nu), y: r * Math.sin(nu), z: 0 }
  const k = Math.sqrt(mu / p)
  const vp: Vec3 = { x: -k * Math.sin(nu), y: k * (e + Math.cos(nu)), z: 0 }
  return {
    r: perifocalToInertial(rp, i, raan, argp),
    v: perifocalToInertial(vp, i, raan, argp),
  }
}

/** Mean motion, rad/s. */
export function meanMotion(a: number, mu: number): number {
  return Math.sqrt(mu / (a * a * a))
}

/** Mean anomaly at time t seconds after the epoch. */
export function meanAnomalyAt(el: OrbitalElements, mu: number, t: number): number {
  return el.M0 + meanMotion(el.a, mu) * t
}

/** True anomaly at time t seconds after the epoch. */
export function trueAnomalyAt(el: OrbitalElements, mu: number, t: number): number {
  return meanToTrue(meanAnomalyAt(el, mu, t), el.e)
}

/** Position and velocity at time t seconds after the epoch, km and km/s, inertial frame. */
export function elementsToState(el: OrbitalElements, mu: number, t: number): StateVector {
  const nu = trueAnomalyAt(el, mu, t)
  const p = el.a * (1 - el.e * el.e)
  return stateFromTrueAnomaly(p, el.e, el.i, el.raan, el.argp, nu, mu)
}

export function norm(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z)
}
