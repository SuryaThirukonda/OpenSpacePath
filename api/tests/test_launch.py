import math

import numpy as np

from api import launch as L
from api.mission import plan_mission
from api.models import PlanRequest
from api.propagation import target_state_fn
from api.tests.fixtures import DEFAULT_EPOCH_MS, MU_EARTH, R_EARTH

DEG = math.pi / 180
CAPE = {"name": "Cape Canaveral", "latitude": 28.5, "longitude": -80.6, "altitude": 0.0}
# Illustrative Falcon 9-class figures from public sources, rounded
F9 = {"name": "Falcon 9-class", "dragArea": 10.5, "dragCoefficient": 0.3, "stages": [
    {"name": "first stage", "dryMass": 25600, "propellantMass": 395700, "ispVacuum": 311, "ispSeaLevel": 282, "thrustVacuum": 8227000},
    {"name": "second stage", "dryMass": 3900, "propellantMass": 92670, "ispVacuum": 348, "thrustVacuum": 981000},
]}
ISS_LIKE = {"id": "leo", "kind": "kepler", "elements": {"a": 6798.0, "e": 0.0005, "i": 51.6 * DEG, "raan": 282.4 * DEG, "argp": 96.5 * DEG, "M0": 263.6 * DEG}}
GEO = {"id": "geo", "kind": "kepler", "elements": {"a": 42164.17, "e": 0.0, "i": 0.0, "raan": 0.0, "argp": 0.0, "M0": 0.7}}


def test_gmst_matches_the_app_anchor():
    epoch_ms = 1788220800000  # 2026-09-01T00:00:00Z
    assert abs(math.degrees(L.gmst(epoch_ms, 0.0)) - 340.1731699) < 1e-5


def test_site_rotation_speed_and_azimuth():
    r, v = L.site_inertial(28.5, -80.6, 0.0, DEFAULT_EPOCH_MS, 0.0)
    assert abs(np.linalg.norm(v) - 0.4651 * math.cos(28.5 * DEG)) < 0.002
    assert abs(np.linalg.norm(r) - 6373.0) < 5
    az = L.launch_azimuth(51.6, 28.5)
    assert abs(math.degrees(az) - 45.0) < 0.2
    assert L.launch_azimuth(20.0, 28.5) is None


def test_window_puts_the_pad_in_the_target_plane():
    fn = target_state_fn(ISS_LIKE, MU_EARTH, DEFAULT_EPOCH_MS)
    r_t, v_t = fn(0.0)
    n_t = np.cross(r_t, v_t); n_t /= np.linalg.norm(n_t)
    t, az, alignment = L.find_window(28.5, -80.6, DEFAULT_EPOCH_MS, 0.0, 51.6, n_t)
    assert alignment > math.cos(0.5 * DEG)
    r_site, _ = L.site_inertial(28.5, -80.6, 0.0, DEFAULT_EPOCH_MS, t)
    assert abs(float(np.dot(r_site / np.linalg.norm(r_site), n_t))) < math.sin(0.5 * DEG)
    assert 0 <= t < L.SIDEREAL_DAY


def test_falcon9_class_ascent_to_200_km_is_realistic():
    stages = [L.Stage(s["name"], s["dryMass"], s["propellantMass"], s["ispVacuum"], s.get("ispSeaLevel", 0.9 * s["ispVacuum"]), s["thrustVacuum"]) for s in F9["stages"]]
    res = L.best_ascent(stages, 15000.0, R_EARTH, 0.4651 * math.cos(28.5 * DEG) * math.sin(45 * DEG), MU_EARTH, R_EARTH + 200.0, 0.3 * 10.5)
    assert res.feasible, res.warnings
    assert 0.5 < res.gravity_loss < 2.0
    assert 0.01 < res.drag_loss < 0.35
    assert 0.9 < res.gravity_loss + res.drag_loss + res.steering_loss < 2.5
    assert 8.3 < res.ideal_dv + res.circ_dv < 10.5
    assert 15 < res.max_q < 60
    assert res.max_g <= 5.0 + 1e-9
    assert 300 < res.t_meco < 700
    used = sum(u[1] for u in res.stage_use)
    assert used < sum(s.propellant for s in stages)


def test_too_heavy_a_payload_is_infeasible():
    stages = [L.Stage(s["name"], s["dryMass"], s["propellantMass"], s["ispVacuum"], s.get("ispSeaLevel", 0.9 * s["ispVacuum"]), s["thrustVacuum"]) for s in F9["stages"]]
    res = L.best_ascent(stages, 300000.0, R_EARTH, 0.4, MU_EARTH, R_EARTH + 200.0, 3.15)
    assert not res.feasible


def test_launch_then_tour_is_consistent():
    req = PlanRequest.model_validate({
        "body": {"id": "earth", "mu": MU_EARTH, "radius": R_EARTH}, "epoch": "2026-09-01T11:57:51Z",
        "satellites": [ISS_LIKE, GEO],
        "mission": {"ship": {"dryMass": 2000, "propellantMass": 12000, "isp": 320, "maxThrust": 40000},
                    "startT": 0, "start": {"kind": "launch", "launch": {"site": CAPE, "vehicle": F9, "parkingAltitude": 200}},
                    "stops": [{"satelliteId": "leo", "dwellSeconds": 600, "strategy": "lambert2"}]},
    })
    plan = plan_mission(req)
    rep = plan.launch
    assert rep is not None and rep.feasible, (rep and rep.warnings)
    assert abs(rep.inclinationDeg - 51.6) < 0.7
    assert abs(rep.parkingAltitude - 200.0) < 1.0
    assert rep.insertionT > rep.mecoT > rep.liftoffT >= 0
    # the parking state is circular at the parking radius, in the plane, and the first leg starts there
    r_ins = np.array(rep.samples.r[-1]); v_ins = np.array(rep.samples.v[-1])
    assert abs(np.linalg.norm(r_ins) - (R_EARTH + 200.0)) < 1.0
    assert abs(np.linalg.norm(v_ins) - math.sqrt(MU_EARTH / np.linalg.norm(r_ins))) < 1e-6
    assert 0.001 < rep.budget.planeCorrection < 0.02
    assert abs(float(np.dot(r_ins, v_ins))) < 1e-6
    first = plan.legs[0]
    assert abs(first.burns[0].t - rep.insertionT) < 1e-9
    assert np.linalg.norm(np.array(first.arcs[0].samples.r[0]) - r_ins) < 1e-6
    assert plan.totalTime > first.ride.t1 - rep.insertionT
    assert rep.samples.t[0] == rep.liftoffT and rep.samples.t[-1] == rep.insertionT
    assert all(b - a > 0 for a, b in zip(rep.samples.t, rep.samples.t[1:]))
