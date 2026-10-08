"""One rendezvous leg to a moving target, with the time of flight chosen to minimise delta-v.

Two ways to fly a leg, the app's transfer modes:
  lambert2   solve Lambert to the target's *future* position and brake there: depart (v1 - v_ship)
             and arrive (v_target - v2). The braking burn is what stops the ship flying past.
  threeburn  the three-burn rendezvous of the derivation sheet (threeburn.py) to the same point.
Either way the arrival time is scanned and refined. Times are simulated seconds since the
scenario epoch.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from . import lambert, threeburn
from .propagation import min_radius_on_conic_arc, propagate_universal

GOLDEN = (math.sqrt(5) - 1) / 2


@dataclass
class LegSolution:
    t_d: float
    t_a: float
    v1: np.ndarray
    v2: np.ndarray
    dv1: np.ndarray
    dv2: np.ndarray
    M: int = 0
    low_path: bool = True
    warnings: list[str] = field(default_factory=list)

    @property
    def tof(self) -> float:
        return self.t_a - self.t_d

    @property
    def cost(self) -> float:
        return float(np.linalg.norm(self.dv1) + np.linalg.norm(self.dv2))


def min_radius_on_arc(r0, v0, dt: float, mu: float, n: int = 12) -> float:
    """Smallest distance from the centre along the arc, by sampling (cheap and branch-free)."""
    best = float(np.linalg.norm(r0))
    for k in range(1, n + 1):
        r, _ = propagate_universal(r0, v0, dt * k / n, mu)
        best = min(best, float(np.linalg.norm(r)))
    return best


def _branches(tof: float, T_target: float):
    yield 0, True
    if tof > 1.05 * T_target:
        yield 1, True
        yield 1, False


def _solve_at(r_s, v_s, t_d: float, tof: float, target_fn, mu: float, T_target: float, radius: float):
    """Best branch for one (t_d, tof), or None."""
    t_a = t_d + tof
    target = target_fn(t_a)
    if target is None:
        return None
    r2, v2t = target
    best = None
    for M, low in _branches(tof, T_target):
        res = lambert.solve(mu, r_s, r2, tof, M=M, low_path=low)
        if res is None:
            continue
        v1, v2 = res
        sol = LegSolution(t_d, t_a, v1, v2, v1 - v_s, v2t - v2, M, low)
        if min_radius_on_conic_arc(r_s, v1, r2, mu, M) < radius * 1.01:
            continue  # the transfer would dip into the body
        if best is None or sol.cost < best.cost:
            best = sol
    return best


def plan_two_burn(r_s, v_s, t_d: float, target_fn, T_target: float, mu: float, radius: float,
                  bounds=None, window: float = 0.0, grid: int = 120):
    """Two-burn rendezvous with the time of flight (and optionally the departure time) chosen
    to minimise total delta-v. Returns the best LegSolution or None when no transfer exists."""
    r_s = np.asarray(r_s, float)
    v_s = np.asarray(v_s, float)
    lo, hi = bounds if bounds else (0.05 * T_target, 3.0 * T_target)
    lo = max(lo, 60.0)
    if hi <= lo:
        return None
    departures = [t_d] if window <= 0 else [t_d + window * k / 11 for k in range(12)]
    overall = None
    for td in departures:
        r_dep, v_dep = (r_s, v_s) if td == t_d else _coast(r_s, v_s, td - t_d, mu)
        tofs = np.linspace(lo, hi, grid)
        scored = []
        for tof in tofs:
            sol = _solve_at(r_dep, v_dep, td, float(tof), target_fn, mu, T_target, radius)
            if sol is not None:
                scored.append((sol.cost, float(tof)))
        if not scored:
            continue
        scored.sort()
        step = (hi - lo) / (grid - 1)
        for _, tof0 in scored[:3]:
            a, b = max(lo, tof0 - step), min(hi, tof0 + step)
            f = lambda x: (_solve_at(r_dep, v_dep, td, x, target_fn, mu, T_target, radius) or _INF).cost
            x = _golden(f, a, b)
            sol = _solve_at(r_dep, v_dep, td, x, target_fn, mu, T_target, radius)
            if sol is not None and (overall is None or sol.cost < overall.cost):
                overall = sol
    return overall


class _Inf:
    cost = math.inf


_INF = _Inf()


@dataclass
class LegPlan:
    """A planned leg in the shape the tour assembler and the scene use: impulses and coasts."""
    t_d: float
    t_a: float
    strategy: str
    burns: list[tuple[float, np.ndarray, np.ndarray]]           # (t, r, dv)
    arcs: list[tuple[float, float, np.ndarray, np.ndarray]]      # (t0, t1, r0, v0)
    warnings: list[str] = field(default_factory=list)

    @property
    def tof(self) -> float:
        return self.t_a - self.t_d

    @property
    def cost(self) -> float:
        return float(sum(np.linalg.norm(dv) for _, _, dv in self.burns))


def leg_from_two_burn(sol: LegSolution, r_s, target_fn) -> LegPlan:
    r_s = np.asarray(r_s, float)
    r_a = np.asarray(target_fn(sol.t_a)[0], float)
    plan = LegPlan(sol.t_d, sol.t_a, "lambert2",
                   [(sol.t_d, r_s, sol.dv1), (sol.t_a, r_a, sol.dv2)],
                   [(sol.t_d, sol.t_a, r_s, sol.v1)], list(sol.warnings))
    if sol.M > 0:
        plan.warnings.append(f"{sol.M}-revolution transfer ({'low' if sol.low_path else 'high'} path)")
    return plan


def leg_from_three_burn(tb: threeburn.ThreeBurn) -> LegPlan:
    return LegPlan(tb.t_d, tb.t_a, "threeburn", list(tb.burns), list(tb.arcs), list(tb.warnings))


def plan_three_burn(r_s, v_s, t_d: float, target_fn, T_target: float, mu: float, radius: float,
                    bounds=None, dv_max: float = math.inf, grid: int = 24):
    """Three-burn rendezvous with the arrival time scanned and refined to minimise total delta-v."""
    r_s = np.asarray(r_s, float)
    v_s = np.asarray(v_s, float)
    lo, hi = bounds if bounds else (0.05 * T_target, 3.0 * T_target)
    lo = max(lo, 60.0)
    if hi <= lo:
        return None

    def at(tof: float, quality: str):
        target = target_fn(t_d + tof)
        if target is None:
            return None
        return threeburn.solve(mu, r_s, v_s, t_d, target[0], target[1], t_d + tof, radius=radius, dv_max=dv_max, quality=quality)

    scored = []
    for tof in np.linspace(lo, hi, grid):
        sol = at(float(tof), "fast")
        if sol is not None:
            scored.append((sol.cost, float(tof)))
    if not scored:
        return None
    scored.sort()
    step = (hi - lo) / (grid - 1)
    tof0 = scored[0][1]
    x = _golden(lambda t: (at(t, "fast") or _INF).cost, max(lo, tof0 - step), min(hi, tof0 + step), iters=8)
    best = at(x, "full")
    if best is None and len(scored) > 1:
        best = at(scored[1][1], "full")
    return best


def plan_leg(mode: str, r_s, v_s, t_d: float, target_fn, T_t: float, mu: float, radius: float,
             bounds=None, window: float = 0.0, dv_max: float | None = None):
    """The leg in the requested transfer mode, as a LegPlan, or None when no transfer exists."""
    if mode == "threeburn":
        tb = plan_three_burn(r_s, v_s, t_d, target_fn, T_t, mu, radius, bounds=bounds, dv_max=dv_max if dv_max else math.inf)
        return leg_from_three_burn(tb) if tb is not None else None
    two = plan_two_burn(r_s, v_s, t_d, target_fn, T_t, mu, radius, bounds=bounds, window=window)
    return leg_from_two_burn(two, r_s, target_fn) if two is not None else None


def _coast(r, v, dt, mu):
    return propagate_universal(r, v, dt, mu)


def _golden(f, a: float, b: float, iters: int = 30) -> float:
    c = b - GOLDEN * (b - a)
    d = a + GOLDEN * (b - a)
    fc, fd = f(c), f(d)
    for _ in range(iters):
        if fc < fd:
            b, d, fd = d, c, fc
            c = b - GOLDEN * (b - a)
            fc = f(c)
        else:
            a, c, fc = c, d, fd
            d = a + GOLDEN * (b - a)
            fd = f(d)
    return (a + b) / 2
