import numpy as np
from fastapi.testclient import TestClient

from api.index import app

client = TestClient(app)


def test_health_is_warm():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["warm"] is True


def test_lambert_route_curtis_5_2():
    r = client.post("/api/lambert", json={"mu": 398600.0, "r1": [5000, 10000, 2100], "r2": [-14600, 2500, 7000], "tof": 3600})
    assert r.status_code == 200
    body = r.json()
    assert np.allclose(body["v1"], [-5.99249, 1.92536, 3.24564], atol=1e-5)
    assert np.allclose(body["v2"], [-3.31246, -4.19662, -0.38529], atol=1e-5)


def test_lambert_route_rejects_degenerate_input():
    r = client.post("/api/lambert", json={"mu": 398600.0, "r1": [5000, 10000, 2100], "r2": [5000, 10000, 2100], "tof": 3600})
    assert r.status_code == 422
    r = client.post("/api/lambert", json={"mu": -1, "r1": [1, 2, 3], "r2": [3, 2, 1], "tof": 10})
    assert r.status_code == 422
