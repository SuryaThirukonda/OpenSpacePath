"""Lambert's problem through lamberthub. Units km, km/s, s.

`solve` returns the departure and arrival velocities of the conic joining r1 to r2 in `tof`
seconds, or None when lamberthub reports that no solution exists (transfer angle of 0 or 180
degrees, a time of flight too short for the requested revolutions, or degenerate input).
"""
from __future__ import annotations

import numpy as np
import lamberthub

SOLVERS = {
    "izzo2015": lamberthub.izzo2015,
    "gooding1990": lamberthub.gooding1990,
    "vallado2013": lamberthub.vallado2013,
}


def solve(mu, r1, r2, tof, M=0, prograde=True, low_path=True, solver="izzo2015"):
    """Velocities (v1, v2) as numpy arrays, or None if the problem has no solution."""
    fn = SOLVERS[solver]
    try:
        v1, v2 = fn(float(mu), np.asarray(r1, float), np.asarray(r2, float), float(tof),
                    M=int(M), prograde=bool(prograde), low_path=bool(low_path))
    except (ValueError, RuntimeError, ZeroDivisionError, FloatingPointError, AssertionError):
        # lamberthub reports impossible geometry with ValueError, and a degenerate chord with an assert
        return None
    if not (np.all(np.isfinite(v1)) and np.all(np.isfinite(v2))):
        return None
    return np.asarray(v1, float), np.asarray(v2, float)
