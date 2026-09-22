import math

import numpy as np

from api.propagation import (coe2rv, elements_state, period, propagate_universal, sgp4_period, sgp4_state,
                             solve_kepler, target_state_fn)
from api.tests.fixtures import DEFAULT_EPOCH_MS, ISS_LINE1, ISS_LINE2, MU_EARTH

DEG = math.pi / 180


def test_curtis_example_4_7():
    h, e = 80000.0, 1.4
    r, v = coe2rv(h * h / MU_EARTH, e, 30 * DEG, 40 * DEG, 60 * DEG, 30 * DEG, MU_EARTH)
    assert np.allclose(r, [-4039.9, 4814.56, 3628.62], atol=0.05)
    assert np.allclose(v, [-10.386, -4.772, 1.744], atol=0.002)


def test_kepler_equation_round_trips_on_a_dense_grid():
    for e in np.linspace(0.0, 0.999, 30):
        for M in np.linspace(-math.pi, math.pi, 91):
            E = solve_kepler(M, e)
            assert abs(math.remainder(E - e * math.sin(E) - M, 2 * math.pi)) < 1e-9


def test_elements_state_matches_universal_propagation():
    el = {"a": 26600.0, "e": 0.74, "i": 63.4 * DEG, "raan": 0.0, "argp": 270 * DEG, "M0": 0.3}
    r0, v0 = elements_state(el, MU_EARTH, 0.0)
    for t in (100.0, 3600.0, 20000.0, period(el["a"], MU_EARTH)):
        r_el, v_el = elements_state(el, MU_EARTH, t)
        r_u, v_u = propagate_universal(r0, v0, t, MU_EARTH)
        assert np.linalg.norm(r_el - r_u) < 1e-5
        assert np.linalg.norm(v_el - v_u) < 1e-8


def test_universal_propagation_hyperbolic_energy_is_conserved():
    r0 = np.array([7000.0, 0.0, 0.0]); v0 = np.array([0.0, 12.0, 0.0])
    eps0 = 0.5 * v0 @ v0 - MU_EARTH / np.linalg.norm(r0)
    r, v = propagate_universal(r0, v0, 5000.0, MU_EARTH)
    eps = 0.5 * v @ v - MU_EARTH / np.linalg.norm(r)
    assert abs(eps - eps0) < 1e-9


def test_iss_sgp4_state_matches_the_app_fixture():
    # 2026-09-01T12:00:00Z is 129 s after the default epoch; numbers from app/tests/propagation/sgp4.test.ts
    r, v = sgp4_state(ISS_LINE1, ISS_LINE2, DEFAULT_EPOCH_MS, 129.0)
    assert np.allclose(r, [2038.3065, -6439.0583, 769.2834], atol=2e-3)
    assert np.allclose(v, [4.35345, 2.09991, 5.94407], atol=2e-5)
    assert abs(sgp4_period(ISS_LINE1, ISS_LINE2) / 60 - 92.976) < 0.01


def test_target_state_fn_dispatches_by_kind():
    kep = {"kind": "kepler", "elements": {"a": 6798.0, "e": 0.0005, "i": 0.9, "raan": 4.9, "argp": 1.7, "M0": 4.6}}
    tle = {"kind": "tle", "line1": ISS_LINE1, "line2": ISS_LINE2}
    fk = target_state_fn(kep, MU_EARTH, DEFAULT_EPOCH_MS)
    ft = target_state_fn(tle, MU_EARTH, DEFAULT_EPOCH_MS)
    rk, _ = fk(0.0); rt, _ = ft(0.0)
    assert abs(np.linalg.norm(rk) - 6798.0) < 5
    assert abs(np.linalg.norm(rt) - 6798.0) < 15
