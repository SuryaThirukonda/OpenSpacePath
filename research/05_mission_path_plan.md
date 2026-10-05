# Mission path visualization with burns: implementation plan

**Document** OSP-PLAN-002 · **Date** 2026-09-22, revised the same day for Python compute · **Status** implemented 2026-09-22/23 through step 5, launch-from-the-ground added 2026-09-28 (§13; see `api/README.md`); this document is the design record · **Builds on** `04_system_design.md` §5, §7.14, §7.15, §7.17, amended by §12 below

## 1. What is being built

A spaceship that visits a user-chosen sequence of satellites around the current central body. For each leg the planner solves a transfer to where the target *will be* at arrival, not where it is now, matches the target's velocity on arrival, waits there for a dwell time, and departs for the next target. The scene draws the whole tour as one continuous line, animates the ship along it with a firing effect at every burn, keeps the camera on the ship while it moves, and, whether playing or paused, shows the part of the path already flown and the part still to come.

Two transfer families are in scope, matching the professor's remark:

- **Two-burn Lambert rendezvous**, the classic solution: one burn to leave, one to arrive.
- **Three- and four-burn transfers**, where one or two intermediate burns buy a cheaper or better-timed route: phasing loops, bi-elliptic transfers, a plane change done where it is cheap, and a general waypoint chain that an optimizer tunes.

The spaceship itself is a parameter block (mass, thrust, specific impulse, propellant, a speed cap) that feeds burn durations and feasibility checks. Speed is not a constraint yet, but the framework carries it.

## 2. Definitions the rest of the plan relies on

| Term | Meaning here |
|---|---|
| Target | A satellite in the scenario, Keplerian or TLE, propagated with its own model (two-body or SGP4). Later, planets in the heliocentric scene. |
| Intercept | Ship position equals target position at arrival time. |
| Rendezvous | Intercept plus ship velocity equals target velocity. This is what the tour needs, since the ship then rides with the satellite during the dwell. |
| Lead, or "overshoot" | Aiming at the target's position at the arrival time rather than at the current one. Aiming at the current position arrives where the satellite was; the satellite has moved on by $v_t \cdot \mathrm{TOF}$, tens of thousands of km for a LEO target over one transfer. |
| Braking | The arrival burn. Without it the ship reaches the target's position at the wrong velocity and flies past. Its size is $\lVert \mathbf v_{target}(t_a) - \mathbf v_2 \rVert$. |
| Leg | Departure event, one or more coast arcs joined by burns, arrival event, then a dwell. |
| Dwell | Time spent attached to the target after rendezvous, riding its orbit, before the next departure. |
| Burn | An impulsive velocity change $\Delta\mathbf v$ at an instant, with a finite duration derived from the ship model for display and feasibility. |

Fidelity rule carried over from the design: the ship coasts under two-body gravity only. Targets keep their own propagators. Because each leg's endpoint is taken from the target's propagator at the chosen arrival time, the ship arrives exactly where the target's model puts it; no mismatch is introduced by mixing models.

## 3. User flow

1. Open the new **Mission** panel. Choose targets from the existing satellite list and order them (drag or up/down buttons). Set a start time (default: current timeline instant) and a dwell time per stop (default 30 minutes).
2. Pick a transfer strategy per leg or for the whole tour: *2-burn*, *3-burn phasing*, *3-burn bi-elliptic*, *4-burn waypoint*, or *best of all* (planner tries each and keeps the lowest Δv that meets the time limits).
3. Press **Plan**. The browser sends the mission to the Python backend, which returns the plan and fills a leg table: departure, TOF, arrival, burns with Δv and duration, propellant used, warnings.
4. The scene draws the tour. Press play on the existing timeline; the ship flies, burns flare, the camera follows. Pause anywhere to inspect: flown path solid, remaining path dimmed, burn markers labelled.
5. Edit anything (order, dwell, ship thrust, strategy) and re-plan. The mission is part of the scenario, so the URL captures it.

## 4. Data model

Added to `types.ts`, all serializable so the URL codec can carry them. Units stay km, s, rad, kg, N.

