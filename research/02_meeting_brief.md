# Meeting brief for Prof. Rathinam, week of September 7, 2026

Read this before the Monday 3 PM meeting. It condenses the `research/` folder (six track studies, the gap statement, the one-pager, about 100 validation scripts) into what to say, what to show, what to ask, and what not to claim. Everything here is drawn from those documents; nothing new was researched for this brief.

His three asks on August 31 were: learn the field, scout existing projects, build something visually appealing. All three have a concrete answer now.

---

## 1. Where things stand in one paragraph

The research plan in the master document was executed on September 1 and adversarially verified. Phase 0, "the lecture as code," is built and runs: Orbit Lab (`app/`) puts any of six central bodies at the centre, adds satellites from the six classical elements or from a TLE through SGP4, draws orbit paths, scrubs time, and encodes the whole scenario in a shareable URL. It passes 32 known-answer tests including Curtis Example 4.7 and an SGP4 cross-check. The landscape one-pager (`research/00_landscape_one_pager.md`) is the handout. The next build step is A1, a live ISS on a token-free globe.

---

## 2. The pitch, worded carefully

**Defensible claim:** no open-source project, mature or not, couples an exact multi-objective (EMOA*-class, Pareto-front) optimizer to an interactive 3D view. And no mature, institutionally backed open-source tool couples any trajectory optimizer to a browser-based interactive 3D scene.

**Do not say** "nobody couples optimization to visualization." That is false. GMAT couples single-objective targeting to an OpenGL view, and four hobbyist repos from 2026 already link a Lambert porkchop to a 3D solar system. The novelty lives at the intersection of three things: exact multi-objective search, interactive 3D, institutional quality.

One supporting fact worth saying out loud: the 2025 survey of multi-objective search (Salzman, Hernández Ulloa, Felner, Koenig) names transportation, robotics and chemistry as benchmark domains and never mentions orbits, spacecraft or delta-v. Space is an unclaimed benchmark domain in his own field's self-map.

---

## 3. What exists today (the product landscape)

### Earth-orbit viewers: polished, zero optimization

| Tool | Stack | License | Verdict |
|---|---|---|---|
| **satvis.space** (his reference) | TypeScript, Vue 3, CesiumJS, satellite.js | MIT | The architecture and polish bar. Live CelesTrak catalogs, SGP4 in a worker pool on an epoch-anchored sample grid, batched primitives holding 5,000 to 12,000 satellites at 70+ fps, seven per-satellite components, pass prediction, URL state. 83% of its August 2026 commits carry an AI-assisted trailer. |
| **KeepTrack.space** | TypeScript, custom WebGL2 | AGPL-3.0-or-later | Performance ceiling: 50,000+ objects as one `gl.POINTS` draw call. AGPL means nothing from it can be copied into an MIT repo. Study, do not copy. |
| **Stuff in Space** | WebGL1, jQuery | none (all rights reserved) | Original site is dead. MIT fork by ajmas survives. Defines the "stylized instrument" look. |
| **Gpredict / PREDICT** | C, GTK / ncurses | GPL | The ham-radio pass-prediction lineage that satvis webified. Same SGP4 code family as satellite.js. |

### Interplanetary and mission design: powerful math, weak or absent viewers

| Tool | License | Verdict |
|---|---|---|
| **pykep + pygmo** (ESA) | MPL-2.0 / GPL-3.0 | Lambert, multiple gravity assist, low-thrust, global and evolutionary multi-objective optimization. Static matplotlib only. Active. Strongest library to borrow from. |
| **GMAT** (NASA Goddard) | Apache-2.0 | The only actively maintained open-source tool coupling an optimizer to a 3D view. Single-objective targeting and NLP only; its own `Optimizer.hpp` has one scalar cost. Legacy wxWidgets UI is the anti-example for polish. Single-platform install is about 400 to 460 MB. |
| **NASA EMTG** | NOSA | Optimizer ceiling (basin hopping plus SNOPT). No interactive view at all. |
| **poliastro / hapsira** | MIT | poliastro archived October 2023. hapsira's development branch dormant about 2.3 years. Do not depend on either. |
| **spacekit.js** | MIT | Three.js solar-system library. Pinned to three r0.135 (WebGL1, removed at r163), fixed 2018 planetary elements (Saturn already 0.38 degrees off), float32 AU coordinates (17.8 km precision at 1 AU). Borrow its Ephem and KeplerParticles patterns; do not build on it. |
| **NASA Eyes on the Solar System** | closed | The "wonder" bar. Engine undisclosed. Borrow UX: time-rate dial, encounter markers, not-to-scale toggle, guided tours. |
| **STK, FreeFlyer, Copernicus, ESA GODOT** | closed or access-gated | Coupling exemplars, not competitors. |
| **ESA Space Trajectory Analysis** | EUPL | The only historical case of a multi-objective optimizer (NSGA-II) beside a 3D view. Abandoned since 2013; coupling claim unverifiable. |

