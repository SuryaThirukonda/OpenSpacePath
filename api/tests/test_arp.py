import math
import random

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api import arp, lambert
from api.index import app
from api.mission import plan_mission
from api.models import ArpInstance, PlanRequest
from api.propagation import elements_state, propagate_universal
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
TWO = {"mode": "lambert2"}


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
    tr = arp.transfer(INST, 0, 1, 0.0, **TWO)
    assert 0.0 <= tr.tau <= INST.tauMax and 1.0 <= tr.t <= INST.tMax
    assert tr.dv == pytest.approx(np.linalg.norm(tr.dv1) + np.linalg.norm(tr.dv2))
    assert tr.z == pytest.approx(tr.dv + (2.0 / 30.0) * (tr.tau + tr.t))
    # no worse than the papers' starting point of no wait and a 30-day transfer
    start = arp.transfer(INST, 0, 1, 0.0, fixed=(0.0, 30.0), **TWO)
    assert tr.z <= start.z + 1e-9
    assert tr.miss < 1e-8
    # the relaxation that does not charge the wait is a lower bound
    assert arp.transfer(INST, 0, 1, 0.0, relaxed=True, **TWO).z <= tr.z + 1e-9


def test_a_route_chains_its_transfers_and_is_deterministic():
    order = [3, 1, 5, 2, 6, 4]
    ev, _ = arp.evaluate(INST, order, **TWO)
    eta = 0.0
    for leg, there, here in zip(ev.legs, order, [0] + order[:-1]):
        assert (leg.origin, leg.target) == (here, there)
        assert leg.eta == pytest.approx(eta)
        eta += leg.tau + leg.t
    assert ev.time == pytest.approx(eta)
    assert ev.cost == pytest.approx(sum(l.z for l in ev.legs))
    assert ev.cost == pytest.approx(ev.dv + (2.0 / 30.0) * ev.time)
    again, _ = arp.evaluate(INST, order, **TWO)
    assert again.cost == ev.cost
    # giving the route its own times back reproduces it exactly
    fixed, _ = arp.evaluate(INST, order, times=[[l.tau, l.t] for l in ev.legs], **TWO)
    assert fixed.cost == pytest.approx(ev.cost, rel=1e-12)
    # a prefix of the route costs the same as the first legs of the whole
    part, _ = arp.evaluate(INST, order[:3], **TWO)
    assert part.cost == pytest.approx(sum(l.z for l in ev.legs[:3]))


def test_bad_orders_are_refused():
    for bad in ([1, 1, 2], [0, 1], [7], [1, 2, 99]):
        with pytest.raises(ValueError):
            arp.evaluate(INST, bad, **TWO)
    with pytest.raises(ValueError):
        arp.check_order(INST, [1, 2], complete=True)
    with pytest.raises(ValueError):
        arp.evaluate(INST, [1, 2], times=[[0, 100]], **TWO)
    with pytest.raises(ValueError):
        arp.transfer(INST, 0, 1, 0.0, mode="fourburn")


def test_the_drawn_route_starts_and_ends_on_the_bodies():
    order = [2, 4, 1]
    ev, raw = arp.evaluate(INST, order, **TWO)
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


def test_three_burn_mode_flies_the_same_times_with_three_burns():
    """Three-burn mode keeps the papers' times and charges the sheet's three burns; the drawn arcs chain exactly."""
    order = [2, 4]
    two, _ = arp.evaluate(INST, order, mode="lambert2")
    three, raw = arp.evaluate(INST, order, mode="threeburn")
    assert three.transfer == "threeburn" and three.time == pytest.approx(two.time)
    for a, b, tr in zip(two.legs, three.legs, raw):
        assert (b.tau, b.t) == pytest.approx((a.tau, a.t))
        assert b.transfer == "threeburn" and b.burns in (2, 3) and b.lambertDv == pytest.approx(a.dv)
        assert b.dv == pytest.approx(b.dv1 + b.dv2 + b.dv3)
        assert b.z == pytest.approx(b.dv + (2.0 / 30.0) * (b.tau + b.t))
        assert b.miss < 1e-6
        # coasts chain: each arc propagated to its end lands on the next burn, the last on the target
        for (t0, t1, r0, v0), (tb, rb, _) in zip(tr.arcs[-(len(tr.burns) - 1):], tr.burns[1:]):
            r, _ = propagate_universal(r0, v0, t1 - t0, INST.mu)
            assert np.linalg.norm(r - rb) < 5e-3
        assert np.linalg.norm(tr.burns[-1][1] - elements_state(arp.body_elements(INST, b.target), INST.mu, (b.eta + b.tau + b.t) * DAY)[0]) < 1e-6
    plan = arp.build_plan(INST, three, raw)
    for leg, tr in zip(plan.legs, raw):
        assert leg.strategy.startswith("threeburn") and [b.label for b in leg.burns][0] == "burn 1, shaping"
        assert leg.burns[-1].label == "burn 3, match" and len(leg.arcs) >= len(leg.burns) - 1
    # explicit times are flown as given, in either mode
    times = [[10.0, 250.0], [40.0, 300.0]]
    for mode in ("lambert2", "threeburn"):
        ev, _ = arp.evaluate(INST, order, times=times, mode=mode)
        assert [[l.tau, l.t] for l in ev.legs] == times
    # a delta-v cap that nothing meets is an error for explicit times
    with pytest.raises(ValueError):
        arp.evaluate(INST, order, times=times, mode="threeburn", dv_max=0.01)