```ts
interface Ship {
  name: string
  dryMass: number          // kg
  propellantMass: number   // kg, at mission start
  isp: number              // s
  maxThrust: number        // N
  maxSpeed?: number        // km/s relative to the central body; undefined = no cap
  minBurnSpacing: number   // s, guard against two burns in the same instant
}

type Strategy = 'lambert2' | 'phasing3' | 'bielliptic3' | 'waypoint4' | 'best'

interface Stop {
  satelliteId: string
  dwellSeconds: number
  strategy: Strategy
  tofBounds?: [number, number]   // s, optional user limits for the leg into this stop
}

interface Mission {
  ship: Ship
  startT: number        // simulated seconds since the scenario epoch
  stops: Stop[]
  // the planner's output, cached so the scene never re-solves per frame
  plan?: MissionPlan
}

interface Burn { t: number; r: Vec3; dv: Vec3; magnitude: number; duration: number; propellant: number; label: string }
interface Arc  { t0: number; t1: number; r0: Vec3; v0: Vec3 }            // two-body coast from (r0, v0)
interface Ride { t0: number; t1: number; satelliteId: string }           // attached to a target during dwell
interface Leg  { toStop: number; strategy: Strategy; arcs: Arc[]; burns: Burn[]; ride: Ride; totalDv: number; tof: number; warnings: string[] }
interface MissionPlan { legs: Leg[]; totalDv: number; totalTime: number; propellantLeft: number; feasible: boolean }
```

The backend also returns dense samples of time, position and velocity for every arc and ride. The ship's state at any simulated time $t$ is then a pure function of the plan: find the sample interval containing $t$ and interpolate it (cubic Hermite, using the velocities), or, in a ride, return the target's own state. This keeps the scene stateless, keeps every propagator on the server, and lets scrubbing, pausing and rate changes work with no extra logic.

## 5. Algorithms

### 5.1 Lambert core, in Python