### Recent hobbyist tools (the reason the claim had to be narrowed)

Four single-author repos created April to July 2026 couple a single-objective Lambert porkchop to an interactive 3D real-solar-system view: chipi/orrery (3 stars), kevinkicho/k-solar-system-navigator (0 stars), abc000cool/porkchop-mission-planner (0 stars, no license file), tamiralmas/Orbital-Simulation (0 stars, ephemeris valid for two months only). Three of the four disclose heavy AI-assisted authorship. nmisyats/KSP-MGA-Planner (GPL-3.0, 47 stars) is the most mature coupled optimizer found but is game-branded. None does multi-objective search. Acknowledge them if asked; they are prior art, not competitors.

### The two-cluster picture to draw on the whiteboard

Real-time 3D viewers (satvis, KeepTrack) do beautiful SGP4 rendering and no optimization. Headless libraries (pykep, EMTG, Orekit, Tudat, nyx) do serious optimization and output static plots. GMAT is the sole maintained bridge, single-objective, desktop. The project sits in the empty corner.

---

## 4. Library shelf (what to use, what to avoid)

**Browser, use:**
- `satellite.js` 7.1 (MIT): SGP4 plus frame helpers. Cross-checked against python-sgp4 to 0.055 m. Already in Orbit Lab.
- `three.js` r185 (MIT): the heliocentric scene, and what Orbit Lab already uses.
- `cesium` / `@cesium/engine` (Apache-2.0): Earth globe if Phase A goes that way. Fully usable with zero Cesium ion token: bundled Natural Earth tiles plus ellipsoid terrain.
- `d3`: porkchop heatmap and Pareto plots.
- `zustand`, React, Vite: already in place.

**Python, use as oracles and for Phase C math:**
- `pykep` (MPL-2.0, active): Lambert, ephemerides, porkchop. The Phase C engine, or the reference for an in-house port.
- `lamberthub` (GPL-3.0): pure-Python Lambert with 14 algorithms; used as the oracle for the computed porkchop.
- `skyfield` + `sgp4` + `jplephem` (DE421/DE440): validation oracles for frames, time, ephemerides.
- `pygmo`: evolutionary contrast and benchmarks in the eventual paper.

**Avoid:**
- spacekit.js as a base (dead WebGL1 stack, wrong planets).
- poliastro and hapsira (archived, dormant).
- Copying anything from KeepTrack (AGPL).
- The `lambert-izzo` npm package as a runtime dependency. Track 4 called it fabricated; a check on September 7 found it does exist (a Rust-to-WASM Izzo solver, MIT or Apache-2.0, 1 star). Fine as a test oracle, not vetted enough to depend on. See `research/03_tech_stack.md`.
- TLE text as an ingestion format: catalog numbers passed 100,000 on July 11, 2026 and overflowed the 5-digit field. Use CelesTrak OMM JSON or CSV.

**His code, `public_emoa`:** C++ exact multi-objective A*, about 1,900 core lines, STL-only (no Boost). **No LICENSE file on any branch**; README carries an "academic and non-commercial use, AS IS" note only. Treat as all-rights-reserved unless he grants terms in writing. Never vendor it into an MIT repo. Three integration options: WASM build (low risk, keeps the site serverless), a thin Python service, or a TypeScript reimplementation (600 to 1,800 lines; deepest learning).

---

## 5. Technology decisions to put in front of him

**Rendering.** The master document's default was "Cesium for Earth, Three.js for the solar system later, renderer behind an interface." Phase 0 was built in Three.js with a body-agnostic design, which leans toward the Three.js-only path. The honest tradeoff:
- Cesium gives satvis parity fastest (imagery, terrain, clock for free) but is architecturally Earth-locked. Its "inertial" mode is a rotation of the Earth-fixed frame; there is no heliocentric origin.
- Three.js gives one engine from LEO to Mars and total visual control, but re-implements the globe basics. It needs a floating origin and a logarithmic depth buffer to host both LEO and heliocentric content, since float32 at 1 AU is 17.8 km, which is 4.5% of a LEO altitude.
- A dual-scene design has the most capability and the most surface area.

Ask him whether a stylized, non-photoreal Earth in Three.js is acceptable for Phase A, or whether he wants the Cesium globe look that satvis has. That answer decides the next month.

**Data.** CelesTrak `gp.php` with `FORMAT=json` (OMM). CelesTrak enforces a 2-hour cadence and, since March 26, 2026, returns HTTP 403 on repeat downloads. Cache on disk, fetch at most once per 2 hours per query. Planet positions from JPL Horizons or DE-series kernels via a Lagrange-interpolated table, never fixed osculating elements.

