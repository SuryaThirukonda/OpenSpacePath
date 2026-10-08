"""Orbit Lab planner: a FastAPI app that runs as one Vercel Python function.

Routes are defined with their full /api/... paths; vercel.json rewrites every /api/* request to
this file. A Lambert solve runs at import so numba compiles lamberthub's kernels during the cold
start rather than inside the first user request.
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import arp, lambert
from .mission import plan_mission
from .models import (ArpEvaluateRequest, ArpEvaluation, ArpPathRequest, ArpPlanResponse, ArpTransfer, ArpTransferRequest, MissionPlan,
                     PlanRequest)

VERSION = "0.6.0"

app = FastAPI(title="Orbit Lab planner", version=VERSION)


class LambertRequest(BaseModel):
    mu: float = Field(gt=0, description="gravitational parameter, km^3/s^2")
    r1: list[float] = Field(min_length=3, max_length=3)
    r2: list[float] = Field(min_length=3, max_length=3)
    tof: float = Field(gt=0, description="time of flight, s")
    M: int = Field(default=0, ge=0, description="complete revolutions")
    prograde: bool = True
    lowPath: bool = True
    solver: str = lambert.DEFAULT_SOLVER


class LambertResponse(BaseModel):
    v1: list[float]
    v2: list[float]


def _warm_up() -> None:
    lambert.solve(398600.0, [5000.0, 10000.0, 2100.0], [-14600.0, 2500.0, 7000.0], 3600.0)


_warm_up()


@app.get("/api/health")
def health() -> dict:
    return {"version": VERSION, "warm": True}


@app.post("/api/lambert", response_model=LambertResponse)
def lambert_route(q: LambertRequest) -> LambertResponse:
    try:
        res = lambert.solve(q.mu, q.r1, q.r2, q.tof, M=q.M, prograde=q.prograde, low_path=q.lowPath, solver=lambert.check_solver(q.solver))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if res is None:
        raise HTTPException(status_code=422, detail="no Lambert solution for this geometry, time of flight and revolution count")
    v1, v2 = res
    return LambertResponse(v1=v1.tolist(), v2=v2.tolist())


@app.post("/api/plan", response_model=MissionPlan)
def plan_route(req: PlanRequest) -> MissionPlan:
    try:
        return plan_mission(req)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.get("/api/lambert/solvers")
def lambert_solvers() -> dict:
    """Every solver lamberthub ships; the default is Izzo (2015)."""
    return {"default": lambert.DEFAULT_SOLVER, "solvers": lambert.solver_info()}


@app.post("/api/arp/transfer", response_model=ArpTransfer)
def arp_transfer(q: ArpTransferRequest) -> ArpTransfer:
    """The black-box B(a, a', eta) of the Asteroid Routing Problem, or its relaxation B'."""
    try:
        tr = arp.transfer(q.instance, q.origin, q.target, q.eta, solver=lambert.check_solver(q.solver), relaxed=q.relaxed, tau_f=q.tauF,
                          mode=q.transfer, dv_max=q.dvMax)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return tr.to_model(q.origin, q.target, q.eta)


@app.post("/api/arp/evaluate", response_model=ArpEvaluation)
def arp_evaluate(q: ArpEvaluateRequest) -> ArpEvaluation:
    """The cost of visiting the asteroids in a given order (which may be partial)."""
    try:
        ev, _ = arp.evaluate(q.instance, q.order, solver=lambert.check_solver(q.solver), times=q.times, mode=q.transfer, dv_max=q.dvMax)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return ev


@app.post("/api/arp/plan", response_model=ArpPlanResponse)
def arp_plan(q: ArpEvaluateRequest) -> ArpPlanResponse:
    """A route's cost together with its sampled trajectory, in the shape the Mission view draws."""
    try:
        ev, raw = arp.evaluate(q.instance, q.order, solver=lambert.check_solver(q.solver), times=q.times, mode=q.transfer, dv_max=q.dvMax)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return ArpPlanResponse(evaluation=ev, plan=arp.build_plan(q.instance, ev, raw))


@app.post("/api/arp/path", response_model=ArpPlanResponse)
def arp_path(q: ArpPathRequest) -> ArpPlanResponse:
    """A path written as arrival days and stays per asteroid, flown exactly as given and drawn."""
    try:
        inst, order, times = arp.path_route(q)
        ev, raw = arp.evaluate(inst, order, solver=lambert.check_solver(q.solver), times=times, mode=q.transfer, dv_max=q.dvMax)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return ArpPlanResponse(evaluation=ev, plan=arp.build_plan(inst, ev, raw))
