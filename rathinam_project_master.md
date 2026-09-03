# Rathinam Research Project — Master Document
### Scope · Research Directions · Implementation Guide

**Student:** Surya Thirukonda, CS '28, Texas A&M (surya.thirukonda@tamu.edu)
**Advisor:** Prof. Sivakumar Rathinam, Mechanical Engineering, Texas A&M
**Status as of Sep 1, 2026:** active Undergraduate Research Assistant position (volunteer); **weekly meetings, Mondays 3:00 PM**; **491 credit confirmed for next semester**; framed by the professor as a long-term project.
**Resume listing (approved wording):** "Undergraduate Research Assistant, Rathinam Group, Texas A&M Dept. of Mechanical Engineering (Sep 2026–present)" — describe as building an open-source 3D satellite-orbit visualization platform with planned multi-objective interplanetary trajectory optimization. No results claims until they exist.

This document consolidates the project scope/planning and the implementation guide, and adds a research-directions section for deep reading **before building**. It is a *reference*, not a spec — where it recommends, treat recommendations as defaults to deviate from with reason.

---
---

# PART I — SCOPE & PLANNING

## 1. How this project came to be

Surya ran a cold-email research campaign to 99 TAMU professors on Mon Aug 17, 2026 (subject for Rathinam: "Fall 2026 undergraduate research inquiry in motion planning and control of autonomous vehicles"; each email opened with a verified paper of the professor's, resume attached). Rathinam replied; after a short thread, a Zoom meeting was set. He is one of five research homes Surya kept after consolidating the campaign (others: EJ Kim's architecture lab — #1 priority, Guofei Gu / SUCCESS Lab, Yanmin Gong / HASH AI Lab, Marcus Botacin).

Relationship facts that matter:
- **ME professor** (not CSE): motion planning and control of autonomous vehicles, collaborative decision making, combinatorial optimization.
- **Core co-author of the modern multi-objective search literature**: EMOA* (SoCS 2022; consolidated in *Artificial Intelligence* 2025 with Ren, Hernández, Likhachev, Felner, Koenig, Salzman, Choset), **MOPBD\*** — "Multi-Objective Path-Based D* Lite" (RA-L 2022; use this name with him — "MOD* Lite" is a different, earlier 2015/2016 algorithm by Oral & Polat that MOPBD* baselines against), MO-CBS and MOM* (multi-objective multi-agent path finding), plus older multi-depot heterogeneous vehicle routing and Dubins/TSP work. Reference C++ EMOA* implementation: `github.com/rap-lab-org/public_emoa` (no license file — see Part III §3).
- Sits on the board of SwIRL (a nonprofit whose internship Surya declined — if it comes up, stay brief and gracious; never criticize SwIRL, Korok Ray, or Rakesh Godha).
- Volunteer this semester, no funding. **491 confirmed for next semester.**

## 2. Meeting summaries

### Meeting 1 — Fri Aug 21, 2026, 10:00 AM, Zoom
- Proposed an **open-source 3D space-logistics visualization with MOA\* route optimization**, described as SpaceX-adjacent.
- Framing was logistics-flavored: routes between orbital locations, optimized on multiple objectives, his multi-objective search algorithms as the engine.
- Outcome: mutual interest; agreed to meet again first week of September. No concrete task yet.

### Meeting 2 — on/around Mon Aug 31, 2026
- Showed **satvis.space** as the reference bar, sending `https://satvis.space/?elements=Point,Label,Orbit+track,Orbit,3D+model` (the query string is satvis's per-satellite component list).
- Gave a **mini-lecture on satellite positioning** (two notebook pages): the in-plane ellipse — semi-major axis a, eccentricity e (0 ≤ e < 1), true anomaly θ, periapsis a(1−e), apoapsis a(1+e), conic equation **r = a(1−e²)/(1+e·cosθ)** — and the 3D orientation via three rotations (3-1-3): about z by **RAAN**, about x′ by **inclination**, about z″ by **argument of periapsis**. Together with true anomaly: the six classical orbital elements.
- Noted **existing software already does satellite positioning/path viewing**; his vision is to keep this genre **open source** and extend it to **path optimization between different planets** — the part that doesn't exist in open source.
- Explicit asks, in order: (1) research and learn the field, (2) scout current projects, (3) build a nice, **visually appealing** visualization software.
- Offered **491 next semester**; called it a **long-term project**.

### Post-meeting-2 confirmations (Sep 1)
- Agreed to work together officially; **weekly meeting every Monday 3:00 PM** established (fits Surya's rules: MW class ends 2:40 + 20 min buffer; no conflict with EJ Kim's Mon 5–6 PM).
- 491 next semester reconfirmed.

### Standing understanding
Meeting 1's MOA*/optimization ambition is the destination; meeting 2 sequenced the work: **visualization platform first** (achievable now with Surya's web skills), **optimization layer after**. Identity: *an open-source, satvis-quality 3D visualization that grows an interplanetary trajectory-optimization brain.*

## 3. Project vision

One sentence (narrowed to the defensible claim after the Sep 1 landscape verification — full analysis in `research/gap_statement.md`): **no open-source project, mature or not, couples an exact multi-objective (EMOA\*-class, Pareto-front) optimizer to an interactive 3D view; and no mature, institutionally backed open-source tool couples any trajectory optimizer to a browser-based interactive 3D scene.** Do not claim "nobody couples optimization to visualization" — GMAT couples single-objective optimization to its OpenGL view (output-coupled), and four 2026 hobbyist repos (0–3 stars, mostly AI-authored, one unlicensed) couple single-objective Lambert porkchops to 3D solar-system views. The novelty lives specifically in *exact multi-objective* + *interactive 3D* + *institutional quality*.

Long-term shape (18+ months):
- **Phase A — Earth-orbit visualizer**: satvis-class (live TLE catalogs, 3D globe, orbit/ground-track rendering, element display, time controls). Establishes codebase, visual bar, credibility.
- **Phase B — beyond Earth orbit**: solar-system scene, planetary ephemerides, interplanetary transfer arcs.
- **Phase C — optimization**: Lambert/porkchop transfers for planet pairs (interactive, linked to 3D), then **multi-objective route optimization** (Δv vs. time of flight vs. more) over transfer networks with EMOA* — where a research paper most plausibly lives.
- Ongoing: polish, community, docs, possibly benchmark instances for the multi-objective search community.

## 4. Immediate scope — updated Sep 2, 2026

**Research phase: COMPLETE.** Part II's six tracks were executed on Sep 1 (see `research/` — track write-ups, verification ledgers, ~100 validation scripts with outputs, a computed 2026–2029 Earth–Mars porkchop, and adversarially verified claims). His asks #1 (learn the field) and #2 (scout projects) are answered; `research/00_landscape_one_pager.md` is the presentable artifact and `research/gap_statement.md` holds the defensible novelty claim with a 30-row comparison table.

**Current goals, in order:**
1. **Build Phase 0** — the lecture as code (elements→position, Kepler, sliders, animated orbit), using `research/scripts/T1_1_elements_to_eci.py` as the oracle. Deploy.
2. **Build A1** — live ISS on a token-free Cesium globe via the Track-2 frame chain (TEME → GMST → ECEF → geodetic), ingesting OMM JSON (not TLE text), respecting CelesTrak's 2-hour/403 policy.
3. **Monday 3 PM meeting:** demo Phase 0 (+A1 if ready), hand over the one-pager, present the narrowed gap statement, and ask the §7 open questions — especially `public_emoa` licensing (repo has no license file) and whether he'd rather see EMOA* reimplemented in TypeScript.
4. Pick a project/repo name and push the public repo (MIT) with the Phase-0 demo as the first commit series.

## 5. Constraints, preferences, working rules

- **Time budget:** ~5–6 hrs/week (14 credit hours: CSCE 312, 314, 181, MATH 304, GEOL 101; four other labs; internship pipeline).
- **Class schedule** (for any scheduling): MW 9:10–10:00, 10:20–11:10, 11:30–12:20, 1:50–2:40; TR 8:00–9:15, 12:45–2:00; F 10:20–11:10, 11:30–12:20, 1:50–2:40. No 8 AM proposals; meetings ≥20 min after class; holds stay "(proposed)" until confirmed. **Recurring: Rathinam Mon 3 PM; EJ Kim Mon & Wed 5–6 PM.**
- **Email voice** (all professor correspondence): no em dashes, no colons in the body, warm and professional. Drafts only — nothing sent without Surya's explicit approval.
- **Open source from day one:** MIT or BSD, public GitHub under SuryaThirukonda, clean README. Repo quality is a first-class deliverable.
- **SpaceX relevance:** Summer 2027 SWE application in flight; favor decisions that keep a public, demoable artifact.

## 6. Decisions log

| Date | Decision | Rationale |
|---|---|---|
| Aug 21 | Join Rathinam's project (volunteer) | Motion planning + SpaceX-adjacent; strong PI |
| Aug 27–31 | Kept through consolidation to 5 labs | Complements EJ Kim (systems) and Botacin (first-author) |
| Aug 31 | Viz-first sequencing accepted | His explicit direction |
| Aug 31 | satvis.space = reference | His link; teardown complete |
| Sep 1 | Official URA position; weekly Mon 3 PM; resume listing approved | His confirmation |
| Sep 1 | Part II research tracks executed + verified | `research/` folder; errata applied to this doc Sep 2 |
| Sep 1 | Gap claim narrowed to exact-multi-objective + interactive-3D | Four 2026 hobbyist single-objective couplings found; see `research/gap_statement.md` |
| Sep 1 | Drop spacekit.js as a Phase B base; drop poliastro/hapsira | Dead/dormant deps (Track 3); use pykep + lamberthub; borrow spacekit patterns only |
| Sep 1 | Ingest OMM JSON, not TLE text | Catalog-number overflow (Jul 2026) + CelesTrak 403 policy (Track 2) |
| open | Which lab gets 491 next semester | Rathinam confirmed; Botacin and Gu also point at 491; finite credit hours — decide ~November |
| open | Stack (Cesium vs Three.js vs dual-scene) | Part III §4; one-pager proposes Cesium-behind-interface + separate Three.js heliocentric later |
| open | Project/repo name | Pick before first push |
| open | `public_emoa` terms | No license file; needs his written terms — ask Monday |

## 7. Open questions for Rathinam

1. v1 scope check: single-satellite → catalog Earth-orbit viewer first, or interplanetary visuals sooner?
2. Students/collaborators joining, or solo?
3. What does he want demoed by end of September?
4. Optimization layer: implement EMOA* fresh, or wrap `public_emoa`?
5. Publication ambition: tool paper, benchmark set, or methods work?
6. Hosting/branding preferences (lab page link, TAMU affiliation in README)?

## 8. Risks

- **Scope sprawl** ("long-term" + "between planets" + "visually appealing"): ship small vertical slices; every Monday meeting gets a demo, not a status report.
- **Astrodynamics correctness**: an ME professor spots wrong orbits instantly; validate against oracles before demoing (Part III §7).
- **Competing hours**: EJ Kim is #1; Botacin has first-author stakes; keep Rathinam work weekend-chunk sized.
- **Library churn**: poliastro forked to hapsira; pin versions; prefer pykep for optimization-critical math.
- **491 conflict**: three labs, finite hours; decide in November with data on which collaboration is thriving.

---
---

# PART II — RESEARCH DIRECTIONS (read before building)

> **Status Sep 2, 2026: EXECUTED.** All six tracks were completed on Sep 1 with adversarial verification — write-ups, ledgers, and ~100 validation scripts live in `research/`. This part remains as the map of what was studied and why; consult the track documents for the verified findings, and `research/01_master_doc_errata.md` for the corrections already applied to this document.

This is the deep-research plan answering his ask #1 ("research and learn more in the field") and #2 ("scout the current projects"). Organized as six tracks; each lists what to read, in what order, and the questions your reading should answer. Tracks 1–3 are prerequisites for Phase A; tracks 4–6 feed Phases B/C and the eventual paper. Budget roughly: Track 1 deep, Tracks 2–3 working knowledge, Tracks 4–6 survey now + deepen when the phase arrives.

## Track 1 — Orbital mechanics fundamentals (the professor's lecture, extended)

**Goal:** be able to derive position from elements, explain every field of satvis's element panel, and animate an orbit from first principles.

Reading, in order:
1. **Curtis, *Orbital Mechanics for Engineering Students*** — the project textbook. Ch. 2 (two-body problem), Ch. 3 (position as a function of time — Kepler's equation), Ch. 4 (orbits in 3D — the elements and the 3-1-3 rotation, i.e., exactly the notebook pages). Work the examples numerically.
2. **Kepler's equation** M = E − e·sinE: understand why it has no closed form and how Newton–Raphson solves it. (Curtis 3.5–3.7; any dynamics text.)
3. Braeunig's *Rocket & Space Technology* orbital-mechanics pages and NASA's basics-of-spaceflight tutorial — free, readable second passes over the same material.
4. Interactive intuition-builders: orbit simulators in browser (search "Kepler orbit interactive"), and satvis itself — toggle the ISS orbit while watching the element panel.

Questions to answer before building:
- Given (a, e, i, Ω, ω, θ), can you compute an ECI position by hand-calculator for a simple case (equatorial circular orbit) and sanity-check code against it?
- Why does true anomaly move non-uniformly in time while mean anomaly moves uniformly?
- What are typical element values for LEO / GEO / Molniya / sun-synchronous orbits, and what does each *look like*?

## Track 2 — Real satellite data: TLEs, SGP4, frames, time

**Goal:** know why real catalogs need SGP4 (not the Keplerian pipeline), and never lose a week to a frame or time bug.

Reading, in order:
1. **CelesTrak's documentation** on TLE/GP data formats (celestrak.org — Dr. T.S. Kelso's columns explain every TLE field, including BSTAR drag and epoch conventions).
2. The **satellite.js README + source** — small enough to read fully; note `twoline2satrec`, `propagate`, `gstime`, `eciToEcf`, `eciToGeodetic`.
3. **Frames**: ECI vs ECEF vs TEME (the SGP4 output frame) — Vallado's *Fundamentals of Astrodynamics* is the reference; a focused blog-level read on "TEME to J2000" suffices initially.
4. **Time**: UTC vs UT1 vs Julian dates vs GMST (sidereal time — why Earth's rotation angle matters for ground tracks).
5. Skim a paper/article on **TLE accuracy decay** (km-level errors growing per day in LEO) so fidelity claims stay honest.

Questions to answer:
- Why do TLE "mean elements" only make sense inside SGP4?
- What frame is SGP4 output in, and what two conversions get you to (lat, lon, alt)?
- How often must each orbit class refresh TLEs to stay visually truthful?

## Track 3 — Scouting existing projects (hands-on teardowns)

**Goal:** know the genre cold — what exists, what's good, what's missing — and be able to say it crisply in a Monday meeting.

Do, in order:
1. **satvis** (`github.com/Flowm/satvis`, `next` branch — MIT, TS/CesiumJS/satellite.js/Vue/PWA): read `src/` (CesiumController → SatelliteManager → per-satellite components) and `worker/` (propagation offloading). This is the architecture to learn from. A live teardown already exists in `rathinam_field_research.md` §3.
2. **KeepTrack.space** (`github.com/thkruz/keeptrack.space` — TS/WebGL, 30k+ objects, SSA-flavored: launches, breakups, sensors): use the app, skim the rendering approach (custom WebGL, not Cesium) — the performance ceiling reference.
3. **Stuff in Space** (jeyoder) — minimal WebGL debris view; mood/inspiration.
4. **Gpredict** (desktop C) and **PREDICT** — the ham-radio lineage of pass prediction; understand the operator workflow (ground station → passes → notifications) that satvis webified.
5. **spacekit.js** (typpo) — Three.js space-viz library that leaves Earth orbit (asteroids, solar system); evaluate as a Phase B base vs. rolling your own Three.js scene.
6. **NASA Eyes on the Solar System** — closed source; study purely as the visual/UX bar for interplanetary.
7. **GMAT** (NASA, open) — install once, run a tutorial mission; the anti-example for UI but the standard for mission-design capability. Note what "real" mission design includes that v1 will honestly omit.
8. **CesiumJS sandcastle** examples (entities, SampledPositionProperty, CZML) — the engine's idioms.
9. Browse **orbitalindex/awesome-space** (curated list) for anything the scan missed; check GitHub topics `satellite-tracking`, `orbital-mechanics`, `astrodynamics` sorted by recent activity.

Questions to answer:
- What exact feature set makes satvis feel polished, and which 3 features beyond parity would differentiate this project? (Candidates: element-sandbox teaching mode, linked porkchop↔3D, Pareto route explorer.)
- Cesium vs custom WebGL: at what object count and what feature (heliocentric view) does each break down?
- Confirmed gap statement: is there *any* open-source interactive 3D tool coupling trajectory optimization to visualization? (Scan says no — keep looking to be safe; check pykep's plotting, GMAT's OpenGL views, and anything recent on GitHub before asserting it to a professor.)

## Track 4 — Mission design & transfers (Phase B/C math)

**Goal:** working knowledge of how interplanetary trajectories are computed, enough to design the optimizer's inputs honestly.

Reading, in order:
1. **Curtis Ch. 5 (Lambert's problem)** and **Ch. 8 (interplanetary — patched conics, spheres of influence, planetary departure/arrival)**.
2. **Vis-viva and Hohmann** as anchors (memorize LEO→GEO ≈ 3.9 km/s; Earth→Mars Hohmann ≈ 258.9 days ≈ 8.5 months — real windows are 300–320 day Type II transfers, not Hohmann).
3. **Porkchop plots**: JPL's mission-design primers and pykep's porkchop tutorial; understand C3, v∞, arrival vs departure energy, synodic banding (Earth–Mars ≈ 780 days).
4. **Izzo's Lambert algorithm** (2015 paper "Revisiting Lambert's problem") — the modern solver everyone uses; skim for structure, use via pykep.
5. **Δv maps/subway maps** of the solar system (community-maintained charts) — the edge weights of any logistics graph; note their impulsive/no-plane-change assumptions.
6. Later, as needed: **CR3BP basics** (Lagrange points, halo orbits/NRHO, ballistic lunar transfers) — the cislunar fidelity step; **low-thrust trajectories** (electric propulsion — different optimization world, mention-only for now).

Questions to answer:
- Given two dates, what exactly does one Lambert solve return, and how do its v∞ values become the Δv numbers on a porkchop?
- Why do launch windows recur, and what sets their cadence per planet pair?
- Which fidelity shortcuts are acceptable for a v1 (ignore planetary capture spirals? impulsive burns only?) and how should the UI disclose them?

## Track 5 — Multi-objective search (the professor's own field)

**Goal:** speak his research language; be ready to formulate the Phase C graph problem the way his papers do.

Reading, in order:
1. **EMOA\*** — Ren, Hernández, Likhachev, Felner, Koenig, Salzman, Rathinam, Choset, "EMOA*: A framework for search-based multi-objective path planning," *Artificial Intelligence* 2025 (the consolidated version; SoCS 2022 for the short read). Focus: the label/frontier-set machinery, lazy dominance checks, the BBST trick.
2. **BOA\*** — Hernández et al., "Simple and efficient bi-objective search" (the 2-objective ancestor whose O(1) dominance check EMOA* generalizes).
3. **MOPBD\*** ("Multi-Objective Path-Based D* Lite") — Ren, Rathinam, Likhachev, Choset, RA-L 2022 (incremental replanning — the "launch slipped, repair the front" story). Use the MOPBD* name; "MOD* Lite" is a different 2015/2016 algorithm it baselines against.
4. **MO-CBS / MOM\*** — Ren, Rathinam, Choset (multi-agent — the fleet/campaign extension).
5. The 2025 survey "Multi-Objective Search: Algorithms, Applications, and Emerging Directions" (arXiv) — the field map, including approximate-front variants with guarantees (relevant if time-expanded graphs blow up).
6. The **`public_emoa` repo** — build it, run the included examples, understand its input format (graph with vector edge costs). License status: **no LICENSE file on any branch** — all-rights-reserved by default; get terms from the professor in writing (keep it an optional plugin, never vendored into an MIT repo).
7. For contrast: skim how **pygmo/evolutionary** methods attack the same problems (approximate, population-based) — the comparison a paper would draw.

Questions to answer:
- Why does weighted-sum A* provably miss non-convex Pareto points, and which space-transfer solutions live there (ballistic lunar transfers)?
- What makes dominance checking the bottleneck, and what exactly does the BBST buy?
- What would a benchmark instance set from this domain look like (graph sizes, objective counts) that the SoCS community would care about?

## Track 6 — Space logistics & the research frame (for the paper conversation)

**Goal:** know the adjacent academic field so the project's novelty claim survives review.

Reading, survey-level now:
1. **Georgia Tech Space Systems Optimization Group** (Koki Ho) publications page — time-expanded network formulations of Earth–Moon logistics, generalized multi-commodity flow, MILP solutions. This is the established "space logistics" school; the project's differentiator is exact multi-objective *graph search* + interactive viz.
2. **NASA Trajectory Browser** (web) — precomputed Earth→body trajectories; study its query model (what users ask for) as UX research.
3. **GTOC** (Global Trajectory Optimization Competition) problem statements — what expert-level interplanetary optimization looks like; pykep was built for these.
4. Starship-era logistics color: HLS multi-tanker refueling architecture articles — why "depot routing" is suddenly real (also the SpaceX-application talking point).
5. If cislunar becomes the focus: the Δv/time tradeoffs of ballistic lunar transfers, NRHO (Gateway), and EML staging — `rathinam_project_deep_dive.md` §4 has the starter table.

Questions to answer:
- How does the time-expanded-network formulation map onto EMOA*'s input, and where does it explode (time resolution × node count)?
- What's the crispest one-paragraph novelty claim vs. the GT/MILP school and vs. porkchop-only tools?
- Tool paper, benchmark paper, or methods paper — which does the evidence support first? (Deep-dive doc §7 argues: tool/benchmark first.)

## Suggested reading order (first 3 weeks, ~5 hrs/wk)

- **Week 1:** Track 1 items 1–2 (Curtis ch. 2–4) + Track 3 item 1 (satvis source). End state: Phase-0 demo math understood; satvis architecture sketched in a notebook.
- **Week 2:** Track 2 (TLE/SGP4/frames) + Track 3 items 2–6 + 9. End state: can build A1 (real ISS on a globe) without frame bugs; landscape one-pager for Rathinam done.
- **Week 3:** Track 5 items 1–2 (EMOA*, BOA*) + Track 4 items 1–3 (Lambert, porkchop). End state: can discuss Phase C credibly in a Monday meeting; ready to propose the v1 build formally.

---
---

# PART III — IMPLEMENTATION GUIDE (reference for coding agents)

Guiding taste: **satvis.space is the bar for polish and architecture; NASA Eyes is the bar for wonder.** When in doubt, ship the smaller thing that looks great and is verifiably correct.

## 1. Domain math you actually need

### 1.1 The six classical elements → position

| Element | Symbol | Meaning |
|---|---|---|
| Semi-major axis | a | size |
| Eccentricity | e | shape (0 ≤ e < 1 closed) |
| Inclination | i | tilt vs. equatorial plane |
| RAAN | Ω | node line direction from vernal equinox |
| Argument of periapsis | ω | node → periapsis angle, in-plane |
| True anomaly | θ | periapsis → satellite angle |

Position algorithm: (1) `r = a(1−e²)/(1+e·cosθ)`; (2) perifocal `x=r·cosθ, y=r·sinθ`; (3) rotate perifocal→ECI with `Q = Rz(Ω)·Rx(i)·Rz(ω)` (active convention — verified against Curtis Example 4.7; the §6.1 code implements exactly this and is the reference).

Position vs. **time**: mean motion `n=√(μ/a³)` (μ⊕≈398600.4418 km³/s²); `M = M₀+n·Δt`; solve Kepler `M = E − e·sinE` (Newton, ~5 iterations, seed E₀=M); `tan(θ/2)=√((1+e)/(1−e))·tan(E/2)`; feed θ above. This ~40-line pipeline is the Phase-0 seed and stays in the repo as the first-principles reference.

### 1.2 TLEs & SGP4
- TLE mean elements are **only** valid through SGP4 (J2, drag/BSTAR); never feed them to the Keplerian pipeline for real satellites. Keplerian pipeline = teaching displays, synthetic scenarios, interplanetary conics.
- SGP4 outputs **TEME**; convert (satellite.js `gstime` + `eciToEcf`/`eciToGeodetic`) before rendering — frame confusion is the #1 "orbit looks wrong" bug.
- Staleness, measured: LEO/ISS elements reach ~1 globe-pixel of error in 3–4 days; GEO in 1–3 weeks absent maneuvers. Nightly CelesTrak pulls suffice at globe zoom; ISS needs 6–12 h pulls only at regional zoom. Respect the 2-hour/403 fetch policy (§2).

### 1.3 Transfers (Phase C)
- **Vis-viva**: `v² = μ(2/r − 1/a)`; all Δv arithmetic starts here.
- **Hohmann** r₁→r₂: a_t=(r₁+r₂)/2; anchor: LEO→GEO ≈ 3.9 km/s.
- **Lambert**: two positions + time of flight → connecting conic; one solve per (departure, arrival) pair; use pykep (Izzo) or a vetted JS port.
- **Porkchop**: Lambert grid over departure×arrival dates contoured by Δv/C3 — the signature interactive candidate (hover cell → arc in 3D).
- **Patched conics**: Sun-centered conic between SOIs; v1 may report v∞ sums and skip planetary spirals — label fidelity honestly.
- **Multi-objective layer**: nodes = (body, window), edges = Lambert arcs with vector costs (Δv, ToF, …); EMOA* returns the exact Pareto front. Weighted-sum A* provably misses non-convex points (e.g., ballistic lunar transfers) — the exactness claim is the differentiator. Full treatment: `rathinam_project_deep_dive.md`.

### 1.4 Credibility vocabulary
Epoch, osculating elements, ECI/ECEF/TEME, J2, C3 (km²/s²), v∞, SOI, synodic period (Earth–Mars ≈ 780 d), ephemeris, ground-track drift, knee solution, cost-unique Pareto set, dominance check, frontier set.

## 2. Data sources

| Data | Source | Notes |
|---|---|---|
| Satellite elements | CelesTrak `gp.php` — **prefer `FORMAT=json` (OMM) or CSV over TLE text**: the fixed 5-digit TLE catalog field overflowed when USSF numbers passed 100000 (2026-07-11). Groups: starlink, oneweb, weather, gnss, active…; `CATNR=25544` for ISS | free, no key — but CelesTrak enforces a 2-hour update cadence and (since 2026-03-26) returns **HTTP 403 on repeat downloads**; a naive dev-loop fetcher can get an IP blocked. Cache on disk; fetch ≤ once per 2 h per query. Refresh reality: LEO reaches ~1 globe-pixel error in 3–4 days; GEO in 1–3 weeks — nightly pulls suffice at globe zoom |
| Planet ephemerides | JPL Horizons API `https://ssd.jpl.nasa.gov/api/horizons.api`; simpler: analytic (VSOP87/Meeus) or pykep `jpl_lp` | analytic is plenty for viz |
| High-precision geometry | NAIF SPICE kernels (+ spiceypy) | Phase C+ only |
| Δv edge weights | published Δv subway maps | cite in-repo; impulsive assumptions |
| 3D models / imagery | satvis `data/`, NASA 3D resources; Cesium ion (token) or NaturalEarth/OSM (token-free) | default token-free so cloning Just Works |

## 3. Library shelf

**Browser:** `cesium` (globe engine; entities, SampledPositionProperty, clock), `satellite.js` (SGP4 + frames — the Earth-orbit heart), `three.js` (heliocentric scene), `d3` (porkchop heatmap, Pareto plots). **spacekit.js: do NOT build on it** — pinned to three.js r0.135 (WebGL1, removed at r163), fixed 2018 planetary elements (Saturn already 0.38° off), float32 AU coords (~17.8 km precision at 1 AU); borrow its Ephem/KeplerParticles patterns under MIT instead.
**Python:** `pykep` (MPL-2.0, active — Lambert/ephemerides/porkchop, the Phase C engine), `pygmo` (evolutionary contrast/benchmarks), `skyfield` + `sgp4` (validation oracles), `lamberthub` (pure-Python Lambert oracle). **poliastro is archived (2023-10-14) and hapsira dormant (~2.3 yrs)** — do not depend on either.
**Professor's:** `public_emoa` (C++ exact MO-A*). Integration options: WASM (keeps serverless story), thin Python service, or TS reimplementation (deepest learning — ask him which he'd value). **License: the repo has NO LICENSE file on any branch** (README carries a usage/citation statement only) — treat as all-rights-reserved unless he grants terms in writing; optional plugin only, never vendored into an MIT repo.

## 4. Architecture options (tradeoffs, not verdicts)

**Rendering fork:**
- **A. Cesium-only** — fastest to satvis parity (imagery/terrain/clock free; satvis source as guide); Earth-locked, fights heliocentric scenes. Fine Phase A, ceiling by B.
- **B. Three.js-only** — one engine LEO→Mars, total visual control ("visually appealing" favors this); re-implements Earth basics; cheaper if the aesthetic is stylized not photoreal.
- **C. Dual-scene** — Cesium (Earth mode) + Three.js (solar-system mode), shared UI shell; most capability, most surface area.
- Reasonable default: **start A, keep the render layer behind an interface, prototype B on the side before committing.** satvis's Satellite→components pattern ports across engines if renderer calls are isolated.

**Other defaults:** propagation in a **web worker** (satvis does; 60fps with thousands of satellites); sample into interpolated position properties rather than per-frame propagation for tracked objects. Framework: React (Surya's skills) or Vue (satvis's) — 3D scene lives outside the re-render cycle either way. **URL-encoded scenario state from day one** (cheap early, hard to retrofit, makes every demo shareable). Serverless static hosting (Vercel) until a Python service is unavoidable — WASM can defer that indefinitely. Aesthetic: **stylized instrument** (dark scene, glowing orbit lines, clean type) over photoreal — cheaper, harder to get wrong, fits the eventual routes-and-Pareto content.

**Module seams (name them anything, keep the seams):**
```
core/        elements, frames, time, constants
propagation/ sgp4 adapter, kepler propagator, worker glue
data/        tle fetch/cache/parse, ephemerides, catalogs
scene/       renderer interface + cesium/ (+ later three/)
ui/          panels, search, timeline, settings
optimize/    lambert, porkchop, graph builder + emoa adapter
```
Iron rule worth keeping: nothing in `core/`, `data/`, `optimize/` imports from `scene/` — math stays headless-testable, renderer stays swappable.

## 5. Phased build map (waypoints, not a schedule)

- **Phase 0 (weekend-sized):** the notebook pages as code — elements→position pipeline, one orbit around a sphere-Earth, animated via Kepler's equation, sliders for (a,e,i,Ω,ω). Deploy. Proves the lecture landed; starts the repo. Validate vs satellite.js first.
- **A1:** real ISS on a Cesium globe from a live TLE — orbit line, ground track, live lat/lon/alt/vel, element panel (satvis's info box is the professor's lecture as UI — mirror it).
- **A2:** catalog groups + search; per-satellite component toggles; URL state.
- **A3:** time controls; worker propagation for hundreds–thousands; performance pass (Starlink group = the stress test). Differentiators over parity: element-sandbox teaching mode, guided "what am I looking at," better visual design.
- **B1:** heliocentric scene; planets from analytic ephemerides; log-scale distance toggle (true scale reads as empty blackness — the toggle is standard practice, not cheating).
- **B2:** one precomputed Earth→Mars Lambert arc rendered with markers.
- **C1:** interactive porkchop for a planet pair; hover→arc renders; click→pin/compare. **The signature demo.**
- **C2:** transfer-network graph + EMOA* → Pareto panel linked to 3D routes.
- **C3:** benchmarks, comparisons (EMOA* vs weighted-sum vs pygmo), write-up.

Never be more than two weeks from a demoable increment; every Monday 3 PM gets a demo.

## 6. Code sketches (starting points, not gospel)

### 6.1 Elements → ECI (Phase-0 seed)
```js
const MU_EARTH = 398600.4418; // km^3/s^2

function solveKepler(M, e, tol = 1e-10) {
  // Vallado seed: zero failures up to e=0.9999 (tested in research/scripts/T1_2_kepler.py;
  // the naive "M if e<0.8 else pi" seed fails ~6.7% of cases at high e)
  let E = (M > -Math.PI && M < 0) ? M - e : M + e;
  for (let k = 0; k < 30; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < tol) break;
  }
  return E;
}

// elements: {a km, e, i, raan, argp, M0} radians; t sec since epoch
function elementsToECI({ a, e, i, raan, argp, M0 }, t) {
  const n = Math.sqrt(MU_EARTH / (a * a * a));
  const M = M0 + n * t;
  const E = solveKepler(((M % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI), e);
  const theta = 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2)
  );
  const r = (a * (1 - e * e)) / (1 + e * Math.cos(theta)); // the circled equation
  const xp = r * Math.cos(theta), yp = r * Math.sin(theta);
  const [cO, sO] = [Math.cos(raan), Math.sin(raan)];
  const [ci, si] = [Math.cos(i), Math.sin(i)];
  const [cw, sw] = [Math.cos(argp), Math.sin(argp)];
  return {
    x: (cO*cw - sO*sw*ci) * xp + (-cO*sw - sO*cw*ci) * yp,
    y: (sO*cw + cO*sw*ci) * xp + (-sO*sw + cO*cw*ci) * yp,
    z: (sw*si) * xp + (cw*si) * yp,
  }; // km, ECI
}
```
Validation: ISS-like (a≈6795 km, e≈0.0005, i≈51.6°) → |r|≈6790–6800 km, speed ≈7.66 km/s (numerical derivative). Cross-check a revolution against satellite.js on a fresh TLE; expect km-scale SGP4-vs-Kepler differences — document, don't chase.

### 6.2 TLE → Cesium (A1 spine)
```js
import * as satellite from "satellite.js";
const rec = satellite.twoline2satrec(tle1, tle2);
function positionAt(date) {
  const pv = satellite.propagate(rec, date);      // TEME, km
  const gmst = satellite.gstime(date);
  return satellite.eciToEcf(pv.position, gmst);   // ECEF for a fixed-Earth scene
}
// Sample over ±1 period into SampledPositionProperty; attach point/label/polyline; drive viewer.clock.
```

### 6.3 Porkchop (C1, pykep flavor)
```python
import pykep as pk, numpy as np
earth, mars = pk.planet.jpl_lp("earth"), pk.planet.jpl_lp("mars")
def total_dv(t_dep, tof_days):
    r1, v1 = earth.eph(pk.epoch(t_dep))
    r2, v2 = mars.eph(pk.epoch(t_dep + tof_days))
    l = pk.lambert_problem(r1, r2, tof_days*86400, pk.MU_SUN)
    return (np.linalg.norm(np.array(l.get_v1()[0]) - v1) +
            np.linalg.norm(np.array(l.get_v2()[0]) - v2))
# grid departure x TOF -> heatmap; expect ~780-day synodic banding
```

### 6.4 EMOA* surface (C2)
Graph builder emits plain serializable `{nodes, edges:[{u,v,cost:[dv,tof,...]}]}`; solver backend (WASM C++, service, or TS port) is swappable behind that seam — same philosophy as the renderer.

## 7. Correctness & testing

- **Oracles, not eyeballs:** satellite.js vs python-sgp4 vs Skyfield; Lambert vs pykep; Hohmann vs hand calc. Automated, headless (the core/scene seam enables this).
- **Known-answer anchors:** LEO→GEO Hohmann ≈ 3.9 km/s; ISS period ≈ 92.9–93.0 min; ISS ground track shifts ~23.5° westward per orbit (23.3° Earth rotation + ~0.3° J2 nodal regression); porkchop banding ≈ 780 d; good-window Earth→Mars v∞ sums ≈ 5.6–6 km/s (2026 window: depart Oct 29, C3 = 9.3 km²/s², v∞ sum 5.6 — computed in `research/scripts/T4_3_porkchop.py`).
- **Bug class #1 — frames** (TEME/ECI/ECEF): symptom is precessing orbits or drifting ground tracks.
- **Bug class #2 — units** (km vs m — satellite.js is km+rad, Cesium is meters; degrees vs radians): enforce at module boundaries.
- **Bug class #3 — time** (UTC/Julian/GMST): use library time types (Cesium `JulianDate`), never hand-rolled timezone math.
- Golden screenshots per release; performance budget checked with full Starlink loaded.

## 8. Pitfalls & lore

- No TLEs into the Keplerian pipeline; no hand-rolled SGP4.
- Default to token-free imagery so `git clone && pnpm dev` works for strangers.
- Multi-rev / short-long-way Lambert branches: take sensible minimum now, expose the choice later.
- WASM-compiling pykep is painful (C++/boost); a thin service or pure-JS Izzo port is likely less pain for C1 — decide when there.
- `public_emoa` has **no license file** — all-rights-reserved by default; get terms from the professor in writing before distributing anything built on it.
- BBST nuance for the paper conversation: the balanced-tree frontier is an asymptotic win only at exactly 3 objectives; AIJ 2025's own experiments favor a sorted-array + binary-search variant (Late-BS) in every tested case.
- The professor is ME: SI units, km, proper element names in the UI earn trust.
- Scope guard: "visually appealing" is a requirement, "photoreal" is not.

## 9. Reference shelf

Curtis (ch. 2–5, 8) · Vallado (frames/SGP4 lore) · EMOA* AIJ 2025 + SoCS 2022 + `public_emoa` · MO-D* Lite RA-L 2022 · MO-CBS · 2025 MO-search survey (arXiv) · satvis source (`next` branch: `src/`, `worker/`) · pykep docs/tutorials (esa.github.io/pykep) · CelesTrak format docs · JPL Horizons API docs · NAIF SPICE tutorials · Visual bars: satvis.space, NASA Eyes, app.keeptrack.space, stuffin.space.

---

*Companion material: the `research/` folder (executed Part II — track docs, gap statement, one-pager, scripts) is the primary evidence base and supersedes earlier session docs (`rathinam_field_research.md`, `rathinam_project_deep_dive.md`, `rathinam_meeting2_prep.md` — not present in this folder; their satvis teardown and cislunar Δv table were redone from scratch in Tracks 3 and 6). This master file supersedes `rathinam_project_scope.md` and `rathinam_implementation_guide.md` where they differ. Errata applied Sep 2, 2026 per `research/01_master_doc_errata.md`.*
