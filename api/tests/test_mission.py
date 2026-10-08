import math

import numpy as np
from fastapi.testclient import TestClient

from api.index import app
from api.legs import plan_two_burn
from api.mission import plan_mission
from api.models import PlanRequest
from api.propagation import elements_state, period, propagate_universal, target_state_fn
from api.tests.fixtures import DEFAULT_EPOCH_MS, ISS_LINE1, ISS_LINE2, MU_EARTH, R_EARTH

DEG = math.pi / 180
BODY = {"id": "earth", "mu": MU_EARTH, "radius": R_EARTH}
EPOCH = "2026-09-01T11:57:51Z"


def kepler(sid, a, e, i, raan, argp, M0):
    return {"id": sid, "kind": "kepler", "elements": {"a": a, "e": e, "i": i * DEG, "raan": raan * DEG, "argp": argp * DEG, "M0": M0 * DEG}}


ISS_LIKE = kepler("leo", 6798.0, 0.0005, 51.6, 282.4, 96.5, 263.6)
GEO = kepler("geo", 42164.17, 0.0, 0.0, 0.0, 0.0, 40.0)
POLAR = kepler("polar", 7078.0, 0.0, 98.2, 90.0, 0.0, 0.0)
ISS_TLE = {"id": "iss", "kind": "tle", "line1": ISS_LINE1, "line2": ISS_LINE2}


# capacity 4.41 km/s x ln(101) = 20 km/s: enough for a two-leg tour with plane changes
BIG_SHIP = {"dryMass": 5000, "propellantMass": 500000, "isp": 450, "maxThrust": 2000000}


def request(stops, start=None, ship=None, window=0.0, transfer="lambert2"):
    return PlanRequest.model_validate({
        "body": BODY, "epoch": EPOCH, "satellites": [ISS_LIKE, GEO, POLAR, ISS_TLE],
        "mission": {"ship": ship or BIG_SHIP, "transfer": transfer,
                    "startT": 0, "start": start or {"kind": "satellite", "id": "leo"}, "stops": stops, "departureWindow": window},
    })


def check_leg_chain(plan, sats, stops):
    """Every coast, propagated from its own first sample, lands on the next burn; the last on the target."""
    for leg, sid in zip(plan.legs, stops):
        target_fn = target_state_fn(sats[sid], MU_EARTH, DEFAULT_EPOCH_MS)
        assert len(leg.burns) == len(leg.arcs) + 1 or (leg.strategy == "threeburn" and len(leg.burns) <= len(leg.arcs) + 1)
        for arc, nxt in zip(leg.arcs[-(len(leg.burns) - 1):], leg.burns[1:]):
            r0 = np.array(arc.samples.r[0]); v0 = np.array(arc.samples.v[0])
            r_end, _ = propagate_universal(r0, v0, arc.t1 - arc.t0, MU_EARTH)
            assert np.linalg.norm(r_end - np.array(nxt.r)) < 5e-3          # 5 m
            assert abs(nxt.t - arc.t1) < 1e-6
        last = leg.arcs[-1]
        r0 = np.array(last.samples.r[0]); v0 = np.array(last.samples.v[0])
        r_end, v_end = propagate_universal(r0, v0, last.t1 - last.t0, MU_EARTH)
        r_t, v_t = target_fn(last.t1)
        assert np.linalg.norm(r_end - r_t) < 5e-3
        assert np.linalg.norm(v_end + np.array(leg.burns[-1].dv) - v_t) < 1e-6   # 1 mm/s
        assert leg.ride is not None and leg.ride.t0 == last.t1


def test_hohmann_is_recovered_when_the_phase_is_right():
    """Coplanar circular 300 km -> GEO with the target placed where a Hohmann arc lands."""
    r1, r2 = R_EARTH + 300.0, 42164.17
    t_h = math.pi * math.sqrt(((r1 + r2) / 2) ** 3 / MU_EARTH)
    n_geo = math.sqrt(MU_EARTH / r2 ** 3)
    ship_el = {"a": r1, "e": 0.0, "i": 0.0, "raan": 0.0, "argp": 0.0, "M0": 0.0}
    target_el = {"a": r2, "e": 0.0, "i": 0.0, "raan": 0.0, "argp": 0.0, "M0": math.pi - n_geo * t_h}
    r_s, v_s = elements_state(ship_el, MU_EARTH, 0.0)
    sol = plan_two_burn(r_s, v_s, 0.0, lambda t: elements_state(target_el, MU_EARTH, t), period(r2, MU_EARTH), MU_EARTH, R_EARTH)
    assert sol is not None
    assert abs(sol.cost - 3.8926) / 3.8926 < 0.01
    assert abs(sol.tof - t_h) / t_h < 0.02