def test_a_written_path_is_flown_exactly_and_checked():
    from api.models import ArpPathRequest
    entries = [{"asteroid": INST.asteroids[1].model_dump(), "arrival": 300.0, "delay": 20.0},
               {"asteroid": INST.asteroids[3].model_dump(), "arrival": 700.0, "delay": 0.0}]
    req = ArpPathRequest(epoch=INST.epoch, earth=INST.earth, departure=15.0, entries=entries, transfer="lambert2")
    inst, order, times = arp.path_route(req)
    assert order == [1, 2] and times == [[15.0, 285.0], [20.0, 380.0]]
    ev, raw = arp.evaluate(inst, order, times=times, mode="lambert2")
    assert ev.time == pytest.approx(700.0)
    assert [l.eta + l.tau + l.t for l in ev.legs] == pytest.approx([300.0, 700.0])
    bad = dict(epoch=INST.epoch, earth=INST.earth, entries=[dict(entries[0], arrival=10.0), entries[1]], departure=15.0)
    with pytest.raises(ValueError):
        arp.path_route(ArpPathRequest(**bad))
    with pytest.raises(ValueError):
        arp.path_route(ArpPathRequest(epoch=INST.epoch, earth=INST.earth, entries=[entries[0], dict(entries[1], arrival=310.0)]))
    with pytest.raises(ValueError):
        arp.path_route(ArpPathRequest(epoch=INST.epoch, earth=INST.earth, entries=[entries[0], entries[0]]))


def test_the_chosen_solver_is_used_and_a_robust_one_changes_nothing():
    order = [1, 2, 3]
    izzo, _ = arp.evaluate(INST, order, mode="lambert2", solver="izzo2015")
    gooding, _ = arp.evaluate(INST, order, mode="lambert2", solver="gooding1990")
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
                        "transfer": "lambert2", "stops": [{"satelliteId": "geo", "dwellSeconds": 0}]}})

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
    tr = client.post("/api/arp/transfer", json={"instance": inst, "origin": 0, "target": 2, "eta": 0, "transfer": "lambert2"}).json()
    assert tr["z"] == pytest.approx(arp.transfer(INST, 0, 2, 0.0, mode="lambert2").z) and tr["transfer"] == "lambert2" and tr["burns"] == 2
    ev = client.post("/api/arp/evaluate", json={"instance": inst, "order": [2, 1], "transfer": "lambert2"}).json()
    assert ev["legs"][0]["z"] == pytest.approx(tr["z"]) and ev["solver"] == "izzo2015" and ev["transfer"] == "lambert2"
    planned = client.post("/api/arp/plan", json={"instance": inst, "order": [2, 1], "solver": "gooding1990", "transfer": "lambert2"})
    assert planned.status_code == 200
    body = planned.json()
    assert body["evaluation"]["solver"] == "gooding1990" and len(body["plan"]["legs"]) == 2
    assert len(planned.content) < 400_000
    three = client.post("/api/arp/transfer", json={"instance": inst, "origin": 0, "target": 2, "eta": 0}).json()
    assert three["transfer"] == "threeburn" and three["burns"] in (2, 3) and three["lambertDv"] == pytest.approx(tr["dv"])
    assert client.post("/api/arp/evaluate", json={"instance": inst, "order": [2, 2]}).status_code == 422
    assert client.post("/api/arp/evaluate", json={"instance": inst, "order": [1], "solver": "newton1687"}).status_code == 422
    path = client.post("/api/arp/path", json={"epoch": INST.epoch, "earth": inst["earth"], "departure": 5,
                                              "entries": [{"asteroid": inst["asteroids"][0], "arrival": 400, "delay": 30},
                                                          {"asteroid": inst["asteroids"][2], "arrival": 900}], "transfer": "lambert2"})
    assert path.status_code == 200, path.text
    pb = path.json()
    assert pb["evaluation"]["time"] == pytest.approx(900.0) and len(pb["plan"]["legs"]) == 2
    assert pb["plan"]["prelude"] is not None and pb["plan"]["legs"][0]["ride"] is not None
    assert client.post("/api/arp/path", json={"epoch": INST.epoch, "earth": inst["earth"],
                                              "entries": [{"asteroid": inst["asteroids"][0], "arrival": 400, "delay": 30},
                                                          {"asteroid": inst["asteroids"][2], "arrival": 410}]}).status_code == 422