All transfer mathematics runs in Python on the server, not in the browser. The solver is `lamberthub` (the package the professor pointed at; Track 4 and this document's prototype both confirm it works), called as `lamberthub.izzo2015(mu, r1, r2, tof, M=0, prograde=True, low_path=True)`, which returns $(\mathbf v_1, \mathbf v_2)$. Its `gooding1990` and `vallado2013` solvers serve as in-suite cross-checks, and the numpy Izzo implementation already in `scripts/T7_design_math_check.py` is a second, independent check: through a FastAPI endpoint it matched `lamberthub` to $3 \times 10^{-14}$ km/s over 299 random legs on 2026-09-22.

The planner uses $M = 0$ and $M = 1$ on both branches for legs longer than one target period, since a multi-revolution arc is often the cheap answer when the timing is awkward. Why the computation lives in Python rather than a TypeScript port, and what that costs, is in §12.

### 5.2 A single two-burn leg with a moving target

Given the ship state $(\mathbf r_s, \mathbf v_s)$ at departure time $t_d$ and a target with state function $\mathbf x_t(t)$:

1. For a candidate time of flight $\tau$: $t_a = t_d + \tau$, $\mathbf r_2 = \mathbf r_t(t_a)$, solve Lambert for $(\mathbf v_1, \mathbf v_2)$ from $\mathbf r_s$ to $\mathbf r_2$ in $\tau$.
2. Burns: $\Delta\mathbf v_1 = \mathbf v_1 - \mathbf v_s$ (depart), $\Delta\mathbf v_2 = \mathbf v_t(t_a) - \mathbf v_2$ (brake and match).
3. Cost: $\lVert\Delta\mathbf v_1\rVert + \lVert\Delta\mathbf v_2\rVert$.

The lead is handled by step 1: the endpoint is the target's *future* position. The braking burn in step 2 is what stops the fly-past.

**Choosing $\tau$.** The cost is a rough function of $\tau$ with several minima, so scan first, then refine: sample $\tau$ on a grid from 0.05 to 3 target periods (240 points, one Lambert solve each, well under a millisecond apiece), keep the three best, and polish each with golden-section search. Do it for $M = 0$ and, when the grid extends past one period, $M = 1$ on both branches. Respect the leg's `tofBounds` if set.

**Departure time.** The ship departs the moment the dwell ends. An optional *departure window* (0 to one target period, default 0) lets the planner also slide $t_d$ later when waiting a little makes the geometry cheaper; this is a second scan dimension, coarse (12 points), only enabled by the user because it lengthens the tour.

### 5.3 Three and four burns

All multi-burn strategies are expressed as a **chain of Lambert legs through waypoints**. A waypoint is a position and a time; consecutive Lambert solutions meet there, and the velocity discontinuity is the intermediate burn. A chain with one waypoint is three burns; with two, four. Each strategy is a rule for where the waypoints start, followed by the same optimizer.

| Strategy | Waypoints | When it wins | Seed |
|---|---|---|---|
| **phasing3** | One, on the target's orbit ahead of or behind the target | Timing is the problem: the target is at the wrong phase, and a direct Lambert arc would be steep and expensive. A loop on a slightly different period lets the phase catch up. | Depart onto a coast orbit with period $T_t \pm \Delta T$, rejoin the target's orbit after $n$ loops; $\Delta T$ from the phase error $\Delta\theta$: $n\,\Delta T = \Delta\theta / n_t$. |
| **bielliptic3** | One, at a high apoapsis $r_b$ | Radius ratio above about 11.94 between the ship's orbit and the target's, when going far out and back is cheaper than the direct Hohmann-like arc. | Classic bi-elliptic $\Delta v$ from vis-viva at $r_1$, $r_b$, $r_2$ (design §7.14); $r_b$ scanned from $2 r_2$ to $10 r_2$. |
| **waypoint4** | Two, free | A plane change is needed: do the inclination change at the node or at high altitude where speed is low, and keep the radius changes separate. Also the general case when neither of the above fits. | Waypoint 1 at the line of nodes between the two orbit planes, at the higher of the two radii; waypoint 2 on the target's orbit one quarter period before arrival. |

**Optimizer.** Each waypoint contributes four parameters: radius, in-plane angle, out-of-plane angle, and time. Nelder–Mead from `scipy.optimize.minimize` on those 4 or 8 parameters, objective is total Δv plus a penalty for violating time bounds, ship speed cap, or a periapsis below the surface (checked by sampling each arc). Start from the strategy's seed and from two random perturbations of it; keep the best. It is derivative-free and converges in a few hundred evaluations; each evaluation is two or three `lamberthub` solves at about 20 µs warm, so a leg plans in well under a second. The design deliberately avoids a heavy optimization library here; the eventual multi-objective route search (design §7.17) sits on top of these leg costs, it does not replace them.

**Known-answer anchors** for tests: a coplanar circular 300 km to GEO leg planned with `lambert2` over a free TOF must converge to the Hohmann value 3.8926 km/s in 5.275 h (design §8). `bielliptic3` from 300 km to a radius ratio of 15 must beat Hohmann, and must not beat it at ratio 8. `waypoint4` on a 28.5° plane change must find a cost below the single-burn plane change $2v\sin(\Delta i/2)$ at LEO speed (3.80 km/s at 7.73 km/s, from `scripts/T8_formula_catalog_checks_output.txt`).

### 5.4 The tour

Legs are planned in order. The ship's state at the start of leg $k$ is the target's state at the end of the dwell at stop $k-1$, since the ship rides the target. The first leg starts from the ship's initial state, which by default is a parking orbit the user picks from the presets (an ISS-class orbit at Earth), or the state of a chosen satellite.

Ordering is the user's in this version. The route search that chooses order and timing on Pareto grounds is the design's Phase C2 and reuses the per-leg costs computed here as its edge weights.

### 5.5 Ship model and burn feasibility

From the ship block, per burn with mass $m_0$ before it, exhaust velocity $v_e = g_0 I_{sp}$:

$$
m_1 = m_0\,e^{-\Delta v / v_e}, \qquad
m_{prop} = m_0 - m_1, \qquad
t_{burn} = \frac{m_{prop}\,v_e}{F_{max}}, \qquad
\Delta v_{capacity} = v_e \ln\frac{m_{dry} + m_{prop,left}}{m_{dry}}
$$

Checks the planner reports as warnings rather than failures, so the visualization still draws the tour:

- Propellant exhausted at burn $k$: mark the leg and every later leg infeasible.
- Burn duration longer than 5% of the arc it starts (impulsive assumption strained): warn, later replaced by a finite-burn model.
- Speed cap: any sampled coast speed above `maxSpeed`: warn.
- Two burns closer than `minBurnSpacing`: warn.
- Lambert failure (transfer angle near 180°, or TOF below the minimum-energy limit): the scan skips that $\tau$; if every $\tau$ fails, the leg is infeasible.

$g_0$ = 9.80665 m/s². Check: 3.59 km/s at $I_{sp}$ = 450 s gives a mass ratio of 2.256 (`T8_formula_catalog_checks_output.txt`).

## 6. Rendering and animation

All new scene objects live under the existing inertial group so they share the frame conventions and the future floating origin.

**Ship.** A small mesh (cone plus body, a few hundred triangles, no asset download) with a DOM label, oriented along its velocity vector. Scaled with camera distance the same way satellite markers are, so it never vanishes.

**Path.** One polyline for the whole tour, sampled at a fixed step of about 1/200 of each arc's duration, with the dwell rides sampled from the target's propagator so the line follows the target's orbit during the wait. Each sample carries its simulated time. Two `Line2` objects share the sample buffer: the *flown* line draws samples with $t \le t_{now}$ in the ship's colour at full opacity, the *remaining* line draws the rest dimmed and dashed. Each frame does one binary search on the time array and updates two draw ranges; nothing is rebuilt. Leg boundaries get a colour step so the eye can count legs.

**Markers.** A burn marker at each burn position: a small diamond, labelled with $\Delta v$ in m/s and duration, with the $\Delta\mathbf v$ direction drawn as a short arrow. An arrival marker at each rendezvous point on the target's orbit, even when the satellite has not reached it yet, as the user asked. A dwell badge showing the wait time. Markers already passed are dimmed.

**Burn animation.** When simulated time crosses a burn instant, the ship shows an exhaust flare for a fixed *wall-clock* duration (0.8 s, independent of playback rate, so a 20 s burn is visible at one day per second) pointing along $-\Delta\mathbf v$: an additive sprite plus a short cone of glow, with a jitter on the sprite scale. At playback rates at or below 60×, the flare instead lasts the burn's real duration in simulated time, so slow playback shows the burn honestly. An optional *slow at burns* toggle drops the rate to 1× for the burn and restores it afterwards; off by default.

**Camera follow.** A new camera mode, *follow ship*, on by default while the ship is between stops and off during dwell (the ship is then on the satellite, and body framing is more useful) unless the user pins it. Each frame the controls' target is moved to the ship and the camera is translated by the same delta, so orbit, zoom and pan still work around the ship. A leg's full path stays in view because the follow distance is set from the leg's bounding sphere when the leg begins, and the user can zoom from there.

**Pause.** Nothing special is needed: the ship position, the flown/remaining split, and the markers are all functions of $t_{now}$. Pausing simply stops $t$ from advancing. The scrub slider moves the ship along the tour.

**Timeline.** The span selector gets a *whole mission* option, and the mission's burns and arrivals appear as ticks on the scrub bar so a user can jump to them.

## 7. UI

**Mission panel** (a new collapsible panel, left side below the satellite list on desktop, a sheet on narrow screens following the existing layout rules):

- Start orbit: preset or existing satellite.
- Stops: ordered list with target, dwell, strategy, optional TOF bounds; add, remove, reorder.
- Ship: name, dry mass, propellant, Isp, max thrust, speed cap, burn spacing, with three presets (a Starship-class chemical stage, a small kick stage, a "generous" test ship with 20 km/s capacity for teaching).
- Plan, and a results table: leg, strategy chosen, departure, TOF, arrival, burns (count, total Δv), propellant used, warnings. Totals at the bottom.
- View toggles: follow ship, show remaining path, show burn labels, slow at burns.

The satellite list shows a small tour index on each satellite that is a stop.

## 8. Architecture

The design's module rule still holds on the client: nothing under `core/`, `propagation/` or `data/` imports from `scene/`, `ui/` or `store/`. The new part is a Python backend in the same repository and the same Vercel project.

| Location | New files | Responsibility |
|---|---|---|
| `api/` (Python, FastAPI) | `index.py` (app), `lambert.py` (`lamberthub` wrappers), `legs.py` (two-burn leg, TOF scan), `strategies.py` (phasing, bi-elliptic, waypoint chains), `optimize.py` (Nelder–Mead via `scipy.optimize.minimize`, which `lamberthub` already depends on), `ship.py` (rocket equation, feasibility), `mission.py` (tour assembly, dense sampling), `models.py` (pydantic schemas mirroring §4) | Everything in §5 |
| `api/requirements.txt`, `.python-version` (3.12) | | Vercel's Python runtime reads these |
| `vercel.json` | a `functions` entry for `api/index.py` with `maxDuration` | Same file as today; the frontend build settings stay |
| `app/src/store/` | mission slice | Mission inputs, the returned plan, follow-camera flag, selected leg |
| `app/src/url/` | schema version 2 | `mission` inputs in the scenario; the plan is re-requested on load, not encoded |
| `app/src/optimize/` | `missionState.ts` only | State at time $t$ by cubic Hermite interpolation of the dense samples, using the returned velocities, so the ship moves smoothly between samples without any propagator on the client |
| `app/src/scene/` | `ShipMarker.ts`, `MissionPath.ts`, `BurnEffect.ts`, follow mode in `SceneManager.ts` | Drawing and animation |
| `app/src/ui/` | `MissionPanel.tsx`, `LegTable.tsx`, `ShipForm.tsx` | Panels, with a loading state while the plan request is in flight |
| `app/src/data/` | `ships.ts` | Ship presets |
| `api/tests/` (pytest) and `app/tests/` (Vitest) | | See §9 |

**Endpoints.**

- `POST /api/plan`: body is the `Mission` inputs plus the scenario's body and satellites (elements or TLE lines, so the server can propagate targets with the same models as the client, using `sgp4` for TLE targets). Response is the `MissionPlan` from §4 with, for every arc and ride, dense samples of time, position and velocity (about 200 per arc). A five-stop tour is roughly 300 KB of JSON, well under the 4.5 MB payload limit.
- `POST /api/lambert`: one solve, for tests and a hidden debug panel.
- `GET /api/health`: version and a warm-up call so the first real request does not pay the JIT cost twice.

**Client responsibilities shrink to** rendering, time scrubbing, camera and forms. It never solves Lambert or propagates the ship; scrubbing interpolates the returned samples, and the satellites keep their existing client-side propagators for their own markers.

**Failure behaviour.** If the request fails or times out, the panel shows the error and the last successful plan stays drawn. The plan is cached in the store, so playing, pausing and scrubbing never call the server.

## 9. Testing plan

Python tests run with pytest in `api/tests/` against the real `lamberthub`; they also run in GitHub Actions on Python 3.12, the version Vercel uses.

- **Lambert**: Curtis Example 5.2; 500 random legs comparing `izzo2015`, `gooding1990`, `vallado2013` and the T7 numpy solver to 1e-9 km/s; multi-revolution branches.
- **Rendezvous correctness**: for every planned leg in a sample tour, propagate the post-departure state by the TOF (universal-variable propagation from `scripts/T7_extra_checks.py`) and compare with the target's state at arrival: position within 1 m, velocity after the braking burn within 1 mm/s. This is the direct test of the lead and braking logic.
- **Strategies**: the anchors in §5.3.
- **Ship arithmetic**: rocket equation against the checked mass ratio; propellant accounting sums to the initial load.
- **Plan continuity**: across every arc, burn and ride boundary, position jump under 1 mm and velocity jump equal to the burn's $\Delta\mathbf v$.
- **Endpoint**: FastAPI's test client, schema round trips, and a response-size check.

Vitest keeps the client side: Hermite interpolation against the dense samples (error under 1 m between samples on an ISS-class arc), the flown/remaining split, and the URL schema. A Playwright screenshot of a two-stop tour at three timeline positions is the golden image.

Oracle scripts stay in `research/scripts/T9_*.py` with saved outputs, as with T7 and T8.

## 10. Implementation order

Each step ends with something demoable, at the project's 5 to 6 hours per week.

1. **Backend scaffold**: `api/` with FastAPI, `lamberthub` and the `/api/lambert` and `/api/health` endpoints, pytest against `lamberthub`, deployed as a preview from a branch to confirm the bundle builds and to measure the real cold start. About half a week; the local prototype from 2026-09-22 is most of it.
2. **Mission model, two-burn planner, dense sampling, `/api/plan`, client store and URL schema.** About one week. Demo: plan a two-stop tour from the panel and read the leg table.
3. **Rendering and animation**: ship, path with flown/remaining split, Hermite state function, burn markers, burn flare, camera follow, timeline ticks. One to two weeks. Demo: the tour flies. This is the Monday-meeting demo.
4. **Three- and four-burn strategies with `scipy.optimize` Nelder–Mead, and the *best* selector.** One to two weeks. Demo: the same tour costs less with a phasing loop, side by side.
5. **Ship model UI, presets, feasibility warnings, mission panel polish.** About one week.

## 11. Decisions made here, and what stays open

Decided:

- Impulsive burns with a display duration, not finite-burn integration. Finite burns are a later fidelity level (design §2.2 fidelity ladder, level 3).
- Ship coasts under two-body gravity; targets keep their own propagators; endpoints come from the target's model.
- User orders the stops; the Pareto route search comes later and reuses these costs.
- Multi-burn strategies are waypoint chains with a small derivative-free optimizer, not a trajectory-optimization library.
- Burn animation runs on wall-clock time so it is visible at any playback rate.

Open, to raise with the professor:

- Which three- and four-burn families he has in mind. The plan implements phasing, bi-elliptic and node plane-change chains because they are the standard ones; if he means a specific paper's multi-impulse rendezvous scheme, the waypoint chain is general enough to seed it.
- Whether the tour should optimize departure windows by default, which trades tour duration for Δv.
- Whether "max speed" should be a cap on velocity relative to the central body or relative to the target at rendezvous. The framework stores one number and the check is a single line either way.

Out of scope for this plan: low-thrust arcs, gravity assists, atmospheric drag on the ship, and the interplanetary version of the tour, which is Phase B and C in the system design and will reuse every module listed here with the Sun as the central body.

## 12. Compute placement: Python on Vercel

The system design (04, §1 and §5.13) chose a static site with no backend and a TypeScript port of Izzo's solver. This plan moves the transfer mathematics to Python, on the professor's pointer to `lamberthub` and the wish to run the calculations in Python itself. The question was whether that forces a separate host. It does not: Vercel runs Python functions in the same project, and the checks below were made on 2026-09-22.

**What Vercel provides** (from `vercel.com/docs/functions/limitations`, updated 2026-08-24): a FastAPI app in `api/index.py` with `requirements.txt` and a `.python-version` file is a supported layout in the same deployment as the static frontend. Python function bundles may be up to **500 MB** uncompressed (250 MB for other runtimes; a 5 GB large-function beta exists). Hobby plan: **300 s** maximum duration, 2 GB memory, 4.5 MB request and response payloads, one region (`iad1`). Fluid compute is on by default for new projects, so warm instances serve consecutive requests.

**Measured locally, Python 3.12 on Linux:**

| Item | `lamberthub` backend | numpy-only backend |
|---|---|---|
| Deployable bundle, FastAPI included | 364 MB (`llvmlite` 172, `scipy` 110, `numpy` 57, `numba` 17) | 66 MB |
| Fits the Python limit | Yes, under 500 MB | Yes |
| Cold process to first solve | 2.7 s (0.96 s numba import, 2.6 s first-call JIT) | 0.26 s |
| Warm solve | 21 µs | about 40 µs |
| HTTP request through FastAPI, in process | | 1.85 ms |
| Agreement on Curtis 5.2 and 299 random legs | reference | worst difference 2.8 × 10⁻¹⁴ km/s |

**Decision.** Use `lamberthub` in the backend, as asked, and accept the cold start: the request that pays it is the *Plan* button, once per idle period, behind a spinner. The `/api/health` warm-up call at page load hides most of it. The numpy solver from the T7 script stays in the test suite as the independent check and is the drop-in replacement if the cold start ever matters, since it is already verified against `lamberthub` to machine precision.

**What migration makes easier.** One language for the research scripts and the runtime, so the T7 and T8 checks become tests rather than references. `scipy.optimize` for the multi-burn optimizer instead of a hand-written Nelder–Mead. `sgp4` and `skyfield` on the server for targets and, later, planet ephemerides from DE kernels, which the browser could not read. The professor's group works in Python.

**What it costs.** The app is no longer static: planning needs the network, though playback and scrubbing stay client-side on the returned samples. A cold start of a few seconds after idle. Two toolchains in one repository and in CI. Hobby-plan limits on invocations and compute, ample for a research demo, to be watched if the site is shared widely. `pykep` is not an option on Vercel: it ships no Linux wheels on PyPI and depends on `heyoka`, `pygmo` and `spiceypy`.

**Not migrated.** Rendering, the satellites' own propagation for their markers, URL state, and everything else the browser does today stay in TypeScript. There is no server-side rendering and no database.



## 13. Launch from a site on the ground (added 2026-09-28)

The start of a tour can be a launch pad instead of a parking orbit or a satellite. `api/launch.py` carries the ascent to a circular parking orbit; the tour's first leg then departs from the insertion state at the insertion time, through the same Lambert machinery as every other leg.

### 13.1 Geometry

- The pad is on the WGS-84 ellipsoid (geodetic latitude, longitude, altitude) and is rotated into the inertial frame by Greenwich mean sidereal time (IAU 1982, UT1 taken as UTC), the same formula the browser uses to spin the globe (`satellite.gstime`), so the drawn pad marker and the computed pad coincide. Other bodies use a sphere spun at 2π t / rotationPeriod, again matching the browser.
- Earth's rotation gives the pad a velocity ω × r (about 0.409 km/s at Cape Canaveral). The component along the launch direction is free; the component out of the launch plane must be steered out and costs about v⊥² / (2 Δv) by vector addition, a few m/s, charged at cutoff.
- Launch azimuth β from cos i = cos φ sin β, ascending or descending node; an inclination below the latitude is unreachable, so the planner launches due east into i = |φ| and warns that the first leg pays the plane change.
- Launch window: slide the liftoff time over one rotation and pick the instant where the plane through the pad and the launch direction best aligns with the first stop's orbit plane (720-point scan, golden-section refinement). Alignment is reported; below cos 3° a warning says the first leg pays for the difference.

### 13.2 Ascent model

Planar state (r, θ, v_r, v_t, m) in the launch plane, RK4 at 0.5 s. Per step: thrust from the current stage with sea-level to vacuum Isp blended by an exponential pressure profile (scale height 7 km), throttled so acceleration stays under the vehicle's g-limit; drag ½ρ v_rel² C_D A with an exponential atmosphere (ρ₀ 1.225 kg/m³, scale height 7.16 km, off above 150 km) and a co-rotating air mass; gravity μ/r². Steering: a vertical rise until 8 s have passed and the climb rate has reached 50 m/s (a heavy vehicle with a liftoff thrust-to-weight near 1.15 otherwise tips over, because the turn rate g sin θ / v is large at low speed), an 8 s pitch kick of κ degrees, then a gravity turn (thrust along the air-relative velocity) while the first stage burns below 60 km, then a closed-loop law that commands the pitch so the radial speed reaches zero exactly at the parking radius (constant radial deceleration, clamped to −10°…+60°). Stages drop when a tank empties. Main engine cutoff when the osculating apoapsis reaches the parking radius; Kepler coast to apoapsis; impulsive circularization from the same stage's remaining propellant. κ is scanned (0.5°–15°) and the feasible ascent that burns the least propellant is kept. A vehicle whose liftoff thrust-to-weight is at or below 1.02 is rejected up front with that figure.

Reported per launch: liftoff, staging, cutoff and insertion times; azimuth, inclination, RAAN and plane alignment; gross liftoff mass and payload (the tour ship, dry plus propellant); propellant burned and left per stage with burn times; the delta-v budget as integrated thrust acceleration (ideal), gravity loss ∫g sin γ dt, drag loss ∫D/m dt, steering loss ∫a_T (1 − cos α) dt, circularization, rotation help and plane correction; max-Q, max acceleration, downrange distance; samples at 2 s during powered flight and 100 along the coast; the burn intervals for the continuous flare.

Check figures for the illustrative Falcon 9-class vehicle with a 15 t payload to 200 km from 28.5° N: 8.8 km/s delivered, losses 1.3 km/s (gravity 0.8, drag 0.02, steering 0.5), max-Q 35 kPa, cutoff at about 400 s, second stage keeps about 9 t. Public figures for the real vehicle are 9.0 to 9.4 km/s with 1.5 to 1.7 km/s of losses; the model flies a lofted closed-loop profile with no max-Q throttle-down, which is why its losses come out a little lower.

Not modelled: winds, a tabulated atmosphere, fairing jettison, boost-back or landing reserves, range constraints, yaw steering as a separate channel, finite circularization.

### 13.3 In the app

`StartOrbit` gains `kind: 'launch'` with a site (presets for nine pads, or custom coordinates), a vehicle (Falcon 9-class, a small launcher, a heavy three-stage, each stage editable: dry mass, propellant, vacuum Isp, thrust; drag area and g-limit), and the parking altitude. The URL schema (still v2) carries it. The plan's `launch` report renders as a table under the totals; the ascent draws in white ahead of the first leg with liftoff, staging, cutoff and circularization markers; the pad is a labelled dot parented to the spinning globe; the engine flare stays lit through each stage's burn interval; the follow camera tracks the ascent. "Whole mission" on the timeline and "Fit timeline" start at liftoff.
