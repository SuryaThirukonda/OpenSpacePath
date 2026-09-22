"""Two-body and SGP4 propagation for the planner, matching the browser's conventions.

Units km, km/s, s, rad. Keplerian satellites live in the body-centred inertial frame with z along
the pole (perifocal-to-inertial rotation Q = Rz(raan) Rx(i) Rz(argp), Kepler's equation seeded
with Vallado's E0 = M +/- e). TLE satellites propagate with python-sgp4 in TEME, the same frame
satellite.js uses in the app; the two ports agree to 0.055 m (research track 2).
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

import numpy as np
from sgp4.api import Satrec, jday

TWO_PI = 2.0 * math.pi


def wrap_pi(x: float) -> float:
    y = x % TWO_PI
    return y - TWO_PI if y > math.pi else y


def solve_kepler(M: float, e: float, tol: float = 1e-12, max_iter: int = 60) -> float:
    """Eccentric anomaly for mean anomaly M (elliptic), Newton with Vallado's seed."""
    if e < 0 or e >= 1:
        raise ValueError(f"eccentricity {e} outside [0, 1)")
    m = wrap_pi(M)
    E = m - e if -math.pi < m < 0 else m + e
    for _ in range(max_iter):
        d = (E - e * math.sin(E) - m) / (1 - e * math.cos(E))
        E -= d
        if abs(d) < tol:
            break
    return E


def eccentric_to_true(E: float, e: float) -> float:
    return 2 * math.atan2(math.sqrt(1 + e) * math.sin(E / 2), math.sqrt(1 - e) * math.cos(E / 2))


def rotation_pqw_to_ijk(i: float, raan: float, argp: float) -> np.ndarray:
    cO, sO, ci, si, cw, sw = math.cos(raan), math.sin(raan), math.cos(i), math.sin(i), math.cos(argp), math.sin(argp)
    return np.array([
        [cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci, sO * si],
        [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci, -cO * si],
        [sw * si, cw * si, ci],
    ])


def coe2rv(p: float, e: float, i: float, raan: float, argp: float, nu: float, mu: float):
    """State from the conic geometry at true anomaly nu; p is the semi-latus rectum."""
    r = p / (1 + e * math.cos(nu))
    rp = np.array([r * math.cos(nu), r * math.sin(nu), 0.0])
    k = math.sqrt(mu / p)
    vp = np.array([-k * math.sin(nu), k * (e + math.cos(nu)), 0.0])
    Q = rotation_pqw_to_ijk(i, raan, argp)
    return Q @ rp, Q @ vp


def elements_state(el: dict, mu: float, t: float):
    """State t seconds after the epoch for elements {a, e, i, raan, argp, M0}."""
    n = math.sqrt(mu / el["a"] ** 3)
    E = solve_kepler(el["M0"] + n * t, el["e"])
    nu = eccentric_to_true(E, el["e"])
    return coe2rv(el["a"] * (1 - el["e"] ** 2), el["e"], el["i"], el["raan"], el["argp"], nu, mu)


def period(a: float, mu: float) -> float:
    return TWO_PI * math.sqrt(a ** 3 / mu)


def _stumpff_c(z: float) -> float:
    if z > 0:
        return (1 - math.cos(math.sqrt(z))) / z
    if z < 0:
        return (math.cosh(math.sqrt(-z)) - 1) / (-z)
    return 0.5


def _stumpff_s(z: float) -> float:
    if z > 0:
        s = math.sqrt(z)
        return (s - math.sin(s)) / s ** 3
    if z < 0:
        s = math.sqrt(-z)
        return (math.sinh(s) - s) / s ** 3
    return 1 / 6


def propagate_universal(r0, v0, dt: float, mu: float):
    """Two-body propagation by dt seconds for any conic (Curtis Algorithm 3.4 with f and g)."""
    r0 = np.asarray(r0, float)
    v0 = np.asarray(v0, float)
    if dt == 0:
        return r0.copy(), v0.copy()
    rn0 = np.linalg.norm(r0)
    vn0 = np.linalg.norm(v0)
    vr0 = float(r0 @ v0) / rn0
    alpha = 2 / rn0 - vn0 * vn0 / mu
    smu = math.sqrt(mu)
    chi = smu * abs(alpha) * dt if alpha != 0 else smu * dt / rn0
    for _ in range(100):
        z = alpha * chi * chi
        C, S = _stumpff_c(z), _stumpff_s(z)
        F = rn0 * vr0 / smu * chi * chi * C + (1 - alpha * rn0) * chi ** 3 * S + rn0 * chi - smu * dt
        dF = rn0 * vr0 / smu * chi * (1 - z * S) + (1 - alpha * rn0) * chi * chi * C + rn0
        d = F / dF
        chi -= d
        if abs(d) < 1e-12 * max(1.0, abs(chi)):
            break
    z = alpha * chi * chi
    C, S = _stumpff_c(z), _stumpff_s(z)
    f = 1 - chi * chi / rn0 * C
    g = dt - chi ** 3 / smu * S
    r = f * r0 + g * v0
    rn = np.linalg.norm(r)
    fdot = smu / (rn * rn0) * (alpha * chi ** 3 * S - chi)
    gdot = 1 - chi * chi / rn * C
    return r, fdot * r0 + gdot * v0


def sgp4_state(line1: str, line2: str, epoch_ms: float, t: float):
    """TEME state of a TLE satellite t seconds after the scenario epoch, or None on decay/error."""
    sat = Satrec.twoline2rv(line1, line2)
    when = datetime.fromtimestamp(epoch_ms / 1000.0, tz=timezone.utc) + timedelta(seconds=t)
    jd, fr = jday(when.year, when.month, when.day, when.hour, when.minute, when.second + when.microsecond / 1e6)
    err, r, v = sat.sgp4(jd, fr)
    if err != 0:
        return None
    return np.array(r, float), np.array(v, float)


def sgp4_period(line1: str, line2: str) -> float:
    """Period from the Brouwer (un-Kozai'd) mean motion, seconds, matching sgp4Period in the app.

    python-sgp4's record exposes only the Kozai mean motion, so the conversion SGP4 performs
    internally is repeated here with the WGS-72 constants SGP4 uses (research script T8).
    """
    sat = Satrec.twoline2rv(line1, line2)
    no_k, e, inc = sat.no_kozai, sat.ecco, sat.inclo
    xke = 60.0 / math.sqrt(6378.135 ** 3 / 398600.8)
    ak = (xke / no_k) ** (2.0 / 3.0)
    d1 = 0.75 * 0.001082616 * (3 * math.cos(inc) ** 2 - 1) / (1 - e * e) ** 1.5
    de = d1 / ak ** 2
    adel = ak * (1 - de * de - de * (1.0 / 3.0 + 134 * de * de / 81))
    de = d1 / adel ** 2
    return TWO_PI / ((no_k / (1 + de)) / 60.0)


def target_state_fn(sat: dict, mu: float, epoch_ms: float):
    """A function t -> (r, v) for a satellite record as the app stores it."""
    if sat["kind"] == "kepler":
        el = sat["elements"]
        return lambda t: elements_state(el, mu, t)
    if sat["kind"] == "tle":
        l1, l2 = sat["line1"], sat["line2"]
        return lambda t: sgp4_state(l1, l2, epoch_ms, t)
    raise ValueError(f"unknown satellite kind {sat.get('kind')!r}")


def target_period(sat: dict, mu: float) -> float:
    if sat["kind"] == "kepler":
        return period(sat["elements"]["a"], mu)
    return sgp4_period(sat["line1"], sat["line2"])
