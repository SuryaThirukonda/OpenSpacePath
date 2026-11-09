# Mission planner

How a tour in the Mission tab is planned, returned and drawn. The planner is `api/mission.py`, `legs.py`, `threeburn.py`, `ship.py` and `launch.py` (see [api/README.md](../api/README.md)); in the browser it is `app/src/mission/` and the scene's `ShipMarker`, `MissionPath` and `BurnEffect`.

## 1. What it does

A ship visits satellites around the central body in the order the user gives. For each leg the planner solves a transfer to where the target *will be* at arrival, not where it is when the ship leaves, matches the target's velocity on arrival, stays with it for the dwell time, and departs for the next stop. The scene draws the whole tour as one line, flies the ship along it with an engine flare at every burn, and shows the part already flown and the part still to come, whether playing or paused.

## 2. Terms

| Term | Meaning here |
|---|---|
| Target | A satellite in the scenario, Keplerian or TLE, propagated with its own model (two-body or SGP4). |
| Intercept | Ship position equals target position at arrival time. |
| Rendezvous | Intercept plus ship velocity equals target velocity. This is what the tour needs, since the ship then rides with the satellite during the dwell. |
| Lead | Aiming at the target's position at the arrival time rather than at the current one. Aiming at the current position arrives where the satellite was; by then it has moved on by $v_t \cdot \mathrm{TOF}$, tens of thousands of km for a LEO target over one transfer. |
| Braking | The arrival burn. Without it the ship reaches the target's position at the wrong velocity and flies past. Its size is $\lVert \mathbf v_{target}(t_a) - \mathbf v_2 \rVert$. |
| Leg | Departure, one or more coast arcs joined by burns, arrival, then a dwell. |
| Dwell | Time spent with the target after the rendezvous, riding its orbit, before the next departure. |
| Burn | An impulsive velocity change $\Delta\mathbf v$ at an instant, with a finite duration derived from the ship model for display and feasibility. |

The ship coasts under two-body gravity only, while targets keep their own propagators. Each leg's endpoint is taken from the target's propagator at the chosen arrival time, so the ship arrives exactly where the target's model puts it and mixing models introduces no mismatch.

## 3. A tour

- **Inputs.** The ship (masses, Isp, thrust, an optional speed cap and a minimum spacing between burns); the start, which is a parking orbit given by its elements, riding with one of the satellites, or a launch from a pad (section 7); the stops in order, each with a dwell time; the transfer (two or three burns) and the Lambert solver.
- **Order.** Legs are planned in order. The ship's state at the start of leg k is the target's state at the end of the dwell at stop k − 1, since the ship rides the target.
- **What the planner chooses.** Each leg's timing. The order of the stops is the user's.

## 4. A leg

### 4.1 Two burns

Given the ship state $(\mathbf r_s, \mathbf v_s)$ at departure time $t_d$ and a target with state function $\mathbf x_t(t)$:

1. For a candidate time of flight $\tau$: $t_a = t_d + \tau$, $\mathbf r_2 = \mathbf r_t(t_a)$; solve Lambert for $(\mathbf v_1, \mathbf v_2)$ from $\mathbf r_s$ to $\mathbf r_2$ in $\tau$.
2. Burns: $\Delta\mathbf v_1 = \mathbf v_1 - \mathbf v_s$ (depart), $\Delta\mathbf v_2 = \mathbf v_t(t_a) - \mathbf v_2$ (brake and match).
3. Cost: $\lVert\Delta\mathbf v_1\rVert + \lVert\Delta\mathbf v_2\rVert$.

The lead is step 1: the endpoint is the target's *future* position. The braking burn in step 2 is what stops the fly-past.

**Choosing $\tau$.** The cost is a rough function of $\tau$ with several minima, so the planner scans first and refines afterwards (`legs.plan_two_burn`):

- It scans 120 times of flight from 0.05 to 3 target periods (at least 60 s), keeps the three best and refines each by golden-section search.
- Every time is tried with zero revolutions, and with one revolution on both branches once $\tau$ exceeds 1.05 target periods, since a multi-revolution arc is often the cheap answer when the timing is awkward.
- An arc that would dip into the body is rejected.
- An optional departure window also slides $t_d$ later, over 12 points, when waiting a little makes the geometry cheaper. It is off by default, because it lengthens the tour.

### 4.2 Three burns

The default. Burn 1 shapes the approach in the departure plane, burn 2 at the node line reshapes and tilts the orbit in one impulse, and burn 3 matches the target. With the arrival time free, the planner scans 24 times of flight with a quick search, refines the best bracket by golden section and solves the final time fully (`legs.plan_three_burn`). The method, its departures from the derivation sheet and what to expect of its numbers are in [three-burn-transfer.md](three-burn-transfer.md).

## 5. The ship

Each burn uses the rocket equation. With mass $m_0$ before the burn and exhaust velocity $v_e = g_0 I_{sp}$, where $g_0$ = 9.80665 m/s²:

$$
m_1 = m_0\,e^{-\Delta v / v_e}, \qquad
m_{prop} = m_0 - m_1, \qquad
t_{burn} = \frac{m_{prop}\,v_e}{F_{max}}, \qquad
\Delta v_{capacity} = v_e \ln\frac{m_{dry} + m_{prop,left}}{m_{dry}}
$$

As a check, 3.59 km/s at $I_{sp}$ = 450 s gives a mass ratio of 2.256.

The planner reports problems as warnings rather than failures, so the tour still draws:

- A burn needs more propellant than is left. The ship runs dry, and the plan is marked infeasible.
- A burn lasts more than 5% of its leg, which strains the impulsive model.
- Two burns are closer than the ship's minimum spacing.
- A coast is faster than the ship's speed cap, if one is set.
- No transfer exists for a leg. The plan is marked infeasible and stops at that leg.

The ship presets are a test ship with a generous tank (20 km/s), a chemical upper stage (about 9 km/s) and a small kick stage (about 5.6 km/s).

## 6. What comes back, and how it is drawn

The plan holds every leg with its burns (time, position, $\Delta\mathbf v$, magnitude, duration, propellant, label), its coast arcs and its ride, plus warnings and totals. Every arc and ride also carries dense samples of time, position and velocity; ride samples come from the target's own propagator. The ship's state at any simulated time is a pure function of the plan: the browser finds the sample interval containing $t$ and interpolates it with a cubic Hermite spline, using the velocities (`app/src/mission/state.ts`). Scrubbing, pausing and rate changes need no extra logic and never call the planner. If a request fails, the panel shows the planner's message.

In the scene:

- **The path** is one line for the whole tour. The part already flown is solid and the rest is dashed, with dashes that keep their size on screen at any zoom. Rides are not drawn as lines.
- **Markers.** Burn markers carry their $\Delta v$, and wait badges carry the dwell. Their labels belong to the leg in play, or to the selected leg.
- **The ship** points its nose along its motion with its belly toward the body. After a burn it swings onto the new direction at a bounded turn rate and angular acceleration in wall time. On the ascent the nose follows the velocity relative to the turning atmosphere, so the rocket stands on the pad and pitches over as it climbs.
- **The flare.** When the clock crosses a burn while playing (not while scrubbing), the engine flares from the tail. At playback rates up to 60× it lasts the burn's real duration (at least 0.4 s of wall time); faster, it lasts 0.8 s of wall time, so a burn is visible at any rate. During a powered ascent the engines stay lit for each stage's whole burn.
- **Cameras.** Free, Follow (travels with the ship), Chase (behind the ship along its flight) and Bird's-eye (straight down on the current leg), from the View menu.
- **The timeline** offers a "whole mission" span, marks the burns on the scrubber, and steps to the previous or next burn.

## 7. Launch from the ground

The start of a tour can be a launch pad instead of a parking orbit or a satellite. `api/launch.py` carries the ascent to a circular parking orbit; the tour's first leg then departs from the insertion state at the insertion time, through the same machinery as every other leg.

### 7.1 Geometry

- The pad is on the WGS-84 ellipsoid (geodetic latitude, longitude, altitude) and is rotated into the inertial frame by Greenwich mean sidereal time (IAU 1982, UT1 taken as UTC), the same formula the browser uses to spin the globe (`satellite.gstime`), so the drawn pad marker and the computed pad coincide. Other bodies use a sphere spun at 2π t / rotationPeriod, again matching the browser.
- Earth's rotation gives the pad a velocity ω × r (about 0.409 km/s at Cape Canaveral). The component along the launch direction is free; the component out of the launch plane must be steered out and costs about v⊥² / (2 Δv) by vector addition, a few m/s, charged at cutoff.
- Launch azimuth β comes from cos i = cos φ sin β, on the ascending or descending node. An inclination below the latitude is unreachable, so the planner then launches due east into i = |φ| and warns that the first leg pays the plane change.
- Launch window: the liftoff time slides over one rotation, and the planner picks the instant where the plane through the pad and the launch direction best aligns with the first stop's orbit plane (a 720-point scan, refined by golden section). The alignment is reported; worse than 3° and a warning says the first leg pays for the difference.

### 7.2 Ascent model

The state is planar, (r, θ, v_r, v_t, m) in the launch plane, integrated with RK4 at 0.5 s. Each step applies:

- **Thrust** from the current stage, with sea-level and vacuum Isp blended by an exponential pressure profile (scale height 7 km), throttled so that the acceleration stays under the vehicle's g-limit.
- **Drag** ½ρ v_rel² C_D A, in an exponential atmosphere (ρ₀ 1.225 kg/m³, scale height 7.16 km, off above 150 km) with a co-rotating air mass.
- **Gravity** μ/r².

Steering has four phases:

1. A vertical rise, until 8 s have passed and the climb rate has reached 50 m/s. A heavy vehicle with a liftoff thrust-to-weight near 1.15 otherwise tips over, because the turn rate g sin θ / v is large at low speed.
2. An 8 s pitch kick of κ degrees.
3. A gravity turn, with thrust along the air-relative velocity, while the first stage burns below 60 km.
4. A closed-loop law that commands the pitch so that the radial speed reaches zero exactly at the parking radius (constant radial deceleration, clamped to −10° to +60°).

