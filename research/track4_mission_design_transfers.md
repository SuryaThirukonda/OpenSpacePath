# Track 4 Study Notes: Mission Design and Transfers (Phase B/C Math)

## 1. Orientation

This track builds the working knowledge needed to design Phase B/C of the project honestly: the layer that turns two dates and two planets into a transfer trajectory, a delta-v number, and eventually a graph edge that EMOA* (Track 5) can search. Everything here maps directly onto the master document's Part III §1.3 ("Transfers (Phase C)") and the C1 milestone ("interactive porkchop plot, hover cell to see the 3D arc"). Concretely, this track answers: what a Lambert solve actually computes, why launch windows to a given planet repeat on a fixed cadence, and how much physical fidelity a v1 build can honestly skip. It also produces the concrete deliverable the professor will expect on Monday: a fidelity ladder with UI disclosure language, and a stack recommendation for the Lambert solver that will sit behind the C1 porkchop feature.

Six sub-items were researched (T4.1-T4.6), each with its own sources, computed numbers, and a verification pass (two independent lenses: recompute-from-scratch, and re-check-against-primary-sources). Where the verification ledger found a claim wrong or overstated, this document uses the corrected wording and flags what changed.

## 2. Sources Actually Read

All items ran in the project scratchpad venv (`<scratchpad>/venv/Scripts/python.exe`) unless noted. Confidence follows each reader's own labels; "opened: false" sources were found via search snippets only and are marked accordingly.

| Source | Where | Opened? |
|---|---|---|
| Curtis, *Orbital Mechanics for Engineering Students*, Ex. 5.2 (Lambert reference values) | Cited in task brief, cross-validated via 3 independent solvers | Not re-opened directly this track; validated by algorithmic cross-check (see T4.1) |
| Izzo, "Revisiting Lambert's Problem" (arXiv 1403.2705 / Celestial Mech. Dyn. Astron. 121, 2015) | `arxiv.org/abs/1403.2705`; full text via `ar5iv.labs.arxiv.org/html/1403.2705` | Abstract yes; full PDF failed to parse (WebFetch garbled binary), worked around via the ar5iv HTML mirror (a third-party rendering, not the arXiv PDF itself) |
| Wikipedia, "Lambert's problem" | `en.wikipedia.org/wiki/Lambert%27s_problem` | Yes |
| lamberthub README and package (14 cross-validated Lambert algorithms, GPLv3) | `raw.githubusercontent.com/jorgepiloto/lamberthub/main/README.md`; installed in venv | Yes, installed and run (`notes/T4_1_lambert.py`) |
| pykep docs/GitHub | `esa.github.io/pykep/`; `github.com/esa/pykep/blob/master/src/lambert_problem.cpp` | No — `ex2.html` 404'd; API signature taken from the master doc's own code sketch (secondary source) |
| influenceth/lambert-orbit (pure-JS Lambert solver, MIT) | `github.com/influenceth/lambert-orbit` | README yes; solver source/algorithm not confirmed |
| npm registry search API | `registry.npmjs.org/-/v1/search?text=lambert%20orbit` | Yes — 97 real packages returned, no "lambert-izzo" |
| Wikipedia, "Sphere of influence (astrodynamics)" | `en.wikipedia.org/wiki/Sphere_of_influence_(astrodynamics)` | Yes |
| Wikipedia, "Patched conic approximation" | `en.wikipedia.org/wiki/Patched_conic_approximation` | Yes |
| orbital-mechanics.space, "Planetary Departure for Interplanetary Transfer" | `orbital-mechanics.space/interplanetary-maneuvers/planetary-departure-trajectory.html` | Yes |
| Braeunig, "Basics of Space Flight: Interplanetary Flight" (`interpl.htm`) | `www.braeunig.us/space/interpl.htm` | **No** — TLS hostname mismatch (cert covers `*.securedata.net`, not `braeunig.us`); `braeunig.space` does not resolve. Cross-checked instead via Wikipedia + orbital-mechanics.space, and via WebSearch snippets (marked "likely" where used) |
| Wikipedia, "Porkchop plot" | `en.wikipedia.org/wiki/Porkchop_plot` | Yes |
| degenerateconic.com, "Porkchop Plots" | `degenerateconic.com/porkchop-plots.html` | Yes |
| JPL DE421 ephemeris kernel (`de421.bsp`), via Skyfield | Auto-downloaded by `skyfield.api.load`; valid 1899-07-29 to 2053-10-09 | Yes, loaded and used for real Earth/Mars state vectors |
| Wikipedia, "Delta-v budget" | `en.wikipedia.org/wiki/Delta-v_budget` | Yes |
| Wikimedia Commons, `File:Solar_system_delta_v_map.svg` (CMG Lee derivative of the Ulysse Carion "subway map") | `commons.wikimedia.org/wiki/File:Solar_system_delta_v_map.svg` | Yes (description page) |
| Wikipedia, "Three-body problem"; "Near-rectilinear halo orbit"; "Low-energy transfer" | en.wikipedia.org | Yes |
| Advanced Space, LLC — "BLT (Ballistic Lunar Transfer) Cheat Sheet" (Jan 2021) | `advancedspace.com/wp-content/uploads/2025/08/blt-quick-ref.pdf` | Yes, full text extracted via pypdf — primary quantitative source for cislunar numbers |
| Whitley & Martinez (2016), "Options for Staging Orbits in Cis-Lunar Space" (NASA JSC, IEEE Aerospace), NTRS 20150019648 | `ntrs.nasa.gov/api/citations/20150019648/downloads/20150019648.pdf` | Yes, full text extracted |
| Williams et al. (2017), "Targeting Cislunar NRHOs for Human Space Exploration," AAS 17-267, NTRS 20170001352 | ntrs.nasa.gov | Yes (verification pass) |
| Parrish et al., "Ballistic Lunar Transfers to NRHO: Operational Considerations," NTRS 20200011549 | ntrs.nasa.gov | Yes (verification pass) |
| Whitley et al. (2018), "Earth-Moon NRHO and Butterfly Orbits for Lunar Surface Exploration," AAS 18-406 | Purdue engineering mirror | Yes (verification pass) |
| ResearchGate, "Navigation Design of the CAPSTONE Mission Near NRHO Insertion" | researchgate.net | **No** — 403 on fetch; only a WebSearch snippet was read, flagged "uncertain" |
| Parker & Anderson, *Low-Energy Lunar Trajectory Design* (2014) | JPL Deep Space Communications and Navigation Series | No — paywalled book, only reached via a secondary citation inside the BLT cheat sheet |
| Wikipedia, "Electric propulsion" | en.wikipedia.org | Yes |
| NASA EMTG GitHub repo | `github.com/nasa/EMTG` | README yes; `docs/0_Users/` not opened |
| pykep `simsflanagan` documentation | `esa.github.io/pykep/documentation/simsflanagan.html` | **No** — 404 on both the docs page and the raw GitHub `.rst`; reconstructed from WebSearch snippets quoting the page, confidence "likely" |
| NASA Dawn / NSTAR ion-engine fact sheet | nasa.gov PDF; Springer chapter | No — WebSearch snippets only |

Scripts and data under `notes/` with the `T4_` prefix (all in `C:/Users/thiru/AppData/Local/Temp/claude/C--Users-thiru-tamu2-ecs-research-rathinam/5b6188bd-1182-4842-a6a3-cb49230254ab/scratchpad/notes/`), cited throughout below:

