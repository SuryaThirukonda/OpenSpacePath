"""Equation-by-equation check of threeburn.py against the derivation sheet, on solved transfers.

Every quantity below is recomputed from the sheet's formulas with the solution's own state vectors,
independently of the solver's internals, and compared with what the solver reports and with the
orbit elements read numerically from those state vectors.
"""
import math
import random

import numpy as np
import pytest

from api import threeburn
from api.propagation import elements_state, propagate_universal
from api.tests.fixtures import MU_EARTH, R_EARTH

AU = 149597870.7
MU_SUN = 132712440041.9
DAY = 86400.0
Z = np.array([0.0, 0.0, 1.0])


def circular(r, i=0.0, M0=0.0):
    return {"a": r, "e": 0.0, "i": i, "raan": 0.0, "argp": 0.0, "M0": M0}


def conic(r, v, mu):
    """p, e and the periapsis direction of the orbit through a state, read numerically."""
    h = np.cross(r, v)
    evec = np.cross(v, h) / mu - r / np.linalg.norm(r)
    return float(h @ h) / mu, float(np.linalg.norm(evec)), evec, h


def cases():
    r1, r2 = R_EARTH + 300.0, 42164.0
    t_h = math.pi * math.sqrt(((r1 + r2) / 2) ** 3 / MU_EARTH)
    n2 = math.sqrt(MU_EARTH / r2 ** 3)
    out = []
    for i_deg, factor, phase in ((28.5, 1.3, 0.3), (10.0, 1.8, 1.1), (51.6, 2.4, 2.0)):
        T = factor * t_h
        r_s, v_s = elements_state(circular(r1, i=math.radians(i_deg)), MU_EARTH, 0.0)
        r_p, v_p = elements_state(circular(r2, M0=(phase - n2 * T) % (2 * math.pi)), MU_EARTH, T)
        out.append((MU_EARTH, r_s, v_s, 0.0, r_p, v_p, T, R_EARTH))
    rng = random.Random(3)
    for _ in range(3):
        el = lambda: {"a": rng.uniform(1.0, 3.3) * AU, "e": rng.uniform(0.0, 0.25), "i": math.radians(rng.uniform(0, 12)),
                      "raan": rng.uniform(0, 2 * math.pi), "argp": rng.uniform(0, 2 * math.pi), "M0": rng.uniform(0, 2 * math.pi)}
        a, b = el(), el()
        t0, tof = rng.uniform(0, 1000) * DAY, rng.uniform(150, 600) * DAY
        r_s, v_s = elements_state(a, MU_SUN, t0)
        r_p, v_p = elements_state(b, MU_SUN, t0 + tof)
        out.append((MU_SUN, r_s, v_s, t0, r_p, v_p, t0 + tof, 0.0))
    return out


