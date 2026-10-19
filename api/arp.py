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

Transfer modes. The papers' black box is the two-burn Lambert rendezvous ("lambert2"). In the
"threeburn" mode the same wait and flight time are flown with the three-burn rendezvous of the
derivation sheet (threeburn.py) and its delta-v is the one charged. The times are still chosen by
the papers' inner optimizer on the two-burn cost, so a route keeps one deterministic cost and an
evaluation stays affordable; with explicit times the three-burn transfer is solved directly.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import minimize

from . import lambert, threeburn
from .mission import burn_labels
from .models import (Arc, ArpEvaluation, ArpInstance, ArpPathRequest, ArpTransfer, Burn, DEFAULT_TRANSFER, Leg, MissionPlan,
                     Ride, Samples)
from .propagation import elements_state, propagate_universal

DAY = 86400.0
PENALTY = 1.0e4          # cost of a point where the Lambert solver finds nothing
# the inner optimization starts where the instance says (the papers' text: (0, 30) days; their code: (1, 30))
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
    mode: str = "lambert2"
    burns: list = field(default_factory=list)      # (t_s, r, dv) in seconds after the epoch
    arcs: list = field(default_factory=list)       # (t0_s, t1_s, r0, v0)
    dv3: float = 0.0
    lambert_dv: float | None = None                # the two-burn cost at the same times, when flown with three burns
    note: str = ""

    def to_model(self, origin: int, target: int, eta: float) -> ArpTransfer:
        return ArpTransfer(origin=origin, target=target, eta=eta, tau=self.tau, t=self.t, z=self.z, dv=self.dv,
                           dv1=float(np.linalg.norm(self.dv1)), dv2=float(np.linalg.norm(self.dv2)), dv3=self.dv3, evals=self.evals,
                           miss=self.miss if math.isfinite(self.miss) else -1.0, transfer=self.mode, burns=len(self.burns),
                           lambertDv=self.lambert_dv, note=self.note)


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
             relaxed: bool = False, tau_f: float | None = None, fixed: tuple[float, float] | None = None,
             mode: str = DEFAULT_TRANSFER, dv_max: float | None = None) -> Transfer:
    """B(a, a', eta), or B' when `relaxed`. With `fixed` = (tau, t) the times are taken as given.
    `mode` says how the chosen times are flown: "lambert2" or "threeburn"."""
    if origin == target:
        raise ValueError("a transfer needs two different bodies")
    if mode not in ("lambert2", "threeburn"):
        raise ValueError(f"unknown transfer mode {mode!r}: use lambert2 or threeburn")
    if relaxed:
        mode = "lambert2"   # B' only bounds; it is the papers' two-burn relaxation whatever flies the route
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
        if not (math.isfinite(fixed[0]) and math.isfinite(fixed[1])) or fixed[0] < 0 or fixed[1] <= 0:
            raise ValueError("a wait must be zero or more days and a transfer longer than zero days")
        x = np.array([float(fixed[0]), float(fixed[1])])
    else:
        start = np.array([min(max(inst.innerStart[0], 0.0), tau_hi), min(max(inst.innerStart[1], 1.0), inst.tMax)])
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
        if inst.innerTol:
            options["ftol"] = inst.innerTol
        res = minimize(cost, start, method="SLSQP", bounds=[(0.0, tau_hi), (1.0, inst.tMax)], options=options)
        x = np.array([min(max(res.x[0], 0.0), tau_hi), min(max(res.x[1], 1.0), inst.tMax)])
        if cost(x) > cost(start):
            x = start  # never return a point worse than the start
    got = detail(x)
    if got is None:
        raise ValueError(f"no Lambert solution from body {origin} to body {target} at day {eta + x[0]:.1f} for a {x[1]:.1f}-day transfer")
    r1, v1, r2, dv1, dv2 = got
    dv = float(np.linalg.norm(dv1) + np.linalg.norm(dv2))
    t_dep, t_arr = (eta + float(x[0])) * DAY, (eta + float(x[0]) + float(x[1])) * DAY
    out = Transfer(float(x[0]), float(x[1]), dv + w * (float(x[1]) + (0.0 if relaxed else float(x[0]))), dv, dv1, dv2, evals,
                   lambert.miss(mu, r1, v1, r2, x[1] * DAY), r1, v1, r2,
                   burns=[(t_dep, r1, dv1), (t_arr, r2, dv2)], arcs=[(t_dep, t_arr, r1, v1)])
    if mode == "threeburn":
        va = v1 - dv1
        vb = elements_state(b, mu, t_arr)[1]
        tb = threeburn.solve(mu, r1, va, t_dep, r2, vb, t_arr, dv_max=dv_max if dv_max else math.inf)
        if tb is None:
            if fixed is not None:
                raise ValueError(f"no three-burn transfer from body {origin} to body {target} arrives on day {eta + x[0] + x[1]:.1f} "
                                 f"after a {x[1]:.1f}-day flight; the two-burn transfer may")
            out.note = "no three-burn transfer at these times; flown with two burns"
            return out
        out.mode, out.lambert_dv = "threeburn", dv
        out.burns, out.arcs = list(tb.burns), list(tb.arcs)
        out.dv1, out.dv2 = tb.burns[0][2], (tb.burns[1][2] if len(tb.burns) == 3 else np.zeros(3))
        out.dv3, out.dv = tb.dv[2], tb.cost
        out.z = tb.cost + w * (float(x[1]) + (0.0 if relaxed else float(x[0])))
        last = tb.arcs[-1]
        out.v1 = last[3]
        out.miss = lambert.miss(mu, last[2], last[3], r2, last[1] - last[0])
    return out


