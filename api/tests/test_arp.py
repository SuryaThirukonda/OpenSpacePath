import math
import random

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api import arp, lambert
from api.index import app
from api.mission import plan_mission
from api.models import ArpInstance, PlanRequest
from api.propagation import elements_state
from api.tests.fixtures import MU_EARTH, R_EARTH

AU = 149597870.7
DAY = 86400.0


def make_instance(n: int = 6, seed: int = 42) -> ArpInstance:
    rng = random.Random(seed)
    asteroids = [{"id": f"a{k + 1}", "name": f"Asteroid {k + 1}", "elements": {
        "a": rng.uniform(2.1, 3.3) * AU, "e": rng.uniform(0.0, 0.25), "i": math.radians(rng.uniform(0, 12)),
        "raan": rng.uniform(0, 2 * math.pi), "argp": rng.uniform(0, 2 * math.pi), "M0": rng.uniform(0, 2 * math.pi)}} for k in range(n)]
    earth = {"id": "earth", "name": "Earth", "elements": {"a": 1.00000261 * AU, "e": 0.01671, "i": 0.0, "raan": 0.0,
                                                          "argp": math.radians(102.94), "M0": math.radians(357.0)}}
    return ArpInstance(epoch="2121-01-01T00:00:00Z", earth=earth, asteroids=asteroids)


INST = make_instance()


def test_izzo_is_the_default_and_every_lamberthub_solver_is_offered():
    info = lambert.solver_info()
    assert info[0]["id"] == "izzo2015" and info[0]["default"]
    assert {s["id"] for s in info} == {"izzo2015", "gooding1990", "vallado2013", "arora2013", "avanzini2008", "battin1984", "gauss1809"}
    assert {s["id"] for s in info if s["multiRevolution"]} == {"izzo2015", "gooding1990"}
    assert lambert.current_solver() == "izzo2015"
    with lambert.use_solver("gooding1990"):
        assert lambert.current_solver() == "gooding1990"
    assert lambert.current_solver() == "izzo2015"
    with pytest.raises(ValueError):
        lambert.check_solver("newton1687")


def test_solvers_agree_where_they_claim_to_and_never_return_an_arc_that_misses():
    rng = random.Random(7)

    def el():
        return {"a": rng.uniform(1.0, 3.3) * AU, "e": rng.uniform(0.0, 0.25), "i": math.radians(rng.uniform(0, 12)),
                "raan": rng.uniform(0, 2 * math.pi), "argp": rng.uniform(0, 2 * math.pi), "M0": rng.uniform(0, 2 * math.pi)}

    mu = INST.mu
    cases = []
    for _ in range(60):
        a, b = el(), el()
        t0, tof = rng.uniform(0, 2000) * DAY, rng.uniform(60, 730) * DAY
        cases.append((elements_state(a, mu, t0)[0], elements_state(b, mu, t0 + tof)[0], tof))
    ref = [lambert.solve(mu, r1, r2, tof) for r1, r2, tof in cases]
    assert all(r is not None for r in ref)
    worst = {}
    for s in lambert.SOLVERS:
        diffs = []
        for (r1, r2, tof), rf in zip(cases, ref):
            got = lambert.solve(mu, r1, r2, tof, solver=s)
            if got is None:
                continue
            assert lambert.miss(mu, r1, got[0], r2, tof) <= lambert.MAX_MISS or s in lambert.ROBUST, s
            diffs.append(float(np.linalg.norm(got[0] - rf[0])))
        worst[s] = (len(diffs), max(diffs) if diffs else None)
    assert worst["gooding1990"][0] == 60 and worst["gooding1990"][1] < 1e-9
    assert worst["avanzini2008"][0] == 60 and worst["avanzini2008"][1] < 1e-4
    assert worst["gauss1809"][0] < 30          # short arcs only
    # single-revolution solvers decline a multi-revolution request instead of answering a different question
    r1, r2, tof = cases[0]
    assert lambert.solve(mu, r1, r2, 6 * 365 * DAY, M=1, solver="avanzini2008") is None


