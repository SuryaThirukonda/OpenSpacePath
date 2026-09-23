# Orbit Lab planner (Python)

The mission planner behind the app's Mission tab: Lambert rendezvous transfers to moving targets, multi-burn strategies, ship arithmetic. It runs as one Vercel Python function in the same project as the static frontend, and locally under uvicorn.

## Endpoints

| Route | Purpose |
|---|---|
| `GET /api/health` | Version and a warm-up solve (the page calls it on load so the first plan does not pay the numba JIT). |
| `POST /api/lambert` | One Lambert solve: `{mu, r1, r2, tof, M?, prograde?, lowPath?}` → `{v1, v2}`. |
| `POST /api/plan` | A whole tour: scenario body, epoch and satellites plus the mission (ship, start orbit, ordered stops with dwell and strategy). Returns every leg with burns, dense samples of each coast and ride, warnings and totals. Schemas are in `models.py` and mirrored in `app/src/mission/types.ts`. |

Units: km, km/s, s, kg, N, rad. Times are simulated seconds since the scenario epoch, the same clock as the app's timeline.

## How a leg is planned

`legs.py` scans the time of flight, solves Lambert with `lamberthub.izzo2015` to the target's position at arrival, and returns the departure and braking burns. `strategies.py` expresses three- and four-burn transfers as chains of Lambert legs through waypoints and tunes them with scipy's Nelder-Mead: phasing loops, bi-elliptic transfers, and a node plane change. `best` keeps the cheapest. `mission.py` chains legs, rides the target during dwells, and samples everything for the browser. Fidelity: impulsive burns, two-body coasts for the ship, targets on their own propagators (two-body or SGP4).

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

Anchors: Curtis Examples 4.7 and 5.2; 500 random legs against lamberthub's Gooding and Vallado solvers and an independent numpy Izzo port; every planned leg propagated to its target within 1 m and 1 mm/s; Hohmann recovered when the phase is right; bi-elliptic beats Hohmann at a radius ratio of 15 and not at 8; phasing fixes a quarter-turn phase error for under 1 km/s. CI runs the suite on Python 3.12.

## Deployment

`.python-version` (3.12) and `requirements.txt` at the repository root; `vercel.json` rewrites `/api/*` to `api/index.py` and allows 300 s. A `best` plan takes about 15 s per stop on the function's CPU. Preview a change without touching production with `npx vercel deploy`, then check it with `npx vercel curl /api/health --deployment <url>`.
