"""Derivative-free minimisation for waypoint chains: Nelder-Mead with a couple of restarts."""
from __future__ import annotations

import numpy as np
from scipy.optimize import minimize


def minimize_chain(objective, x0, maxfev: int = 220, restarts: int = 1, rng_seed: int = 0):
    """Best of Nelder-Mead runs from x0 and from perturbed copies. Returns (x_best, f_best)."""
    x0 = np.asarray(x0, float)
    rng = np.random.default_rng(rng_seed)
    best_x, best_f = x0, float(objective(x0))
    starts = [x0] + [x0 * (1 + 0.08 * rng.standard_normal(x0.shape)) for _ in range(restarts)]
    for start in starts:
        res = minimize(objective, start, method="Nelder-Mead",
                       options={"maxfev": maxfev, "xatol": 1e-4, "fatol": 1e-5, "adaptive": True})
        if res.fun < best_f:
            best_x, best_f = res.x, float(res.fun)
    return best_x, best_f
