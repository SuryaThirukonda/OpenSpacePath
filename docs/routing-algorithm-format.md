# A standard format for asteroid routing algorithms (ARP-ALGORITHM 1)

The format of the algorithms the Asteroids tab runs. This is its specification and the record of why it is shaped this way. The same text, shortened, is shown in the tab under "Format reference"; the code is `app/src/arp/format.ts` (the check and the examples), `app/public/arp-worker.js` (the runner) and `api/arp.py` (the transfer black box).

## 1. Purpose

Two papers frame the problem:

- López-Ibáñez, Chicano and Gil-Merino, "The Asteroid Routing Problem: A Benchmark for Expensive Black-Box Permutation Optimization" (arXiv 2203.15708). It defines the problem, a greedy nearest-neighbour heuristic, and compares random search, UMM and CEGO under a small budget of evaluations.
- Rudich, López-Ibáñez, Römer, Cappart and Rousseau, "An Exact Framework for Solving the Space-Time Dependent TSP" (arXiv 2312.01404). It solves the same problem exactly with decision diagrams and Peel-and-Bound, using a relaxed transfer as a bound.

Both describe an algorithm as something that talks to one black box, the transfer between two bodies from a given day. The format fixes that conversation, so any algorithm written to it can be run on any instance, drawn, and compared with any other, without the page knowing what kind of algorithm it is.

## 2. The problem as implemented

A spacecraft starts in Earth's orbit at the instance epoch and must visit each of n asteroids exactly once. It does not return. Bodies are numbered as in the second paper: 0 is Earth, 1 to n are the asteroids. All bodies move on fixed heliocentric Kepler orbits.

