"""Lambert's problem through lamberthub. Units km, km/s, s.

`solve` returns the departure and arrival velocities of the conic joining r1 to r2 in `tof`
seconds, or None when the solver reports that no solution exists (transfer angle of 0 or 180
degrees, a time of flight too short for the requested revolutions, degenerate input) or does not
converge.

Every solver lamberthub ships is available. Izzo (2015) is the default, here and in every
caller. A planning request picks another one for its whole duration with `use_solver`, so the
choice does not have to be threaded through every function between the endpoint and the solve.

Only Izzo and Gooding are robust by lamberthub's own classification. The others can return
velocities that do not reach the target, so their answers are checked: the departure state is
propagated for the time of flight and must arrive within 5% of the distance, or the solve
counts as having no solution. `miss` gives that error for any solution, so a caller can report
how accurate the chosen solver was.
"""
from __future__ import annotations

import contextvars
import math
from contextlib import contextmanager

import numpy as np
import lamberthub

from .propagation import propagate_universal

DEFAULT_SOLVER = "izzo2015"
SOLVERS = {f.__name__: f for f in lamberthub.ALL_SOLVERS}
MULTI_REV = {f.__name__ for f in lamberthub.MULTI_REV_SOLVERS}
ROBUST = {f.__name__ for f in lamberthub.ROBUST_SOLVERS}
# What to expect from each solver, measured on 300 Sun-centred transfers between orbits of 1 to
# 3.3 AU lasting 1 to 730 days (api/tests/test_lambert.py repeats the measurement).
NOTES = {
    "izzo2015": "The default. Robust, handles multiple revolutions.",
    "gooding1990": "Robust, handles multiple revolutions. Agrees with Izzo to 1e-12 km/s.",
    "avanzini2008": "Direct transfers only. Agrees with Izzo to about 1e-6 km/s.",
    "arora2013": "Direct transfers only. Usually exact; occasionally off by 0.01 km/s, rarely no answer.",
    "vallado2013": "Direct transfers only. Finds nothing for fast, hyperbolic transfers (about one case in seven).",
    "battin1984": "Direct transfers only. In this package its velocities are typically off by 0.07 km/s, so arcs miss the target slightly.",
    "gauss1809": "Short arcs only. Fails on most transfers between different orbits; of historical interest.",
}
MAX_MISS = 0.05   # a solution whose arc misses the target by more than this fraction of |r2| is rejected

LABELS = {
    "izzo2015": "Izzo (2015)", "gooding1990": "Gooding (1990)", "vallado2013": "Vallado (2013)",
    "arora2013": "Arora and Russell (2013)", "avanzini2008": "Avanzini (2008)",
    "battin1984": "Battin (1984)", "gauss1809": "Gauss (1809)",
}

_current: contextvars.ContextVar[str] = contextvars.ContextVar("lambert_solver", default=DEFAULT_SOLVER)


def check_solver(name: str) -> str:
    if name not in SOLVERS:
        raise ValueError(f"unknown Lambert solver {name!r}; available: {', '.join(sorted(SOLVERS))}")
    return name


@contextmanager
def use_solver(name: str):
    """Make `name` the solver for every `solve` call in this context that does not name one."""
    token = _current.set(check_solver(name))
    try:
        yield
    finally:
        _current.reset(token)


def current_solver() -> str:
    return _current.get()


def solver_info() -> list[dict]:
    """The available solvers, the default first, with what lamberthub says about each."""
    names = [DEFAULT_SOLVER] + sorted(n for n in SOLVERS if n != DEFAULT_SOLVER)
    return [{"id": n, "name": LABELS.get(n, n), "default": n == DEFAULT_SOLVER,
             "multiRevolution": n in MULTI_REV, "robust": n in ROBUST, "note": NOTES.get(n, "")} for n in names]


def miss(mu, r1, v1, r2, tof) -> float:
    """How far the arc leaving r1 with v1 ends from r2 after tof, as a fraction of |r2|; inf if it cannot be propagated."""
    try:
        rp, _ = propagate_universal(np.asarray(r1, float), np.asarray(v1, float), float(tof), float(mu))
    except (ArithmeticError, ValueError, RuntimeError):
        return math.inf
    err = float(np.linalg.norm(rp - np.asarray(r2, float)) / np.linalg.norm(r2))
    return err if math.isfinite(err) else math.inf


def solve(mu, r1, r2, tof, M=0, prograde=True, low_path=True, solver=None):
    """Velocities (v1, v2) as numpy arrays, or None if the problem has no solution."""
    name = solver or _current.get()
    fn = SOLVERS[name]
    if M > 0 and name not in MULTI_REV:
        return None  # this solver only finds the direct, zero-revolution transfer
    r1 = np.asarray(r1, float)
    r2 = np.asarray(r2, float)
    try:
        with np.errstate(all="ignore"):
            v1, v2 = fn(float(mu), r1, r2, float(tof), M=int(M), prograde=bool(prograde), low_path=bool(low_path))
    except Exception:  # noqa: BLE001
        # lamberthub reports impossible geometry with ValueError and a degenerate chord with an
        # assert; the less robust solvers give up in many other ways, some of them plain bugs
        return None
    v1, v2 = np.asarray(v1, float), np.asarray(v2, float)
    if not (np.all(np.isfinite(v1)) and np.all(np.isfinite(v2))):
        return None
    if name not in ROBUST and M == 0 and miss(mu, r1, v1, r2, tof) > MAX_MISS:
        return None  # the solver returned something, but it is not a transfer to r2
    return v1, v2
