"""Tour assembly: plan each leg in order, ride the target during the dwell, sample everything.

The ship's state at the start of a leg is the target's state at the end of the previous dwell,
because the ship rides with the satellite it has rendezvoused with.
"""
from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from . import ship as shipmodel
from .legs import plan_two_burn
from .models import (Arc, Burn, Leg, MissionPlan, PlanRequest, Ride, Samples)
from .propagation import elements_state, period, propagate_universal, target_period, target_state_fn

ARC_SAMPLES = 200


def epoch_ms_of(iso: str) -> float:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(timezone.utc).timestamp() * 1000.0


def _sample_arc(r0, v0, t0: float, t1: float, mu: float, n: int = ARC_SAMPLES) -> Samples:
    ts, rs, vs = [], [], []
    for k in range(n + 1):
        t = t0 + (t1 - t0) * k / n
        r, v = propagate_universal(r0, v0, t - t0, mu)
        ts.append(t); rs.append(r.tolist()); vs.append(v.tolist())
    return Samples(t=ts, r=rs, v=vs)


def _sample_ride(target_fn, t0: float, t1: float, n: int = ARC_SAMPLES) -> Samples:
    ts, rs, vs = [], [], []
    for k in range(n + 1):
        t = t0 + (t1 - t0) * k / n
        state = target_fn(t)
        if state is None:
            continue
        r, v = state
        ts.append(t); rs.append(np.asarray(r).tolist()); vs.append(np.asarray(v).tolist())
    return Samples(t=ts, r=rs, v=vs)


def plan_mission(req: PlanRequest) -> MissionPlan:
    mu, radius = req.body.mu, req.body.radius
    epoch_ms = epoch_ms_of(req.epoch)
    sats = {s.id: s.model_dump() for s in req.satellites}
    m = req.mission
    ship = m.ship

    # ship state at the start of the tour
    if m.start.kind == "satellite":
        if m.start.id not in sats:
            raise ValueError(f"start satellite {m.start.id!r} is not in the scenario")
        r_s, v_s = target_state_fn(sats[m.start.id], mu, epoch_ms)(m.startT)
    else:
        if m.start.elements is None:
            raise ValueError("start elements are required when start.kind is 'elements'")
        r_s, v_s = elements_state(m.start.elements.model_dump(), mu, m.startT)
    r_s, v_s = np.asarray(r_s, float), np.asarray(v_s, float)

    mass = ship.dryMass + ship.propellantMass
    t = m.startT
    legs: list[Leg] = []
    feasible = True
    last_burn_t = -np.inf

    for k, stop in enumerate(m.stops):
        if stop.satelliteId not in sats:
            raise ValueError(f"stop {k}: satellite {stop.satelliteId!r} is not in the scenario")
        target_fn = target_state_fn(sats[stop.satelliteId], mu, epoch_ms)
        T_t = target_period(sats[stop.satelliteId], mu)
        warnings: list[str] = []
        strategy = "lambert2"
        if stop.strategy not in ("lambert2", "best"):
            warnings.append(f"strategy {stop.strategy} is not available yet; planned with lambert2")
        sol = plan_two_burn(r_s, v_s, t, target_fn, T_t, mu, radius, bounds=stop.tofBounds, window=m.departureWindow)
        if sol is None:
            legs.append(Leg(toStop=k, strategy=strategy, tof=0.0, totalDv=0.0,
                            warnings=warnings + ["no transfer found for this leg"], burns=[], arcs=[], ride=None))
            feasible = False
            break

        burns: list[Burn] = []
        for label, tb, rb, dv in (("depart", sol.t_d, r_s, sol.dv1), ("arrive", sol.t_a, target_fn(sol.t_a)[0], sol.dv2)):
            mag = float(np.linalg.norm(dv))
            m1, prop, duration = shipmodel.burn(mass, mag, ship.isp, ship.maxThrust)
            if prop > ship.propellantMass + 1e-9 or mass - prop < ship.dryMass - 1e-6:
                warnings.append(f"{label} burn needs {prop:.0f} kg of propellant; the ship runs dry")
                feasible = False
            if duration > 0.05 * sol.tof:
                warnings.append(f"{label} burn lasts {duration:.0f} s, more than 5% of the leg; impulsive model strained")
            if tb - last_burn_t < ship.minBurnSpacing:
                warnings.append(f"{label} burn is within {ship.minBurnSpacing:.0f} s of the previous burn")
            last_burn_t = tb
            mass = max(m1, ship.dryMass)
            burns.append(Burn(t=tb, r=np.asarray(rb).tolist(), dv=dv.tolist(), magnitude=mag, duration=duration,
                              propellant=prop, label=label))

        arc = Arc(t0=sol.t_d, t1=sol.t_a, samples=_sample_arc(r_s, sol.v1, sol.t_d, sol.t_a, mu))
        if ship.maxSpeed is not None:
            vmax = max(np.linalg.norm(v) for v in arc.samples.v)
            if vmax > ship.maxSpeed:
                warnings.append(f"coast speed {vmax:.2f} km/s exceeds the ship's cap of {ship.maxSpeed:.2f} km/s")
        if sol.M > 0:
            warnings.append(f"{sol.M}-revolution transfer ({'low' if sol.low_path else 'high'} path)")

        t_ride_end = sol.t_a + stop.dwellSeconds
        ride = Ride(t0=sol.t_a, t1=t_ride_end, satelliteId=stop.satelliteId,
                    samples=_sample_ride(target_fn, sol.t_a, t_ride_end) if stop.dwellSeconds > 0
                    else Samples(t=[sol.t_a], r=[np.asarray(target_fn(sol.t_a)[0]).tolist()], v=[np.asarray(target_fn(sol.t_a)[1]).tolist()]))
        legs.append(Leg(toStop=k, strategy=strategy, tof=sol.tof, totalDv=sol.cost, warnings=warnings,
                        burns=burns, arcs=[arc], ride=ride))

        state = target_fn(t_ride_end)
        r_s, v_s = np.asarray(state[0], float), np.asarray(state[1], float)
        t = t_ride_end

    total_dv = sum(l.totalDv for l in legs)
    total_time = (legs[-1].ride.t1 - m.startT) if legs and legs[-1].ride else 0.0
    return MissionPlan(legs=legs, totalDv=total_dv, totalTime=total_time,
                       propellantLeft=max(mass - ship.dryMass, 0.0), feasible=feasible)