**Architecture rules already adopted:** propagation in a web worker once counts grow; URL-encoded scenario state from day one (done); token-free by default so a clone just runs (done); nothing in `core/`, `propagation/`, `data/` imports from `scene/` or `ui/` so the math stays testable (done). Serverless static hosting until a Python service is unavoidable; WASM can defer that indefinitely.

**Aesthetic:** stylized instrument (dark scene, glowing orbit lines, clean type), not photoreal. Cheaper, harder to get wrong, fits the eventual routes-and-Pareto content.

---

## 6. What was learned, with numbers to say out loud

These are the verified findings that show the research was done rather than recited.

- **The lecture, checked.** The six-element to position pipeline reproduces Curtis Example 4.7 to floating-point precision. The master document's written rotation formula had a sign error (it gave the inverse transform); the code was already correct with Q = Rz(RAAN) Rx(i) Rz(argp).
- **Kepler's equation seeding.** Seeding Newton's method at E = pi fails about 6.7% of the time at high eccentricity. Vallado's seed (M minus e or M plus e depending on the half-plane) had zero failures in 7,600 cases up to e = 0.9999. That seed is in the code.
- **Why TLEs cannot feed the Keplerian pipeline.** Feeding the ISS TLE to a two-body propagator is 11.7 km wrong at epoch, about 480 km after one day, about 3,200 km after a week. TLE elements are Brouwer mean elements fit to SGP4 itself.
- **Frames.** SGP4 outputs TEME. Treating TEME as J2000 is a silent error of about 41 km at ISS altitude and about 260 km at GEO in 2026. The correct chain is TEME, GMST rotation, Earth-fixed, geodetic, which is exactly what satvis does in its worker.
- **Time.** A 1-second time slip moves the ISS 7.67 km along-track. Confusing TAI and UTC (37 s) costs 17 km. Timezone mistakes cost thousands of km.
- **Staleness.** LEO elements reach one globe pixel of error (about 12.7 km) in 3 to 4 days; GEO in 1 to 3 weeks. Nightly pulls suffice at globe zoom.
- **Porkchop, computed.** Earth to Mars, 2026 to 2029, from DE421 ephemerides and Izzo's Lambert solver, 6,479 cells, zero failures. Best 2026 window departs October 29, 2026, arrives September 4, 2027, 310 days, C3 of 9.28 km²/s², v-infinity sum 5.6 km/s. Second window departs November 23, 2028. The 780-day synodic recurrence shows up as expected. Curtis Example 5.2 was reproduced by three Lambert algorithms agreeing to 5e-5 km/s.
- **Weighted-sum search provably misses Pareto points.** Three points A=(1,10), B=(5,7), C=(10,1): sweeping 2,001 weights never selects B. This is the mathematical reason exact multi-objective search matters; it is the differentiator over pygmo-style scalarization.
- **On his own papers.** EMOA* unifies dominance-based multi-objective A*; BOA* is the two-objective special case with an O(1) dominance check. The balanced-tree frontier from SoCS 2022 is an asymptotic win only at exactly three objectives; the AIJ 2025 experiments show a sorted-array plus binary-search variant (Late-BS, from Hernández Ulloa's IJCAI 2023 work) is fastest in every tested case. Implication for Phase C: start with two objectives (delta-v, time of flight) and a sorted array, not a tree.
- **Space logistics context.** The Georgia Tech school (Ho, de Weck lineage) solves campaign logistics as time-expanded network flow. Ishimatsu 2016's network is 16 nodes and 598 arcs, solved as a pure LP. A naive daily-resolution Earth-Moon-Mars network over two years is about 8,000 nodes and 40,000 arcs. Lesson: build the Phase C graph event-driven, not calendar-gridded. Since 2026 (Gollins, Grieser, Ho, JSR 63(3)) that school has an exact multi-objective MIQCP for small instances and an evolutionary one at scale, so the novelty must be phrased as exact graph-search Pareto enumeration plus interactive 3D, not "multi-objective is absent."

---

## 7. The plan

Sequenced so every Monday has a demo, never more than two weeks from a shippable increment, at 5 to 6 hours per week.

| Phase | What ships | Status |
|---|---|---|
| **0** | The lecture as code: elements to position, Kepler's equation, animated orbits, element sliders, presets, TLE via SGP4, any central body, URL state. | **Done.** Demo Monday. |
| **A1** | Live ISS from a CelesTrak OMM record on a token-free globe: orbit line, ground track, live lat/lon/alt/speed, element panel mirroring the lecture. | Next. |
| **A2** | Catalog groups and search, per-satellite component toggles. | |
| **A3** | Worker propagation for thousands, performance pass with the Starlink group as the stress test. Differentiator: the element-sandbox teaching mode. | |
| **B1** | Heliocentric scene, planets from JPL-quality ephemerides, log-scale distance toggle. | |
| **B2** | One precomputed Earth to Mars Lambert arc with encounter markers. | |
| **C1** | Interactive porkchop for a planet pair; hover a cell, see the arc in 3D. The signature demo. | |
| **C2** | Transfer-network graph plus EMOA*, Pareto panel linked to 3D routes. The research contribution. | |
| **C3** | Benchmarks (EMOA* vs weighted-sum vs pygmo), benchmark instance set, write-up. | |

**Differentiators over satvis, ranked by value per effort:**
1. Element-sandbox teaching mode. Nothing in the genre lets a user drag a, e, i, RAAN, argp and watch the orbit deform live. satvis never even displays semi-major axis, period or true anomaly. Orbit Lab already does this. Weeks of work, already mostly spent.
2. Porkchop linked to a 3D arc, validated against oracles and maintained. Phase B/C.
3. Pareto route explorer. Phase C. The paper.

**Fidelity to disclose honestly.** v1 sits at "impulsive patched-conic Lambert with real ephemerides." It does not model finite burns, drag, non-spherical gravity, solar radiation pressure, B-plane targeting, or navigation uncertainty, all of which GMAT does. Ship a GMAT-anchored fidelity table in the README so a domain expert never gets to ask "did you know your model ignores X."

**Publication path the evidence supports:** a tool paper (SoCS demo track, or JOSS) plus a benchmark instance set first; an astrodynamics conference (AAS/AIAA) once the interplanetary layer works; a methods paper only if one emerges.

---

## 8. Questions to ask him

Ordered by how much the answer changes the next month of work.

1. **`public_emoa` terms.** The repo has no license file. Would he grant written terms, or would he rather see EMOA* reimplemented in TypeScript? (A TS port is license-clean, 600 to 1,800 lines, and may be faster with the sorted-array frontier.)
2. **Rendering path.** Stylized Three.js Earth for Phase A, or the Cesium globe look of satvis? Phase 0 is already Three.js.
3. **Scope check.** Single-satellite to catalog Earth-orbit viewer first, or push to interplanetary visuals sooner?
4. **What does he want demoed by end of September?**
5. **Collaborators.** Solo, or will students join?
6. **Publication ambition.** Tool paper, benchmark set, or methods work?
7. **Hosting and branding.** Lab page link, TAMU affiliation in the README, project name (pick before the public push).
8. **491 next semester.** Reconfirm what he expects the credit to produce.

---

## 9. Things not to get wrong in front of him

- Call his RA-L 2022 paper **MOPBD\*** ("Multi-Objective Path-Based D* Lite"). "MOD* Lite" is Oral and Polat's 2015/2016 algorithm that MOPBD* baselines against.
- Dominance notation differs between his papers: SoCS 2022 uses a ⪰ b for "dominates," AIJ 2025 uses a ≺ b for the same relation.
- Ishimatsu 2016 is a pure **LP**, not MILP. Only Jagannatha and Ho 2020 and the MINLP work are mixed-integer.
- Earth to Mars Hohmann is 258.9 days, which is 8.5 months, not 8.6. Real windows are 300 to 320 day Type II transfers.
- ISS ground track shifts about 23.5 degrees west per orbit (23.3 from rotation plus 0.3 from J2), not 22.5.
- The NASA OIG report says "more than 10" Starship tankers on a roughly 6-day cadence over a 200-plus-day window. "10 to 20" is journalism.
- The gap claim is a September 1, 2026 snapshot. Four near-matches appeared in one four-month window this year. Say "no counterexample found after checking GitHub broadly and ESA's GODOT specifically," not "nowhere."

---

## 10. Loose ends the research itself flagged

- The master document's ISS semi-major axis (6795 km) versus the live-TLE value (about 6798 km) is unreconciled; probably different epochs.
- `abolfazlshirazi/ZERUA` (14 stars) claims a 3D web viewer with evolutionary trajectory optimization and was not confirmed either way. Worth 15 minutes if it comes up.
- Whether ballistic lunar transfers actually sit in a non-convex Pareto pocket relative to direct transfers is inferred structurally, not computed. If he asks for the EMOA*-beats-weighted-sum example in the space domain, say it is the planned first experiment, not a result.
- No performance benchmark was run on your own hardware; all fps numbers are satvis's own or vendor claims.
- ESA GODOT is behind ESA's private GitLab; its documented multi-objective capability outputs static images, but the source was not seen.

---

## Bring to the meeting

- Laptop with Orbit Lab running (`cd app && npm run dev`). Demo: switch bodies, drag elements, load the ISS TLE, play time, copy a link.
- Printed `research/00_landscape_one_pager.md`.
- This brief, section 8 open on the phone.
