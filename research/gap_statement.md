# Gap Analysis: Open-Source Interactive 3D Trajectory Optimization

Prepared for Surya Thirukonda's Monday meeting with Prof. Sivakumar Rathinam, Sep 1, 2026.
Basis: five independent research sweeps (github, academic, tools, webapps, recent) plus a follow-up
verification pass in this task that re-read cached READMEs, re-fetched two repos live, and attempted
GitHub API re-verification for nine repos (blocked by rate limiting; noted in Search Coverage below).

---

## 1. The gap statement (defensible, with qualifiers)

As of September 2026, no **actively maintained, properly open-licensed, community-adopted** project
couples a **genuine trajectory optimizer** to an **interactive 3D real-solar-system viewer** inside one
running application, and **none at all**, mature or not, couple a **multi-objective / Pareto-front**
optimizer (the EMOA*-class exact search that is Prof. Rathinam's own research area) to any interactive
3D view. Read the qualifiers literally, because each one is load-bearing: "**coupled**" means a selection
or computation made in the optimization UI live-updates the 3D render inside the same running app (not a
separate offline script, a one-directional export, or a static image generated per selection); "**interactive
3D**" means a real-time, navigable (orbit/pan/zoom/scrub) WebGL or OpenGL scene, not a static matplotlib
Axes3D figure or a one-shot Plotly HTML file; "**open source**" means a real OSI-style license (MIT, BSD,
Apache, GPL, EUPL, etc.) is actually present and redistribution/modification rights follow, not merely a
public GitHub repository with no LICENSE file (which defaults to all-rights-reserved) or a government/commercial
restricted-release binary; "**optimization**" means an actual search or optimization procedure over a
solution space (a Lambert/porkchop date-grid search, a gravity-assist sequencer, an NLP trajectory optimizer,
a differential-evolution or NSGA-II solver), not mere propagation or rendering of a precomputed path;
"**real solar system**" means the tool's default, primary target is the actual Sun and planets using real
ephemerides (JPL/Horizons, DE-series, Meeus, or J2000 mean elements), not a fictional or rescaled game system
(Kerbal Space Program's Kerbol) that happens to support a realism mod. Four hobbyist repositories created in the
last ~4-5 months of 2026 (chipi/orrery, kevinkicho/k-solar-system-navigator, abc000cool/porkchop-mission-planner,
tamiralmas/Orbital-Simulation) come close to satisfying open-source + interactive-3D + optimization + coupled +
real-solar-system simultaneously for the **single-objective** case, which means the narrowest possible version
of "nobody has coupled a Lambert porkchop plot to a 3D solar system view in open source" is no longer strictly
true and should not be claimed to Prof. Rathinam without the maturity caveat; what remains true and defensible
is that every one of those near-matches has zero-to-three GitHub stars, no citations, no institutional backing,
and (in three of the four) an explicit disclosure of heavy AI-assisted authorship with no independent review,
while every mature, institutionally-backed, or long-running tool checked (GMAT, pykep, EMTG, Copernicus,
poliastro/hapsira, GODOT, ESA STA) either has no interactive 3D coupling at all or, in GMAT's single
partial exception, couples the optimizer's iterations *into* the 3D view as an output/monitor rather than
letting the user *design through* the 3D view, and not one of them, anywhere, implements exact multi-objective
search. That combination, a multi-objective (EMOA*-style) route optimizer wired live to an interactive 3D
real-solar-system viewer, appears absent from the open-source landscape entirely, which is where this
project's genuine novelty lives.

---

## 2. Comparison table (nontrivial candidates, deduplicated across all five sweeps)

Legend: OSS = open source (license actually present and applicable); Int3D = interactive 3D; Opt = optimization present; Coupled = optimizer output live-drives the 3D view in one running app; RSS = real solar system is the default/primary target (not a game).

| Name | URL | Licence | OSS? | Int3D? | Optimization | Coupled? | RSS vs. game | Activity | Threat (my assessment) |
|---|---|---|---|---|---|---|---|---|---|
| kevinkicho/k-solar-system-navigator (HELIOS) | github.com/kevinkicho/k-solar-system-navigator | MIT (verified live) | Yes | Yes (Three.js) | Lambert + porkchop grid search, single-objective | Yes (click cell / auto-min drives dates -> 3D) | Real solar system (DE440s-class ephemeris) | 0 stars, 0 forks (verified live); created 2026-04-22, last push 2026-08-05 | High as prior art, low as competitive threat (unstarred, solo, discloses heavy AI authorship) |
| chipi/orrery | github.com/chipi/orrery | MIT (verified live) | Yes | Yes (Three.js) | Lambert porkchop grid, single-objective | Yes (/plan cell click -> /fly Keplerian arc) | Real solar system (8 planets, dwarf planets, 113 real missions) | 3 stars, 1 fork (verified live); created 2026-04-26, daily commits through 2026-09-01 | High as prior art, low as competitive threat (3 stars, AI-assisted dev artifacts in repo) |
| abc000cool/porkchop-mission-planner | github.com/abc000cool/porkchop-mission-planner | None (no LICENSE file; package.json "private": true) | **No** (public code, all-rights-reserved by default) | Yes (React Three Fiber) | Lambert porkchop + coordinate-descent multi-flyby Grand Tour, single-objective | Yes (src/App.tsx: onSelect -> setLocked -> SolarSystem3D) | Real solar system | 0 stars; created 2026-07-10, last push 2026-08-15, 9 commits | High as prior art, disqualified on the open-source prong |
| tamiralmas/Orbital-Simulation | github.com/tamiralmas/Orbital-Simulation | MIT per README; GitHub API reports NOASSERTION (nonstandard LICENSE text) | Ambiguous | Yes (custom painter-sorted canvas, not WebGL) | Lambert porkchop + B-plane/insertion targeting, single-objective, local only | Yes (explicit "Apply" button) | Real solar system, but ephemeris table is bounded to 2026-06-27..2026-08-26 only | 0 stars; created 2026-07-14, last push 2026-07-18, 10 commits | High as prior art, weakened by narrow ephemeris validity window |
| nmisyats/KSP-MGA-Planner | github.com/nmisyats/KSP-MGA-Planner | GPL-3.0 | Yes | Yes (Three.js) | Differential-evolution global multi-gravity-assist optimizer (pykep/Ceriotti-derived), single-objective | Yes (optimized sequence shown in 3D window) | KSP/Kerbol default; real-solar-system data present in unshipped config (data/rss/) | 47 stars, 43 forks; created 2021-08-15, last push 2026-06-08 | Medium; most mature coupled tool found, but game-branded |
| mtepenner/trajectory-porkchop-generator | github.com/mtepenner/trajectory-porkchop-generator | MIT | Yes | Yes (Three.js) | Lambert porkchop grid (Izzo), single-objective | Documented in source (App.tsx: fetchPath -> SolarSystem3D) | Real solar system | 0 stars; created 2026-04-27, last push 2026-05-14, 6 commits, requires Docker backend, no live demo | Medium (unreachable without self-hosting) |
| Zyzzbarth333/digital-orrery | github.com/Zyzzbarth333/digital-orrery | MIT | Yes | Yes (Three.js) | Lambert transfer estimates | README admits porkchop grid not yet wired to the verified core | Real solar system | 0 stars; created 2025-06-13, last push 2026-07-06, 8 commits | Low-medium (coupling explicitly unfinished) |
| zangjiucheng/orbitopt | github.com/zangjiucheng/orbitopt | GPL-3.0-or-later | Yes | Yes (PySide6/PyVista desktop) | pykep/pygmo global optimization (Lambert/MGA), plus tudatpy verification | No (sequential: `run` writes JSON, `view` opens it; not live) | Real solar system | 1 star; created 2026-07-15, last push 2026-07-23, 55 commits | Medium (strong optimizer, no live coupling) |
| pleiszenburg/hapsira (poliastro fork) | github.com/pleiszenburg/hapsira | MIT | Yes | Yes (Plotly OrbitPlotter, separate code path) | Lambert/porkchop via matplotlib (static), no optimizer | No (porkchop and 3D plotter are unconnected modules) | Real solar system | 42 stars; last push 2024-05-09 (dormant); poliastro upstream archived 2023-10-14 | Low (dormant, not coupled) |
| esa/pykep + esa/pygmo | github.com/esa/pykep, esa/pygmo2 | MPL-2.0 | Yes | No (matplotlib Axes3D static plots only) | Lambert, MGA, Sims-Flanagan/low-thrust, indirect methods; pygmo global/multi-objective (NSGA-II, MOEA/D) optimization | No (no GUI at all) | Real solar system | pykep 422 stars, last push 2026-07-07; pygmo2 534 stars, last push 2026-04-17 | Low as viz threat, but the strongest algorithmic library to borrow from |
| nasa/GMAT | github.com/nasa/GMAT | Apache-2.0 | Yes | Yes (OrbitView OpenGL + OpenFramesInterface plugin) | Full NLP trajectory optimization/targeting (Yukon, VF13ad, SNOPT-class), single-objective | Output-coupled only (SolverIterations All/Current/None plots iterations live; not a design-by-interacting-with-3D surface) | Real solar system | 94 stars on GitHub mirror, longer SourceForge/NASA history; R2026a released 2026-04-03/05-06, actively maintained | Medium; the most credible institutional near-match |
| nasa/EMTG + PyEMTG | github.com/nasa/EMTG | NASA Open Source Agreement (NOSA, OSI-approved but non-GPL/MIT-compatible) | Yes | No (wxPython GUI calls matplotlib post-process only) | Global low-thrust/impulsive MGA optimization (monotonic basin hopping + SNOPT/IPOPT) | No (one-directional: optimize, then plot) | Real solar system | 89 stars; last push 2024-11-08, v9.02 | Low as viz threat, high as optimizer-algorithm reference |
| NASA Copernicus (JSC) | nasa.gov/general/copernicus, software.nasa.gov/software/MSC-26673-1 | U.S. Government Purpose Release (restricted distribution on request) | **No** | Yes (OpenFrames-based interactive 3D) | NLP trajectory optimization (SNOPT/IPOPT), finite burn, CR3BP | Yes, per documentation | Real solar system | v5.4.1 released 2026-05-26 | Low as open-source threat (not distributable), high as a coupling exemplar |
| ESA Space Trajectory Analysis (STA) | github.com/toxygen/STA (SourceForge mirror) | EUPL v1.1 (per 2010 paper); GitHub mirror labeled GPL-2.0-or-later | Yes | Yes (Celestia-based OpenGL) | NSGA-II multi-objective optimizer module (the only multi-objective + 3D match found anywhere) | Claimed ("real-time porkchop" in a 2008 abstract), unverified in surviving source | Real solar system | Abandoned; mirror's last commit 2013-02-25, 6 stars | Low (dead, unverifiable claim), historically important |
| Ansys STK / Astrogator | help.agi.com/stk | Commercial | No | Yes | Differential-corrector targeting + optimizer profiles (SNOPT/IPOPT-class) | Yes ("the iterations, the last one placing the satellite at the desired location" drawn live in the 3D window) | Real solar system | Actively sold, STK 12.x | None as OSS threat, useful coupling-UX reference |
| a.i. solutions FreeFlyer | ai-solutions.com/freeflyer | Commercial (free university license) | No | Yes | NLP optimization (Ipopt/NLopt/SNOPT) | Yes ("Views, Plots, and Reporting... behave the same way within an optimization loop" per vendor docs) | Real solar system | FreeFlyer 8 / 7.6, 2024-2026 | None as OSS threat, useful coupling-UX reference |
| Arrowstar/ksptot | github.com/Arrowstar/ksptot | Custom "Other" license, no SPDX, GitHub reports NOASSERTION | Ambiguous | Yes (MATLAB-runtime "geometry suite") | Gravity-assist/rendezvous optimization, multi-flyby sequencer, porkchop | Yes | KSP/Kerbol default; RSS via mods | 136 stars; last push 2026-08-31, 7+ years running | Low-medium (mature but game-first, license unclear) |
| MuMech/MechJeb2 | github.com/MuMech/MechJeb2 | GitHub reports NOASSERTION (mixed GPL/MIT components) | Ambiguous | Yes (in-game map view) | Lambert porkchop, "lowest dV" auto-pick | Yes (click plot -> maneuver node) | KSP/Kerbol default; RSS via mods | 1,126 stars; last push 2026-08-08 | Low (game-only, license mixed) |
| alexmoon/ksp (Launch Window Planner) | github.com/alexmoon/ksp | CC BY-NC-SA 4.0 (non-commercial; not OSI open source) | **No** | No (2D porkchop only) | Lambert porkchop grid, interactively explorable | Yes (click point -> burn plan) | KSP/Kerbol default; RSS option exists | 195 stars, 87 forks; archived, last push 2019-08-28 | Low as current threat, high as UX reference |
| TriggerAu/TransferWindowPlanner, Nazfib/TransferWindowPlanner2 | github.com/TriggerAu/..., Nazfib/... | MIT (both) | Yes | No (in-game 2D plot) | Lambert porkchop | Yes (click plot -> maneuver node), tested with RSS | KSP default, RSS-testable | TWP: 66 stars, last push 2022-04-12; TWP2: 10 stars, last push 2026-06-02 | Low |
| Orbiter Space Flight Simulator (+ TransX/IMFD) | github.com/orbitersim/orbiter | Orbiter core MIT; TransX/IMFD closed source | Partial | Yes | None automated (manual MFD-based planning only) | No (manual dial-turning, no optimizer) | Real solar system | ~1,977 stars; last push 2026-08-10 | Low (no optimizer at all) |
| OpenSpace | github.com/OpenSpace-Project/OpenSpace | Custom/NOASSERTION | Yes | Yes (flagship real-time 3D, NASA/AMNH-backed) | None | No | Real solar system and beyond | 1,242 stars; very actively maintained, last push 2026-09-01 | None (pure visualization) |
| claurel/cosmographia (NAIF SPICE viewer) | github.com/claurel/cosmographia | Apache-2.0 (core) | Yes | Yes | None | No | Real solar system | 28 stars; last push 2017-12-05 | None |
| typpo/spacekit.js | github.com/typpo/spacekit | MIT | Yes | Yes | None | No | Real solar system | 581 stars; last push 2026-04-10 | None |
| hyqzz/Solar-Wanderer | github.com/hyqzz/Solar-Wanderer | MIT | Yes | Yes | None | No | Real solar system | 729 stars; last push 2026-08-23 | None |
| AVSLab/basilisk + Vizard | github.com/AVSLab/basilisk | Basilisk ISC (core); Vizard freeware binary | Partial | Yes | None (GNC simulation, no trajectory optimizer) | No | Real solar system | 375 stars; last push 2026-09-01 | None |
| nyx-space/nyx | github.com/nyx-space/nyx | AGPL-3.0 (dual commercial) | Yes | No | Targeting, multiple shooting, low-thrust guidance laws | No | Real solar system | 483 stars; last push 2026-09-01 | None as viz threat |
| tudat-team/tudatpy | github.com/tudat-team/tudatpy | BSD-3-Clause | Yes | No | MGA/DSM, shape-based low-thrust, pygmo optimization | No | Real solar system | 88 stars; last push 2026-09-01 | None as viz threat |
| ESA GODOT | godot.io.esa.int | ESA Software Community Licence v2.4 (member-states only) | **No** | No | Trajectory/orbit optimization (used for Juice, Hera) | No | Real solar system | v1.20.0 docs 2026-08-27 | None (not distributable) |
| CS-SI/Orekit | github.com/CS-SI/Orekit | Apache-2.0 | Yes | No | None (OD/maneuver models only) | No | Real solar system | 291 stars; last push 2026-08-31 | None |
| NASA Ames Trajectory Browser | trajbrowser.arc.nasa.gov | Proprietary NASA web service | No | Yes | Precomputed constraint search over a trajectory database | Yes (query -> 3D trajectory viewer) | Real solar system | Institutionally hosted; no source available | None as OSS threat, useful UX reference |
| NASA Eyes on the Solar System | eyes.nasa.gov | Proprietary | No | Yes | None | No | Real solar system | Actively maintained by JPL | None |

Rows condensed from roughly 90 distinct candidate mentions across the five sweeps after removing duplicates (the same repo surfaced independently in 2-4 sweeps in most cases, which itself is a useful cross-validation signal) and pure noise (unrelated name collisions such as "porkchop" matching a Cheap-Yellow-Display flasher, or "orbit planner" matching daily-planner apps).

---

## 3. Ranked nearest neighbours

1. **kevinkicho/k-solar-system-navigator (HELIOS)** - closest functional match found. Borrow: the
   workerized porkchop grid-search UX where a cell click or an auto-selected minimum drives departure/arrival
   dates into the render; the "physics/visuals decoupling" discipline (cinematic tilt is display-only, all
   delta-v math uses real inclinations); parent-centered Lambert solves for same-SOI pairs (Europa->Io,
   Earth->Moon) instead of a dishonest heliocentric half-orbit; and the validation-script culture
   (`npm run validate` against Vallado 7-5, Perseverance C3, and synodic-period checks) as a template for
   keeping an ME professor's confidence. Falls short: single-objective grid search only, zero stars/citations,
   solo-authored, disclosed as substantially AI-generated code with no independent review, and the whole
   project's history sits inside the same four months as this research task.

2. **chipi/orrery** - second-closest match. Borrow: the two-step `/plan` (porkchop) -> `/fly` (true two-point
   Keplerian arc, Sun pinned at one focus, endpoints pinned to live planet positions) interaction flow as a
   reference for how to make a click-through feel causal rather than cosmetic; the ADR-driven documentation
   discipline and the 113-real-mission historical overlay as content-design ideas; the i18n/accessibility
   investment (14 locales, Axe-core CI) as a bar for "visually appealing" that goes beyond graphics. Falls
   short: same single-objective ceiling, 3 stars, and the repo's own CLAUDE.md/.cursor/AGENTS.md files disclose
   AI-assisted development with no external audit trail.

3. **nmisyats/KSP-MGA-Planner** - the most institutionally mature coupled interactive-3D optimizer found (47
   stars, 43 forks, five years of history, last pushed 2026-06-08). Borrow: its differential-evolution global
   multi-gravity-assist optimizer, grounded in Ceriotti's 2010 thesis and adapted from ESA pykep, is the closest
   thing to a "real" optimizer (as opposed to a plain date-grid search) among every interactive-3D tool checked;
   its config-driven body-system files (`data/systems.yml`, `data/rss/bodies.yml`) are a clean template for
   making "real solar system" a first-class configuration rather than an afterthought. Falls short: shipped
   identity and default system are Kerbal Space Program's Kerbol, real-solar-system data exists only as an
   unshipped alternate config, GPL-3.0 is copyleft (a real constraint if Surya wants a permissive MIT repo per
   the project's stated preference), and the optimizer is still single-objective.

4. **nasa/GMAT (with OrbitView / OpenFramesInterface)** - the most credible institutional prior art. Borrow: the
   `SolverIterations = All | Current | None` pattern for visualizing an optimizer's search process live inside
   a 3D view, a pattern worth replicating even in a from-scratch web tool; the Apache-2.0 licensing precedent
   from a NASA flagship tool; the plugin architecture that lets multiple optimizer backends (Yukon, VF13ad,
   external SNOPT/fmincon) sit behind one 3D front end; and the Emergent Space Technologies "Visual Interactive
   Trajectory Design" (VITD) research demo (Mathur et al., DTIC AD1121939), which showed a user grabbing and
   dragging a velocity vector in the OpenFrames 3D view and watching GMAT re-propagate a lunar free-return live,
   the single closest thing to true bidirectional coupling found in the entire search, as an interaction-design
   target even though it was never shipped as a GMAT feature or released as code. Falls short: the shipping
   product's coupling is output-only (you watch the optimizer iterate; you do not design by manipulating the 3D
   view), it has no multi-objective/Pareto capability, and its Qt/wxWidgets desktop UI is explicitly cited in
   the project's own working notes as the anti-example for polish.

5. **pleiszenburg/hapsira (poliastro fork)** - the most relevant Python library if a Python-first stack is
   considered. Borrow: the `OrbitPlotter` Plotly-3D backend as a starting point for a real-solar-system
   interactive 3D renderer, and the `porkchop()` function's Lambert-grid implementation as a reference algorithm
   for the porkchop math itself. Falls short: the porkchop plot (matplotlib `contourf`) and the 3D `OrbitPlotter`
   (Plotly) are two entirely separate, unconnected code paths with no click-to-render linkage anywhere in the
   source; and the project is dormant (upstream poliastro archived October 2023; the hapsira fork's last push
   was May 2024).

6. **ESA Space Trajectory Analysis (STA)** - the only tool found anywhere, in any of the five sweeps, that pairs
   a genuine multi-objective optimizer (NSGA-II via the KanGAL library) with an interactive 3D view (a
   Celestia-based OpenGL viewport). Borrow: its module boundary (separate Astro-Core, Optimization, Plotting,
   RendezVous, SEM modules all feeding one shared 3D viewport) as an architectural pattern for exactly where a
   future EMOA* module would plug into a viewer, since it is the only real-world precedent for "multi-objective
   optimizer output rendered in an interactive 3D view" that exists to point to. Falls short: abandoned since
   2013 (the SourceForge-to-GitHub mirror's last commit), does not build on a modern toolchain without real
   archaeology, and its specific claim of "real-time porkchop plot generation" traces to one 2008 COSPAR
   conference abstract that could not be confirmed against the surviving source in this pass.

7. **nasa/EMTG + PyEMTG** - the algorithmic ceiling for trajectory optimization among everything surveyed.
   Borrow: the monotonic-basin-hopping-plus-SNOPT/IPOPT global low-thrust optimizer as the reference to cite
   when scoping a future low-thrust extension, and the NASA Open Source Agreement as a licensing data point (an
   OSI-approved license, though one that is not GPL/MIT-compatible, worth knowing about even though the project
   plans to use MIT). Falls short: PyEMTG's "Plot trajectory" action in its wxPython GUI runs a strictly
   one-directional post-process into static matplotlib figures after the optimizer has already finished; nothing
   in it is interactive, and there is no navigable 3D view of any kind.

8. **alexmoon/ksp (KSP Launch Window Planner)** - dated but still the best-known reference implementation of a
   usable Lambert-porkchop interaction ("click a point on the plot to get a burn plan"), the exact interaction
   metaphor Surya's own porkchop-to-3D linkage should imitate in spirit. Borrow: the plot-as-primary-interaction
   pattern itself, independent of its implementation. Falls short: no 3D component at all (2D porkchop only),
   archived since 2023 with no commits since August 2019, licensed CC BY-NC-SA 4.0 (non-commercial, not an OSI
   open-source license), and it targets KSP's Kerbol system by default (a Real Solar System option exists but is
   not the default).

9. **Orbiter Space Flight Simulator + TransX/IMFD** - the real-solar-system, MIT-licensed simulator core that
   comes closest to a plausible open-source rendering/physics substrate if the project ever wanted a desktop
   rather than browser target. Borrow: the real-solar-system-by-default design choice and the MIT core license
   as data points; the in-cockpit MFD (multi-function display) interaction metaphor as a UX cautionary tale
   worth avoiding, since it is widely regarded even inside the Orbiter community as unapproachable to newcomers.
   Falls short: the actual interplanetary transfer-planning tools, TransX and IMFD, are closed-source add-ons
   distributed separately from the MIT-licensed core, and neither one runs any automated optimizer; both are
   manual, dial-turning trajectory planners.

---

## 4. Caveats: what a reviewer could still object to

- **This is a snapshot, not a permanent claim.** All five sweeps ran within a single day (2026-09-01). New
  repositories publish continuously; a tool satisfying every qualifier, including multi-objective search, could
  appear at any time and this document would need re-checking before any publication or grant application relies
  on it.

- **The "gap" may be closing on its own, independent of this project.** Four of the closest near-matches
  (kevinkicho/HELIOS, chipi/orrery, abc000cool, tamiralmas) were all created within roughly the same four-to-five
  month window in 2026, and three of the four explicitly disclose heavy AI-assisted development. A reviewer could
  reasonably argue this reflects 2026-era tooling making this specific app shape newly cheap to build solo, which
  means the honest framing is "the gap has been mostly-but-not-fully closed by very recent, unvetted, single-author
  work," not "the gap is structural and stable."

- **Star/fork counts are a weak, gameable maturity proxy.** The gap statement leans on "zero adoption, no
  institutional backing" to distinguish the hobby near-matches from a genuine prior-art blocker. A reviewer could
  reject that criterion outright and argue the coupling gap is already closed by, e.g., HELIOS, regardless of its
  star count, since the code runs and does what it claims.

- **License data disagreed across sweeps in places.** tamiralmas/Orbital-Simulation states MIT in its README but
  GitHub's automatic detector reports NOASSERTION (its LICENSE file uses nonstandard text the detector cannot
  parse); this is a detector limitation, not proof the project isn't open source, and should be phrased as
  "ambiguous," not "not open source." By contrast, abc000cool/porkchop-mission-planner's lack of any LICENSE file
  and its `"private": true` package.json were independently confirmed by three of the five sweeps plus this
  verification pass's own review of the cached README, so that one classification is solid.

- **GMAT's "coupled" classification is a genuine judgment call.** Two of the five original sweep passes marked
  GMAT coupled:true and two marked it coupled:false; this document picked "output-coupled only" (the 3D view
  shows the optimizer's live iterations, but you do not design by interacting with the 3D view) as the most
  precise middle position, but a reviewer could contest it in either direction.

- **GitHub API coverage is incomplete by construction.** Every sweep log and this task's own follow-up curl/WebFetch
  calls repeatedly hit GitHub's unauthenticated rate limit (60 requests/hour; several "403 rate limit exceeded"
  and "dead end" entries appear in every sweep's log, and my own attempt to re-verify nine repos' live metadata in
  this task was blocked the same way after the first two calls). Very recent or very obscure repositories are
  systematically under-covered, not exhaustively ruled out.

- **Search-engine and keyword coverage has known blind spots.** Several queries returned false positives that had
  to be manually filtered (e.g., "interplanetary" matching IPFS/misskey federation software, "orbit planner"
  matching daily-planner apps, "porkchop" matching a Cheap-Yellow-Display flasher and a Beer-Lambert-law
  ice-sheet tool), which means some true positives may have been missed by the same kind of keyword mismatch in
  the other direction.

- **Non-GitHub, non-English, and non-indexed venues are under-covered.** The searches leaned on GitHub (API and
  web), general WebSearch, and arXiv/JOSS/AIAA. GitLab-only, SourceForge-only, Bitbucket-only, self-hosted-only,
  and non-English-language projects, plus code released only as unindexed supplementary material on a journal's
  own site, are all systematically under-represented in this evidence base.

- **Nothing in this evidence base was independently run or built.** All assessments come from reading READMEs,
  source files (via raw.githubusercontent.com), and GitHub/GitLab API metadata, not from cloning, building, and
  running any of these tools. Correctness claims inside their own READMEs (e.g., HELIOS's Lambert-solver
  validation, chipi/orrery's Kepler solver) were not independently reproduced in this pass.

- **"Real solar system vs. game" was treated as binary but several tools straddle the line.** KSPTOT,
  KSP-MGA-Planner, and Transfer Window Planner/MechJeb2 all support real-solar-system data through optional
  configs or the Real Solar System mod even though their shipped, default identity is Kerbal Space Program. A
  reviewer could argue these should count as satisfying "real solar system" on capability grounds, which would
  make the field of near-matches larger than this document credits.

- **The multi-objective claim rests on an absence of evidence, not a confirmed negative.** ESA STA's NSGA-II
  optimizer is real, but the specific claim that it was ever wired to a live, interactive Celestia 3D view with a
  real-time porkchop plot could not be confirmed from the surviving 2013-era source in this pass; the honest
  statement is "the one candidate that might have combined multi-objective search with an interactive 3D view is
  dead and its coupling claim is unverifiable," not "confirmed to never have existed."

---

## 5. Search coverage (evidence base for the claim above)

**Five independent sweep passes**, each logged in full (JSON candidate lists plus a step-by-step search log
included in this task's input):

- **github** - GitHub REST API repository search (`api.github.com/search/repositories`) across ~20 query
  variants (`porkchop trajectory`, `topic:astrodynamics`, `topic:trajectory-optimization`, `"launch window"
  planner three.js`, `"delta-v" planner web`, etc.), plus direct `api.github.com/repos/...` and
  `raw.githubusercontent.com` README fetches for the top candidates found.

- **academic** - WebSearch and WebFetch across JOSS's Astrodynamics and trajectory-optimization tags, arXiv
  queries on multi-objective A*/Pareto interplanetary search and visual-analytics for spacecraft trajectory
  design, and NASA Ames Trajectory Browser / GMAT / Copernicus documentation pages; explicitly logged three
  dead ends (no JOSS or arXiv paper found combining exact multi-objective graph search with interplanetary
  transfer networks).

- **tools** - the broadest pass: roughly 40 WebSearch queries and 90+ WebFetch page loads (GitHub repo pages,
  raw READMEs, ESA/NASA documentation, GitLab, SourceForge) plus a `notes/gh_meta.sh` script pulling GitHub/GitLab
  API metadata (stars, license, created/pushed dates) for roughly 25 repositories, saved under
  `<scratchpad>/notes/`.

- **webapps** - targeted WebSearch across ~35 queries aimed specifically at live web apps, browser games, and
  Kerbal Space Program mods/add-ons (Hacker News, Reddit, itch.io/Steam, YouTube-demo searches included), plus
  GitHub API metadata pulls for ~25 repositories and repo-contents checks specifically for LICENSE file presence.

- **recent** - GitHub API repository-search scripts (`notes/gh_search.py`, `gh_search2.py`) filtered by
  `created:>2024-01-01` / `pushed:>2025-01-01` across ~45 query/topic variants, GitHub/GitLab API metadata for 35
  repositories (`gh_meta.py`), repo-contents/commit checks for LICENSE presence and coupling evidence
  (`gh_tree.py`), and ~35 further WebSearch queries plus arXiv export-API queries before the pass's own search
  budget was exhausted.

Combined, the five passes represent on the order of 300 distinct search, fetch, and API operations and surfaced
roughly 90 named candidate repositories/tools before deduplication, condensed to the ~30 nontrivial rows in the
table above.

**This task's own follow-up verification** (on top of the five sweeps, not a sixth independent sweep):
read the cached README files the tools/recent sweeps had already saved locally under `<scratchpad>/output/` for
chipi/orrery, abc000cool/porkchop-mission-planner, kevinkicho/k-solar-system-navigator, and
tamiralmas/Orbital-Simulation, and the raw text of `sweep_flagged.txt` / `github_recent_summary.txt`; attempted a
live re-verification of GitHub API metadata for nine repositories via both `curl` (Bash tool) and `WebFetch`,
which succeeded for two (kevinkicho/k-solar-system-navigator: 0 stars, 0 forks, MIT confirmed; chipi/orrery: 3
stars, 1 fork, MIT confirmed) before the unauthenticated GitHub API rate limit (60 requests/hour) was hit and the
remainder had to rely on the five sweeps' own independently-cross-checked figures instead of a sixth live check.