- `T4_1_lambert.py` — lamberthub cross-validation (izzo2015/vallado2013/gooding1990) against Curtis Ex. 5.2; multi-rev demo; synodic periods; illustrative Earth-Mars v_inf/C3 chain.
- `T4_2_patched_conics.py` — SOI radii, departure/capture delta-v (Oberth formula), Hohmann worked chain, LEO-GEO anchor, synodic periods.
- `T4_3_porkchop.py` / `T4_3_porkchop.csv` / `T4_3_porkchop.png` — real DE421 + Izzo Lambert porkchop grid, 2026-2029, 6479 cells.
- `T4_4_dv_check.py` — vis-viva cross-checks of the community delta-v-map numbers (LEO-GEO, LEO-TLI, LEO-escape, LEO-Mars/Venus injection, Mars capture).
- `T4_reader_notes.json` — the structured notes for all six items, the primary input synthesized into this document.
- `T4_verify_blt_claim.py` — independent verification-pass script for the ballistic-lunar-transfer delta-v claim (not part of the original six items, produced during the verification lens).

## 3. Core Notes by Reading Item

### T4.1 — Lambert's problem and Izzo's 2015 algorithm

**The problem.** Given two position vectors **r1**, **r2** about the same central body and a time of flight Δt, Lambert's problem finds the unique two-body conic arc connecting them, returning the velocity vectors **v1** (at r1) and **v2** (at r2) that make the transfer happen in exactly Δt (Wikipedia, "Lambert's problem," verified). Lambert's theorem: transfer time depends only on semi-major axis a, the sum r1+r2, and the chord length c — not on r1, r2 individually, which is why solvers work in derived scalar quantities rather than full vector geometry.

**Short way vs. long way.** The transfer angle θ can be taken in (0°,180°) ("short way"/Type I) or (180°,360°) ("long way"/Type II); both are valid, distinct transfer orbits. At θ=180° exactly, r1 and r2 are antiparallel and the transfer plane is undefined — a genuine geometric degeneracy, not a numerical artifact.

**Multi-revolution solutions.** For long enough Δt, the spacecraft can complete N full revolutions before arrival. Solution count for a given (r1,r2,Δt) is 1 + 2·M_max, where M_max = floor(T/π) in Izzo's normalized time variable T. lamberthub's M=0,1,2 calls all returned distinct, finite (v1,v2) pairs on a 10-hour LEO-scale demo, consistent with this structure (confidence: "likely" — the exact M_max for that specific geometry was not separately verified).

**Izzo's 2015 method.** Builds on Lancaster & Blanchard (1969)'s universal-variable formulation, reformulated in a normalized variable x: x = cos(α/2) for elliptic transfers, x = cosh(α/2) for hyperbolic; x = 0 is the minimum-energy ellipse. A geometry parameter λ² = (s−c)/s (s = semi-perimeter, c = chord) encodes the transfer angle and short-way (λ>0) vs. long-way (λ<0) branch. The time-of-flight T(x) is a known closed-form function; solving Lambert's problem becomes 1-D root-finding, T(x) = T*. Izzo's key result is a 3rd-order Householder iteration (uses T's first three derivatives) that converges in about two iterations for the single-revolution case, given a good closed-form piecewise initial guess exploiting T(x)'s two oblique asymptotes — roughly 1.8x faster than his own earlier (2010-2013) versions (confidence: "likely," since the full-text description rests on the ar5iv mirror rather than the arXiv PDF itself).

**Cross-validation against Curtis Ex. 5.2** (r1=[5000,10000,2100] km, r2=[-14600,2500,7000] km, Δt=3600 s, μ⊕=398600 km³/s², prograde/short way): `izzo2015`, `vallado2013`, and `gooding1990` in lamberthub all agree to within 5.2×10⁻⁵ km/s of each other and of the reference values:

```
izzo2015:    v1=[-5.99249, 1.92536, 3.24564]  v2=[-3.31246, -4.19662, -0.38529]
vallado2013: v1=[-5.99249, 1.92536, 3.24564]  v2=[-3.31246, -4.19662, -0.38529]
gooding1990: v1=[-5.99249, 1.92536, 3.24564]  v2=[-3.31246, -4.19662, -0.38529]
```

This 3-way algorithmic cross-validation is treated as strong verification (this is also lamberthub's own standard testing practice), but the textbook page itself was not independently reopened this track, so "these are exactly Curtis's printed numbers" stays "likely" rather than "verified."

**Solver landscape for the C1 build.** `lamberthub` (GPLv3) packages 14 published algorithms. `pykep` is the field-standard C++/Python library (not independently re-verified against live docs this track). `influenceth/lambert-orbit` is a pure-JS, MIT-licensed solver on GitHub/npm, but its underlying algorithm and validation were not confirmed from the README alone — an in-repo source read is needed before trusting it. **A claimed npm package `lambert-izzo` (WASM binding of an Izzo Rust port) is very likely fabricated**: the authoritative npm registry search API returned 97 real packages under "lambert orbit" and did not include it, and a direct package-page fetch returned HTTP 403 rather than confirming it. Do not cite `lambert-izzo` as a real dependency without a human checking `npmjs.com/package/lambert-izzo` directly in a browser.

### T4.2 — Patched conics, spheres of influence, planetary departure/arrival

**The three-region trick.** An interplanetary trajectory is split into three two-body problems glued together at each sphere of influence (SOI): a hyperbolic escape inside the departure planet's SOI, a heliocentric conic (near-Hohmann) between the SOIs, and a hyperbolic/captured arrival inside the destination's SOI.

**SOI radius (Laplace formula).**

$$r_{SOI} = a \left(\frac{m}{M}\right)^{2/5}$$

where a is the planet's heliocentric semi-major axis, m its mass, M the Sun's mass. Computed and independently re-verified this track: Earth SOI = 924,540 km, Mars SOI = 577,067 km, matching Wikipedia's published SOI table to within about 0.5% (the small Earth-side gap is explained by Wikipedia's table using the combined Earth+Moon mass rather than Earth alone).

> **Corrected via verification ledger.** The original claim framed these SOI radii as "under 1% of the ~1.5×10⁸ km Earth-Mars distance." That is wrong on two counts, confirmed by two independent verification passes. First, 1.5×10⁸ km is **1 AU**, i.e. Earth's own heliocentric semi-major axis — the same "a" that goes into the Earth SOI formula — not the Earth-Mars separation. Second, the actual Earth-Mars distance varies enormously with orbital alignment, from roughly 55-56 million km at the closest recorded oppositions to about 401 million km at conjunction (NASA's commonly quoted "average" figure is ~225 million km). At the closest oppositions, Earth's SOI-to-distance ratio actually **exceeds** 1% (up to ~1.7%). The textbook-correct comparison — confirmed against Wikipedia's own "Distance from Sun" column and against orbital-mechanics.space, which explicitly defines the denominator as "the planet's orbital radius around the Sun" — is that each SOI radius is small **relative to the planet's own heliocentric orbital radius** (Earth SOI is 0.62% of 1 AU, Mars SOI is 0.25% of Mars's own 1.524 AU), which is what actually licenses treating the SOI patch as instantaneous. Use this corrected framing, not "under 1% of the Earth-Mars distance," when explaining patched-conic validity to the professor.

**Departure/arrival hyperbola.** From vis-viva energy conservation on the escape/capture hyperbola, specific energy E = v∞²/2 (potential vanishes at r→∞), so periapsis speed vp = √(v∞² + 2μ/rp). Departure/capture delta-v from a circular parking orbit of radius rp:

$$\Delta v = \sqrt{v_\infty^2 + \frac{2\mu}{r_p}} - \sqrt{\frac{\mu}{r_p}}$$

**C3 (characteristic energy)** = v∞² (km²/s²) is the standard launch-vehicle-performance axis, independent of parking-orbit choice.

