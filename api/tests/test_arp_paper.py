"""The papers' instances, reproduced: the catalogue, their generator, and their recorded results.

The expected numbers come from the first paper's reproducibility package (Zenodo 10.5281/zenodo.6034335,
CC BY 4.0): results/m1-er0/arp_10_42/greedynn-euclidean.csv.xz and results/m400/arp_10_42/randomsearch.csv.xz.
"""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from api import arp, catalogue
from api.index import app
from api.propagation import elements_state

DAY = 86400.0


def greedy_euclidean(inst):
    """The papers' Algorithm 1 as their code runs it: nearest asteroid by distance at the time the ship is free."""
    n = len(inst.asteroids)
    here, eta, order = 0, 0.0, []
    unvisited = list(range(1, n + 1))
    while unvisited:
        r_here = elements_state(arp.body_elements(inst, here), inst.mu, eta * DAY)[0]
        nxt = min(unvisited, key=lambda a: np.linalg.norm(elements_state(arp.body_elements(inst, a), inst.mu, eta * DAY)[0] - r_here))
        tr = arp.transfer(inst, here, nxt, eta, mode="lambert2")
        eta += tr.tau + tr.t
        unvisited.remove(nxt)
        order.append(nxt)
        here = nxt
    return order


def test_the_catalogue_is_the_papers():
    c = catalogue.catalogue()
    assert catalogue.size() == 83453
    assert int(c["id"][0]) == 1 and int(c["id"][-1]) == 83453
    assert np.all(np.diff(c["id"]) == 1)
    assert 0.6 < float(c["a"].min()) / catalogue.AU_KM < 0.7 and 4.0 < float(c["a"].max()) / catalogue.AU_KM < 4.1
    assert float(c["e"].max()) < 0.97 and float(np.degrees(c["i"].max())) < 72


def test_instance_10_42_is_the_papers_instance():
    inst = catalogue.paper_instance(10, 42)
    assert inst.name == "10_42" and len(inst.asteroids) == 10
    assert [a.name for a in inst.asteroids][:3] == ["GTOC11 7449", "GTOC11 64589", "GTOC11 54626"]
    assert inst.mu == catalogue.MU_SUN and inst.innerStart == [1.0, 30.0] and inst.innerTol == 1e-4
    # the same seed draws the same instance; another seed another
    assert catalogue.paper_instance(10, 42).model_dump() == inst.model_dump()
    assert catalogue.paper_instance(10, 73).asteroids[0].name != inst.asteroids[0].name
    with pytest.raises(ValueError):
        catalogue.paper_instance(0, 1)


def test_the_papers_greedy_route_and_costs_are_reproduced():
    """Greedy nearest neighbour on 10_42 gives the paper's route and fitness, and two of its random-search
    rows cost what the paper recorded, to a few parts in a million (poliastro versus lamberthub, same mathematics)."""
    inst = catalogue.paper_instance(10, 42)
    order = greedy_euclidean(inst)
    assert [k - 1 for k in order] == [1, 2, 4, 7, 9, 8, 6, 0, 5, 3]
    ev, _ = arp.evaluate(inst, order, mode="lambert2")
    assert ev.cost == pytest.approx(391.308150064896, rel=2e-5)
    for row, fitness in (("2 9 6 4 0 3 1 7 8 5", 563.0430559870999), ("9 5 3 0 8 4 2 1 6 7", 473.04937871438926)):
        got, _ = arp.evaluate(inst, [int(k) + 1 for k in row.split()], mode="lambert2")
        assert got.cost == pytest.approx(fitness, rel=2e-5)


def test_the_instance_endpoint():
    client = TestClient(app)
    r = client.get("/api/arp/instance", params={"n": 5, "seed": 7})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "5_7" and len(body["asteroids"]) == 5 and body["innerStart"] == [1.0, 30.0]
    assert client.get("/api/arp/instance", params={"n": 0, "seed": 7}).status_code == 422
