# Tech stack and library recommendation

> **Superseded on 2026-09-14 by `04_system_design.md`**, which carries these choices forward and adds the game-engine evaluation, the system architecture and the mathematics reference.

Date: 2026-09-07. Basis: the six track documents and gap analysis in this folder (snapshot 2026-09-01), the master document's Part III, what `app/` already uses, what `research/scripts/` actually ran, and seven targeted registry and repository checks made on 2026-09-07 to close gaps the local research left open. No new landscape sweep was run.

The recommendation in one sentence: **keep the stack Orbit Lab already has (TypeScript, Vite, React, zustand, Three.js, satellite.js, Vitest), extend it with astronomy-engine for planets, an in-house Izzo Lambert port, small d3 modules for the porkchop, and a TypeScript EMOA\* with a two-objective first cut; keep Cesium as an optional Earth mode behind the renderer seam rather than the primary engine.**

---

## 1. What is already in place

`app/package.json` today:

| Package | Version | Role | Current on npm (2026-09-07) |
|---|---|---|---|
| three | 0.185.1 | scene, camera, orbit lines | 0.185.1, yes |
| satellite.js | 7.1.0 | SGP4, GMST, TEME to geodetic | 7.1.0 (2026-07-23), yes |
| react / react-dom | 19.2.8 | panels | yes |
| zustand | 5.0.15 | one store read by both React and the render loop | yes |
| vite | 8.2.2 | build, ES-module workers already configured | yes |
| vitest | 5.0.0 | 32 known-answer tests | yes |
| typescript | 6.0.3 | | yes |
| oxlint | 1.81.0 | | yes |

The architecture rules from the master document are already enforced: `core/`, `propagation/`, `data/` import nothing from `scene/` or `ui/`; the Three.js `SceneManager` reads the store inside its own animation loop and never goes through React; scenario state lives in the URL; the build is static (`base: './'`) and token-free.

The research scripts used the Python oracle toolchain: numpy, python-sgp4 2.27, skyfield with the DE421 kernel, lamberthub, scipy, jplephem. That stack stays as the validation side and never ships to the browser.

---

## 2. The one real decision: rendering engine

The master document listed three options and defaulted to "start Cesium, prototype Three.js on the side." Phase 0 went the other way and was built in Three.js, body-agnostic. The evidence in Track 3 supports making that the primary path.

**Recommendation: Three.js-first (option B), renderer kept behind an interface, Cesium as an optional Earth mode if the professor asks for the satvis globe look.**

Why Three.js wins for this project specifically:

- **The destination is heliocentric.** Cesium's scene is WGS84 and Earth-centred by construction. Its "inertial" mode is a rotation of the Earth-fixed frame; there is no heliocentric origin and no log-scale distance mode anywhere in the API (Track 3, Q2). satvis never attempts a non-Earth view. Phases B and C, which carry the research contribution, cannot live in Cesium.
- **Orbit Lab already renders six central bodies.** Switching to Cesium for Phase A would throw away working code and re-introduce an Earth-only constraint.
- **The aesthetic decision is already "stylized instrument," not photoreal.** Track 3's distilled design rules (point-sprite catalog, glowing orbit lines, dim-not-hide, DOM labels, cubic zoom ease) are all Three.js-native patterns. Cesium's strength, imagery and terrain, is what this aesthetic gives up on purpose.
- **Bundle and complexity.** Cesium is a 4.2 MB minified bundle with its own clock, entity system and type-drift across point releases (Track 3 T3.8 documents a `LagrangePolynomialApproximation` type break in 1.143). One engine is less surface area at 5 to 6 hours a week.

What Three.js costs, and what to do about it (all from Track 3 T3.5 and Q2):

- **Scale precision.** float32 at 1 AU is 17.8 km, 4.5% of a LEO altitude. A single scene holding LEO and Mars needs a floating origin: keep positions in double-precision JS, upload camera-relative float32 each frame. Orbit Lab's "1 unit per 1000 km" scale is fine for one body and must become camera-relative before Phase B.
- **Depth range.** Enable `logarithmicDepthBuffer` or a multi-pass near/far scheme before planet close-ups exist.
- **Globe basics.** Ground tracks, day/night terminator and imagery have to be built. The stylized wireframe sphere already in `CentralBodyMesh` is the honest v1 answer; a Natural Earth texture is a cheap upgrade.
- **Catalog scale.** For thousands of satellites, draw the catalog as one `THREE.Points` with per-vertex size and colour attributes (the KeepTrack and Stuff in Space pattern, re-implemented, never copied: both are AGPL or unlicensed). Build orbit lines only for hovered, selected or grouped objects, sampled by eccentric anomaly, which Orbit Lab already does.

