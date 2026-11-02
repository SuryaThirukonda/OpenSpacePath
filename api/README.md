# Orbit Lab planner (Python)

The planner behind the app's Mission and Routing tabs: Lambert rendezvous transfers to moving targets, multi-burn strategies, ship arithmetic, and the transfer black box of the Asteroid Routing Problem. It runs as one Vercel Python function in the same project as the static frontend, and locally under uvicorn.

## Endpoints

| Route | Purpose |
|---|---|
| `GET /api/health` | Version and a warm-up solve (the page calls it on load so the first plan does not pay the numba JIT). |
| `POST /api/lambert` | One Lambert solve: `{mu, r1, r2, tof, M?, prograde?, lowPath?, solver?}` → `{v1, v2}`. |
| `GET /api/lambert/solvers` | The `lamberthub` solvers on offer, with the default, whether each is robust and a note on its accuracy. |
| `POST /api/plan` | A whole tour: scenario body, epoch and satellites plus the mission (ship, start orbit, ordered stops with their dwell times). Returns every leg with burns, dense samples of each coast and ride, warnings and totals. `mission.solver` picks the Lambert solver (default `izzo2015`) and `mission.transfer` two or three burns (default `threeburn`). Schemas are in `models.py` and mirrored in `app/src/mission/types.ts`. |
| `GET /api/arp/instance` | Instance `n_seed` of the routing papers: `?n=10&seed=42` → the instance (Earth and n GTOC11 asteroids with their elements at the mission start), ready for the other `arp` routes. |
| `POST /api/arp/transfer` | The routing black box B(a, a', eta): `{instance, origin, target, eta, solver?, relaxed?, tauF?}` → wait, transfer time, cost and delta-v. |
| `POST /api/arp/evaluate` | The cost f of a visiting order: `{instance, order, solver?, times?}` → the legs and totals. |
| `POST /api/arp/plan` | The same, plus the route as a drawable plan (waits as rides, transfers as sampled arcs). |
| `POST /api/arp/path` | A path written by hand: `{epoch, earth, departure, entries: [{asteroid, arrival, delay}], solver?, transfer?}`; each entry carries the asteroid's elements, the arrival day and the stay, and the path is flown exactly as written. |

Units: km, km/s, s, kg, N, rad. Times are simulated seconds since the scenario epoch, the same clock as the app's timeline.

## How a leg is planned

`legs.py` scans the time of flight and plans each leg in the mission's transfer mode. `lambert2` solves Lambert with the chosen `lamberthub` solver to the target's position at arrival and returns the departure and braking burns. `threeburn` (the default) is the three-burn rendezvous of the derivation sheet in `threeburn.py`: burn 1 in the departure plane (tangential or radial), burn 2 at the node line scaling and rotating the velocity in one impulse, burn 3 matching the target; the arrival time is scanned with a quick search, refined by golden section and solved fully once. `research/07_three_burn_transfer.md` maps the sheet to the code. `mission.py` chains legs, rides the target during dwells, and samples everything for the browser. Fidelity: impulsive burns, two-body coasts for the ship, targets on their own propagators (two-body or SGP4).

## Lambert solvers

`lambert.py` wraps every solver in `lamberthub` 1.0.0 behind one function; `izzo2015` is the default and `use_solver` selects another for the length of a request. `izzo2015` and `gooding1990` are exact and handle multiple revolutions. The other five are direct-transfer only and less reliable (measured: Avanzini agrees to 1e-6 km/s, Arora is occasionally off by 0.01 km/s, Vallado has no answer for fast hyperbolic transfers, Battin is off by about 0.07 km/s, Gauss fails on most transfers between different orbits), so their answers are propagated and rejected when the arc misses the target by more than 5% of the distance.

## Asteroid routing

`arp.py` implements the problem of López-Ibáñez, Chicano and Gil-Merino (2022) and Rudich et al. (2024): bodies on heliocentric Kepler orbits, body 0 Earth and 1..n the asteroids; a transfer waits tau in [0, 730] days and flies t in [1, 730] days, chosen by SLSQP from (0, 30) on the two-burn cost, and costs delta-v plus 2 km/s per 30 days of tau + t. In `threeburn` mode the chosen times are flown with the three-burn rendezvous and its delta-v is charged, with the two-burn figure reported beside it. The relaxed variant does not charge the wait and is always the two-burn bound. The service never runs a visitor's algorithm: that happens in the browser, which asks these endpoints for transfers. `research/06_routing_algorithm_format.md` specifies the algorithm format.

Speed. The inner optimizer's chosen times and every three-burn solution are memoised per process (`arp.TIMES`, `arp.THREE`, keyed by the instance's content and the transfer's arguments), so a transfer asked twice costs once while the function stays warm; an evaluation finds its legs' times first, leg by leg, then flies the three-burn transfers side by side in a small thread pool. A 10-leg three-burn evaluation takes about 2 s cold and milliseconds when repeated.

`catalogue.py` holds the papers' instance generator. `data/gtoc11.npz` (3.8 MB) is the GTOC11 asteroid catalogue, 83,453 orbits moved to the papers' mission start (2121-01-01, MJD 95739), taken from the first paper's reproducibility package (López-Ibáñez, Chicano, Gil-Merino 2022, Zenodo record 6034335, licence CC BY 4.0); `research/scripts/gtoc11_catalogue.py` built it from the package's `ast_orbits.pkl.gz` without executing any of the package's code. Instance `n_seed` draws the ids with `numpy.random.default_rng(seed).integers(1, 83454, size=n)` as the package does (with replacement), Earth is their Table 1 orbit and the constants their Table 2 values; the inner optimizer starts from their code's (1, 30) with tolerance 1e-4. `tests/test_arp_paper.py` reproduces the package's instance 10_42 results (greedy route and cost 391.308, random-search rows) to within 1e-4; SLSQP stops at slightly different times on different scipy builds.

## Launching from the ground

A tour can start on a launch pad (`start.kind = "launch"`). `launch.py` finds the launch window and azimuth that put the pad in the first stop's orbit plane, integrates a staged ascent with drag, gravity and steering losses and a g-limit, cuts off when the apoapsis reaches the parking altitude, coasts and circularizes, and hands the parking state to the tour. The `launch` field of the plan reports the times, masses, the delta-v budget with its losses, max-Q and per-stage propellant. `research/05_mission_path_plan.md` §13 has the model and its limits.

## Local development

```bash
uv venv --python 3.12 api/.venv
uv pip install -r requirements.txt -r api/requirements-dev.txt
npm --prefix app run dev:api      # uvicorn on 8000 with reload
npm --prefix app run dev          # Vite on 5173, proxies /api to 8000
```

System Python 3.14 cannot install `numba`, which `lamberthub` needs, hence the 3.12 environment.

## Tests

```bash
api/.venv/bin/pytest api/tests -q
```

Anchors: Curtis Examples 4.7 and 5.2; 500 random legs against lamberthub's Gooding and Vallado solvers and an independent numpy Izzo port; every planned leg propagated to its target within 1 m and 1 mm/s; Hohmann recovered when the phase is right; bi-elliptic beats Hohmann at a radius ratio of 15 and not at 8; phasing fixes a quarter-turn phase error for under 1 km/s; GMST matches the browser's anchor; a Falcon 9-class ascent reaches a 200 km circular orbit with realistic losses and the first leg departs from its insertion state; the routing black box keeps its bounds, cost definition and determinism, and the browser runner's Python (extracted from `app/public/arp-worker.js`) runs every example algorithm and reports each format violation; the three-burn solver recovers Hohmann exactly, beats the forced Lambert arc on a plane change, and every coast it returns propagates onto the next burn. CI runs the suite on Python 3.12.

## Deployment

`.python-version` (3.12) and `requirements.txt` at the repository root; `vercel.json` rewrites `/api/*` to `api/index.py` and allows 300 s. A `best` plan takes about 15 s per stop on the function's CPU. Preview a change without touching production with `npx vercel deploy`, then check it with `npx vercel curl /api/health --deployment <url>`.
