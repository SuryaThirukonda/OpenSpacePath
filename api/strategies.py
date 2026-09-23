"""Multi-burn transfers as chains of Lambert legs through waypoints.

A waypoint is a position and a time. Consecutive Lambert solutions meet there and the velocity
jump is the intermediate burn, so one waypoint gives three burns and two give four. Each named
strategy is a rule for where the waypoints start; the same optimizer then moves them (radius,
direction, time) and the arrival time to minimise total delta-v.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from . import lambert
from .legs import LegSolution, plan_two_burn
from .optimize import minimize_chain
from .propagation import min_radius_on_conic_arc

MIN_SUBLEG = 120.0     # s, shortest coast between two burns
PENALTY = 50.0         # km/s added per violated constraint, scaled by how far it is violated


@dataclass
class ChainSolution:
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


def _spherical_to_vec(r: float, lon: float, lat: float) -> np.ndarray:
    return r * np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])


def _vec_to_spherical(v) -> tuple[float, float, float]:
    r = float(np.linalg.norm(v))
    return r, math.atan2(v[1], v[0]), math.asin(float(np.clip(v[2] / r, -1, 1)))


def _branches(tof, T_ref, max_rev=4):
    """Lambert branches worth trying for a sub-leg: more revolutions as the time allows."""
    yield 0, True
    for M in range(1, min(max_rev, int(tof // (1.05 * T_ref))) + 1):
        yield M, True
        yield M, False


def _best_branch(mu, r1, r2, tof, T_ref):
    """Every Lambert branch that solves for this sub-leg, as (M, (v1, v2))."""
    for M, low in _branches(tof, T_ref):
        res = lambert.solve(mu, r1, r2, tof, M=M, low_path=low)
        if res is not None:
            yield M, res


def evaluate_chain(r_s, v_s, t_d, waypoints, t_a, target_fn, mu, radius, T_ref):
    """Total delta-v (with penalties) and the ChainSolution for fixed waypoints and arrival time."""
    target = target_fn(t_a)
    if target is None:
        return PENALTY * 10, None
    r_t, v_t = target
    times = [t_d] + [t for t, _ in waypoints] + [t_a]
    points = [np.asarray(r_s, float)] + [np.asarray(r, float) for _, r in waypoints] + [np.asarray(r_t, float)]
    penalty = 0.0
    for a, b in zip(times, times[1:]):
        if b - a < MIN_SUBLEG:
            penalty += PENALTY * (1 + (MIN_SUBLEG - (b - a)) / MIN_SUBLEG)
    if penalty:
        return penalty + PENALTY, None
    burns, arcs = [], []
    v_prev = np.asarray(v_s, float)
    for k in range(len(points) - 1):
        r1, r2 = points[k], points[k + 1]
        tof = times[k + 1] - times[k]
        best = None
        last = k == len(points) - 2
        for M, (v1, v2) in _best_branch(mu, r1, r2, tof, T_ref):
            c = float(np.linalg.norm(v1 - v_prev))
            if last:
                c += float(np.linalg.norm(np.asarray(v_t, float) - v2))   # the braking burn is known here
            if best is None or c < best[0]:
                best = (c, M, v1, v2)
        if best is None:
            return PENALTY * 5, None
        c, M, v1, v2 = best
        rmin = min_radius_on_conic_arc(r1, v1, r2, mu, M)
        if rmin < radius * 1.01:
            penalty += PENALTY * (1 + (radius * 1.01 - rmin) / radius)
        burns.append((times[k], r1, v1 - v_prev))
        arcs.append((times[k], times[k + 1], r1, v1))
        v_prev = v2
    burns.append((t_a, points[-1], np.asarray(v_t, float) - v_prev))
    sol = ChainSolution(t_d, t_a, "", burns, arcs)
    return sol.cost + penalty, sol


def optimize_chain(strategy, r_s, v_s, t_d, seeds, target_fn, mu, radius, T_ref, bounds):
    """Run the optimizer from each seed (list of (waypoints, t_a)); return the best ChainSolution."""
    lo, hi = bounds
    R_ref = max(float(np.linalg.norm(r_s)), radius * 2)
    best = None
    for waypoints, t_a0 in seeds:
        x0 = []
        for t_w, r_w in waypoints:
            r, lon, lat = _vec_to_spherical(r_w)
            x0 += [r / R_ref, lon, lat, (t_w - t_d) / T_ref]
        x0.append((t_a0 - t_d) / T_ref)

        def unpack(x):
            wps = []
            for k in range(len(waypoints)):
                r, lon, lat, tw = x[4 * k: 4 * k + 4]
                wps.append((t_d + tw * T_ref, _spherical_to_vec(abs(r) * R_ref, lon, lat)))
            return wps, t_d + x[-1] * T_ref

        def objective(x):
            wps, t_a = unpack(x)
            pen = 0.0
            if t_a - t_d < lo:
                pen += PENALTY * (1 + (lo - (t_a - t_d)) / T_ref)
            if t_a - t_d > hi:
                pen += PENALTY * (1 + ((t_a - t_d) - hi) / T_ref)
            cost, _ = evaluate_chain(r_s, v_s, t_d, wps, t_a, target_fn, mu, radius, T_ref)
            return cost + pen

        x, f = minimize_chain(objective, x0)
        wps, t_a = unpack(x)
        if not (lo <= t_a - t_d <= hi):
            continue
        cost, sol = evaluate_chain(r_s, v_s, t_d, wps, t_a, target_fn, mu, radius, T_ref)
        if sol is None or cost > sol.cost + 1e-9:      # a penalty is still active
            continue
        sol.strategy = strategy
        if best is None or sol.cost < best.cost:
            best = sol
    return best


# ---------------- seeds ----------------

def seeds_phasing3(r_s, v_s, t_d, target_fn, T_t, mu):
    """Reach the target's orbit off-phase, then loop on a slightly different period until the
    phase is right: n loops on a period T(1 + gain/n) let the target gain `gain` of a turn."""
    out = []
    t_w = t_d + 0.45 * T_t
    for lead, gain, loops in ((0.25, 0.25, 2), (0.25, 0.25, 6), (-0.25, 0.75, 6)):
        r_w = target_fn(t_w + lead * T_t)[0]          # a point on the target orbit, offset in phase
        out.append(([(t_w, r_w)], t_w + loops * T_t * (1 + gain / loops)))
    return out


def seeds_bielliptic3(r_s, v_s, t_d, target_fn, T_t, mu, ratios=(3.0, 8.0)):
    """Apoapsis far out, opposite the departure point; the second ellipse comes down to the target."""
    r1 = float(np.linalg.norm(r_s))
    r2 = float(np.linalg.norm(target_fn(t_d)[0]))
    out = []
    for k in ratios:
        r_b = k * max(r1, r2)
        t_w = t_d + math.pi * math.sqrt(((r1 + r_b) / 2) ** 3 / mu)
        r_w = -r_b * np.asarray(r_s, float) / r1
        t_a = t_w + math.pi * math.sqrt(((r_b + r2) / 2) ** 3 / mu)
        out.append(([(t_w, r_w)], t_a))
    return out


def seeds_waypoint4(r_s, v_s, t_d, target_fn, T_t, mu):
    """Plane change at the node between the two orbit planes, then join the target orbit early."""
    r_t, v_t = target_fn(t_d)
    h_s = np.cross(r_s, v_s); h_t = np.cross(r_t, v_t)
    node = np.cross(h_s, h_t)
    if np.linalg.norm(node) < 1e-9:
        node = np.asarray(r_s, float)
    node = node / np.linalg.norm(node)
    r_hi = max(float(np.linalg.norm(r_s)), float(np.linalg.norm(r_t)))
    out = []
    for sign in (1.0, -1.0):
        t_w1 = t_d + 0.5 * T_t
        r_w1 = sign * node * r_hi
        t_a = t_d + 1.75 * T_t
        t_w2 = t_a - 0.25 * T_t
        r_w2 = target_fn(t_w2)[0]
        out.append(([(t_w1, r_w1), (t_w2, r_w2)], t_a))
    return out


STRATEGY_SEEDS = {"phasing3": seeds_phasing3, "bielliptic3": seeds_bielliptic3, "waypoint4": seeds_waypoint4}


def chain_from_two_burn(sol: LegSolution, r_s) -> ChainSolution:
    return ChainSolution(sol.t_d, sol.t_a, "lambert2",
                         [(sol.t_d, np.asarray(r_s, float), sol.dv1), (sol.t_a, None, sol.dv2)],
                         [(sol.t_d, sol.t_a, np.asarray(r_s, float), sol.v1)], sol.warnings)


def plan_leg(strategy, r_s, v_s, t_d, target_fn, T_t, mu, radius, bounds=None, window=0.0):
    """Best ChainSolution for the requested strategy ('best' tries every strategy)."""
    lo, hi = bounds if bounds else (0.05 * T_t, 3.0 * T_t)
    candidates: list[ChainSolution] = []
    names = ["lambert2", "phasing3", "bielliptic3", "waypoint4"] if strategy == "best" else [strategy]
    for name in names:
        if name == "lambert2":
            two = plan_two_burn(r_s, v_s, t_d, target_fn, T_t, mu, radius, bounds=bounds, window=window)
            if two is not None:
                c = chain_from_two_burn(two, r_s)
                c.burns[1] = (two.t_a, np.asarray(target_fn(two.t_a)[0], float), two.dv2)
                if two.M > 0:
                    c.warnings.append(f"{two.M}-revolution transfer ({'low' if two.low_path else 'high'} path)")
                candidates.append(c)
        else:
            seeds = STRATEGY_SEEDS[name](r_s, v_s, t_d, target_fn, T_t, mu)
            sol = optimize_chain(name, r_s, v_s, t_d, seeds, target_fn, mu, radius, T_t, (lo, hi))
            if sol is not None:
                candidates.append(sol)
    if not candidates:
        return None
    return min(candidates, key=lambda c: c.cost)