The transfer black box is

    B(a, a', eta) -> (tau, t, z)

Leaving body a no earlier than day eta, the spacecraft waits tau days in a's orbit, departs on the Lambert arc that reaches a' after t days, and matches a' with a second impulse. Its cost is

    z = |dv1| + |dv2| + w (tau + t),   w = 2 km/s per 30 days

with tau in [0, 730] days and t in [1, 730] days chosen by SLSQP started from (tau, t) = (0, 30) with at most 1000 iterations, as in the papers. Because that inner optimizer is deterministic, one visiting order always has one cost:

    f(pi) = sum of z over the transfers of pi, each starting at the day the previous one arrived.

The relaxed transfer B' of the second paper is the same with the wait not charged. It is a lower bound for pruning and never the cost of a route.

Times in the interface are days after the instance epoch. Distances are km, speeds km/s, angles radians.

## 3. The format

An algorithm is one Python file:

```python
"""ARP-ALGORITHM 1
name: A short name
author: optional
source: optional, a paper or a link
description: optional, one sentence
"""

def solve(problem, tools):
    ...
    return order
```

Rules, each checked before a run and each reported with a sentence that says what is wrong:

1. The file begins with a docstring whose first non-empty line is exactly `ARP-ALGORITHM 1`. The number is the format version.
2. The docstring has a `name:` line. Any other `key: value` line is metadata and is kept with the exported run.
3. The file defines `def solve(problem, tools):` at the top level, with exactly those two parameters.
4. `solve` returns one of:
   - `order`: a list holding every asteroid index 1..n exactly once, in visiting order. Earth is not listed.
   - `(order, times)`: the order and a list of n `(tau, t)` pairs in days, when the algorithm chooses the times itself. Each tau must lie in [0, tau_max] and each t in [1, t_max]. The route is then costed with those times and the inner optimizer is not used.
   - `None`: the best complete route passed to `tools.evaluate` is the answer.
5. Helper functions, classes and imports from the Python standard library are allowed. `numpy` and `scipy` are loaded if the file imports them.

### 3.1 `problem` (read only)

| Name | Meaning |
|---|---|
| `problem.n` | number of asteroids |
| `problem.earth`, `problem.asteroids`, `problem.bodies[k]` | bodies; each has `.index .id .name .a .e .i .raan .argp .M0` (km, rad, M0 at the epoch) |
| `problem.mu` | the Sun's gravitational parameter, km^3/s^2 |
| `problem.epoch` | the mission start, ISO 8601 UTC |
| `problem.tau_max`, `problem.t_max` | bounds on the wait and on the transfer, days |
| `problem.time_weight` | w, km/s per day |
| `problem.seed` | the run's random seed |
| `problem.transfer` | how transfers are flown in this run: `"threeburn"` or `"lambert2"` (section 7.1) |

### 3.2 `tools`

| Call | Meaning |
|---|---|
| `tools.transfer(a, b, eta) -> (tau, t, z)` | The black box B. The next transfer can start at `eta + tau + t`. The result also has the fields `.tau .t .z`. |
| `tools.relaxed_transfer(a, b, eta, tau_f=None) -> (tau, t, z)` | The relaxation B'. `tau_f` caps the free wait. |
| `tools.evaluate(order) -> Evaluation(cost, dv, time, legs, order)` | f(pi) for a complete order or a prefix. Uses one evaluation of the budget. `legs` holds a `(tau, t, z)` per transfer. |
| `tools.position(a, day) -> (x, y, z)` | heliocentric position, km |
| `tools.distance(a, b, day)` | distance between two bodies, km |
| `tools.report(order, note="")` | draw a route, complete or partial, without evaluating it |
| `tools.log(...)` | a line in the run log; `print` works too |
| `tools.random` | a `random.Random` seeded with the run's seed |
| `tools.budget`, `tools.evaluations`, `tools.transfers` | the evaluation budget and the counts so far |

### 3.3 Run rules

- The budget counts calls of `tools.evaluate`, the unit both papers use for an expensive black box. Calling it once the budget is used ends the run and the best complete route so far is the answer. An algorithm can also stop itself by comparing `tools.evaluations` with `tools.budget`.
- `tools.transfer` is not budgeted, so constructive algorithms and exact methods can be written, but repeated identical calls are answered from a cache and a run is stopped after 40 x budget x n distinct transfers (at least 2000).
- A run is repeatable: the instance, the Lambert solver, the budget and the seed determine it, provided the algorithm takes its randomness from `tools.random`.
- A body that does not exist, a transfer that ends at Earth, an order with a repeat, a wrong-length answer and a time out of bounds each stop the run with a message. An exception inside the algorithm is shown with the line numbers of the algorithm's own file.

## 4. What the page does with a run

| The algorithm does | The page shows |
|---|---|
| `tools.evaluate(order)` | a point in the convergence chart (cost of each route, and the best so far as a step line) and a row in the list of evaluated routes; a new best complete route is drawn in the 3D scene |
| `tools.report(order, note)` | the route drawn in the scene with the note, for algorithms that build a route step by step |
| `tools.transfer(...)` | the count of transfers asked |
| `tools.log(...)`, `print` | the run log |
| `return` | the final route flown from the start on the timeline: waits as rides with the body, transfers as coloured arcs, a marker at each impulse; cost, delta-v and time, and a table of the legs |

Clicking a row of the list or a point of the chart draws that route. "Export run" saves a JSON record (`format: "arp-run", version: 1`) holding the instance, the solver, the algorithm's source and header, the budget, the seed, every evaluation and the final route, so a run can be archived and compared outside the page.

## 5. Where it runs, and why

The algorithm runs in the visitor's own browser: Python compiled to WebAssembly (Pyodide 0.29.5, loaded from the jsDelivr CDN the first time the tab runs something, about 8 MB) inside a Web Worker. Each transfer it asks for is computed by the planner (`POST /api/arp/transfer`, `/api/arp/evaluate`) with `lamberthub` and SciPy, through a blocking request, which a worker may make. So an algorithm is ordinary sequential Python and the server never executes anyone's code.

Two consequences are deliberate:

- The algorithm and the instance are kept in the browser's local storage and are not put in the page link. A link that carried code would run that code in the browser of whoever opened it.
- "Stop" ends the worker, so a loop that never finishes cannot hang the page.

Python was chosen because both papers' reference implementations and the transfer service are Python, and it is the language a new algorithm is most likely to be drafted in.

## 6. How the papers' algorithms fit

| Algorithm | In the format |
|---|---|
| Greedy nearest neighbour (paper 1, Algorithm 1) | shipped: `tools.distance` to pick, `tools.transfer` to advance the clock |
| Random search (paper 1, baseline) | shipped: `tools.random.shuffle` and `tools.evaluate` until the budget is used |
| Restricted decision diagram (paper 2, Algorithm 3) | shipped: phase-one bounds z_min from `tools.relaxed_transfer` (eq. 8), then the route built layer by layer keeping the `WIDTH` partial routes with the best bound z↓ + w + z↑, exact arcs from `tools.transfer` for those only (at most WIDTH × n calls of B). z↑ is a width-one relaxation: every remaining asteroid entered from its cheapest predecessor. |
| Peel-and-Bound (paper 2, Algorithm 4) | shipped as the paper describes it. The first route is the paper's Euclidean nearest neighbour. The initial relaxed diagram of section 3 has n nodes a layer: phase one weights every arc with B′ over the whole mission window (eq. 8, n² − n calls), phase two tightens them layer by layer with the window of eq. 10 (n³ − 2n² + n calls; skipped above `PHASE_TWO_MAX_N` asteroids), and every B′ value is kept with its window so a containing window answers later arcs (section 6.1.2) and B′ is never called again. Constraint propagation (`Diagram.propagate`) removes arcs with z↓ + w + z↑ ≥ z̄ and revisits of asteroids on every path into a node. The loop of Algorithm 4 takes the newest diagram from the queue (the paper's largest-index choice), peels the last exact node on its shortest path (Algorithm 2), gives the peeled root's arcs their exact cost, reads feasible routes from the peeled diagram with the embedded restricted search of Algorithm 3 at width `SEARCH_WIDTH`, splits the first node on its shortest path with several in-arcs by whether its paths all visited the previous asteroid (Algorithm 1, eq. 5; layers capped at `MAX_LAYER_WIDTH`), and keeps whichever diagrams can still beat the best route. It stops after budget × n transfers past construction and says whether the result is proven optimal within the bounds; on the test instances with 5 and 6 asteroids it proves the optimum that brute force over every route confirms. The earliest start time of an inexact node is the paper's heuristic (the smallest arrival over its in-arcs), so "proven" means within the paper's bounds, as in the paper. |
| UMM, CEGO (paper 1) | fit as written: samplers or surrogate models over permutations that call `tools.evaluate`; `numpy` and `scipy` are available. Not shipped. |