@pytest.mark.parametrize("case", cases())
def test_the_sheets_equations_hold_on_the_solution(case):
    mu, r_s, v_s, t_d, r_p, v_p, t_a, radius = case
    sol = threeburn.solve(mu, r_s, v_s, t_d, r_p, v_p, t_a, radius=radius)
    assert sol is not None
    if sol.direct:
        pytest.skip("the no-burn-2 member has no node to check")
    S = threeburn._Setup(mu, r_s, v_s, t_d, r_p, v_p, t_a)
    f = lambda x: S.R @ np.asarray(x, float)               # into the sheet's frame: Z the departure normal
    (t1, r1, dv1), (t2, r2, dv2), (t3, r3, dv3) = sol.burns
    arcs = {round(a[0], 6): a for a in sol.arcs}
    _, _, _, v1p = arcs[round(t1, 6)]
    _, _, _, v2p = arcs[round(t2, 6)]
    v1m = v1p - dv1
    v2m = propagate_universal(r1, v1p, t2 - t1, mu)[1]
    assert np.linalg.norm(v2m + dv2 - v2p) < 1e-9

    # ---- burn 1 in the polar frame: equations (16) to (19), and the family (sections 3.3, 3.4, 5)
    r1f, v1mf, v1pf = f(r1), f(v1m), f(v1p)
    assert abs(r1f[2]) < 1e-6 * np.linalg.norm(r1f)         # on the departure orbit, in plane 1
    rhat = r1f / np.linalg.norm(r1f)
    that = np.cross(Z, rhat)
    vr, vt = float(v1pf @ rhat), float(v1pf @ that)
    h1 = np.linalg.norm(r1f) * vt                             # (17)
    p1 = h1 * h1 / mu
    e1 = math.sqrt((p1 / np.linalg.norm(r1f) - 1) ** 2 + (h1 * vr / mu) ** 2)       # (19)
    theta1 = math.atan2(r1f[1], r1f[0])
    omega1 = theta1 - math.atan2(h1 * vr / mu, p1 / np.linalg.norm(r1f) - 1)         # (19)
    p_num, e_num, evec, _ = conic(r1f, v1pf, mu)
    assert p1 == pytest.approx(p_num, rel=1e-9) and e1 == pytest.approx(e_num, rel=1e-7, abs=1e-9)
    if e_num > 1e-6:
        assert math.cos(math.atan2(evec[1], evec[0]) - omega1) == pytest.approx(1.0, abs=1e-6)
    assert theta1 == pytest.approx(math.atan2(math.sin(sol.theta1), math.cos(sol.theta1)), abs=1e-9)
    if sol.family == "tangential":                           # section 5.2: both components scaled by eta_1
        assert np.linalg.norm(np.cross(dv1, v1m)) < 1e-9 * np.linalg.norm(v1m) ** 2 or np.linalg.norm(dv1) < 1e-12
        assert np.linalg.norm(v1p) / np.linalg.norm(v1m) == pytest.approx(sol.eta1, rel=1e-9)
        assert np.linalg.norm(dv1) == pytest.approx(abs(sol.eta1 - 1) * np.linalg.norm(v1m), rel=1e-9, abs=1e-12)   # (15)
    else:                                                     # section 5.1: only the radial speed changes
        assert abs(float(f(dv1) @ that)) < 1e-9 * max(1.0, np.linalg.norm(dv1))

    # ---- burn 2 at the node line: equations (28), (29), (30), (37), (38), (39), (40)
    r2f, v2mf, v2pf = f(r2), f(v2m), f(v2p)
    assert abs(r2f[2]) < 1e-6 * np.linalg.norm(r2f)         # the node line lies in plane 1
    theta2 = math.atan2(r2f[1], r2f[0])
    assert math.cos(theta2 - sol.theta2) == pytest.approx(1.0, abs=1e-9)
    u = np.array([math.cos(theta2), math.sin(theta2), 0.0])
    w = np.array([-u[1], u[0], 0.0])
    phi = sol.phi
    wp = math.cos(phi) * w + math.sin(phi) * Z                                              # (28)
    n_new = np.array([math.sin(phi) * math.sin(theta2), -math.sin(phi) * math.cos(theta2), math.cos(phi)])   # (29)
    assert np.linalg.norm(np.cross(u, wp) - n_new) < 1e-12
    _, _, _, h2 = conic(r2f, v2pf, mu)
    assert np.linalg.norm(h2 / np.linalg.norm(h2) - n_new) < 1e-9                        # the plane after burn 2
    assert math.acos(float(np.clip(n_new @ Z, -1, 1))) == pytest.approx(abs(phi), abs=1e-9)   # (30): i_new = phi
    vr2m, vt2m = float(v2mf @ u), float(v2mf @ w)
    eta2 = np.linalg.norm(v2pf) / np.linalg.norm(v2mf)
    assert eta2 == pytest.approx(sol.eta2, rel=1e-9)
    assert np.linalg.norm(v2pf - eta2 * (vr2m * u + vt2m * wp)) < 1e-9 * np.linalg.norm(v2pf)   # (37) then the rotation
    P = f(r_p)
    r_dest = np.linalg.norm(P)
    psi = math.atan2(float(P @ wp), float(P @ u)) % (2 * math.pi)                             # (36) with d = r_P
    assert psi == pytest.approx(sol.psi, abs=1e-9)
    p1b, e1b, _, _ = conic(r2f, v2mf, mu)
    h1b = math.sqrt(mu * p1b)
    eta2_sq = (1 - math.cos(psi)) / (p1b / r_dest - (p1b / np.linalg.norm(r2f)) * math.cos(psi) + (h1b * vr2m / mu) * math.sin(psi))   # (39)
    assert eta2_sq == pytest.approx(eta2 ** 2, rel=1e-9)
    p2, e2, evec2, _ = conic(r2f, v2pf, mu)
    nu_node = math.atan2(eta2 * h1b * eta2 * vr2m / mu, p2 / np.linalg.norm(r2f) - 1)     # (18) at the node, orbit 2
    assert p2 / (1 + e2 * math.cos(nu_node + psi)) == pytest.approx(r_dest, rel=1e-9)       # (38): the orbit passes r_dest
    combined = math.sqrt((eta2 - 1) ** 2 * vr2m ** 2 + vt2m ** 2 * (eta2 ** 2 - 2 * eta2 * math.cos(phi) + 1))
    assert np.linalg.norm(dv2) == pytest.approx(combined, rel=1e-9)
    assert sol.dv[1] == pytest.approx(combined, rel=1e-9)
    if abs(phi) < 1e-9:
        assert combined == pytest.approx(abs(eta2 - 1) * np.linalg.norm(v2mf), rel=1e-9)    # (40) when there is no rotation

    # ---- the three coasts: equations (41) to (45), as the solver's vectorised form, against propagation
    nu1 = theta1 - omega1
    tB = float(threeburn._tof(p1, e1, nu1, (sol.theta2 - sol.theta1) % (2 * math.pi) or 2 * math.pi, mu))
    tC = float(threeburn._tof(p2, e2, nu_node, psi, mu))
    assert math.isfinite(tB) and math.isfinite(tC)
    assert tB == pytest.approx(t2 - t1, rel=1e-9, abs=1e-6)
    assert tC == pytest.approx(t3 - t2, rel=1e-9, abs=1e-6)
    assert (t1 - t_d) + tB + tC == pytest.approx(t_a - t_d, rel=1e-9)
    r_end, v_end = propagate_universal(r2, v2p, t3 - t2, mu)
    assert np.linalg.norm(r_end - r_p) < 5e-3
    assert np.linalg.norm(v_end + dv3 - v_p) < 1e-6                                           # burn 3: the velocity match