Stages drop when a tank empties. The main engine cuts off when the osculating apoapsis reaches the parking radius; the vehicle then coasts on a Kepler arc to apoapsis and circularizes impulsively with the same stage's remaining propellant. κ is scanned from 0.5° to 15°, and the feasible ascent that burns the least propellant is kept. A vehicle whose liftoff thrust-to-weight is at or below 1.02 is rejected up front, with that figure.

Each launch reports:

- the liftoff, staging, cutoff and insertion times;
- the azimuth, inclination, RAAN and plane alignment;
- the gross liftoff mass and the payload (the tour ship, dry plus propellant);
- the propellant burned and left in each stage, with burn times;
- the delta-v budget: integrated thrust acceleration (ideal), gravity loss ∫g sin γ dt, drag loss ∫D/m dt, steering loss ∫a_T (1 − cos α) dt, circularization, the help from Earth's rotation and the plane correction;
- max-Q, maximum acceleration and downrange distance;
- samples every 2 s during powered flight and 100 along the coast, and the burn intervals for the continuous flare.

Check figures for the illustrative Falcon 9-class vehicle with a 15 t payload to 200 km from 28.5° N: 8.8 km/s delivered, losses 1.3 km/s (gravity 0.8, drag 0.02, steering 0.5), max-Q 35 kPa, cutoff at about 400 s, and the second stage keeps about 9 t. Public figures for the real vehicle are 9.0 to 9.4 km/s with 1.5 to 1.7 km/s of losses. The model flies a lofted closed-loop profile with no max-Q throttle-down, which is why its losses come out a little lower.

Not modelled: winds, a tabulated atmosphere, fairing jettison, boost-back or landing reserves, range constraints, yaw steering as a separate channel, finite circularization.

### 7.3 In the app

The start's `kind: 'launch'` holds a site (nine pad presets, or custom coordinates), a vehicle and the parking altitude. The vehicle presets are a Falcon 9-class launcher, a small launcher and a heavy three-stage; each stage's dry mass, propellant, vacuum Isp and thrust can be edited, along with the drag area and the g-limit. The share link carries all of it. The plan's `launch` report renders as a table under the totals. The ascent draws ahead of the first leg with liftoff, staging, cutoff and circularization markers, the pad is a labelled dot on the spinning globe, and "Whole mission" and "Fit timeline" start at liftoff.

## 8. Where the computation runs

All transfer mathematics runs in Python on a Vercel function, with `lamberthub`. Vercel accepts a FastAPI app in `api/index.py` with `requirements.txt` and `.python-version` in the same deployment as the static frontend, allows Python bundles up to 500 MB uncompressed, and gives functions up to 300 s on the Hobby plan.

Measured locally, Python 3.12 on Linux:

| Item | `lamberthub` | numpy-only Izzo solver |
|---|---|---|
| Deployable bundle, FastAPI included | 364 MB (`llvmlite` 172, `scipy` 110, `numpy` 57, `numba` 17) | 66 MB |
| Cold process to first solve | 2.7 s (0.96 s numba import, 2.6 s first-call JIT) | 0.26 s |
| Warm solve | 21 µs | about 40 µs |
| Agreement on Curtis Example 5.2 and 299 random legs | reference | worst difference 2.8 × 10⁻¹⁴ km/s |

`lamberthub` is used, and its cold start is accepted: the request that pays it is the Plan button, once per idle period, and the `/api/health` call the page makes on load hides most of it. The numpy solver lives in the test suite as the independent check, and would replace `lamberthub` if the cold start ever mattered.

What this costs: planning needs the network, though playback and scrubbing stay in the browser; a cold start of a few seconds after an idle period; two toolchains in one repository and in CI. `pykep` is not an option on Vercel, because it ships no Linux wheels on PyPI.

## 9. Tests

`api/tests/test_mission.py`:

- Hohmann is recovered when the phase is right.
- In a two-stop tour, every leg is propagated from its departure burn and meets its target within 1 m, and within 1 mm/s after braking.
- A three-burn tour is exact and labelled.
- Position is continuous across every arc, burn and ride boundary, and velocity jumps by exactly each burn's $\Delta\mathbf v$.
- Propellant accounting and warnings are right.
- The endpoint round-trips the schema and keeps the response small.

`api/tests/test_lambert.py` covers Curtis Example 5.2, agreement between solvers on random legs, and multi-revolution branches that reach the target.

`api/tests/test_launch.py` covers:

- GMST against the browser's anchor;
- the pad's rotation speed and azimuth, and a window that puts the pad in the target's plane;
- a Falcon 9-class ascent to 200 km with realistic losses;
- every vehicle preset reaching orbit, and a vehicle that cannot lift off saying so;
- a tour that departs from the ascent's insertion state.

In the browser, Vitest checks the Hermite interpolation against the samples, the split between the flown and remaining path, and the share-link schema.
