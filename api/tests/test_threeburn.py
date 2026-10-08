"""The three-burn rendezvous of the derivation sheet: every answer must be a real trajectory."""
import math
import random

import numpy as np
import pytest

from api import lambert, threeburn
from api.propagation import elements_state, propagate_universal
from api.tests.fixtures import MU_EARTH, R_EARTH

AU = 149597870.7
MU_SUN = 132712440041.9
DAY = 86400.0


def circular(r, i=0.0, raan=0.0, M0=0.0):
    return {"a": r, "e": 0.0, "i": i, "raan": raan, "argp": 0.0, "M0": M0}


def hohmann(r1, r2, mu=MU_EARTH):
    return math.sqrt(mu / r1) * (math.sqrt(2 * r2 / (r1 + r2)) - 1) + math.sqrt(mu / r2) * (1 - math.sqrt(2 * r1 / (r1 + r2)))


def check_chain(sol, r_p, v_p, mu, pos_tol=5e-3):
    """Each coast propagated to its end lands on the next burn; the last lands on the destination
    with the matched velocity; the coasts fill the whole transfer time."""
    assert sol.arcs[0][0] == pytest.approx(sol.t_d) and sol.arcs[-1][1] == pytest.approx(sol.t_a)
    for (t0, t1, _, _), (u0, _, _, _) in zip(sol.arcs, sol.arcs[1:]):
        assert t1 == pytest.approx(u0)
    ends = {}
    for (t0, t1, r0, v0) in sol.arcs:
        ends[round(t1, 6)] = propagate_universal(r0, v0, t1 - t0, mu)
    for tb, rb, _ in sol.burns:
        if round(tb, 6) in ends:
            assert np.linalg.norm(ends[round(tb, 6)][0] - rb) < pos_tol
    r_end, v_end = ends[round(sol.t_a, 6)]
    assert np.linalg.norm(r_end - r_p) < pos_tol
    assert np.linalg.norm(v_end + sol.burns[-1][2] - v_p) < 1e-6
    assert sol.cost == pytest.approx(sum(np.linalg.norm(dv) for _, _, dv in sol.burns))
    assert len(sol.burns) == len(sol.arcs) + (0 if sol.s > 1e-12 else 1) or len(sol.burns) == 3 or sol.direct


def test_hohmann_is_the_direct_member_of_the_tangential_family():
    r1, r2 = R_EARTH + 300.0, 42164.0
    t_h = math.pi * math.sqrt(((r1 + r2) / 2) ** 3 / MU_EARTH)
    n2 = math.sqrt(MU_EARTH / r2 ** 3)
    r_s, v_s = elements_state(circular(r1), MU_EARTH, 0.0)
    r_p, v_p = elements_state(circular(r2, M0=(math.pi - n2 * t_h) % (2 * math.pi)), MU_EARTH, t_h)
    sol = threeburn.solve(MU_EARTH, r_s, v_s, 0.0, r_p, v_p, t_h, radius=R_EARTH)
    assert sol is not None and sol.direct and sol.family == "tangential"
    assert sol.cost == pytest.approx(hohmann(r1, r2), rel=1e-4)
    assert sol.dv[1] == 0.0 and sol.s < 1e-6
    check_chain(sol, r_p, v_p, MU_EARTH)


def test_a_plane_change_uses_all_three_burns_and_beats_the_forced_two_burn_arc():
    """LEO at 28.5 deg to equatorial GEO in 1.3 Hohmann times: the sheet's burns 1 and 2 shape and
    tilt the orbit, where a single Lambert arc to the same point and time is far more expensive."""
    r1, r2 = R_EARTH + 300.0, 42164.0
    t_h = math.pi * math.sqrt(((r1 + r2) / 2) ** 3 / MU_EARTH)
    T = 1.3 * t_h
    n2 = math.sqrt(MU_EARTH / r2 ** 3)
    r_s, v_s = elements_state(circular(r1, i=math.radians(28.5)), MU_EARTH, 0.0)
    r_p, v_p = elements_state(circular(r2, M0=(0.3 - n2 * T) % (2 * math.pi)), MU_EARTH, T)
    sol = threeburn.solve(MU_EARTH, r_s, v_s, 0.0, r_p, v_p, T, radius=R_EARTH)
    assert sol is not None and not sol.direct and len(sol.burns) == 3
    assert abs(math.degrees(sol.phi)) > 1.0                      # a real plane change happened at the node
    v1, v2 = lambert.solve(MU_EARTH, r_s, r_p, T)
    two = np.linalg.norm(v1 - v_s) + np.linalg.norm(v_p - v2)
    assert sol.cost < 0.5 * two
    assert sol.min_radius > R_EARTH
    check_chain(sol, r_p, v_p, MU_EARTH)