These four are the algorithms shipped. Each is a complete file in the format, offered in the editor as a starting point for writing your own.

### 6.1 The relaxed transfer is always two-burn

`tools.relaxed_transfer` is the papers' no-wait B′, a bound. It is computed with the two-burn Lambert rendezvous whatever the transfer mode (section 7.1), since a bound has no business flying three burns. In three-burn mode the exact costs can fall below it on legs with a plane change, so the decision-diagram algorithms' pruning is then heuristic rather than exact.

## 7. Transfers

### 7.1 Two or three burns

Every transfer is flown in one of two ways, chosen in the Transfer section and stored with the scene:

- `lambert2`: the papers' two-impulse Lambert rendezvous.
- `threeburn` (the default): the three-burn rendezvous of [three-burn-transfer.md](three-burn-transfer.md).

The times (τ, t) of a transfer are always chosen as the papers define, by SLSQP on the two-burn cost from (0, 30), so a route has one deterministic cost in either mode and evaluations stay affordable. In three-burn mode those times are then flown with three burns and z charges the three-burn delta-v; the two-burn delta-v at the same times is reported beside it. With explicit times the three-burn transfer is solved directly. A route in three-burn mode is therefore not comparable with the papers' tables even under Izzo or Gooding; switch to two burns for that.

### 7.2 Paths written by hand

In the tab's Plan a path half, a route can be written by hand: a list of entries, each holding an asteroid with all of its elements, the day to arrive there and how long to stay, plus the day the spacecraft leaves Earth's orbit. The arrival days and stays fix every departure and flight time, so the planner flies the path exactly as written (`POST /api/arp/path`), with whichever transfer is chosen, and draws it. The list can be edited as rows, where each entry's name and six orbital elements (a in AU, angles in degrees, M0 at the epoch) sit under an "orbit" fold, or typed as text in a standard format, `ARP-PATH 1`:

```
ARP-PATH 1
epoch: 2121-01-01T00:00:00Z
departure: 0
Asteroid 1: a=3.2654 e=0.1823 i=6.72 raan=147.75 argp=296.07 M0=283.61 arrive=365 stay=30
Ceres: a=2.767 AU e=0.0785 i=10.59 deg raan=80.3 argp=73.6 M0=130 arrive=760 stay=20
```