def test_transfer_respects_the_bounds_and_the_cost_definition():
    tr = arp.transfer(INST, 0, 1, 0.0)
    assert 0.0 <= tr.tau <= INST.tauMax and 1.0 <= tr.t <= INST.tMax
    assert tr.dv == pytest.approx(np.linalg.norm(tr.dv1) + np.linalg.norm(tr.dv2))
    assert tr.z == pytest.approx(tr.dv + (2.0 / 30.0) * (tr.tau + tr.t))
    # no worse than the papers' starting point of no wait and a 30-day transfer
    start = arp.transfer(INST, 0, 1, 0.0, fixed=(0.0, 30.0))
    assert tr.z <= start.z + 1e-9
    assert tr.miss < 1e-8
    # the relaxation that does not charge the wait is a lower bound
    assert arp.transfer(INST, 0, 1, 0.0, relaxed=True).z <= tr.z + 1e-9


def test_a_route_chains_its_transfers_and_is_deterministic():
    order = [3, 1, 5, 2, 6, 4]
    ev, _ = arp.evaluate(INST, order)
    eta = 0.0
    for leg, there, here in zip(ev.legs, order, [0] + order[:-1]):
        assert (leg.origin, leg.target) == (here, there)
        assert leg.eta == pytest.approx(eta)
        eta += leg.tau + leg.t
    assert ev.time == pytest.approx(eta)
    assert ev.cost == pytest.approx(sum(l.z for l in ev.legs))
    assert ev.cost == pytest.approx(ev.dv + (2.0 / 30.0) * ev.time)
    again, _ = arp.evaluate(INST, order)
    assert again.cost == ev.cost
    # giving the route its own times back reproduces it exactly
    fixed, _ = arp.evaluate(INST, order, times=[[l.tau, l.t] for l in ev.legs])
    assert fixed.cost == pytest.approx(ev.cost, rel=1e-12)
    # a prefix of the route costs the same as the first legs of the whole
    part, _ = arp.evaluate(INST, order[:3])
    assert part.cost == pytest.approx(sum(l.z for l in ev.legs[:3]))


def test_bad_orders_are_refused():
    for bad in ([1, 1, 2], [0, 1], [7], [1, 2, 99]):
        with pytest.raises(ValueError):
            arp.evaluate(INST, bad)
    with pytest.raises(ValueError):
        arp.check_order(INST, [1, 2], complete=True)
    with pytest.raises(ValueError):
        arp.evaluate(INST, [1, 2], times=[[0, 100]])


def test_the_drawn_route_starts_and_ends_on_the_bodies():
    order = [2, 4, 1]
    ev, raw = arp.evaluate(INST, order)
    plan = arp.build_plan(INST, ev, raw)
    assert len(plan.legs) == 3
    assert (plan.prelude is not None) == (ev.legs[0].tau > 1e-6)
    t_prev = 0.0
    for k, (leg, e) in enumerate(zip(plan.legs, ev.legs)):
        d_dep, d_arr = (e.eta + e.tau) * DAY, (e.eta + e.tau + e.t) * DAY
        arc = leg.arcs[0]
        assert arc.t0 == pytest.approx(d_dep) and arc.t1 == pytest.approx(d_arr)
        r_from = elements_state(arp.body_elements(INST, e.origin), INST.mu, d_dep)[0]
        r_to = elements_state(arp.body_elements(INST, e.target), INST.mu, d_arr)[0]
        assert np.linalg.norm(np.array(arc.samples.r[0]) - r_from) < 1e-3
        assert np.linalg.norm(np.array(arc.samples.r[-1]) - r_to) / np.linalg.norm(r_to) < 1e-7
        assert sum(b.magnitude for b in leg.burns) == pytest.approx(e.dv)
        assert [b.label for b in leg.burns] == ["depart", "arrive"]
        assert arc.t0 >= t_prev - 1e-6
        t_prev = arc.t1
        # the wait before the next transfer is drawn as a ride with this leg's target; the last leg always has one
        waits_next = k == len(ev.legs) - 1 or ev.legs[k + 1].tau > 1e-6
        assert (leg.ride is not None) == waits_next
        if leg.ride is not None:
            assert leg.ride.satelliteId == arp.body_id(INST, e.target)
            assert leg.ride.t0 == pytest.approx(arc.t1)
    assert plan.totalTime == pytest.approx((ev.time + arp.FINAL_RIDE_DAYS) * DAY)
    assert plan.totalDv == pytest.approx(ev.dv)