def test_the_sheets_selection_criterion_is_available():
    """Judging candidates by the sheet's own sum (burn 1 plus equation 40) changes the pick, never the physics."""
    r1, r2 = R_EARTH + 300.0, 42164.0
    t_h = math.pi * math.sqrt(((r1 + r2) / 2) ** 3 / MU_EARTH)
    n2 = math.sqrt(MU_EARTH / r2 ** 3)
    T = 1.3 * t_h
    r_s, v_s = elements_state(circular(r1, i=math.radians(28.5)), MU_EARTH, 0.0)
    r_p, v_p = elements_state(circular(r2, M0=(0.3 - n2 * T) % (2 * math.pi)), MU_EARTH, T)
    total = threeburn.solve(MU_EARTH, r_s, v_s, 0.0, r_p, v_p, T, radius=R_EARTH)
    threeburn.SELECTION = "sheet"
    try:
        sheet = threeburn.solve(MU_EARTH, r_s, v_s, 0.0, r_p, v_p, T, radius=R_EARTH)
    finally:
        threeburn.SELECTION = "total"
    assert total is not None and sheet is not None
    # either way the reported burns are the real impulses that chain to the target
    for sol in (total, sheet):
        r_end, v_end = propagate_universal(sol.arcs[-1][2], sol.arcs[-1][3], sol.arcs[-1][1] - sol.arcs[-1][0], MU_EARTH)
        assert np.linalg.norm(r_end - r_p) < 5e-3 and np.linalg.norm(v_end + sol.burns[-1][2] - v_p) < 1e-6
        assert sol.cost == pytest.approx(sum(np.linalg.norm(dv) for _, _, dv in sol.burns))
    # the sheet's criterion ignores burn 3 and the rotation, so its pick cannot beat the total-cost pick on the total
    assert sheet.cost >= total.cost - 1e-9