**Verification ledger result — nonlinearity confirmed, with an added caveat.** Independent symbolic (sympy) re-derivation confirms the formula exactly and confirms Δv is a genuine, non-affine (square-root) function of v∞ — the ratio Δv/v∞ ranges from over 6 at low v∞ to under 1 at high v∞ for LEO-radius rp, so a naive v∞ sum is not a Δv budget. But the verification pass adds a second reason this matters beyond nonlinearity: the formula is single-leg, single-impulse, and requires choosing an rp at each end; a bare porkchop v∞ grid carries none of that context, so converting v∞ to Δv also needs a chosen parking/capture orbit, not just a nonlinear correction. Some porkchop tools already plot true insertion Δv rather than raw v∞/C3 — this caveat applies specifically to metrics built from bare v∞ sums.

**Worked Hohmann-limit chain** (coplanar circular idealization, not a real-date case): a_t = 188.75×10⁶ km; v_Earth,circ = 29.78 km/s, v_Mars,circ = 24.13 km/s; transfer perihelion speed 32.73 km/s, aphelion speed 21.48 km/s → v∞_dep = 2.9435 km/s, v∞_arr = 2.6479 km/s; time of flight = π√(a_t³/μ_sun) = 258.8 days (~8.5 months). Departure Δv from 300 km circular LEO = 3.5897 km/s (C3 = 8.664 km²/s², all independently re-derived and matched during verification to 4 decimal places). Capture into a 500 km circular Mars orbit costs 2.0694 km/s; capture into a highly elliptical orbit (periapsis 500 km alt, apoapsis 33,000 km alt) costs only 0.9285 km/s — a 55% saving, an Oberth-effect result: the burn only needs to shave the hyperbolic periapsis speed down to the ellipse's periapsis speed, not all the way to a slow circular speed.

**Source access note.** Braeunig's `interpl.htm` (a named primary source) could not be opened this track — TLS hostname mismatch on `www.braeunig.us`, and `braeunig.space` does not resolve. All formulas were cross-checked instead against Wikipedia and orbital-mechanics.space, which state identical equations and reproduce every numeric anchor; Braeunig's own worked examples were never directly seen.

### T4.3 — Porkchop plots: theory plus a computed Earth-Mars porkchop (the strongest evidence in this track)

**What a porkchop plot is.** A 2-D contour map over a grid of (departure date, arrival date) — equivalently (departure date, time of flight) — pairs. One Lambert solve happens per grid cell. Standard contour families: departure C3 (km²/s²), arrival v∞, time of flight, and (per Wikipedia) Sun-Earth-probe angle at departure — a communications/geometry constraint not used in the computed grid below. Type I (short way, transfer angle < 180°) vs. Type II (long way, > 180°) overlay as separate contour families on a full porkchop; this claim's specific angle convention is corroborated by two secondary sources (a search-snippet description and degenerateconic.com) but was not checked against an authoritative JPL page — confidence "likely."

**The full chain, formalized:**

```
v_inf_departure_vec = v1_transfer − v_planet1(t_dep)
v_inf_arrival_vec   = v2_transfer − v_planet2(t_arr)
C3_departure = |v_inf_departure_vec|^2
```