def check_order(inst: ArpInstance, order: list[int], complete: bool = False) -> None:
    n = len(inst.asteroids)
    if any((not isinstance(k, int)) or k < 1 or k > n for k in order):
        raise ValueError(f"the order may only contain asteroid indices 1..{n} (0 is Earth, where the route starts)")
    if len(set(order)) != len(order):
        raise ValueError("the order visits an asteroid more than once")
    if complete and len(order) != n:
        raise ValueError(f"the order visits {len(order)} of the {n} asteroids; a solution visits each exactly once")


def evaluate(inst: ArpInstance, order: list[int], solver: str | None = None, times=None,
             mode: str = DEFAULT_TRANSFER, dv_max: float | None = None) -> tuple[ArpEvaluation, list[Transfer]]:
    """f(pi): the transfers of a route in turn, each starting when the previous one arrives."""
    check_order(inst, order)
    if times is not None and len(times) != len(order):
        raise ValueError("times needs one [wait, transfer] pair per leg")
    name = solver or lambert.current_solver()
    legs: list[ArpTransfer] = []
    raw: list[Transfer] = []
    eta, here = 0.0, 0
    for k, there in enumerate(order):
        tr = transfer(inst, here, there, eta, solver=name, fixed=tuple(times[k]) if times is not None else None, mode=mode, dv_max=dv_max)
        legs.append(tr.to_model(here, there, eta))
        raw.append(tr)
        eta += tr.tau + tr.t
        here = there
    return ArpEvaluation(order=list(order), solver=name, transfer=mode, legs=legs, cost=sum(l.z for l in legs),
                         dv=sum(l.dv for l in legs), time=eta), raw


def path_route(req: ArpPathRequest) -> tuple[ArpInstance, list[int], list[list[float]]]:
    """A user-written path (arrival day and stay per asteroid) as an instance, an order and leg times.

    The asteroids' elements travel inside the entries, so the path is planned from exactly what
    the user wrote. Leg k waits `delay` days at its origin and flies until the next arrival."""
    arrivals = [e.arrival for e in req.entries]
    for k in range(1, len(arrivals)):
        if arrivals[k] <= arrivals[k - 1] + req.entries[k - 1].delay:
            raise ValueError(f"entry {k + 1} arrives on day {arrivals[k]:g}, before the spacecraft leaves entry {k} "
                             f"on day {arrivals[k - 1] + req.entries[k - 1].delay:g}")
    if arrivals[0] <= req.departure:
        raise ValueError(f"the first arrival (day {arrivals[0]:g}) must come after the departure from Earth (day {req.departure:g})")
    ids = [e.asteroid.id for e in req.entries]
    if len(set(ids)) != len(ids):
        raise ValueError("an asteroid appears twice in the path; the problem visits each once")
    longest_wait = max([req.departure] + [e.delay for e in req.entries])
    flights = [arrivals[0] - req.departure] + [arrivals[k] - arrivals[k - 1] - req.entries[k - 1].delay for k in range(1, len(arrivals))]
    inst = ArpInstance(mu=req.mu, epoch=req.epoch, earth=req.earth, asteroids=[e.asteroid for e in req.entries],
                       tauMax=max(730.0, longest_wait), tMax=max(730.0, max(flights)), timeWeight=req.timeWeight)
    times = [[req.departure, flights[0]]] + [[req.entries[k - 1].delay, flights[k]] for k in range(1, len(arrivals))]
    return inst, list(range(1, len(req.entries) + 1)), times


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
        labels = burn_labels(tr.mode, len(tr.burns))
        burns = [Burn(t=tb, r=np.asarray(rb).tolist(), dv=np.asarray(dvb).tolist(), magnitude=float(np.linalg.norm(dvb)), duration=0.0,
                      propellant=0.0, label=label) for label, (tb, rb, dvb) in zip(labels, tr.burns)]
        arcs = [_arc(r0, v0, t0, t1, inst.mu) for (t0, t1, r0, v0) in tr.arcs if t1 - t0 > 1e-6]
        legs.append(Leg(toStop=k, strategy=f"{tr.mode} ({ev.solver})", tof=leg.t * DAY, totalDv=leg.dv, warnings=[tr.note] if tr.note else [],
                        burns=burns, arcs=arcs, ride=None))
    end = ev.time
    if legs:
        legs[-1].ride = _ride(inst, ev.legs[-1].target, end, end + FINAL_RIDE_DAYS)
    return MissionPlan(legs=legs, totalDv=ev.dv, totalTime=(end + FINAL_RIDE_DAYS) * DAY, propellantLeft=-1.0, feasible=True, prelude=prelude)
