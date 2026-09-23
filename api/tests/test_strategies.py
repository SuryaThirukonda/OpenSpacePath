import math

import numpy as np

from api.propagation import elements_state, period, propagate_universal
from api.strategies import plan_leg
from api.tests.fixtures import MU_EARTH, R_EARTH


def circular(r, i=0.0, raan=0.0, M0=0.0):
    return {"a": r, "e": 0.0, "i": i, "raan": raan, "argp": 0.0, "M0": M0}


def hohmann_dv(r1, r2, mu=MU_EARTH):
    a = (r1 + r2) / 2
    return math.sqrt(mu / r1) * (math.sqrt(2 * r2 / (r1 + r2)) - 1) + math.sqrt(mu / r2) * (1 - math.sqrt(2 * r1 / (r1 + r2)))


def bielliptic_dv(r1, r2, rb, mu=MU_EARTH):
    a1, a2 = (r1 + rb) / 2, (rb + r2) / 2
    v1 = math.sqrt(mu / r1)
    dv1 = math.sqrt(mu * (2 / r1 - 1 / a1)) - v1
    dv2 = math.sqrt(mu * (2 / rb - 1 / a2)) - math.sqrt(mu * (2 / rb - 1 / a1))
    dv3 = math.sqrt(mu * (2 / r2 - 1 / a2)) - math.sqrt(mu / r2)
    return abs(dv1) + abs(dv2) + abs(dv3)


def check_rendezvous(sol, target_fn):
    """Every arc propagated to its end must land on the next burn, and the last on the target."""
    for (t0, t1, r0, v0), (tb, rb, dv) in zip(sol.arcs, sol.burns[1:]):
        r, v = propagate_universal(r0, v0, t1 - t0, MU_EARTH)
        assert np.linalg.norm(r - np.asarray(rb if rb is not None else r)) < 1e-3
    r_end, v_end = propagate_universal(sol.arcs[-1][2], sol.arcs[-1][3], sol.arcs[-1][1] - sol.arcs[-1][0], MU_EARTH)
    r_t, v_t = target_fn(sol.t_a)
    assert np.linalg.norm(r_end - r_t) < 1e-3
    assert np.linalg.norm(v_end + sol.burns[-1][2] - v_t) < 1e-6


def test_bielliptic_beats_hohmann_at_a_large_radius_ratio():
    r1 = R_EARTH + 300.0
    r2 = 15.0 * r1
    rb = 6.0 * r2
    T_t = period(r2, MU_EARTH)
    # place the target where the seed's own arrival time lands it, so timing does not dominate
    t_arr = math.pi * math.sqrt(((r1 + rb) / 2) ** 3 / MU_EARTH) + math.pi * math.sqrt(((rb + r2) / 2) ** 3 / MU_EARTH)
    n_t = math.sqrt(MU_EARTH / r2 ** 3)
    target = circular(r2, M0=(0.0 - n_t * t_arr) % (2 * math.pi))   # arrival point at angle 0 (two half-ellipses = 360 deg)
    ship = circular(r1)
    r_s, v_s = elements_state(ship, MU_EARTH, 0.0)
    target_fn = lambda t: elements_state(target, MU_EARTH, t)
    sol = plan_leg("bielliptic3", r_s, v_s, 0.0, target_fn, T_t, MU_EARTH, R_EARTH, bounds=(0.05 * T_t, 20 * T_t))
    assert sol is not None and len(sol.burns) == 3
    assert sol.cost < hohmann_dv(r1, r2)
    assert sol.cost < 1.02 * bielliptic_dv(r1, r2, rb)
    check_rendezvous(sol, target_fn)


def test_bielliptic_does_not_beat_hohmann_at_a_small_ratio():
    r1 = R_EARTH + 300.0
    r2 = 8.0 * r1
    assert all(bielliptic_dv(r1, r2, k * r2) > hohmann_dv(r1, r2) for k in (2, 4, 8, 20))


def test_best_never_costs_more_than_the_two_burn_leg_and_stays_exact():
    ship = circular(R_EARTH + 400.0, i=51.6 * math.pi / 180, raan=1.0)
    geo = circular(42164.17, M0=2.0)
    T_t = period(42164.17, MU_EARTH)
    r_s, v_s = elements_state(ship, MU_EARTH, 0.0)
    target_fn = lambda t: elements_state(geo, MU_EARTH, t)
    two = plan_leg("lambert2", r_s, v_s, 0.0, target_fn, T_t, MU_EARTH, R_EARTH)
    best = plan_leg("best", r_s, v_s, 0.0, target_fn, T_t, MU_EARTH, R_EARTH)
    assert two is not None and best is not None
    assert best.cost <= two.cost + 1e-9
    check_rendezvous(best, target_fn)
    print(f"LEO(51.6) -> GEO: lambert2 {two.cost:.3f} km/s, best ({best.strategy}) {best.cost:.3f} km/s")


def test_phasing_fixes_a_same_orbit_phase_error_cheaply():
    a = R_EARTH + 500.0
    ship = circular(a, i=0.5)
    target = circular(a, i=0.5, M0=math.pi / 2)     # same orbit, a quarter turn ahead
    T_t = period(a, MU_EARTH)
    r_s, v_s = elements_state(ship, MU_EARTH, 0.0)
    target_fn = lambda t: elements_state(target, MU_EARTH, t)
    bounds = (0.05 * T_t, 8 * T_t)   # room for six phasing loops
    two = plan_leg("lambert2", r_s, v_s, 0.0, target_fn, T_t, MU_EARTH, R_EARTH, bounds=bounds)
    ph = plan_leg("phasing3", r_s, v_s, 0.0, target_fn, T_t, MU_EARTH, R_EARTH, bounds=bounds)
    assert ph is not None and len(ph.burns) == 3
    assert ph.cost < 1.0
    assert two is None or ph.cost <= two.cost + 1e-9
    check_rendezvous(ph, target_fn)


def test_waypoint4_handles_a_plane_change_and_stays_exact():
    ship = circular(R_EARTH + 300.0, i=28.5 * math.pi / 180)
    target = circular(R_EARTH + 300.0, i=0.0, M0=1.0)
    T_t = period(R_EARTH + 300.0, MU_EARTH)
    r_s, v_s = elements_state(ship, MU_EARTH, 0.0)
    target_fn = lambda t: elements_state(target, MU_EARTH, t)
    sol = plan_leg("waypoint4", r_s, v_s, 0.0, target_fn, T_t, MU_EARTH, R_EARTH, bounds=(0.05 * T_t, 6 * T_t))
    assert sol is not None and len(sol.burns) == 4
    check_rendezvous(sol, target_fn)
    two = plan_leg("lambert2", r_s, v_s, 0.0, target_fn, T_t, MU_EARTH, R_EARTH, bounds=(0.05 * T_t, 6 * T_t))
    assert two is None or sol.cost <= 1.25 * two.cost