One line per stop in visiting order: a name, then `key=value` pairs in any order, with `a` in AU (or `km`), the angles in degrees (or `rad`), `M0` at the epoch, `arrive` the day the spacecraft must be there and `stay` the days spent there. Generating or importing an instance fills the list with every asteroid and a default schedule, so each generated orbit is there to tweak. A stop named like an asteroid of the instance is that asteroid, with the orbit as written: the instance, the scene and the algorithms follow the edit as it is made. Any other name is a body of its own, drawn when the path is flown, so orbits can be typed from a catalogue; "Add asteroid" offers such a fresh orbit once every asteroid of the instance is in the path. Lines starting with `#` are comments; `mu:`, `earth:` and `id=` are optional. The page checks the text as it is typed and names the first thing wrong with it. The list can also be filled from the last algorithm run and saved to or opened from a file (this text, or the JSON the page exported before). Each entry carries its asteroid's elements so a saved path stands on its own.

### 7.3 Lambert solvers

Every transfer uses one solver from `lamberthub` 1.0.0, chosen in the "Lambert solver" section of the Mission and Asteroids tabs and stored with the scene. The default is Izzo (2015). Measured on 300 random heliocentric transfers by propagating each answer and comparing with the target:

| Solver | Result |
|---|---|
| `izzo2015` (default) | exact; multi-revolution capable |
| `gooding1990` | agrees with Izzo to 1e-12 km/s; multi-revolution capable |
| `avanzini2008` | agrees to about 1e-6 km/s |
| `arora2013` | usually exact, occasionally off by 0.01 km/s, rarely raises an error |
| `vallado2013` | no solution for about 15% of cases (fast, hyperbolic transfers) |
| `battin1984` | velocities off by about 0.07 km/s (median), so arcs miss the target slightly |
| `gauss1809` | fails or returns unusable answers on most transfers between different orbits |

For the five solvers that are not robust, an answer is rejected when the propagated arc misses the target by more than 5% of the distance, the inner optimizer starts from a longer transfer if (0, 30) has no solution, and it uses a wider finite-difference step and at most 150 iterations. A route's cost can therefore differ between solvers, and a result is only comparable with the papers under Izzo or Gooding.

## 8. Differences from the papers

- Instances are the papers' own. "Generate instance" with "the GTOC11 catalogue" asks the planner for instance `n_seed` (`GET /api/arp/instance?n&seed`), drawn from the 83,453 GTOC11 asteroids with the generator of the first paper's reproducibility package (Zenodo record 6034335, CC BY 4.0): numpy's `default_rng(seed).integers(1, 83454, size=n)`, with replacement, Earth from their Table 1, their constants, their mission start. `api/tests/test_arp_paper.py` reproduces the package's own results for instance 10_42 (the greedy route and its cost 391.308, and rows of its random search) to within 1e-4 (SLSQP stops at slightly different times on different scipy builds), so costs are comparable with the papers' tables under the Izzo or Gooding solver. The inner optimizer's start and tolerance travel with the instance (`innerStart`, `innerTol`): catalogue instances carry the package's (1, 30) and 1e-4; instances without them use the text's (0, 30). The other source, "a synthetic main belt", draws main-belt-like orbits from the seed (a from 2.1 to 3.3 AU, e from 0.02 to 0.25, i up to 14 degrees) and is named `synthetic n_seed`; its costs are not comparable with the papers. An instance in the page's JSON form can still be imported.
- Earth's orbit comes from the JPL approximate elements for the Earth-Moon barycentre at the instance epoch (2121-01-01).
- Bodies move on unperturbed Kepler orbits and impulses are instantaneous, as in the papers.
- The drawn route holds the spacecraft with the last asteroid for 30 days so the arrival is visible. That ride is not part of the cost.

## 9. Versioning

The version number in the first line belongs to the interface in section 3. A change that could break an existing algorithm file (a renamed call, a changed return value, a different budget rule) gets a new number, and the runner refuses a file whose number it does not know rather than run it under different rules. Additions that old files cannot notice keep the number.

## 10. Tests

`api/tests/test_arp.py` checks the black box (bounds, the cost definition, chaining, determinism, fixed times, solver agreement). `api/tests/test_arp_paper.py` checks the catalogue and reproduces the first paper's package results for instance 10_42. `api/tests/test_arp_harness.py` runs the runner's Python outside the browser against the real service: every example, each format violation and its message, traceback line numbers, the budget cut-off, explicit times, and `tools.position` against the planner. `app/tests/arp/arp.test.ts` checks the format check, the instance generator and the scene conversion.