What would flip the decision: the professor saying the photoreal satvis globe is a requirement, or a Phase A need for terrain and imagery layers. In that case add `cesium` 1.145 (Apache-2.0, `@cesium/engine` 26.3) as an Earth-mode renderer using satvis's token-free setup (bundled Natural Earth II tiles plus `EllipsoidTerrainProvider`, never set `Ion.defaultAccessToken`). `resium` 1.26 (MIT, peer `cesium 1.x`, `react >= 18.2`) exists if React bindings are wanted, but satvis drives Cesium imperatively from a store, which matches the pattern Orbit Lab already uses and is the better fit.

**Do not adopt React Three Fiber.** `@react-three/fiber` 9.7 is fine software, but it moves the scene into React's render cycle, pins `react >= 19 < 19.3`, and would replace the working imperative `SceneManager` with no gain for a store-driven scene.

---

## 3. Library shelf by concern

### Earth-orbit propagation and frames (Phase A)

- **satellite.js 7.1** (MIT, ESM-only). Keep. Use `json2satrec` for OMM records, `twoline2satrec` only for the legacy TLE path. Cross-checked against python-sgp4 to 0.055 m (Track 2). Pitfall recorded in Track 2: its `.no` field is the Brouwer mean motion after `sgp4init`, unlike python-sgp4's `.no`.
- **Frame chain**: TEME, GMST rotation, Earth-fixed, geodetic. satellite.js supplies all of it (`gstime`, `eciToEcf`, `eciToGeodetic`). Never treat TEME as J2000 (41 km error at LEO, 260 km at GEO).
- **Do not use `ootk`** (KeepTrack's propagator library). Confirmed 2026-09-07: `ootk` 7.0.3 is AGPL-3.0-or-later. Same family as satellite.js, incompatible license.

### Off-thread propagation

- **Vite native workers.** `vite.config.ts` already sets `worker: { format: 'es' }`. Instantiate with `new Worker(new URL('./sgp4.worker.ts', import.meta.url), { type: 'module' })`. No extra library required; **comlink** (Apache-2.0) is an optional convenience.
- **Transfer `Float64Array` buffers, not `SharedArrayBuffer`.** KeepTrack's own comment (Track 3): COOP/COEP headers break embeds. satvis ships positions as transferable arrays in metres.
- **Copy satvis's sampling design**: epoch-anchored grid, 120 samples per orbit, window of minus 0.5 to plus 1.5 orbits, chunks carry anchor plus index. Cache satrecs by catalog number and pin one satellite to one worker lane.
- **Budget from the local benchmark** (`research/scripts/T3_3_sgp4_bench.mjs`): 1.6 microseconds per object per SGP4 call near epoch, 93 microseconds when elements are eleven years stale (deep-space branch and decay checks). A 15,000-object catalog with fresh elements is 25 ms per full pass, so a 2 Hz worker tick with per-frame linear extrapolation (sub-metre error, Track 3 T3.3) is comfortable.

### Catalog data

- **CelesTrak `gp.php` with `FORMAT=JSON`** (OMM). TLE text is retired for new code: catalog numbers passed 100,000 on 2026-07-11. Cache by `EPOCH`, not element-set number. Respect the 2-hour cadence and the HTTP 403 on repeat downloads.
- **Refresh mechanism without a backend**: a GitHub Actions cron (nightly, or every 6 hours for the ISS group) that fetches the chosen groups once and commits or uploads them as static JSON with the site build. Track 2 shows nightly is enough at globe zoom (LEO reaches one pixel of error in 3 to 4 days). satvis's Cloudflare Worker plus KV is the same idea with more moving parts; adopt it only if the catalog needs to update more often than the site deploys.
- **Vendor a snapshot in the repo** so `git clone && npm run dev` works offline. `research/data/iss_tle_2026-09-01.txt` and the bundled ISS TLE in `presets.ts` already do this for one object.
- **SupGP** (CelesTrak supplemental GP) gives 5 to 10 times better accuracy for ISS and GPS when it matters at regional zoom.

### Planetary ephemerides (Phase B)

This was the largest gap in the local research: Track 3 said "use a JPL-quality table, not fixed elements" but evaluated no browser library. Checked 2026-09-07:

- **astronomy-engine** (MIT, npm `astronomy-engine`, about 116 KB minified, no dependencies). Truncated VSOP87, validated by its author against NOVAS and JPL Horizons, stated accuracy within 1 arcminute. `BaryState(body, time)` returns barycentric position and velocity in AU and AU per day in the J2000 mean equator frame; heliocentric vectors are also provided. **Recommended as the runtime planet source.** Reasoning: 1 arcminute at 1 AU is roughly 44,000 km; over a 300-day Lambert transfer that is about 2 m/s of velocity error against a 5.6 km/s v-infinity sum. That is invisible for the porkchop and the 3D scene. Validate this claim against `research/scripts/T4_3_porkchop.csv` (6,479 DE421 cells) before quoting any mission number from it.
- **No JavaScript SPK/BSP kernel reader exists** as an established package. Two searches on 2026-09-07 found readers only in Python (jplephem), Julia and Ruby. If DE-series precision is ever needed in the browser, export Horizons vectors offline and ship a Lagrange-interpolated `[JD, x, y, z, vx, vy, vz]` table, the spacekit `EphemerisTable` pattern (MIT, port the idea not the library).
- **Python side**: skyfield with DE421 or DE440 via jplephem remains the oracle, exactly as the porkchop script did.
- **Do not use spacekit.js** as a base (three r0.135 WebGL1, fixed 2018 elements, Saturn 0.38 degrees off). Borrow `Ephem` normalisation and the GPU Kepler-particle pattern only.

### Lambert solver and porkchop (Phase C1)

Track 4 recommended an in-house TypeScript port of Izzo 2015 and flagged two npm options as unverified. Both were checked on 2026-09-07:

- **`lambert-izzo` exists.** Track 4 called it "very likely fabricated"; that was wrong. It is a Rust implementation of Izzo's revisited solver compiled to WebAssembly (`sakobu/izzos-lambert`, MIT OR Apache-2.0, npm version 2.0.0), with multi-revolution support to 32 revolutions and an internal test-support crate. It has 1 star and no visible validation against textbook cases. Usable as a cross-check, not as an unaudited dependency.
- **`influenceth/lambert-orbit`** is a single 10 KB JavaScript file implementing Izzo 2015 (cited in the source) with multi-revolution and long-way options, SI units (metres), CommonJS, and dependencies on `mathjs` and `cephes`. Two commits total, MIT. Good as a reading reference for the port; not something to depend on.
- **Recommendation unchanged: in-house TypeScript port of Izzo 2015 in `optimize/lambert.ts`**, a few hundred lines, tested against Curtis Example 5.2 (v1 = [-5.9925, 1.9254, 3.2456], v2 = [-3.3125, -4.1966, -0.3853] km/s, tolerance 1e-4 km/s) and against the DE421 porkchop CSV. Use both npm packages as independent oracles in the test suite. A `pykep` microservice is the fallback if WASM or a port ever proves too slow, at the cost of the serverless story.
- **Porkchop rendering**: draw the grid to a Canvas 2D element and use small d3 modules for scales, colour and contours (`d3-scale`, `d3-scale-chromatic`, `d3-contour`, all ISC-licensed, a few KB each). Avoid Plotly in the app bundle (multi-megabyte, static-plot idiom). Hover on a cell drives the Three.js arc through the store, the same one-way pattern the scene already uses.

### Multi-objective search (Phase C2)

- **TypeScript reimplementation of EMOA\***, 600 to 1,800 lines by Track 5's estimate, is the license-clean default. Start with two objectives (delta-v, time of flight) so the dominance check is BOA\*'s O(1) `g2min` scalar; add a third objective with a sorted-array plus binary-search frontier (Late-BS), which the AIJ 2025 experiments show beats the balanced tree in every tested case.
- **`public_emoa`** (C++, no license file) stays an optional plugin. If the professor grants terms, the WASM route is low risk: STL-only, no Boost, an embind wrapper replacing file I/O with an in-memory graph.
- **Seam**: the graph builder emits plain `{ nodes, edges: [{ u, v, cost: [dv, tof, ...] }] }`; the solver backend (TS, WASM, or a service) sits behind it, the same philosophy as the renderer interface. Build the graph event-driven, not calendar-gridded (Track 6: 16 nodes and 598 arcs versus 8,000 nodes and 40,000 arcs).
- **pygmo** (Python) is the evolutionary comparison for the eventual paper, not a runtime dependency.

### UI, plots, labels

- React 19 plus zustand, already in place. No component library needed for a dark instrument panel; the existing `index.css` is the right scale.
- Satellite labels as DOM overlays (`CSS2DRenderer` from three's addons, or the existing sprite approach), capped at about 40 on screen.
- Pareto front and timeline plots with the same d3 modules as the porkchop.

### Testing and validation

- **Vitest** known-answer tests, already 32 of them. Grow the oracle set from `research/scripts/*_output.txt` and the two CSVs.
- **Cross-library oracles in CI**: satellite.js versus stored python-sgp4 output (target under 1 m), the TS Lambert port versus `lambert-izzo` and the DE421 porkchop CSV, astronomy-engine versus DE421 positions.
- **Playwright** for golden screenshots per release once the scene stabilises.
- **GitHub Actions**: typecheck, lint, test, build, deploy, plus the catalog refresh cron.

### Hosting

Static only. GitHub Pages, Vercel or Cloudflare Pages all work with the existing `base: './'` build. No API keys or tokens anywhere in the deploy. A Python service is deferred indefinitely by the in-house Lambert port and the TS EMOA\*.

---

## 4. Do-not list, with the reason

| Item | Reason | Source |
|---|---|---|
| spacekit.js as a base | dead WebGL1 three, wrong planets, float32 AU | Track 3 T3.5 |
| poliastro, hapsira | archived 2023, fork dormant | Track 3 §5 |
| Any KeepTrack or `ootk` source | AGPL-3.0-or-later, confirmed for both | Track 3 T3.2, npm check 2026-09-07 |
| Stuff in Space original source | no license file | Track 3 T3.3 |
| Cesium ion token in the default build | breaks `git clone && npm run dev` for strangers | Track 3 T3.8 |
| TLE text as the ingestion format | 5-digit catalog field overflowed 2026-07-11 | Track 2 |
| `SharedArrayBuffer` for worker output | COOP/COEP breaks embeds | Track 3 T3.2 |
| React Three Fiber | scene belongs outside the React render cycle | this document |
| Plotly in the browser bundle | size, static-plot idiom | this document |
| Vendoring `public_emoa` | no license | Track 5 |
| Unaudited `lambert-izzo` or `lambert-orbit` as runtime deps | 1 star and 2 commits respectively, no textbook validation shown | npm and GitHub checks 2026-09-07 |

---

## 5. Corrections to the local research found while checking

- **Track 4** states the npm package `lambert-izzo` is "very likely fabricated." It exists: `sakobu/izzos-lambert`, Rust to WASM, MIT OR Apache-2.0, version 2.0.0. The conclusion (do not depend on it unaudited) still holds; the reason changes from "does not exist" to "unvetted, 1 star."
- **Track 3** left `ootk`'s license unchecked. It is AGPL-3.0-or-later, so the KeepTrack rule extends to its propagator library.
- **Track 3** asked for a browser ephemeris source without naming one. astronomy-engine fills that role at the 1 arcminute level; nothing reads SPK kernels in JavaScript.

---

## 6. What to add, in build order

1. **A1**: OMM fetch through a GitHub Actions cron into static JSON; `json2satrec`; SGP4 worker with transferable buffers; ground track on the existing sphere. No new runtime dependency.
2. **A3**: `THREE.Points` catalog renderer, DOM label cap, worker pool. No new runtime dependency.
3. **B1**: `astronomy-engine`; floating origin and logarithmic depth in `SceneManager`; log-scale distance toggle.
4. **C1**: `optimize/lambert.ts` (Izzo port) with `lambert-izzo` as a dev-only oracle; `d3-scale`, `d3-scale-chromatic`, `d3-contour`.
5. **C2**: `optimize/emoa.ts`, two objectives first; graph builder seam; optional `public_emoa` WASM plugin if terms arrive.

Runtime dependencies added across the whole plan: one ephemeris library and three small d3 modules. Everything else is code in this repo, which is the point of the `core/`, `propagation/`, `optimize/` seams.
