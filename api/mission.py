"""Tour assembly: plan each leg in order, ride the target during the dwell, sample everything.

The ship's state at the start of a leg is the target's state at the end of the previous dwell,
because the ship rides with the satellite it has rendezvoused with.
"""
from __future__ import annotations

from datetime import datetime, timezone

import math

import numpy as np

from . import ship as shipmodel
from .strategies import plan_leg
from . import launch as L
from .models import (Arc, Burn, BurnInterval, LaunchBudget, LaunchEvent, LaunchReport, Leg, MissionPlan, PlanRequest, Ride, Samples, StageReport)
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
    launch_report = None
    if m.start.kind == "launch":
        if m.start.launch is None:
            raise ValueError("start.launch is required when start.kind is 'launch'")
        first = m.stops[0].satelliteId
        if first not in sats:
            raise ValueError(f"stop 0: satellite {first!r} is not in the scenario")
        launch_report, (r_s, v_s), t_ins = plan_launch(m.start.launch, ship.dryMass + ship.propellantMass, sats[first],
                                                       req.body, epoch_ms, m.startT)
        m = m.model_copy(update={"startT": t_ins})
    elif m.start.kind == "satellite":
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
        sol = plan_leg(stop.strategy, r_s, v_s, t, target_fn, T_t, mu, radius, bounds=stop.tofBounds, window=m.departureWindow)
        if sol is None:
            legs.append(Leg(toStop=k, strategy=stop.strategy, tof=0.0, totalDv=0.0,
                            warnings=warnings + ["no transfer found for this leg"], burns=[], arcs=[], ride=None))
            feasible = False
            break
        strategy = sol.strategy
        warnings += sol.warnings

        burns: list[Burn] = []
        labels = ["depart"] + [f"burn {i + 2}" for i in range(len(sol.burns) - 2)] + ["arrive"]
        for label, (tb, rb, dv) in zip(labels, sol.burns):
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
            burns.append(Burn(t=tb, r=np.asarray(rb).tolist(), dv=np.asarray(dv).tolist(), magnitude=mag, duration=duration,
                              propellant=prop, label=label))

        arcs = [Arc(t0=t0, t1=t1, samples=_sample_arc(r0, v0, t0, t1, mu)) for (t0, t1, r0, v0) in sol.arcs]
        if ship.maxSpeed is not None:
            vmax = max(np.linalg.norm(v) for a in arcs for v in a.samples.v)
            if vmax > ship.maxSpeed:
                warnings.append(f"coast speed {vmax:.2f} km/s exceeds the ship's cap of {ship.maxSpeed:.2f} km/s")

        t_ride_end = sol.t_a + stop.dwellSeconds
        ride = Ride(t0=sol.t_a, t1=t_ride_end, satelliteId=stop.satelliteId,
                    samples=_sample_ride(target_fn, sol.t_a, t_ride_end) if stop.dwellSeconds > 0
                    else Samples(t=[sol.t_a], r=[np.asarray(target_fn(sol.t_a)[0]).tolist()], v=[np.asarray(target_fn(sol.t_a)[1]).tolist()]))
        legs.append(Leg(toStop=k, strategy=strategy, tof=sol.tof, totalDv=sol.cost, warnings=warnings,
                        burns=burns, arcs=arcs, ride=ride))

        state = target_fn(t_ride_end)
        r_s, v_s = np.asarray(state[0], float), np.asarray(state[1], float)
        t = t_ride_end

    total_dv = sum(l.totalDv for l in legs)
    start_of_time = launch_report.liftoffT if launch_report else m.startT
    total_time = (legs[-1].ride.t1 - start_of_time) if legs and legs[-1].ride else (m.startT - start_of_time)
    if launch_report is not None and not launch_report.feasible:
        feasible = False
    return MissionPlan(legs=legs, totalDv=total_dv, totalTime=total_time,
                       propellantLeft=max(mass - ship.dryMass, 0.0), feasible=feasible, launch=launch_report)