C3 is the launch-vehicle-constraining quantity; the v∞ sum is a cheap proxy for total impulsive cost, not a true burn Δv (see T4.2's Oberth-formula correction above).

**Real computed porkchop grid — the strongest single result in this track.** Using Skyfield + the JPL DE421 ephemeris kernel for true 3-D Earth/Mars heliocentric state vectors, and `lamberthub.izzo2015` (μ_sun = 132,712,440,041.28 km³/s²) for the Lambert solve, a 2026-01-01 to 2029-12-31 grid (209 departure dates × 31 times of flight, 100-400 days, 6479 cells, 0 solver failures) was computed. Global best cell:

- Departure **2026-10-29**, arrival **2027-09-04**, ToF = 310 days
- v_inf_dep = 3.046 km/s → **C3_dep = 9.281 km²/s²**
- v_inf_arr = 2.579 km/s
- **v∞ sum = 5.625 km/s**

A second good window: departure 2028-11-23, arrival 2029-09-19, ToF = 300 days, C3_dep = 9.118 km²/s², v∞ sum = 5.988 km/s. The global-minimum-C3 cell in the whole grid (2028-11-30, ToF = 320 d, C3 = 9.019 km²/s²) is a *different* date than the global-minimum-v∞-sum cell — a real illustration that "min C3" and "min total v∞" pick different optimal launch dates, worth teaching explicitly in any porkchop UI.

This grid was independently re-derived during the verification pass with a from-scratch universal-variable Lambert solver (bisection root-find, not Izzo/Newton), first validated against Curtis Ex. 5.2 (matching to <6×10⁻⁵ km/s), then run against independently-fetched DE421 state vectors for the same two dates: v_inf_dep = 3.0464 km/s, v_inf_arr = 2.5790 km/s, C3_dep = 9.2806 km²/s², v∞ sum = 5.6254 km/s — matching to six decimal places. A coarser independent grid scan (14-day step) found the same global minimum at a shifted-by-about-a-week date, confirming this window is genuinely the global optimum and not a copy-paste error.

> **Corrected via verification ledger.** The claim that this window falls "inside the master doc's stated good-window bands (C3 8-16 km²/s², v∞ sum 5.6-6 km/s)" is half right. The master document's Part III §7 states only **one** numeric anchor: "good-window Earth→Mars v∞ sums ≈ 5.6-6 km/s" — and the computed 5.625 km/s genuinely matches that. But an exhaustive grep of the master document for "C3" and for "8-16" found **no stated C3 band anywhere in the document** — the "C3 8-16 km²/s²" figure originated in the T4.3 reader's own working notes, which mislabeled it a "master doc anchor" when it is not one. It is directionally reasonable astronautical knowledge (this computed grid's own C3 values, 9.02-9.48 km²/s², are consistent with it), but should be cited as "consistent with typical published Mars-mission C3 figures," not as something the master document itself asserts.

**Synodic recurrence, computed against this grid.** The two window minima found (2026-10-29 and 2028-11-23) are 756 days apart — close to but about 3% under the analytic 779.93-day synodic period (see §4/T4.1 below), attributable to the grid's 7-day coarseness and to Mars's real eccentricity/inclination not being captured by a pure beat-frequency argument. This is expected slop from grid quantization, not a bug, and should be presented to the professor as such rather than as a refined synodic-period measurement.

**Fidelity gaps disclosed by this item.** The computed grid uses a single Lambert branch only — prograde, zero-revolution, low-path (Type I/short-way) — so it is not a full Type I/II overlay. Skyfield returns state vectors in the ICRF/J2000 equatorial frame (fine for Lambert, since any consistent inertial frame works, but would need conversion for Curtis-style ecliptic-plane diagrams). A real pitfall encountered and fixed: `lamberthub.izzo2015`'s docstring claims a 3-value return `(v1, v2, numiter)`, but the installed version returns only 2 values — unpacking 3 silently produced zero successful rows until caught.

### T4.4 — Delta-v maps and subway maps as edge weights

**What a delta-v map is.** A precomputed, impulsive, patched-conic Hohmann-transfer graph — nodes are orbital states (LEO, GTO, GEO, Earth escape, Mars transfer orbit, low Mars orbit, etc.), edges are single delta-v numbers for the cheapest coplanar burn connecting them. This is structurally identical to the transfer-network graph the project's Phase C optimizer needs, just with scalar rather than vector edge weights and one fixed/typical launch date baked in. The community "subway map" (Ulysse Carion lineage, mirrored on Wikimedia Commons by CMG Lee) states its assumptions explicitly: "burns are at periapsis, and gravity assist and inclination changes are ignored," with aerobraking used only where marked. The creator even flags one uncertain number on the chart itself (a high Venus-leg value), a good example of why every number needs its own citation.

**Wikipedia's core caveat, load-bearing for this project:** "because delta-v depends on the position and motion of celestial bodies... the delta-v budget changes with launch time." Every scalar on these charts is a single-date or typical-case snapshot, not a bound — real values vary roughly ±10-30% around a synodic cycle depending on alignment quality, which is the entire reason porkchop plots exist.

**Tabulated cross-checks** (all computed independently via vis-viva in `T4_4_dv_check.py`, 300 km circular parking/capture orbit assumed):

| Edge | Wikipedia figure | Computed (vis-viva) | Note |
|---|---|---|---|
| LEO → GEO total (coplanar, equatorial LEO) | 3.90 km/s | 3.893 km/s | matches to 0.007 km/s; Wikipedia's 4.24 km/s "Kennedy-inclination" figure adds a ~28.5° plane change, excluded by the coplanar assumption |
| LEO → TLI | 3.20 km/s | 3.106 km/s | small gap plausibly from a historical Apollo-era parking altitude/inclination |
| LEO → Earth escape (C3=0) | ~3.2 km/s (the article's *other* commonly-quoted figure; a separate ~9.3-10 km/s figure elsewhere in the article uses a different baseline) | 3.200 km/s | flags a real internal inconsistency in casually reading chart numbers — re-derive, don't trust verbatim |
| LEO → Mars transfer injection | ~4.3 km/s | 3.590 km/s | gap consistent with Wikipedia using a lower parking altitude and/or a faster-than-Hohmann trajectory (real missions always fly higher-C3 than minimum-energy to shorten cruise time) |
| Mars capture orbit → low Mars orbit | 0.9+1.4 = 2.3 km/s (two-burn: capture-then-circularize) | 2.092 km/s (single direct burn) | both are legitimate, different-complexity strategies — a genuine "fidelity choice" a graph edge weight must encode, not resolved to one number here |
| LEO → Venus injection | 3.5 km/s | 3.482 km/s | excellent match (0.02 km/s) |
| Earth→Mars Hohmann ToF | ~8-9 months | 258.9 d = 8.51 months | matches |
| Earth→Venus Hohmann ToF | 143-149 days (Braeunig, via search snippet only, "likely") | 146.0 days | falls in the middle of the quoted range |

**Aerobraking note (verified).** "The return to LEO figures assume that a heat shield and aerobraking/aerocapture are used to reduce the speed by up to 3.2 km/s" — aerobraking can substitute for a multi-km/s propulsive burn at near-zero propellant cost, at the price of a much longer (weeks-to-months), multi-pass capture timeline and thermal/structural risk, versus a single propulsive burn. Consistent with real missions (MAVEN, MRO) using aerobraking after an initial propulsive capture into a high elliptical orbit.

**Implication for graph edge weights.** A sensible v1 edge-weight vector per (departure state, launch window) → (arrival state) edge: (1) delta-v from an actual Lambert solve for that specific date pair, with the static delta-v map used only as a sanity-check anchor, never the ground-truth edge cost; (2) time of flight, straight from the Lambert solve; (3) launch-window slack / C3 margin — how far the chosen departure date sits from the local porkchop minimum, a schedule-risk proxy not present on any classic delta-v map at all; (4) a risk/fidelity flag — propulsive vs. aerobraking capture, plane-change bundled or assumed away, Hohmann-minimum vs. faster/higher-energy trajectory. Any edge weight sourced from a static map value needs an in-repo citation comment with the date-independence caveat; interplanetary edges must never be hardcoded from the map — only computed live from Lambert/porkchop for the requested dates, with the map retained as a fallback/unit-test sanity bound.

### T4.5 — CR3BP basics and cislunar transfer families (survey level)

**CR3BP setup.** Models a massless spacecraft under the gravity of two primaries (Earth, Moon) orbiting their barycenter circularly. In the barycentric rotating frame (nondimensionalized by R = 384,400 km, mean motion = 1), mass ratio μ = m2/(m1+m2). For Earth-Moon, μ = 0.012154 (computed with standard masses; Earth sits at x = -μ, Moon at x = 1-μ). The pseudo-potential Ω(x,y,z) = ½(x²+y²) + (1-μ)/r1 + μ/r2 + ½μ(1-μ) gives the equations of motion; the system's one conserved quantity is the **Jacobi constant** C = 2Ω − v², the CR3BP analogue of two-body specific energy, partitioning phase space into allowed/forbidden Hill regions. No second conserved quantity exists (Bruns 1887, Poincaré 1889) — this is exactly why the three-body problem has no closed-form solution and is chaotic.

**Lagrange points, Earth-Moon (computed via numerical root-solve, `scipy.optimize.brentq`, verified):**

| Point | Value |
|---|---|
| L1 (toward Earth from Moon) | 58,024 km from Moon |
| L2 (beyond Moon) | 64,521 km from Moon |
| L3 (opposite Earth from Moon) | ~381,675 km from Earth |
| Hill-sphere check, r ≈ R(μ/3)^(1/3) | 61,279 km (order-of-magnitude sanity check against L1/L2) |

L1 connects Earth-side and Moon-side dynamical "realms"; L2 connects Moon-side and outer/deep-space realms — the mechanism behind low-energy/weak-stability-boundary transfers.

**Orbit families around L1/L2**, by increasing period (Whitley & Martinez 2016, Table 1, verified): LLO (~2 hr), prograde circular orbit (~11 hr, ~75° inclination), frozen lunar orbit (~13 hr), elliptical lunar orbit (~14 hr, equatorial), **Near Rectilinear Halo Orbit** (6-8 day period, amplitude 2,000-75,000 km, roughly polar), Earth-Moon L2 halo (8-14 day period), Distant Retrograde Orbit (~14 day, ~70,000 km, equatorial). NRHOs are the halo-family branch passing very close to the Moon at perilune (hence "near rectilinear" — nearly a straight line through the Moon in the rotating frame) and are dynamically near-stable, needing only order-1-10 m/s per orbit of station-keeping, unlike most of the unstable halo family. Gateway's reference orbit is a 9:2 lunar-synodic-resonant Southern L2 NRHO, period ≈ 6.5-7 days, perilune ≈ 3,000 km over the north pole, apolune ≈ 70,000 km over the south pole (confidence "likely" — sourced from Wikipedia, corroborated but not identically confirmed by Whitley & Martinez's more general 6-8 day NRO figure).

**Ballistic lunar transfers (BLTs) — the numbers that need careful handling.** BLTs fly roughly a million-plus kilometers from Earth, well beyond the Moon's orbit, into a regime where solar gravity dominates; the Sun's perturbation raises the trajectory's perigee to lunar-orbit altitude and rotates its inclination to match the target plane, letting a single near-zero-deterministic-Δv ballistic coast substitute for a large insertion burn. Verified directly from the Advanced Space BLT Cheat Sheet PDF text:

- BLT time of flight to NRHO: **80-130 days without an outbound lunar flyby, 110-180 days with one.**
- CAPSTONE's total spacecraft ΔV budget: **52 m/s nominal, 110 m/s at the 99th percentile** (cruise 22/57, NRHO insertion 18/35, station-keeping 0/1, desaturation −/10, disposal 5/7 m/s, nominal/ΔV99). Rule of thumb from the same source: "many missions can safely fly a BLT to NRHO for as little as 70-100 m/s, but 150 m/s is recommended as a safe starting point for early designs."
- BLT Table 4 example (2024 launches, insertion ΔV / ToF): highly elliptical polar orbit 95.4 m/s / 106.7 days; high circular lunar orbit 182.0 m/s / 94.6 days; LLO (100 km) polar 639.7 m/s / 107.1 days.

Direct-transfer comparison (Whitley & Martinez 2016, verified): direct transfer to NRO costs **840 m/s for a 10.9-day transfer** (or 751 m/s for a 37.6-day transfer); L2 halo 811 m/s/~5 days or 637 m/s/~10 days; DRO 957 m/s/~6 days or 841 m/s/~6 days.

> **Corrected via verification ledger — this is the most heavily qualified claim in the track.** The original T4.5 framing pairs "direct transfer 750-900+ m/s, 3.5-11 day ToF" against "BLT 52-150 m/s, 80-180 day ToF" as if both describe the same quantity (one-way NRHO-insertion Δv). Two independent, deep source re-reads (including opening Whitley & Martinez's own tables directly rather than trusting the T4.5 summary of them) found this comparison mixes non-comparable quantities:
> - The "840 m/s, 10.9 days" and "751 m/s, 37.6 days" figures in Whitley & Martinez are **round-trip** totals (enter-and-return-from-NRO) for a *crewed Orion* architecture with a 4-burn sequence, not a one-way insertion Δv, and the quoted "days" is NRHO stay time in one reading, not transfer time — the paper's own Figure 2 states the one-way outbound TLI-to-NRO transfer is **5.1 days**, with an insertion burn of 190-221.5 m/s (one component of the 840 m/s round-trip total).
> - CAPSTONE's 52-150 m/s figure is the **total one-way mission budget** (cruise + insertion + station-keeping + desaturation + disposal), not a pure insertion burn. CAPSTONE's insertion maneuver alone is only 18 m/s nominal / 35 m/s at ΔV99; Whitley & Martinez's own optimized BLT insertion burns (to the same reference NRHO, no statistical margin) ran 6.3-50.2 m/s.
> - An independent patched-conic/vis-viva computation of a one-way direct insertion burn *into an NRHO-shaped ellipse* (perilune altitude 3,000 km, apolune altitude 70,000 km, v∞ 0.6-1.2 km/s) gives only about 165-480 m/s, not 750-900 m/s — the 750-900+ m/s range instead matches direct insertion into a *low circular 100 km* lunar orbit (giving 753-970 m/s, closely reproducing the cited Parker & Anderson ≥820 m/s figure), a materially different target orbit than NRHO.
>
> **Corrected statement:** BLTs to NRHO genuinely deliver an order-of-magnitude reduction in propellant cost relative to a direct chemical transfer to the same orbit, at the cost of roughly 100+ extra days of flight time, by exploiting a solar-perturbation mechanism a two-body Lambert/patched-conic solver structurally cannot represent. But the size of that reduction depends on which quantities are being compared: roughly 2-4x if comparing one-way insertion-only Δv into an NRHO-shaped target (≈165-480 m/s direct vs. ≈18-35 m/s BLT insertion), or roughly 5-10x if comparing total mission-level Δv budgets (≈750-950 m/s direct round-trip/crewed-architecture totals vs. ≈52-150 m/s BLT total mission budget). Use "roughly an order of magnitude, precise multiplier depends on exactly which Δv quantities are compared" rather than quoting a single crisp "5-10x" figure to the professor.

**Discrete families, not a continuum.** The BLT cheat sheet explicitly frames BLTs as **16 discrete named families** (defined by TLI node, apogee quadrant, flyby-or-not, wind-on revolution count), not points on a continuously tunable Δv(T) curve, each family repeating on a ~29.5-day synodic-month cadence. This discreteness is the structural reason to expect a non-convex — possibly disconnected — Pareto front between the "cheap-slow BLT" cluster and the "expensive-fast direct" cluster: a weighted-sum scalarization can only select points on the lower convex hull of the achievable (Δv, ToF) set, so it would jump directly between the direct-transfer point and the BLT point as the weight ratio crosses some threshold, and could never select a genuinely intermediate non-dominated solution living in the gap between clusters, if one exists. **Honest gap, flagged directly by the reader and not resolved by the verification pass:** no dense, same-target-orbit Δv(T) sweep spanning intermediate flight times (roughly 15-80 days) was found in either source, so this non-convexity argument is a structurally well-motivated inference from the discrete-family framing and the two-cluster data, not a numerically verified curve-shape proof. Present it to the professor as inferred-from-structure, not curve-proven.

### T4.6 — Low-thrust and higher-fidelity mission design (mention-only), and the fidelity ladder

**Why electric propulsion breaks the Lambert model.** Chemical propulsion (Isp ~300-450 s) delivers high thrust briefly, so a burn can be treated as an instantaneous impulse — exactly the assumption Lambert's problem needs. Electric propulsion (Isp 1,500-4,100+ s, thrust of only tens to low hundreds of millinewtons because it is power-limited, not energy-density-limited) inverts the trade: burns last hours to months, and the trajectory during a burn is neither a clean ellipse nor hyperbola. NASA's Dawn spacecraft (NSTAR ion engine, 2.3 kW, ~92 mN thrust, Isp ~3,100 s, accumulating ~11 km/s total mission delta-v) is the canonical example (confidence "likely" — figures from WebSearch snippets of the NASA fact sheet and a Springer chapter, not opened directly).

Because thrust is continuous and tiny relative to spacecraft weight, low-thrust trajectory design becomes an **optimal control problem**: find a time-varying thrust-direction/duty-cycle control u(t) satisfying the equations of motion and boundary conditions while minimizing propellant or flight time, with no closed-form solution. **Indirect methods** (Pontryagin's Minimum Principle, costate shooting) are mathematically elegant but brutally sensitive to the initial guess; **direct methods** discretize the trajectory into decision variables and hand the resulting nonlinear program to a solver (SNOPT, IPOPT) — this is what essentially every practical mission-design tool uses today because it tolerates poor initial guesses far better.

**Sims-Flanagan transcription** (confidence "likely" — pykep's own documentation page 404'd on direct fetch both times it was tried; reconstructed from WebSearch snippets quoting it): chop a leg into N equal-duration segments, approximate the continuous thrust in each by one bounded impulsive Δv at the segment midpoint (a control node), coast on ordinary Kepler arcs between impulses. Propagate forward from departure and backward from arrival; the two propagations must agree in position, velocity, and mass at a mid-leg match point, which becomes a set of nonlinear equality constraints. This turns "solve for a continuous control history" into "solve for N discrete throttle vectors" — a finite-dimensional NLP. This is the shared backbone of JPL's MALTO and NASA Goddard's EMTG (whose "MGALT" mode uses it; EMTG's higher-fidelity "FBLT" mode does true forward/backward numerical integration instead). `pykep` already exposes both impulsive Lambert-arc legs and Sims-Flanagan low-thrust legs — the natural long-term dependency if the project ever adds a low-thrust mode, though the master document already flags WASM-compiling pykep as painful for browser deployment, favoring a thin server-side service over in-browser optimization for that future phase.

**The fidelity ladder deliverable — five levels**, synthesized across all six T4 items (T4.1, T4.2, T4.3, T4.4, and T4.6 each independently converge on a similar structure; the wording below reconciles them):

| Level | What it computes | What it ignores | Disclosure text |
|---|---|---|---|
| **0 — Teaching Keplerian** | Position/velocity from 6 classical elements via Kepler's equation, single point-mass body | All perturbations (drag, J2, third-body, SRP) | "Idealized two-body orbit for teaching — not a real satellite's actual path." |
| **1 — SGP4 catalog** | TEME position/velocity from published TLE mean elements via SGP4/SDP4 | Maneuvers since TLE epoch; anything beyond SGP4's built-in drag model | "Real satellite position from published TLE data (epoch shown); accuracy degrades the further from that epoch we are." |
| **2 — Impulsive patched-conic Lambert (v1's interplanetary layer)** | One Lambert solve per (departure, arrival) date pair on real ephemeris positions; v∞ excess speeds at each SOI summed into a cost metric | Finite burn duration; capture-orbit insertion cost; precise plane-change cost; n-body perturbations during coast; launch-vehicle-specific C3-vs-payload curves | "Idealized impulsive (instant-burn) transfer using patched-conic Lambert arcs. Departure and arrival delta-v shown are v-infinity excess speeds at each planet's sphere of influence — capture-orbit insertion, plane-change, and launch-vehicle-specific costs are not included." |
| **3 — Finite burns / n-body / capture spirals / launch-vehicle C3 curves** | Real finite-duration burns with gravity losses; n-body or CR3BP propagation; explicit capture-insertion Δv; explicit plane-change cost; matched against real launch-vehicle performance curves | Continuous low-thrust; navigation/uncertainty | "Higher-fidelity model including capture burns, plane changes, and n-body dynamics — flight-project-grade for chemical-propulsion missions, but still assumes impulsive burns." |
| **4 — Low-thrust, navigation, uncertainty (mention-only)** | Sims-Flanagan/FBLT-style direct transcription solved via NLP; orbit-determination/navigation covariance propagation | Not modeled by this project at all through v2 | "Not modeled. Electric-propulsion (low-thrust) missions, precise navigation, and uncertainty quantification are outside this tool's scope; results here apply only to chemical/impulsive-burn missions." |

v1 sits at **Level 2** — matching essentially every public porkchop tool including NASA's own Trajectory Browser, so it is well-precedented, but it must ship with explicit disclosure text and ideally a persistent, visible fidelity-level badge rather than only README prose.

## 4. Answers to the Three Track Questions

### Q1 — What a Lambert solve returns, and the chain to porkchop delta-v numbers

A Lambert solve takes **(r1, r2, Δt, μ)** — the departure body's position at the departure date, the arrival body's position at the arrival date, the time of flight between the dates, and the central-body gravitational parameter (μ_sun for an interplanetary leg) — and returns exactly **two velocity vectors**: v1 (the transfer conic's velocity at r1, the velocity the spacecraft must have leaving r1 to arrive at r2 in exactly Δt) and v2 (the transfer conic's velocity on arrival at r2). It returns *no* delta-v directly. Izzo's 2015 algorithm solves this as 1-D root-finding on a normalized variable x, using a 3rd-order Householder iteration that converges in about two iterations for the direct (M=0) case, given a good closed-form initial guess. Cross-validated in this project: `lamberthub`'s `izzo2015`, `vallado2013`, and `gooding1990` all reproduce Curtis Example 5.2 to under 5.2×10⁻⁵ km/s (`T4_1_lambert.py`).

To get delta-v-relevant quantities, subtract each planet's own heliocentric velocity (from ephemeris, not Lambert) at that instant:

- v_inf_departure = v1 − v_Earth(t_dep); v_inf_arrival = v2 − v_Mars(t_arr)
- **C3 = |v_inf_departure|²** (km²/s²) — the standard launch-vehicle-performance axis
- Departure/capture burn from a circular parking orbit of radius rp: **Δv = √(v∞² + 2μ/rp) − √(μ/rp)** (the Oberth/hyperbolic-excess formula; nonlinear in v∞, verified symbolically and numerically)
- The porkchop's cheap proxy metric is **v∞ sum = |v_inf_dep| + |v_inf_arr|**, not a true Δv budget — it is nonlinear versus the real formula and hides the capture-strategy choice (a 55% swing between circular vs. elliptical Mars capture in the T4.2 worked example, plus the choice of parking/capture radius, which a bare v∞ sum carries no information about at all).

**Worked example (real JPL DE421 ephemeris + izzo2015, global-best cell in a 2026-2029 grid, independently re-verified during the verification pass):** departure 2026-10-29 → arrival 2027-09-04 (ToF = 310 d). v_inf_dep = 3.046 km/s → **C3_dep = 9.281 km²/s²**; v_inf_arr = 2.579 km/s; **v∞ sum = 5.625 km/s** — matching the master document's "~5.6-6 km/s good window" anchor almost exactly. (Note the corrected sourcing from §3/T4.3 above: the "C3 8-16 km²/s²" comparison band is reasonable astronautical context reproduced by this grid's own values, not something the master document itself states.) A separate idealized-Hohmann worked chain (circular coplanar orbits, not a real-date case) gives v_inf_dep = 2.94-2.95 km/s, v_inf_arr = 2.65 km/s, ToF = 258.8-259 d, departure Δv = 3.59 km/s from 300 km LEO, C3 = 8.66-8.68 km²/s² — consistent in order of magnitude but explicitly not a real-date mission number. A porkchop plot is this whole Lambert → v∞ → C3 chain evaluated once per (departure, arrival) grid cell and contoured.

### Q2 — Why launch windows recur, and cadence per planet pair

A good Earth-target transfer geometry recurs because Earth and the target orbit the Sun at different angular rates; the relative alignment repeats with the **synodic period**:

$$T_{syn} = \frac{1}{\left|\frac{1}{T_1} - \frac{1}{T_2}\right|}$$

where T1, T2 are the two bodies' sidereal orbital periods (same units). Computed independently across four T4 readers using consistent sidereal periods (T_Earth = 365.256 d, T_Venus = 224.701 d, T_Mars = 686.980 d, T_Jupiter = 4332.59 d), and re-verified via an independent computation and cross-check against the sidereal periods on Wikipedia's Earth/Venus/Mars/Jupiter pages (sourced to JPL):

- **Earth–Venus ≈ 583.9 days** (~1.60 yr)
- **Earth–Mars ≈ 779.9 days** (~2.14 yr / ~26 months) — matches the master document's "~780-day" anchor to within 0.1 d
- **Earth–Jupiter ≈ 398.9 days** (~1.09 yr)

Note the non-obvious result: Earth–Jupiter's synodic period is *shorter* than Earth–Mars's despite Jupiter being far more distant, because as T_outer → ∞, 1/T_outer → 0 and T_syn → T_Earth (365.256 d) from above — synodic period is set by the *difference* in angular rates, not by which body is farther/slower. T4.3's independently grid-searched porkchop minima (2026-10-29 vs. 2028-11-23, 756 days apart) roughly confirm the ~780-day cadence, undershooting by about 3% due to 7-day grid coarseness and Mars's real eccentricity/inclination (not captured by the circular-coplanar formula).

> **Verification qualifier.** T_syn = 1/|1/T1 − 1/T2| gives the *mean, idealized* synodic period under the circular-coplanar assumption, confirmed correct arithmetically and against independent computation to five significant figures. It is not the exact interval between any two consecutive real oppositions: because Mars's orbital eccentricity (e ≈ 0.093) makes its angular rate vary noticeably around its orbit, real Earth-Mars opposition-to-opposition intervals vary roughly 764-812 days around the 779.9-day mean, and NASA/JPL colloquially describe the recurring Mars window as "about every 26 months" — a rounded figure — rather than a fixed 779.9-day cycle. Synodic period only sets *cadence*, not *quality*: actual delta-v still varies window to window, and Mars opposition quality cycles over roughly 15-17 years due to its eccentricity.

### Q3 — Acceptable v1 fidelity shortcuts and UI disclosure

Consensus fidelity ladder across all six T4 items (see the full five-level table in §3/T4.6):

- **Level 0 — Teaching/illustrative**: circular, coplanar orbits, arbitrary dates — used only to build worked-chain intuition, never shown as a mission number.
- **Level 1 — SGP4 catalog** (real Earth satellites, out of this track's scope but part of the same ladder).
- **Level 2 — v1 default (recommended)**: real ephemeris (JPL DE421/Skyfield) planet positions on actual candidate dates; patched-conic approximation, justified because each SOI radius is a small fraction of the corresponding planet's own heliocentric orbital radius (Earth SOI 924,540 km is 0.62% of 1 AU, Mars SOI 577,067 km is 0.25% of Mars's own 1.524 AU — see the corrected framing in §3/T4.2, since "under 1% of the Earth-Mars distance" is not a correct way to state this); impulsive burns (no finite-duration/gravity losses); single Lambert branch (Type I short-way, M=0) is acceptable if disclosed, though a full tool should eventually offer Type I/II and multi-rev; v∞ sum or C3 as the displayed cost, explicitly labeled as *not* a total Δv budget (no capture spiral, no plane-change cost, no launch-vehicle-specific C3 curve).
- **Level 3 — Later**: explicit capture-insertion Δv (propulsive vs. aerocapture — differs meaningfully, and per the corrected T4.5 numbers the multiplier depends heavily on exactly which orbit and which Δv quantities are compared), plane-change cost, launch-vehicle C3-vs-payload curves, finite burns/n-body corrections.
- **Level 4 — Out of v1/v2 scope, mention-only**: CR3BP/cislunar effects (ballistic lunar transfers reduce cislunar-arrival Δv substantially relative to direct patched-conic transfer — roughly an order of magnitude on a total-mission-budget basis, with the precise multiplier depending on which Δv quantities are compared, per the corrected T4.5 analysis — a difference a Lambert-only model structurally cannot produce); low-thrust/electric propulsion (Sims-Flanagan direct transcription + NLP, a different solver stack entirely, not an extension of the Lambert graph edge); navigation/uncertainty quantification.

**Recommended UI disclosure wording** (synthesized from T4.1-T4.6, all converging on similar language): *"Idealized two-body patched-conic estimate: impulsive (instantaneous) burns, ephemeris-based Lambert arc, coplanar/short-way transfer only. Delta-v shown is v-infinity excess speed at each planet's sphere of influence — not a flight-ready total mission delta-v budget (excludes orbit-insertion/capture burn, plane-change, and launch-vehicle losses). Does not include ballistic lunar transfers, low-thrust trajectories, or n-body perturbations."* A persistent fidelity-level badge (e.g. "Level 2: patched-conic Lambert") carrying this tooltip, rather than only README prose, is the concrete deliverable multiple readers converge on independently.

## 5. Verification Ledger

Five claims were run through two independent verification lenses (an independent from-scratch computation, and an independent primary-source re-check). All five needed qualification; none were fully confirmed as originally stated, and none were outright refuted either. Corrected wording is incorporated into §3/§4 above; this table summarizes what changed and why.

| # | Claim (original) | Compute-lens verdict | Source-lens verdict | What changed |
|---|---|---|---|---|
| 1 | SOI radii (Earth 924,540 km, Mars 577,067 km) are "under 1% of the ~1.5×10⁸ km Earth-Mars distance" | needs_qualification (0.85) | needs_qualification (0.88) | The SOI-radius arithmetic is confirmed exactly. But 1.5×10⁸ km is 1 AU (Earth's own heliocentric semi-major axis), not the Earth-Mars distance, which actually ranges ~55-401 million km; at close oppositions the ratio exceeds 1%. Corrected comparison: each SOI radius is under 1% of the *planet's own* heliocentric orbital radius, which is the textbook-correct patched-conic justification. |
| 2 | Departure/capture Δv follows Δv = √(v∞²+2μ/rp) − √(μ/rp), nonlinear in v∞, so the v∞-sum porkchop metric is not a true Δv budget | confirmed (0.93) | needs_qualification (0.93) | The formula and its nonlinearity are fully confirmed (symbolic derivation + numeric match to 4 decimals). The source lens adds that nonlinearity is only one of several reasons the v∞ sum isn't a Δv budget — it also omits the choice of rp at each end and any plane-change term, and not every porkchop tool actually plots the raw v∞ sum (some already plot true insertion Δv). |
| 3 | Synodic periods: Earth-Mars ≈ 779.9 d, Earth-Venus ≈ 583.9 d, Earth-Jupiter ≈ 398.9 d, using stated sidereal periods | confirmed (0.95) | needs_qualification (0.88) | Arithmetic and sidereal-period inputs both confirmed against independent computation and against Wikipedia/JPL-sourced figures. Both lenses add the same caveat: this is the *mean, idealized* circular-coplanar value; real Earth-Mars opposition intervals vary roughly 764-812 days around it because of Mars's eccentricity, and NASA/JPL describe the cadence colloquially as "about every 26 months," not a fixed constant. |
| 4 | The computed 2026-10-29/2027-09-04 porkchop window (C3=9.281, v∞ sum=5.625) falls inside "the master doc's stated good-window bands (C3 8-16 km²/s², v∞ sum 5.6-6 km/s)" | needs_qualification (0.85) | needs_qualification (0.85) | The window itself was independently re-derived to 6 decimal places and confirmed to be the true global minimum on the grid. But the master document states only the v∞-sum anchor (5.6-6 km/s) — a full-document grep found no C3 band anywhere in it. The "C3 8-16" figure originated in the reader's own working notes, mislabeled as a master-doc anchor. |
| 5 | BLTs reduce NRHO-insertion Δv from ~750-900+ m/s (direct, 3.5-11 day ToF) to ~52-150 m/s (BLT, 80-180 day ToF), a 5-10x reduction a Lambert-only model cannot produce | needs_qualification (0.65) | needs_qualification (0.6) | The qualitative point (BLTs are a structurally distinct trajectory class Lambert-only math cannot reach, at large ToF cost) holds and is independently confirmed. But the specific numbers mix a round-trip crewed-Orion total against a one-way uncrewed total-mission budget, and mix an NRHO-insertion figure against a low-circular-LLO figure in places. Independent re-derivation gives a one-way NRHO-insertion-only comparison of roughly 165-480 m/s (direct) vs. 18-35 m/s (BLT) — a 2-4x factor — or roughly 750-950 m/s vs. 52-150 m/s on a total-mission-budget basis — a 5-10x factor — depending on which quantities are compared. |

## 6. Implications for the Build

**Decisions this track supports directly:**

1. **v1 sits at fidelity Level 2** (impulsive patched-conic Lambert, real ephemeris dates, v∞/C3 as the displayed cost) — well-precedented (matches NASA's own Trajectory Browser), and every fidelity shortcut it takes is one that all six T4 readers converge on independently.
2. **C1 (Lambert/porkchop) stack recommendation.** None of the JS/TS options surveyed are both confidently production-grade and Izzo-verified. Given the project's stated bias toward serverless, auditable math (`core/`, `optimize/` stay headless-testable, "nothing imports scene/"), the recommended path is: **an in-house pure-JS/TS port of Izzo's 2015 algorithm**, unit-tested against the same Curtis/Battin/Vallado known-answer cases lamberthub uses. Izzo's reference implementation is compact (a few hundred lines of well-specified math: the x-variable, λ geometry parameter, Householder update, piecewise initial guess), making it a bounded, auditable, high-leverage port that keeps zero server dependency and doubles as deep learning directly useful for the eventual EMOA* integration. `influenceth/lambert-orbit` (MIT) is a viable starting point only after its source is read and the same textbook cases are added as tests — do not adopt an unread MIT package as-is. A thin Python microservice wrapping `pykep`/`lamberthub` is the highest-fidelity-fastest option but breaks the serverless-hosting default and should be a fallback, not the default. **Do not depend on an npm package called `lambert-izzo`** — it could not be confirmed via the authoritative npm registry search API and is very likely a fabricated search result.
3. **The porkchop grid needs real ephemeris, not the circular-coplanar Hohmann shortcut**, for anything shown as a mission number. `T4_3_porkchop.py`'s Skyfield + DE421 + lamberthub pipeline is a working, from-scratch-verified example of exactly this, and its CSV output (`T4_3_porkchop.csv`, 6479 rows) is a ready-made oracle for testing a future JS Lambert port.
4. **v∞ sum / C3 must never be presented as a total Δv budget** without the parking/capture-orbit context (radius, strategy). A capture-strategy toggle (propulsive circular vs. propulsive elliptical vs. aerocapture) changes the reported number by 50%+ for the identical Lambert-derived v∞ pair (2.07 vs. 0.93 km/s in the T4.2 worked example) — this needs to be a first-class UI choice, not a hidden default.
5. **SOI-based patched-conic justification** should be stated correctly: each SOI radius is under 1% of the planet's *own* heliocentric orbital radius (not the instantaneous Earth-target distance, which is highly variable and can make the naive ratio exceed 1%).
6. **Cislunar/BLT nodes are out of scope for a Lambert-only graph edge model**, and must be disclosed as such the moment cislunar nodes are added — not folded silently into the same edge type as interplanetary Lambert arcs. The two-cluster (direct vs. BLT) structure is real, sourced evidence for the project's EMOA*-over-weighted-sum-search differentiator claim, but should be presented as a structural, not a curve-proven, non-convexity argument.

**Code-level rules to encode:**

- Every delta-v/C3/v∞ number in the UI carries the disclosure string from §4/Q3, verbatim or close to it.
- `optimize/lambert` (or equivalent module) ships with the Curtis Ex. 5.2 known-answer test (r1=[5000,10000,2100] km, r2=[-14600,2500,7000] km, Δt=3600 s, μ⊕=398600 km³/s²) as a standing oracle, expecting v1≈[-5.9925,1.9254,3.2456], v2≈[-3.3125,-4.1966,-0.38529] km/s to within ~1e-4 km/s.
- Interplanetary graph edges are computed live from a per-window Lambert solve; static delta-v-map/subway-map numbers are used only as a sanity-check bound in tests, never as a runtime edge weight.
- Any UI text using the simple synodic-period formula for explanatory "why do windows recur" content must state it is the idealized circular-coplanar mean, not an exact per-cycle constant.

**Pitfalls already hit and worth pre-empting:**

- `lamberthub.izzo2015`'s docstring claims a 3-value return; the installed version returns 2 — a real, already-encountered bug pattern worth a defensive check/version pin.
- Skyfield's DE421 output is ICRF/J2000 equatorial, not ecliptic — fine for Lambert internally, but needs explicit conversion before comparing against Curtis-style ecliptic-plane diagrams.
- "Min C3" and "min v∞ sum" pick different optimal launch dates on a real grid — a porkchop UI that only exposes one contour family risks steering users toward an inconsistent notion of "best."

## 7. Still Uncertain / To Read Next

- The Izzo 2015 arXiv PDF was never opened directly (WebFetch garbled the PDF); the algorithm description rests on the ar5iv HTML mirror, a third-party rendering — worth a human spot-check if exact equation numbering matters.
- Curtis Example 5.2's textbook-printed v1/v2 answer key was never independently re-confirmed from a second open source; verification relied on 3-way cross-algorithm agreement.
- Braeunig's `interpl.htm` (a named primary source for two items) could not be opened this track (TLS cert mismatch; the `.space` mirror does not resolve) — cross-checked via Wikipedia and orbital-mechanics.space instead, which agree, but Braeunig's own worked examples were never seen directly.
- The Sims-Flanagan low-thrust transcription description is reconstructed entirely from WebSearch snippets quoting pykep's docs page, which 404'd on direct fetch — flagged "likely," not "verified." A follow-up should `pip install pykep` into the venv and read the source/docstrings directly.
- No dense same-target ΔV(T) sweep was found to numerically prove Pareto-front non-convexity for cislunar transfers (BLT vs. direct clusters) with an actual curve — the two-cluster/16-discrete-family argument is structurally inferred, not curve-proven. Parrish et al. 2019/2020 (cited inside the BLT cheat sheet) likely has denser data and is worth fetching directly.
- The Type I/II (<180°/>180°) transfer-angle convention for porkchop contour families was corroborated only by two secondary sources, never against an authoritative JPL page.
- The ResearchGate CAPSTONE NRHO-insertion navigation paper (350-550 m/s direct vs. 20-60 m/s BLT figures) returned a 403 on fetch and was only read as a search snippet — should be re-verified before quoting those specific numbers.
- Parker & Anderson's *Low-Energy Lunar Trajectory Design* (the JPL Deep Space Communications and Navigation Series book behind the 820 vs. 640 m/s LLO figure) was never opened directly — only reached via a secondary citation.
- An npm package `lambert-izzo` surfaced via WebSearch could not be confirmed via the authoritative npm registry search API and is flagged as likely fabricated — should not be treated as a real C1 dependency without a human checking npmjs.com directly.

## 8. Glossary

- **Lambert's problem** — given two position vectors and a time of flight about a common central body, find the connecting two-body conic arc's endpoint velocities.
- **Type I / Type II transfer** — short-way (transfer angle < 180°) vs. long-way (> 180°) Lambert solution branch.
- **v∞ (hyperbolic excess velocity)** — the spacecraft's velocity relative to a planet at the edge of its sphere of influence, i.e. the residual speed after subtracting the planet's own heliocentric velocity.
- **C3 (characteristic energy)** — v∞² (km²/s²); twice the specific orbital energy of the escape/arrival hyperbola; the standard launch-vehicle-performance metric.
- **SOI (sphere of influence)** — the Laplace-formula radius around a planet within which planetocentric (rather than heliocentric) dynamics dominate; r_SOI = a(m/M)^(2/5).
- **Patched-conic approximation** — modeling an interplanetary trajectory as three separate two-body conics (departure hyperbola, heliocentric transfer, arrival hyperbola) glued together by instantaneous vector patching at each SOI boundary.
- **Oberth effect** — the nonlinear gain in energy change per unit Δv when a burn is performed at high speed (deep in a gravity well, e.g. at periapsis).
- **Porkchop plot** — a contour map over a (departure date, arrival date) grid, one Lambert solve per cell, typically contoured by C3, arrival v∞, and time of flight.
- **Synodic period** — the beat period T_syn = 1/|1/T1 − 1/T2| at which two orbiting bodies return to the same relative angular alignment; sets launch-window cadence, not window quality.
- **CR3BP (Circular Restricted Three-Body Problem)** — the dynamical model of a massless third body under the gravity of two primaries in circular mutual orbit; has one conserved quantity (the Jacobi constant) and no closed-form general solution.
- **Lagrange points (L1-L5)** — the five equilibrium points of the CR3BP; L1-L3 collinear (no closed form), L4-L5 equilateral-triangle (closed form).
- **NRHO (Near-Rectilinear Halo Orbit)** — a dynamically near-stable halo-family orbit around a Lagrange point that passes very close to the smaller primary at periapsis; NASA's Gateway reference orbit is a 9:2 lunar-synodic-resonant Southern L2 NRHO.
- **Ballistic Lunar Transfer (BLT)** — a low-energy cislunar transfer exploiting solar third-body perturbation over a multi-month ballistic coast to reach lunar-orbit insertion at a fraction of the direct-transfer propellant cost, at the cost of much longer flight time; exists as discrete named families, not a continuum.
- **Sims-Flanagan transcription** — the standard direct-transcription method for low-thrust trajectory optimization: discretize a leg into segments, approximate continuous thrust as one bounded impulsive Δv per segment, and solve the resulting nonlinear program with forward/backward-propagation match-point constraints.
- **Pareto front / dominance / weighted-sum scalarization** — in multi-objective search, the set of non-dominated solutions; weighted-sum scalarization can only ever find points on the convex hull of that set, provably missing non-convex Pareto-optimal points such as (plausibly) intermediate direct/BLT cislunar trajectories.
