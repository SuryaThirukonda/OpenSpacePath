"""The Asteroid Routing Problem: the black-box transfer, a route's cost, and its drawn trajectory.

Following Lopez-Ibanez, Chicano and Gil-Merino (2022) and Rudich et al. (2024): a spacecraft
starts in Earth's orbit and must visit every asteroid once. A transfer from body a to body a'
that may start no earlier than epoch eta is the black-box function

    B(a, a', eta) -> (tau, t, z)

where the spacecraft waits tau days in a's orbit, departs on the Lambert arc that reaches a'
after t days, and matches a' with a second impulse. Its cost is

    z = |dv1| + |dv2| + (2 km/s / 30 days) * (tau + t)

and tau in [0, tau_max], t in [1, t_max] are chosen by SLSQP started from (0, 30), as in the
papers, so one ordering of the asteroids always gives the same cost. The relaxed variant B'
(Rudich et al., eq. 6) does not charge the wait and is only meant for bounds.

Times here are days after the instance epoch; the Lambert solve and the states use seconds.
Bodies are indexed as in the second paper: 0 is Earth, 1..n the asteroids.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize

from . import lambert
from .models import Arc, ArpEvaluation, ArpInstance, ArpTransfer, Burn, Leg, MissionPlan, Ride, Samples
from .propagation import elements_state, propagate_universal

DAY = 86400.0
PENALTY = 1.0e4          # cost of a point where the Lambert solver finds nothing
X0 = (0.0, 30.0)         # the papers start every inner optimization here
# Tried in turn when the chosen solver has no solution at X0 (a 30-day transfer is hyperbolic,
# which some solvers cannot do): direct transfers of increasing length with no wait.
FALLBACK_STARTS = ((0.0, 90.0), (0.0, 150.0), (0.0, 220.0), (0.0, 300.0), (0.0, 400.0), (0.0, 550.0))
FINAL_RIDE_DAYS = 30.0   # how long the drawn route stays with the last asteroid
ARC_SAMPLES = 160


@dataclass
class Transfer:
    tau: float
    t: float
    z: float
    dv: float
    dv1: np.ndarray
    dv2: np.ndarray
    evals: int
    miss: float
    r1: np.ndarray
    v1: np.ndarray
    r2: np.ndarray


def body_elements(inst: ArpInstance, index: int) -> dict:
    if index == 0:
        return inst.earth.elements.model_dump()
    if not 1 <= index <= len(inst.asteroids):
        raise ValueError(f"body index {index} is out of range: 0 is Earth, asteroids are 1..{len(inst.asteroids)}")
    return inst.asteroids[index - 1].elements.model_dump()


def body_id(inst: ArpInstance, index: int) -> str:
    return inst.earth.id if index == 0 else inst.asteroids[index - 1].id


def _impulses(mu: float, origin: dict, target: dict, t_dep: float, tof: float, solver: str | None):
    """Both impulses of the rendezvous leaving at t_dep (s) and taking tof (s), or None."""
    r1, va = elements_state(origin, mu, t_dep)
    r2, vb = elements_state(target, mu, t_dep + tof)
    res = lambert.solve(mu, r1, r2, tof, solver=solver)
    if res is None:
        return None
    v1, v2 = res
    return r1, v1, r2, v1 - va, vb - v2


def transfer(inst: ArpInstance, origin: int, target: int, eta: float, solver: str | None = None,
             relaxed: bool = False, tau_f: float | None = None, fixed: tuple[float, float] | None = None) -> Transfer:
    """B(a, a', eta), or B' when `relaxed`. With `fixed` = (tau, t) the times are taken as given."""
    if origin == target:
        raise ValueError("a transfer needs two different bodies")
    mu = inst.mu
    a, b = body_elements(inst, origin), body_elements(inst, target)
    tau_hi = float(tau_f) if (relaxed and tau_f) else inst.tauMax
    w = inst.timeWeight
    evals = 0

    def detail(x):
        tau, t = float(x[0]), float(x[1])
        return _impulses(mu, a, b, (eta + tau) * DAY, t * DAY, solver)

    def cost(x) -> float:
        nonlocal evals
        evals += 1
        got = detail(x)
        if got is None:
            return PENALTY
        dv = float(np.linalg.norm(got[3]) + np.linalg.norm(got[4]))
        return dv + w * (float(x[1]) + (0.0 if relaxed else float(x[0])))

    if fixed is not None:
        x = np.array([min(max(fixed[0], 0.0), tau_hi), min(max(fixed[1], 1e-3), inst.tMax)])
    else:
        start = np.array(X0)
        if cost(start) >= PENALTY:
            feasible = [np.array(c) for c in FALLBACK_STARTS if c[1] <= inst.tMax and cost(np.array(c)) < PENALTY]
            if not feasible:
                raise ValueError(f"the {solver or lambert.current_solver()} solver finds no transfer from body {origin} to body {target} "
                                 f"leaving on day {eta:.0f}; Izzo (2015) and Gooding (1990) are the robust choices")
            start = min(feasible, key=cost)
        # The papers' settings for the robust solvers. The others return slightly noisy velocities,
        # which a tiny finite-difference step turns into a meaningless gradient: they get a wider
        # step and fewer iterations so one transfer cannot take seconds.
        robust = (solver or lambert.current_solver()) in lambert.ROBUST
        options = {"maxiter": 1000} if robust else {"maxiter": 150, "eps": 1e-3}
        res = minimize(cost, start, method="SLSQP", bounds=[(0.0, tau_hi), (1.0, inst.tMax)], options=options)
        x = np.array([min(max(res.x[0], 0.0), tau_hi), min(max(res.x[1], 1.0), inst.tMax)])
        if cost(x) > cost(start):
            x = start  # never return a point worse than the start
    got = detail(x)
    if got is None:
        raise ValueError(f"no Lambert solution from body {origin} to body {target} at day {eta + x[0]:.1f} for a {x[1]:.1f}-day transfer")
    r1, v1, r2, dv1, dv2 = got
    dv = float(np.linalg.norm(dv1) + np.linalg.norm(dv2))
    z = dv + w * (float(x[1]) + (0.0 if relaxed else float(x[0])))
    return Transfer(float(x[0]), float(x[1]), z, dv, dv1, dv2, evals, lambert.miss(mu, r1, v1, r2, x[1] * DAY), r1, v1, r2)


def check_order(inst: ArpInstance, order: list[int], complete: bool = False) -> None:
    n = len(inst.asteroids)
    if any((not isinstance(k, int)) or k < 1 or k > n for k in order):
        raise ValueError(f"the order may only contain asteroid indices 1..{n} (0 is Earth, where the route starts)")
    if len(set(order)) != len(order):
        raise ValueError("the order visits an asteroid more than once")
    if complete and len(order) != n:
        raise ValueError(f"the order visits {len(order)} of the {n} asteroids; a solution visits each exactly once")


def evaluate(inst: ArpInstance, order: list[int], solver: str | None = None, times=None) -> tuple[ArpEvaluation, list[Transfer]]:
    """f(pi): the transfers of a route in turn, each starting when the previous one arrives."""
    check_order(inst, order)
    if times is not None and len(times) != len(order):
        raise ValueError("times needs one [wait, transfer] pair per leg")
    name = solver or lambert.current_solver()
    legs: list[ArpTransfer] = []
    raw: list[Transfer] = []
    eta, here = 0.0, 0
    for k, there in enumerate(order):
        tr = transfer(inst, here, there, eta, solver=name, fixed=tuple(times[k]) if times is not None else None)
        legs.append(ArpTransfer(origin=here, target=there, eta=eta, tau=tr.tau, t=tr.t, z=tr.z, dv=tr.dv,
                                dv1=float(np.linalg.norm(tr.dv1)), dv2=float(np.linalg.norm(tr.dv2)), evals=tr.evals,
                                miss=tr.miss if math.isfinite(tr.miss) else -1.0))
        raw.append(tr)
        eta += tr.tau + tr.t
        here = there
    return ArpEvaluation(order=list(order), solver=name, legs=legs, cost=sum(l.z for l in legs),
                         dv=sum(l.dv for l in legs), time=eta), raw


def _ride(inst: ArpInstance, index: int, d0: float, d1: float) -> Ride:
    el = body_elements(inst, index)
    n = max(8, min(ARC_SAMPLES, int(math.ceil((d1 - d0) / 3.0))))
    ts, rs, vs = [], [], []
    for k in range(n + 1):
        t = (d0 + (d1 - d0) * k / n) * DAY
        r, v = elements_state(el, inst.mu, t)
        ts.append(t); rs.append(r.tolist()); vs.append(v.tolist())
    return Ride(t0=d0 * DAY, t1=d1 * DAY, satelliteId=body_id(inst, index), samples=Samples(t=ts, r=rs, v=vs))


def _arc(r0, v0, t0: float, t1: float, mu: float) -> Arc:
    ts, rs, vs = [], [], []
    for k in range(ARC_SAMPLES + 1):
        t = t0 + (t1 - t0) * k / ARC_SAMPLES
        r, v = propagate_universal(r0, v0, t - t0, mu)
        ts.append(t); rs.append(r.tolist()); vs.append(v.tolist())
    return Arc(t0=t0, t1=t1, samples=Samples(t=ts, r=rs, v=vs))


def build_plan(inst: ArpInstance, ev: ArpEvaluation, raw: list[Transfer]) -> MissionPlan:
    """The route as the tour the scene already knows how to draw: waits are rides, transfers are arcs."""
    legs: list[Leg] = []
    prelude = None
    for k, (leg, tr) in enumerate(zip(ev.legs, raw)):
        d_dep = leg.eta + leg.tau
        d_arr = d_dep + leg.t
        if leg.tau > 1e-6:
            wait = _ride(inst, leg.origin, leg.eta, d_dep)
            if k == 0:
                prelude = wait
            else:
                legs[-1].ride = wait
        burns = [
            Burn(t=d_dep * DAY, r=tr.r1.tolist(), dv=tr.dv1.tolist(), magnitude=float(np.linalg.norm(tr.dv1)), duration=0.0, propellant=0.0, label="depart"),
            Burn(t=d_arr * DAY, r=tr.r2.tolist(), dv=tr.dv2.tolist(), magnitude=float(np.linalg.norm(tr.dv2)), duration=0.0, propellant=0.0, label="arrive"),
        ]
        legs.append(Leg(toStop=k, strategy=f"lambert2 ({ev.solver})", tof=leg.t * DAY, totalDv=leg.dv, warnings=[],
                        burns=burns, arcs=[_arc(tr.r1, tr.v1, d_dep * DAY, d_arr * DAY, inst.mu)], ride=None))
    end = ev.time
    if legs:
        legs[-1].ride = _ride(inst, ev.legs[-1].target, end, end + FINAL_RIDE_DAYS)
    return MissionPlan(legs=legs, totalDv=ev.dv, totalTime=(end + FINAL_RIDE_DAYS) * DAY, propellantLeft=-1.0, feasible=True, prelude=prelude)