def plan_launch(spec, payload_mass: float, first_target: dict, body, epoch_ms: float, t0: float):
    """Window, azimuth, integrated ascent, coast and circularization. Returns (report, insertion state, insertion time)."""
    site = spec.site
    mu, radius = body.mu, body.radius
    planet = L.planet_for(body.id, radius, abs(body.rotationPeriod) if body.rotationPeriod else None)
    if body.rotationPeriod is not None and body.rotationPeriod < 0:
        planet = L.Planet(radius=planet.radius, e2=planet.e2, omega=-planet.omega, earth=False)
    stages = [L.Stage(s.name, s.dryMass, s.propellantMass, s.ispVacuum, s.ispSeaLevel or 0.9 * s.ispVacuum, s.thrustVacuum)
              for s in spec.vehicle.stages]
    warnings: list[str] = []

    # target plane from the first stop's state at t0
    r_t, v_t = target_state_fn(first_target, mu, epoch_ms)(t0)
    n_t = np.cross(r_t, v_t); n_t = n_t / np.linalg.norm(n_t)
    inc_target = math.degrees(math.acos(float(np.clip(n_t[2], -1, 1))))
    inclination = spec.inclination if spec.inclination is not None else inc_target
    if math.cos(math.radians(inclination)) > math.cos(math.radians(abs(site.latitude))) + 1e-12:
        warnings.append(f"inclination {inclination:.1f} deg is below the site latitude {abs(site.latitude):.1f} deg; "
                        f"launching due east into {abs(site.latitude):.1f} deg, the first leg pays the plane change")
        inclination = abs(site.latitude)

    if spec.launchTime is None:
        found = L.find_window(site.latitude, site.longitude, epoch_ms, t0, inclination, n_t, planet)
        if found is None:
            raise ValueError("no launch azimuth reaches the requested inclination from this site")
        t_l, az, alignment = found
    else:
        t_l = spec.launchTime
        az = L.launch_azimuth(inclination, site.latitude) or math.pi / 2
        alignment = float(np.dot(L.plane_normal(site.latitude, site.longitude, az, epoch_ms, t_l, planet), n_t))
    n_plane = L.plane_normal(site.latitude, site.longitude, az, epoch_ms, t_l, planet)
    if alignment < math.cos(math.radians(3.0)):
        warnings.append(f"launch plane is {math.degrees(math.acos(max(min(alignment, 1), -1))):.1f} deg from the target plane; the first leg pays for it")

    r_site, v_site = L.site_inertial(site.latitude, site.longitude, site.altitude, epoch_ms, t_l, planet)
    r_hat = r_site / np.linalg.norm(r_site)
    t_hat = np.cross(n_plane, r_hat); t_hat = t_hat / np.linalg.norm(t_hat)
    vt0 = float(np.dot(v_site, t_hat))
    plane_correction = abs(float(np.dot(v_site, n_plane)))
    r_park = radius + spec.parkingAltitude
    cd_area = spec.vehicle.dragCoefficient * spec.vehicle.dragArea

    r_pad = float(np.linalg.norm(r_site))
    asc = L.best_ascent(stages, payload_mass, r_pad, vt0, mu, r_park, cd_area, max_g=spec.vehicle.maxAcceleration,
                        radius=r_pad - site.altitude, atmosphere=body.atmosphere, v_perp=plane_correction)
    warnings += asc.warnings

    # samples: powered flight every 2 s, then the coast to apoapsis, then the parking orbit state
    samples = Samples(t=[t_l], r=[r_site.tolist()], v=[v_site.tolist()])
    for s in asc.samples[3::4]:
        r3, v3 = L.to_inertial(s, r_hat, t_hat)
        samples.t.append(t_l + s[0]); samples.r.append(r3.tolist()); samples.v.append(v3.tolist())
    r_meco, v_meco = L.to_inertial((asc.t_meco,) + asc.meco_state[:4] + (asc.meco_state[4], False), r_hat, t_hat)
    t_meco = t_l + asc.t_meco
    if asc.feasible and asc.t_coast > 0:
        for k in range(1, 100):
            dtk = asc.t_coast * k / 100
            r3, v3 = propagate_universal(r_meco, v_meco, dtk, mu)
            samples.t.append(t_meco + dtk); samples.r.append(r3.tolist()); samples.v.append(v3.tolist())
    t_ins = t_meco + asc.t_coast
    if asc.feasible:
        r_ins, v_pre = propagate_universal(r_meco, v_meco, asc.t_coast, mu) if asc.t_coast > 0 else (r_meco, v_meco)
        r_ins = np.asarray(r_ins, float)
        rn = float(np.linalg.norm(r_ins))
        tan = np.cross(n_plane, r_ins / rn); tan = tan / np.linalg.norm(tan)
        v_ins = math.sqrt(mu / rn) * tan
        # the circularization burn is impulsive: the last sample is the post-burn circular state
        while samples.t and samples.t[-1] >= t_ins:
            samples.t.pop(); samples.r.pop(); samples.v.pop()
        samples.t.append(t_ins); samples.r.append(r_ins.tolist()); samples.v.append(v_ins.tolist())
    else:
        r_ins, v_ins = r_meco, v_meco

    h = np.cross(r_ins, v_ins)
    node = np.cross([0, 0, 1.0], h)
    raan = math.degrees(math.atan2(node[1], node[0])) % 360 if np.linalg.norm(node) > 1e-9 else 0.0
    inc_actual = math.degrees(math.acos(float(np.clip(h[2] / np.linalg.norm(h), -1, 1))))
    period = 2 * math.pi * math.sqrt(float(np.linalg.norm(r_ins)) ** 3 / mu)
    gross = payload_mass + sum(s.dry + s.propellant for s in stages)
    downrange = asc.meco_state[1] * radius

    report = LaunchReport(
        siteName=site.name, vehicleName=spec.vehicle.name, liftoffT=t_l, mecoT=t_meco, insertionT=t_ins,
        azimuthDeg=math.degrees(az), inclinationDeg=inc_actual, raanDeg=raan, planeAlignment=alignment,
        parkingAltitude=float(np.linalg.norm(r_ins)) - radius, parkingPeriod=period,
        grossLiftoffMass=gross, payloadMass=payload_mass, kickAngleDeg=asc.kick_deg, maxQ=asc.max_q, maxG=asc.max_g,
        downrangeKm=downrange,
        events=[LaunchEvent(t=t_l + t, label=lbl) for t, lbl in asc.events],
        stages=[StageReport(name=n, propellantUsed=used + (asc.circ_propellant if i == len(asc.stage_use) - 1 and asc.feasible else 0.0),
                            propellantLeft=max(stages[i].propellant - used - (asc.circ_propellant if i == len(asc.stage_use) - 1 and asc.feasible else 0.0), 0.0),
                            burnTime=bt, ignition=t_l + ig, cutoff=t_l + co)
                for i, (n, used, bt, ig, co) in enumerate(asc.stage_use)],
        budget=LaunchBudget(ideal=asc.ideal_dv, gravityLoss=asc.gravity_loss, dragLoss=asc.drag_loss, steeringLoss=asc.steering_loss,
                            circularization=asc.circ_dv, earthRotation=vt0, planeCorrection=asc.yaw_dv),
        burnIntervals=[BurnInterval(t0=t_l + ig, t1=t_l + co, label=f"{n} burn") for n, _, _, ig, co in asc.stage_use]
                      + ([BurnInterval(t0=t_ins, t1=t_ins + (asc.circ_propellant * stages[min(len(asc.stage_use) - 1, len(stages) - 1)].isp_vac * L.G0 / stages[min(len(asc.stage_use) - 1, len(stages) - 1)].thrust_vac if asc.feasible else 0.0), label="circularization")] if asc.feasible else []),
        samples=samples, warnings=warnings, feasible=asc.feasible,
    )
    return report, (np.asarray(r_ins, float), np.asarray(v_ins, float)), t_ins
