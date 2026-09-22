import math

import numpy as np
import pytest

from api import lambert
from api.propagation import propagate_universal
from api.tests.izzo_numpy import lambert_izzo
from api.tests.fixtures import MU_EARTH

R1 = np.array([5000.0, 10000.0, 2100.0])
R2 = np.array([-14600.0, 2500.0, 7000.0])


def test_curtis_example_5_2():
    v1, v2 = lambert.solve(398600.0, R1, R2, 3600.0)
    assert np.allclose(v1, [-5.99249, 1.92536, 3.24564], atol=1e-5)
    assert np.allclose(v2, [-3.31246, -4.19662, -0.38529], atol=1e-5)


def _random_legs(n, seed=1):
    rng = np.random.default_rng(seed)
    out = []
    while len(out) < n:
        a = rng.normal(size=3); a = a / np.linalg.norm(a) * rng.uniform(7000, 40000)
        b = rng.normal(size=3); b = b / np.linalg.norm(b) * rng.uniform(7000, 40000)
        ang = math.acos(float(np.clip(a @ b / np.linalg.norm(a) / np.linalg.norm(b), -1, 1)))
        if ang < 0.2 or abs(ang - math.pi) < 0.2:
            continue
        tof = rng.uniform(0.1, 1.2) * 2 * math.pi * math.sqrt(np.linalg.norm(a) ** 3 / MU_EARTH)
        out.append((a, b, float(tof)))
    return out


def test_solvers_agree_on_random_legs():
    """izzo2015 must match the independent numpy port on every leg; lamberthub's other solvers
    are compared wherever they converge (Gooding and Vallado give up on a few geometries)."""
    legs = _random_legs(500)
    worst_numpy = 0.0
    worst_other = 0.0
    misses = {"gooding1990": 0, "vallado2013": 0}
    for a, b, tof in legs:
        ref = lambert.solve(MU_EARTH, a, b, tof)
        assert ref is not None
        np1, np2, _, _ = lambert_izzo(a, b, tof, MU_EARTH)
        worst_numpy = max(worst_numpy, np.abs(np1 - ref[0]).max(), np.abs(np2 - ref[1]).max())
        for name in misses:
            alt = lambert.solve(MU_EARTH, a, b, tof, solver=name)
            if alt is None:
                misses[name] += 1
                continue
            worst_other = max(worst_other, np.abs(alt[0] - ref[0]).max(), np.abs(alt[1] - ref[1]).max())
    assert worst_numpy < 1e-9            # same algorithm, independent code: machine precision
    assert worst_other < 1e-4            # different algorithms at lamberthub's 1e-5 tolerance: 0.1 mm/s
    assert all(m < 0.05 * len(legs) for m in misses.values()), misses


def test_solutions_reach_the_target_when_propagated():
    for a, b, tof in _random_legs(60, seed=2):
        v1, _ = lambert.solve(MU_EARTH, a, b, tof)
        r, _ = propagate_universal(a, v1, tof, MU_EARTH)
        assert np.linalg.norm(r - b) < 1e-3  # 1 m


def test_multi_revolution_branches_reach_the_target():
    a = np.array([7000.0, 0.0, 0.0])
    b = np.array([0.0, 7500.0, 1000.0])
    tof = 2.5 * 2 * math.pi * math.sqrt(7200.0 ** 3 / MU_EARTH)
    for low in (True, False):
        res = lambert.solve(MU_EARTH, a, b, tof, M=1, low_path=low)
        assert res is not None
        r, _ = propagate_universal(a, res[0], tof, MU_EARTH)
        assert np.linalg.norm(r - b) < 1e-3


@pytest.mark.parametrize("r2", [np.array([5000.0, 10000.0, 2100.0]), np.array([-5000.0, -10000.0, -2100.0])])
def test_degenerate_geometry_returns_none(r2):
    assert lambert.solve(MU_EARTH, R1, r2, 3600.0) is None


def test_too_short_for_two_revolutions_returns_none():
    assert lambert.solve(MU_EARTH, R1, R2, 600.0, M=2) is None
