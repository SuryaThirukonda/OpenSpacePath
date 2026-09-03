/** Analytic two-body propagation for Keplerian satellites. Units: km, s, rad. */
import { TWO_PI } from '../core/constants'
import { eccentricToTrue, elementsToState, stateFromTrueAnomaly } from '../core/kepler'
import type { CentralBody, KeplerSatellite, OrbitalElements, StateVector, Vec3 } from '../types'

export function keplerStateAt(sat: KeplerSatellite, body: CentralBody, t: number): StateVector {
  return elementsToState(sat.elements, body.mu, t)
}

/**
 * Closed orbit path sampled uniformly in eccentric anomaly, so that eccentric orbits get dense
 * samples near periapsis where the curvature is highest (equal-time sampling looks jagged there).
 * Returns n + 1 points with the last equal to the first.
 */
export function keplerPathSamples(el: OrbitalElements, mu: number, n = 360): Vec3[] {
  const p = el.a * (1 - el.e * el.e)
  const out: Vec3[] = []
  for (let k = 0; k <= n; k++) {
    const E = (k / n) * TWO_PI
    const nu = eccentricToTrue(E, el.e)
    out.push(stateFromTrueAnomaly(p, el.e, el.i, el.raan, el.argp, nu, mu).r)
  }
  return out
}