@pytest.mark.parametrize("seed", [1, 2, 3, 4, 5, 6])
def test_random_heliocentric_transfers_are_consistent(seed):
    rng = random.Random(seed)

    def el():
        return {"a": rng.uniform(1.0, 3.3) * AU, "e": rng.uniform(0.0, 0.25), "i": math.radians(rng.uniform(0, 12)),
                "raan": rng.uniform(0, 2 * math.pi), "argp": rng.uniform(0, 2 * math.pi), "M0": rng.uniform(0, 2 * math.pi)}

    a, b = el(), el()
    t0, tof = rng.uniform(0, 1000) * DAY, rng.uniform(120, 600) * DAY
    r_s, v_s = elements_state(a, MU_SUN, t0)
    r_p, v_p = elements_state(b, MU_SUN, t0 + tof)
    sol = threeburn.solve(MU_SUN, r_s, v_s, t0, r_p, v_p, t0 + tof)
    assert sol is not None, "a transfer of this length between main-belt orbits always has a three-burn answer"
    check_chain(sol, r_p, v_p, MU_SUN)
    assert sol.cost < 150.0            # a sanity bound only; the cheapest transfers between such orbits are 10 to 30 km/s
    assert all(d >= 0 for d in sol.dv) and 0 <= sol.s < 1


def test_the_delta_v_bound_and_impossible_times_give_none():
    r1, r2 = R_EARTH + 300.0, 42164.0
    r_s, v_s = elements_state(circular(r1), MU_EARTH, 0.0)
    r_p, v_p = elements_state(circular(r2, M0=1.0), MU_EARTH, 3 * 3600.0)
    assert threeburn.solve(MU_EARTH, r_s, v_s, 0.0, r_p, v_p, 3 * 3600.0, radius=R_EARTH, dv_max=0.5) is None
    assert threeburn.solve(MU_EARTH, r_s, v_s, 10.0, r_p, v_p, 10.0) is None
    fast = threeburn.solve(MU_EARTH, r_s, v_s, 0.0, r_p, v_p, 3 * 3600.0, radius=R_EARTH, quality="fast")
    full = threeburn.solve(MU_EARTH, r_s, v_s, 0.0, r_p, v_p, 3 * 3600.0, radius=R_EARTH, quality="full")
    assert fast is not None and full is not None and full.cost <= fast.cost * 1.02
    check_chain(full, r_p, v_p, MU_EARTH)


def test_time_of_flight_matches_universal_propagation_on_every_conic():
    """The vectorised Kepler times (elliptic and hyperbolic) agree with the universal-variable propagator."""
    mu = MU_EARTH
    rng = random.Random(11)
    for _ in range(40):
        p = rng.uniform(7000.0, 60000.0)
        e = rng.choice([rng.uniform(0.0, 0.95), rng.uniform(1.05, 2.5)])
        lim = math.acos(-1 / e) if e > 1 else math.pi
        nu_a = rng.uniform(-0.9 * lim, 0.5 * lim)
        dnu = rng.uniform(0.1, (0.9 * lim - nu_a) if e > 1 else 9.0)
        r = p / (1 + e * math.cos(nu_a))
        r0 = np.array([r * math.cos(nu_a), r * math.sin(nu_a), 0.0])
        k = math.sqrt(mu / p)
        v0 = np.array([-k * math.sin(nu_a), k * (e + math.cos(nu_a)), 0.0])
        dt = float(threeburn._tof(p, e, nu_a, dnu, mu))
        assert math.isfinite(dt) and dt > 0
        r1, _ = propagate_universal(r0, v0, dt, mu)
        ang = math.atan2(r1[1], r1[0]) % (2 * math.pi)
        assert abs(((ang - (nu_a + dnu)) + math.pi) % (2 * math.pi) - math.pi) < 1e-7