def test_two_stop_tour_rendezvous_is_exact():
    plan = plan_mission(request([{"satelliteId": "geo", "dwellSeconds": 1800}, {"satelliteId": "iss", "dwellSeconds": 600}]))
    assert plan.feasible, [l.warnings for l in plan.legs]
    assert len(plan.legs) == 2
    sats = {s["id"]: s for s in (ISS_LIKE, GEO, POLAR, ISS_TLE)}
    stops = ["geo", "iss"]
    check_leg_chain(plan, sats, stops)
    for leg in plan.legs:
        assert abs(leg.burns[0].t - leg.arcs[0].t0) < 1e-9
        assert [b.label for b in leg.burns] == ["depart", "arrive"]


def test_three_burn_tour_is_exact_and_labelled():
    """The same tour flown with the derivation sheet's three burns: every coast still lands on the next burn."""
    plan = plan_mission(request([{"satelliteId": "geo", "dwellSeconds": 1800}], transfer="threeburn"))
    assert plan.feasible, [l.warnings for l in plan.legs]
    leg = plan.legs[0]
    assert leg.strategy == "threeburn" and 2 <= len(leg.burns) <= 3
    assert leg.burns[0].label == "burn 1, shaping" and leg.burns[-1].label == "burn 3, match"
    check_leg_chain(plan, {s["id"]: s for s in (ISS_LIKE, GEO, POLAR, ISS_TLE)}, ["geo"])
    # the two-burn plan of the same leg, for scale: the restricted family may cost a little more, never wildly so
    two = plan_mission(request([{"satelliteId": "geo", "dwellSeconds": 1800}], transfer="lambert2"))
    assert leg.totalDv < 1.5 * two.legs[0].totalDv
    assert PlanRequest.model_validate(request([{"satelliteId": "geo"}]).model_dump()).mission.transfer == "lambert2"


def test_plan_is_continuous_across_every_boundary():
    plan = plan_mission(request([{"satelliteId": "polar", "dwellSeconds": 900}, {"satelliteId": "geo", "dwellSeconds": 0}]))
    assert len(plan.legs) == 2 and all(l.arcs for l in plan.legs)   # planned; a 46 deg plane change may exceed the tank
    prev_r = prev_v = None
    prev_dv = None
    for leg in plan.legs:
        first = leg.arcs[0]
        if prev_r is not None:
            assert np.linalg.norm(np.array(first.samples.r[0]) - prev_r) < 1e-6
            assert np.linalg.norm(np.array(first.samples.v[0]) - prev_v - np.array(leg.burns[0].dv)) < 1e-9
        for a, b, burn in zip(leg.arcs, leg.arcs[1:], leg.burns[1:]):
            assert np.linalg.norm(np.array(b.samples.r[0]) - np.array(a.samples.r[-1])) < 1e-3
            assert np.linalg.norm(np.array(b.samples.v[0]) - np.array(a.samples.v[-1]) - np.array(burn.dv)) < 1e-6
        last = leg.arcs[-1]
        ride = leg.ride
        assert np.linalg.norm(np.array(ride.samples.r[0]) - np.array(last.samples.r[-1])) < 1e-3
        assert np.linalg.norm(np.array(ride.samples.v[0]) - np.array(last.samples.v[-1]) - np.array(leg.burns[-1].dv)) < 1e-6
        prev_r, prev_v = np.array(ride.samples.r[-1]), np.array(ride.samples.v[-1])
    assert plan.totalTime > 0 and plan.totalDv > 0


def test_propellant_accounting_and_warnings():
    small = {"dryMass": 500, "propellantMass": 100, "isp": 300, "maxThrust": 500}
    plan = plan_mission(request([{"satelliteId": "geo"}], ship=small))
    assert not plan.feasible
    assert any("runs dry" in w for w in plan.legs[0].warnings)
    plan = plan_mission(request([{"satelliteId": "geo"}]))
    assert plan.feasible
    used = sum(b.propellant for l in plan.legs for b in l.burns)
    assert abs(used + plan.propellantLeft - BIG_SHIP["propellantMass"]) < 1e-6


def test_unknown_satellite_is_a_422_at_the_endpoint():
    client = TestClient(app)
    body = request([{"satelliteId": "nope"}]).model_dump()
    r = client.post("/api/plan", json=body)
    assert r.status_code == 422


def test_endpoint_round_trip_and_size():
    client = TestClient(app)
    body = request([{"satelliteId": "geo", "dwellSeconds": 600}, {"satelliteId": "polar", "dwellSeconds": 600},
                    {"satelliteId": "iss", "dwellSeconds": 600}, {"satelliteId": "geo", "dwellSeconds": 600},
                    {"satelliteId": "leo", "dwellSeconds": 0}]).model_dump()
    r = client.post("/api/plan", json=body)
    assert r.status_code == 200, r.text
    assert len(r.content) < 1_000_000
    plan = r.json()
    assert len(plan["legs"]) == 5 and all(l["arcs"] for l in plan["legs"])
    assert plan["totalTime"] > 0 and abs(sum(l["totalDv"] for l in plan["legs"]) - plan["totalDv"]) < 1e-9
