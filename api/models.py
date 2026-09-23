"""Request and response schemas for the planner. Mirror of app/src/mission/types.ts.

Units: km, km/s, s, kg, N, rad. Times are simulated seconds since the scenario epoch, the same
convention as the browser's timeline.
"""
from __future__ import annotations

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field

Vec3 = Annotated[list[float], Field(min_length=3, max_length=3)]


class Elements(BaseModel):
    a: float = Field(gt=0)
    e: float = Field(ge=0, lt=1)
    i: float
    raan: float
    argp: float
    M0: float


class KeplerSatellite(BaseModel):
    id: str
    kind: Literal["kepler"]
    elements: Elements


class TleSatellite(BaseModel):
    id: str
    kind: Literal["tle"]
    line1: str = Field(min_length=69)
    line2: str = Field(min_length=69)


Satellite = Annotated[Union[KeplerSatellite, TleSatellite], Field(discriminator="kind")]


class Body(BaseModel):
    id: str
    mu: float = Field(gt=0)
    radius: float = Field(gt=0)


class Ship(BaseModel):
    name: str = "Ship"
    dryMass: float = Field(default=5000.0, gt=0)
    propellantMass: float = Field(default=20000.0, ge=0)
    isp: float = Field(default=350.0, gt=0)
    maxThrust: float = Field(default=50000.0, gt=0)
    maxSpeed: Optional[float] = Field(default=None, gt=0)
    minBurnSpacing: float = Field(default=60.0, ge=0)


Strategy = Literal["lambert2", "phasing3", "bielliptic3", "waypoint4", "best"]


class Stop(BaseModel):
    satelliteId: str
    dwellSeconds: float = Field(default=1800.0, ge=0)
    strategy: Strategy = "best"
    tofBounds: Optional[tuple[float, float]] = None


class StartOrbit(BaseModel):
    kind: Literal["satellite", "elements"]
    id: Optional[str] = None
    elements: Optional[Elements] = None


class MissionInput(BaseModel):
    ship: Ship = Ship()
    startT: float = 0.0
    start: StartOrbit
    stops: list[Stop] = Field(min_length=1, max_length=12)
    departureWindow: float = Field(default=0.0, ge=0)


class PlanRequest(BaseModel):
    body: Body
    epoch: str
    satellites: list[Satellite]
    mission: MissionInput


class Burn(BaseModel):
    t: float
    r: Vec3
    dv: Vec3
    magnitude: float
    duration: float
    propellant: float
    label: str


class Samples(BaseModel):
    t: list[float]
    r: list[Vec3]
    v: list[Vec3]


class Arc(BaseModel):
    t0: float
    t1: float
    samples: Samples


class Ride(BaseModel):
    t0: float
    t1: float
    satelliteId: str
    samples: Samples


class Leg(BaseModel):
    toStop: int
    strategy: str
    tof: float
    totalDv: float
    warnings: list[str]
    burns: list[Burn]
    arcs: list[Arc]
    ride: Optional[Ride]


class MissionPlan(BaseModel):
    legs: list[Leg]
    totalDv: float
    totalTime: float
    propellantLeft: float
    feasible: bool
