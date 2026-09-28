"""Orbit Lab planner: a FastAPI app that runs as one Vercel Python function.

Routes are defined with their full /api/... paths; vercel.json rewrites every /api/* request to
this file. A Lambert solve runs at import so numba compiles lamberthub's kernels during the cold
start rather than inside the first user request.
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import lambert
from .mission import plan_mission
from .models import MissionPlan, PlanRequest

VERSION = "0.4.0"

app = FastAPI(title="Orbit Lab planner", version=VERSION)


class LambertRequest(BaseModel):
    mu: float = Field(gt=0, description="gravitational parameter, km^3/s^2")
    r1: list[float] = Field(min_length=3, max_length=3)
    r2: list[float] = Field(min_length=3, max_length=3)
    tof: float = Field(gt=0, description="time of flight, s")
    M: int = Field(default=0, ge=0, description="complete revolutions")
    prograde: bool = True
    lowPath: bool = True


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
    res = lambert.solve(q.mu, q.r1, q.r2, q.tof, M=q.M, prograde=q.prograde, low_path=q.lowPath)
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