def test_the_chosen_solver_is_used_and_a_robust_one_changes_nothing():
    order = [1, 2, 3]
    izzo, _ = arp.evaluate(INST, order, solver="izzo2015")
    gooding, _ = arp.evaluate(INST, order, solver="gooding1990")
    assert gooding.solver == "gooding1990"
    # the same to within where the inner optimizer stops: its finite-difference gradients differ in the last digits
    assert gooding.cost == pytest.approx(izzo.cost, rel=1e-4)
    with pytest.raises(ValueError) as err:
        arp.transfer(INST, 0, 1, 0.0, solver="gauss1809")
    assert "robust" in str(err.value)


def test_the_mission_planner_takes_a_solver():
    def request(solver):
        return PlanRequest.model_validate({
            "body": {"id": "earth", "mu": MU_EARTH, "radius": R_EARTH}, "epoch": "2026-09-01T11:57:51Z",
            "satellites": [{"id": "geo", "kind": "kepler", "elements": {"a": 42164.17, "e": 0.0, "i": 0.0, "raan": 0.0, "argp": 0.0, "M0": 0.7}}],
            "mission": {"ship": {"dryMass": 1000, "propellantMass": 50000, "isp": 450, "maxThrust": 1e5}, "startT": 0, "solver": solver,
                        "start": {"kind": "elements", "elements": {"a": 6678.137, "e": 0.0, "i": 0.0, "raan": 0.0, "argp": 0.0, "M0": 0.0}},
                        "stops": [{"satelliteId": "geo", "dwellSeconds": 0, "strategy": "lambert2"}]}})

    izzo = plan_mission(request("izzo2015"))
    gooding = plan_mission(request("gooding1990"))
    assert gooding.totalDv == pytest.approx(izzo.totalDv, rel=1e-6)
    assert PlanRequest.model_validate(request("izzo2015").model_dump()).mission.solver == "izzo2015"
    with pytest.raises(ValueError):
        plan_mission(request("newton1687"))


def test_endpoints():
    client = TestClient(app)
    solvers = client.get("/api/lambert/solvers").json()
    assert solvers["default"] == "izzo2015" and len(solvers["solvers"]) == 7
    inst = INST.model_dump()
    tr = client.post("/api/arp/transfer", json={"instance": inst, "origin": 0, "target": 2, "eta": 0}).json()
    assert tr["z"] == pytest.approx(arp.transfer(INST, 0, 2, 0.0).z)
    ev = client.post("/api/arp/evaluate", json={"instance": inst, "order": [2, 1]}).json()
    assert ev["legs"][0]["z"] == pytest.approx(tr["z"]) and ev["solver"] == "izzo2015"
    planned = client.post("/api/arp/plan", json={"instance": inst, "order": [2, 1], "solver": "gooding1990"})
    assert planned.status_code == 200
    body = planned.json()
    assert body["evaluation"]["solver"] == "gooding1990" and len(body["plan"]["legs"]) == 2
    assert len(planned.content) < 400_000
    assert client.post("/api/arp/evaluate", json={"instance": inst, "order": [2, 2]}).status_code == 422
    assert client.post("/api/arp/evaluate", json={"instance": inst, "order": [1], "solver": "newton1687"}).status_code == 422
