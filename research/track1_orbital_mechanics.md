# Track 1: Orbital Mechanics Fundamentals

## 1. Orientation

This track builds the first-principles orbital-mechanics foundation the whole project sits on: the two-body problem, the conic (orbit) equation, the six classical orbital elements, the perifocal-to-ECI rotation, Kepler's equation and the three anomalies (true, eccentric, mean), and the shapes of the orbit families (LEO, GEO, Molniya, sun-synchronous) that any teaching UI or preset list needs to get right. It is the mathematical substrate for the Keplerian "elements sandbox" teaching mode (Phase 0), for understanding what satvis's element panel actually shows and does not show (Phase A), and for the conic geometry that Lambert/porkchop trajectory search will need later (Phase B/C). Concretely, this document validates the master document's `elementsToECI` and `solveKepler` code sketches (Part III, secs. 1.1 and 6.1) against Curtis's textbook worked example, independent geometric constructions, and open-source astrodynamics libraries (poliastro/hapsira), flags one sign error in the master document's prose, and supplies a table of ready-to-use preset orbits (ISS, GPS, GEO, Molniya, sun-synchronous) with checked numbers.

Units: SI (km, km/s, s) throughout, with degrees used only for human-readable angle values as is conventional in orbital mechanics; all angles are radians inside any code. μ_Earth = 398600.4418 km³/s² (WGS-84/GGM convention) unless noted; satellite.js/SGP4 internally uses the slightly different WGS-72 value μ = 398600.8 km³/s² (~0.0001% difference), which matters only when cross-checking the Keplerian pipeline against SGP4 output.

## 2. Sources actually read

- Curtis, *Orbital Mechanics for Engineering Students*, 1st ed. (2005), full PDF mirror: https://www.hlevkin.com/hlevkin/90MathPhysBioBooks/Mechanics/Curtis_OrbitamMechForEngineeringStudents.pdf — opened; text extracted to `notes/curtis_hlevkin_text.txt`. Sections 2.4, 2.7, 3.4, 4.6 and Example 4.5 (1st ed., pp. 175–176) = 3rd-ed. Example 4.7 (identical numbers).
- Curtis Appendix D MATLAB reference code: `notes/sv_from_coe.m`, `notes/Example_4_07.m` — opened; used as an oracle.
- Wikipedia, "Perifocal coordinate system": https://en.wikipedia.org/wiki/Perifocal_coordinate_system — opened.
- Wikipedia, "Orbital elements": https://en.wikipedia.org/wiki/Orbital_elements — opened.
- Wikipedia, "Orbital state vectors": https://en.wikipedia.org/wiki/Orbital_state_vectors — opened.
- Wikipedia, "Kepler's equation": https://en.wikipedia.org/wiki/Kepler%27s_equation — opened.
- Wikipedia, "Mean anomaly": https://en.wikipedia.org/wiki/Mean_anomaly — opened.
- Wikipedia, "True anomaly": https://en.wikipedia.org/wiki/True_anomaly — opened.
- Wikipedia, "Eccentric anomaly": https://en.wikipedia.org/wiki/Eccentric_anomaly — opened.
- Wikipedia, "Geostationary orbit": https://en.wikipedia.org/wiki/Geostationary_orbit — opened.
- Wikipedia, "Molniya orbit": https://en.wikipedia.org/wiki/Molniya_orbit — opened.
- Wikipedia, "Sun-synchronous orbit": https://en.wikipedia.org/wiki/Sun-synchronous_orbit — opened.
- Wikipedia, "Medium Earth orbit": https://en.wikipedia.org/wiki/Medium_Earth_orbit — opened.
- Wikipedia, "Global Positioning System": https://en.wikipedia.org/wiki/Global_Positioning_System — opened.
- Wikipedia, "Nodal precession": https://en.wikipedia.org/wiki/Nodal_precession — opened.
- Wikipedia, "International Space Station": https://en.wikipedia.org/wiki/International_Space_Station — opened.
- Wikipedia, "Critical inclination" — attempted, **404, could not be opened**; Frozen_orbit and Apsidal_precession were opened but did not contain the needed formula.
- orbital-mechanics.space (Bryan Weber), "The Orbit Equation": https://orbital-mechanics.space/the-orbit-equation/the-orbit-equation.html — opened.
- orbital-mechanics.space, "Classical Orbital Elements and the State Vector": https://orbital-mechanics.space/classical-orbital-elements/orbital-elements-and-the-state-vector.html — opened.
- orbital-mechanics.space, "Time Since Periapsis, Mean and Eccentric Anomaly": https://orbital-mechanics.space/time-since-periapsis-and-keplers-equation/time-since-periapsis.html — opened.
- orbital-mechanics.space, "Elliptical orbits: time since periapsis and Kepler's equation": https://orbital-mechanics.space/time-since-periapsis-and-keplers-equation/elliptical-orbits.html — opened.
- orbital-mechanics.space, "Classical Orbital Elements": https://orbital-mechanics.space/classical-orbital-elements/classical-orbital-elements.html — opened (local copy `notes/coe_page.html`).
- MIT OCW 16.07 Lecture L16, "Central Force Motion: Orbits": https://ocw.mit.edu/courses/16-07-dynamics-fall-2009/0bb19205a6316ba88f88284bf7257ec6_MIT16_07F09_Lec16.pdf — opened; text in `notes/mit_16_07_L16.txt`.
- Braeunig, *Rocket & Space Technology*, "Orbital Mechanics": http://www.braeunig.us/space/orbmech.htm — **live fetch failed** (TLS certificate mismatch, cert presented for `*.securedata.net`, tried across multiple reader/verifier sessions); read from a previously saved local copy, `notes/braeunig_orbmech.txt`, and its companion `notes/braeunig_problems.txt` (worked example problems 4.3, 4.13–4.15, 4.17).
- NASA, *Basics of Space Flight*, ch. 5-1 "Planetary Orbits": https://science.nasa.gov/learn/basics-of-space-flight/chapter5-1/ — opened.
- NASA, *Basics of Space Flight*, ch. 3-3 "Kepler's Laws": https://science.nasa.gov/learn/basics-of-space-flight/chapter3-3/ — opened. (ch. 5-2 URL returned 404, not opened.)
- J. D. Cook, "Solving Kepler's equation with Newton's method" (2022-11-01): https://www.johndcook.com/blog/2022/11/01/kepler-newton/ — opened.
- J. D. Cook, "Newton's method: the good, the bad, and the ugly" (2022-11-03): https://www.johndcook.com/blog/2022/11/03/bad-newton/ — **not opened directly**, only a search snippet was available; the specific numeric example (e=0.992, M=0.13π) was independently reproduced by script.
- Charles & Tatum, "The convergence of Newton-Raphson iteration with Kepler's equation", *Celestial Mechanics and Dynamical Astronomy* 69:357 (1997/98): https://ui.adsabs.harvard.edu/abs/1997CeMDA..69..357C/abstract — **abstract only**, not the full paper.
- satellite.js source (develop branch): `src/io.ts`, `src/propagation/initl.ts`, `src/propagation/sgp4init.ts`, `src/constants.ts` — fetched via raw.githubusercontent.com, opened.
- poliastro source: `src/poliastro/core/elements.py`, `src/poliastro/core/util.py`, `src/poliastro/twobody/orbit/creation.py` (local clone in `repos/poliastro`) — opened, read directly.
- hapsira source (poliastro fork): `src/hapsira/core/elements.py`, `src/hapsira/twobody/orbit/creation.py` (local clone in `repos/hapsira`) — opened.
- Local repo `repos/astro/src/elements.js`, `utils.js` (JS port citing poliastro) — opened.
- Local repo `repos/digital-orrery/src/physics/orbital.js` (cites "Curtis Algorithm 4.5") — opened.
- satvis source (branch `next`, local clone): `src/modules/util/orbitFacts.ts`, `src/modules/util/entityInfo.ts`, `src/modules/Orbit.ts`, `src/modules/util/gp.ts`, `src/composables/useSelectedEntity.ts`, `src/components/EntityInfoPanel.vue`, `src/config/orbitClass.ts`, `worker/src/gp/types.ts`, `worker/src/gp/evaluate.ts`, `src/modules/SatelliteManager.ts` — opened, read directly.
- a.i. solutions, "Orbit Architect": https://ai-solutions.com/orbit-architect/ — opened (landing page).
- PhET, "Kepler's Laws" model documentation: https://github.com/phetsims/keplers-laws/blob/main/doc/model.md — opened.
- orbitalmechanics.info (GrayBits LLC): https://orbitalmechanics.info/ — opened (landing page).
- pdflynn/fast-orbit-engine: https://github.com/pdflynn/fast-orbit-engine — opened (landing page).
- oPhysics, "Elliptical Orbits & Kepler's 2nd Law": https://ophysics.com/f6.html — opened.
- Fresh ISS TLE, epoch 2026-09-01 (26244.4985): `iss_tle.txt`.
- Project master document, `rathinam_project_master.md`, Part II Track 1, Part III secs. 1.1, 5, 6.1, 7, 8 — opened.
- Scripts written for this track (all in `notes/`, run with `venv/Scripts/python.exe`): `T1_1_elements_to_eci.py`, `T1_2_kepler.py`, `T1_3_orbit_families.py`, `t1_4_elements_sandbox.py`, plus verification scripts `verify_perifocal_rotation.py`, `verify_geometric_construction.py`, `verify_line239.py`, `geo_check.py`, `critical_inclination.py` / `critical_incl.py`, `sso_check.py`, `kepler_newton_seed_test.py`, `kepler_min_e_threshold.py`, `kepler_trace_actual_failure.py`, `kepler_newton_test.py`, `kepler_newton_test2.py` — all executed, outputs saved alongside.

## 3. Core notes

### 3.1 The two-body problem, the conic equation, and orbits in 3D

**Where the orbit equation comes from.** Start from the relative two-body equation of motion, r̈ = −(μ/r³)r, with μ = G(m₁+m₂). Three steps get to the orbit equation (Curtis 1st ed. §2.4, eqs. 2.26–2.35, reproduced in `notes/curtis_hlevkin_text.txt`):

1. **Angular momentum is constant.** h = r × ṙ; d(h)/dt = ṙ×ṙ + r×r̈ = 0 because r̈ ∥ r. So motion is planar and h = r²θ̇ (Curtis eq. 2.37) — this is Kepler's second law, dA/dt = h/2.
2. **Cross the equation of motion with h and integrate once.** r̈ × h = −(μ/r³)r × h; the left side equals d/dt(ṙ × h) since ḣ = 0; the right side, using the bac-cab identity and r·ṙ = rṙ, becomes μ d/dt(r/r). Integrating: ṙ × h − μr/r = C, a constant vector lying in the orbital plane. Define the **eccentricity vector** e = C/μ (points toward periapsis, magnitude = eccentricity).
3. **Dot with r.** r·(ṙ×h) = (r×ṙ)·h = h², so r + r·e = h²/μ. With r·e = re·cosθ (θ measured from periapsis, the true anomaly):

$$r = \frac{h^2/\mu}{1 + e\cos\theta}$$

This is the **orbit equation**, valid for every conic (e ≥ 0), which is why the master document's Algorithm 4.5-style pipeline should take h rather than a as the fundamental parameter — the hyperbolic Curtis Example 4.7 (e=1.4) has a < 0, but h²/μ is always well-defined.

For an ellipse specifically, periapsis and apoapsis distances are r_p = (h²/μ)/(1+e), r_a = (h²/μ)/(1−e); since 2a = r_p + r_a, algebra gives **a = (h²/μ)/(1−e²)**, i.e. h² = μa(1−e²), and substituting back:

$$r = \frac{a(1-e^2)}{1+e\cos\theta}$$

(Curtis eq. 2.62; independently confirmed in MIT OCW 16.07 L16, eq. 1, `notes/mit_16_07_L16.txt`). Corollaries used throughout: h = √(μa(1−e²)); orbital period T = 2π√(a³/μ) (Curtis eq. 2.73, from Kepler's second law: the ellipse area πab = (h/2)T with b = a√(1−e²)); vis-viva v² = μ(2/r − 1/a).

**Perifocal frame.** In the perifocal frame (P̂ toward periapsis along e, Q̂ 90° ahead in the plane, Ŵ = h/|h|):

$$\mathbf{r}_{pf} = r(\cos\theta, \sin\theta, 0), \qquad \mathbf{v}_{pf} = \frac{\mu}{h}(-\sin\theta,\ e+\cos\theta,\ 0)$$

(Curtis eqs. 4.37–4.38).

**Perifocal → ECI rotation.** The Earth-Centered Inertial (geocentric equatorial) frame has X toward the vernal equinox, Z along Earth's spin axis, Y completing the right-handed set (Wikipedia, Orbital state vectors). The orientation of the orbital plane and the periapsis direction within it is given by a classical **3-1-3 Euler sequence**: rotate by RAAN (Ω) about Z, then by inclination (i) about the (new) node-line x-axis, then by argument of periapsis (ω) about the (new) w-axis. Written as **active** rotation matrices acting on perifocal components:

$$Q = R_z(\Omega)\,R_x(i)\,R_z(\omega)$$

with R_z(a) = [[c,−s,0],[s,c,0],[0,0,1]], R_x(a) = [[1,0,0],[0,c,−s],[0,s,c]]. Explicitly (matches Curtis eq. 4.44 1st ed. = eq. 4.49 3rd ed., and Wikipedia's Perifocal coordinate system page entry-for-entry):

```
Q = [ cΩcω − sΩsω ci   −cΩsω − sΩcω ci    sΩ si ]
    [ sΩcω + cΩsω ci   −sΩsω + cΩcω ci   −cΩ si ]
    [  sω si            cω si             ci    ]
```

Then r_ECI = Q·r_pf, v_ECI = Q·v_pf (Curtis eq. 4.46/4.51). Note this equals Curtis's own textbook construction (R₃(ω)R₁(i)R₃(Ω))ᵀ using his passive elementary matrices — that's an exact algebraic identity (R₃(θ) = R_z(θ)ᵀ by construction), not a coincidence, confirmed both symbolically and numerically over thousands of random-angle trials (max deviation ~1e-16, floating-point noise; see §5 verification ledger, claim 1).

**Sign-convention pitfall — corrected in this pass.** The master document's Part III §1.1 prose currently states the transform as "Rz(−Ω)·Rx(−i)·Rz(−ω)." Under the active-matrix convention used everywhere else in this document (and matching §6.1's actual JS code), that expression is **Qᵀ**, i.e. the *inverse* (ECI → perifocal) transform, not the forward one. Numerically, applying it to a test vector gives a materially different (sign-flipped) result from the correct Q — this was independently confirmed twice (verification ledger claim 1) and traced to a genuine, not merely cosmetic, error: an implementer who copies the §1.1 line literally would place satellites in the wrong hemisphere. **Corrected wording: the perifocal→ECI transform is Q = R_z(+Ω)·R_x(+i)·R_z(+ω) with active (right-hand-rule) rotation matrices.** §6.1's JS code was independently confirmed correct as written (max diff 2.2e-16 vs. Curtis's own `sv_from_coe.m` over 1000 random angle triples).

**Python translation and known-answer tests** (`notes/T1_1_elements_to_eci.py`, output `notes/T1_1_output.txt`):

- **TEST 0**: master-doc matrix ≡ Curtis's `sv_from_coe.m` Q_pX ≡ Rz(Ω)Rx(i)Rz(ω), max |diff| 2.2e-16 over 1000 random angle triples.
- **TEST 1, Curtis Example 4.7** (1st ed. Example 4.5, pp. 175–176): h=80000 km²/s, e=1.4, i=30°, Ω=40°, ω=60°, θ=30°, μ=398600 → perifocal r=(6284.96, 3628.62, 0) km, v=(−2.4912, 11.2905, 0) km/s; Q's first row (−0.09907, −0.94175, 0.32139) matches the book's printed matrix digit for digit; **r_ECI = (−4039.90, 4814.56, 3628.62) km, v_ECI = (−10.386, −4.772, 1.744) km/s**, matching the book's (−4040, 4815, 3629) km and (−10.39, −4.772, 1.744) km/s to rounding. Round-trip through the coe-from-sv algorithm recovers the input elements to 4 decimals.
- **TEST 2, ISS-like orbit** (a=6795 km, e=0.0005, i=51.6°): T=92.91 min; |r| ranges over [6791.60, 6798.40] km = [a(1−e), a(1+e)]; numerical speed 7.6552–7.6629 km/s (vis-viva circular value 7.6590 km/s); analytic and numerical velocities agree to 4e-9 km/s.
- **TEST 3/6, hand cases** (a=7000 km circular, v=√(μ/a)=7.5461 km/s, T=97.14 min): equatorial θ=60° → (3500, 6062.18, 0); i=30°, node on +X, θ=90° → (0, 6062.18, 3500); polar i=90°, Ω=90°, θ=90° → (0,0,7000); slightly inclined i=5°, Ω=30°, θ=60° → (11.53, 6980.02, 528.35) km, declination 4.33° ≤ i. All match code to 1e-12 km.

### 3.2 Kepler's equation, time, and the three anomalies

**Three angles, three roles.**
- **True anomaly θ** (also written ν): the physical angle at the focus (Earth's center) from periapsis to the satellite. This is the angle in r = a(1−e²)/(1+e cosθ) and the one the rotation matrices consume.
- **Eccentric anomaly E**: draw the auxiliary circle of radius a centered on the ellipse's center; project the satellite perpendicular to the major axis onto that circle; E is the angle at the *center*, not the focus. Consequences: x = a cosE, y = b sinE, and **r = a(1 − e cosE)** (Wikipedia, Eccentric anomaly).
- **Mean anomaly M**: not a geometric angle at all — a clock. M = n(t−τ), n = √(μ/a³) (mean motion), τ = time of periapsis passage. M grows linearly by definition.

**Kepler's equation** bridges the clock to the geometry: **M = E − e sinE** (radians only).

**Where it comes from, rigorously.** Central gravity conserves h = r²θ̇ (Kepler's second law). Substituting r(θ) into dθ/dt = h/r² gives (μ²/h³)dt = dθ/(1+e cosθ)²; integrating (with the substitution to E) yields exactly E − e sinE on the right-hand side, and the left-hand side (μ²/h³)(1−e²)^{3/2}t is *defined* to be M = nt. So M is uniform because it is the integral of a constant rate (area sweep), while θ is non-uniform because the same swept area covers a small angle when r is large (apoapsis) and a large angle when r is small (periapsis).

**No closed-form inverse.** E appears both algebraically and inside sin(E), so Kepler's equation has no finite algebraic inverse (an infinite Bessel/Kapteyn Fourier series solution exists, E = M + Σ(2/m)J_m(me)sin(mM), convergent for all e<1, but this is not a closed form in elementary functions). A Lagrange-series inverse also exists but converges only for e < 0.6627 (the Laplace limit) — too restrictive for eccentric orbits like Molniya (e=0.74).

**Newton–Raphson.** f(E) = E − e sinE − M has f′(E) = 1 − e cosE > 0 for e < 1, so f is strictly increasing and the root is unique, bracketed in [M−e, M+e]. Standard seeds: E₀=M (fine for small–moderate e), E₀=π (for large e — a common rule is to switch at e≥0.8, per the master document and Wikipedia's own stated heuristic), or the Vallado seed E₀ = M−e if M∈(−π,0)∪(π,∞) else M+e.

**Verification results.** Grid e∈[0,0.95] step 0.025 × M∈[0,2π) step 0.5° (28,080 solves) plus 20,000 random pairs: master-doc Newton solver agrees with independent bisection to max 1.16e-14 rad, and with scipy's `brentq` to 8.9e-15 rad; max 9 Newton iterations, mean 4.32. θ recovered via θ = 2·atan2(√(1+e)sin(E/2), √(1−e)cos(E/2)) agrees with an independent cos/sin form to 8.9e-16 rad, and round-trips M→E→θ→E→M to 3.6e-15 rad. Known-answer checks: Curtis Ex. 3.1/3.2 (r_p=9600, r_a=21000 km, e=0.3725, T=5.232 h): θ=120° → t=1.133 h; t=3 h → θ=193.16° — reproduced. Braeunig problems 4.13–4.15 (a=7500 km, e=0.1) reproduced to every printed digit (t=968.4 s, θ=151.3°, r=7,989,977 m, v=6,828 m/s).

**The seed-robustness question was probed further in the verification pass** (see §5, claim 4) and the result is more nuanced than the reader notes suggested: tested over the **full mean-anomaly range** (0 to 2π, the physically relevant regime for an animation where M sweeps uniformly through a full revolution), E₀=M actually fails *less* often than E₀=π at high eccentricity (0.7–0.8% vs. 6.7% failures at e∈[0.9,0.9999], with E₀=π showing genuine chaotic divergence, not just slowness — iterates ranging into the thousands before recovering). E₀=M's own failures are concentrated narrowly near M≈0 at very high e (e≳0.97–0.98), which is exactly what a naive reading of "seed with M near periapsis" would miss. **The most robust seed tested, with zero failures across 7,600 (e, M) combinations up to e=0.9999, was the Vallado/poliastro seed: E₀ = M−e if M∈(−π,0)∪(π,∞), else M+e.** This is what production code (poliastro's `core/angles.py`) actually uses — neither E₀=M nor E₀=π alone. **Recommendation for the master doc: replace the current `e<0.8 ? M : π` hybrid (which itself fails ~11% of the time in the same full-range, high-e test) with the Vallado seed**, and keep a hard iteration cap (e.g. 50) with a bisection fallback for pathological cases as e→1.

**Molniya-orbit numbers illustrating the anomaly-rate contrast** (a=26562 km, e=0.74, from `notes/T1_2_kepler_output.txt` §6): r_p=6906 km, r_a=46218 km, h=69208 km²/s. dθ/dt at periapsis = 0.0831°/s, at apoapsis = 0.00186°/s — **ratio 44.79** = ((1+e)/(1−e))², matching the mean-motion-normalized n=0.00836°/s exactly at the derivation level. Speed ratio (peri/apo) = (1+e)/(1−e) = 6.69 (10.02 vs. 1.50 km/s). Only 7.6% of the period (0.91 h of 11.97 h) is spent with |θ|≤90°; the remaining 92.4% (11.05 h) is spent on the apoapsis half — the well-known Molniya "dwell" over high latitudes when argp=270°.

### 3.3 Orbit families and their J2 secular rates

**The generating formulas.** Kepler III: T = 2π√(a³/μ); n = √(μ/a³). Apses: r_p = a(1−e), r_a = a(1+e). Vis-viva: v² = μ(2/r − 1/a). J2 secular rates (first-order averaged, p = a(1−e²), J2 = 1.08263e-3, R_E = 6378.137 km):

$$\frac{d\Omega}{dt} = -\frac{3}{2}nJ_2\left(\frac{R_E}{p}\right)^2\cos i, \qquad \frac{d\omega}{dt} = \frac{3}{4}nJ_2\left(\frac{R_E}{p}\right)^2(4-5\sin^2 i)$$

(Braeunig eqs. 4.50/4.51, cross-checked against Wikipedia's nodal-precession formula and independently rederived/reproduced Braeunig's own numeric constant 2.06474×10¹⁴ to 5 significant figures; Braeunig's worked Problem 4.17 — a=7500 km, e=0.1, i=28.5° → dΩ/dt=−5.067, dω/dt=+8.250 °/day — reproduced to 0.01%).

**Orbit family table** (computed in `notes/T1_3_orbit_families.py` and cross-checked in `notes/t1_4_elements_sandbox.py`; verified numbers in §5):

| Orbit | a (km) | e | i (°) | perigee/apogee alt (km) | Period | dΩ/dt (°/day) | Ground-track character |
|---|---|---|---|---|---|---|---|
| ISS-class LEO (fresh TLE, 2026-09-01) | 6797.9 | 0.0005 | 51.63 | 416 / 423 | 92.97 min | −4.95 | sinusoid ±51.6° lat, shifts ~23.5°W per pass |
| GPS MEO (semi-sync) | 26561.8 | ~0 | 55.0 | 20184 / 20184 | 718.03 min = 11h58m | −0.04 | repeats every sidereal day |
| GEO | 42164.17 | 0 | 0 | 35786 (fixed) | 86164.09 s = 1 sidereal day | ~0 | a fixed point on the equator |
| Molniya | ~26600 | 0.74 | 63.4 (critical) | 538 / 39906 | ~719.6 min (½ sidereal day) | −0.15 | daily-repeating loops, apogee over one hemisphere |
| Sun-synchronous, 700 km circular | 7078.1 | 0 | 98.19 (retrograde) | 700 / 700 | 98.77 min | +0.986 (= mean solar rate) | near-polar, fixed local solar time |

**GEO.** r = (μT²/4π²)^(1/3) with T = one *sidereal* day (86164.0905 s, **not** 86400 s — using the solar day gives a≈42241 km, a 77-km error) → a = 42164.17 km, altitude 35786.03 km, v = 3.0747 km/s. This is confirmed to the km against Wikipedia (42,164 km / 35,786 km / 3,074.6 m/s) and independently against ESA and JPL sidereal-day figures (see §5, claim 2).

**Molniya.** Critical inclination i = arccos(√(1/5)) = 63.4349° (or the retrograde companion 116.5651°) is the root of 5cos²i − 1 = 0 (equivalently Wikipedia's stated "4 − 5sin²i = 0"), which zeros the *first-order J2 secular* argument-of-perigee drift rate — the reason Molniya orbits use exactly i=63.4°: without it, the apogee would slowly rotate away from its intended high-latitude coverage over a period of a few years (at i=51.6°, dω/dt = +0.153°/day instead of the ≈0 at 63.4°). This does **not** zero nodal (RAAN) drift, which is a separate quantity (−0.147°/day at Molniya's elements) — only the apsidal line is frozen. Confirmed by independent bisection root-finding and cross-checked against poliastro/hapsira source code, which hard-codes exactly 63.4349°/116.5651° as "critical inclinations" (§5, claim 3). Note: this is strictly a first-order (J2-only) result; real Molniya spacecraft still require some station-keeping against J4, drag, and lunisolar effects not captured by this formula.

**Sun-synchronous.** Requires dΩ/dt = +360°/365.2422 days = 0.9856°/day (the mean rate of the Sun's apparent eastward motion), which per the J2 nodal-rate formula requires cos i < 0, i.e. **retrograde** inclination (i > 90°). Solving for a 700-km circular orbit (a=7078.137 km): cos i = −0.9856/(1.5·n·J2·(R_E/a)²) = −0.1424 → **i = 98.19°**, confirmed independently to <0.001° against Wikipedia's closed-form fit cos i = −(a/12352 km)^3.5 and against that page's own worked 800-km example (98.7°) reproduced exactly (§5, claim 5). No circular SSO exists above altitude ≈5974–6000 km, since cos i would need to exceed −1.

## 4. Answers to the track questions

### Q1. Given (a, e, i, RAAN, argp, true anomaly), compute an ECI position by hand for a simple case (equatorial circular, then slightly inclined), and sanity-check code against it.

**Pipeline.** (1) r(θ) = a(1−e²)/(1+e cosθ) (Curtis eq. 2.62, derived in §3.1). (2) Perifocal position r_pf = r·(cosθ, sinθ, 0); perifocal velocity v_pf = (μ/h)(−sinθ, e+cosθ, 0), h=√(μa(1−e²)) (Curtis eqs. 4.37–4.38). (3) Rotate to ECI with the 3-1-3 Euler sequence **Q = R_z(Ω)·R_x(i)·R_z(ω)** (active-matrix convention, verified in §5).

**Case A — equatorial circular** (a=7000 km, e=0, i=Ω=ω=0, θ=60°): r=a=7000 km (circular). Perifocal: (7000cos60°, 7000sin60°, 0) = (3500.00, 6062.18, 0) km. All rotation angles are zero (Q=I), so **r_ECI = (3500.00, 6062.18, 0) km**. Speed v = √(μ/a) = 7.5461 km/s, period T = 2π√(a³/μ) = 97.14 min. Verified against code to 1e-12 km.

**Case B — slightly inclined** (a=7000 km circular, i=5°, Ω=30°, ω=0°, θ=60°): start from perifocal (3500, 6062.18, 0). R_z(ω=0) leaves it unchanged. R_x(5°) → (3500, 6062.18·cos5°, 6062.18·sin5°) = (3500, 6039.11, 528.35). R_z(30°) → x' = 3500cos30° − 6039.11sin30° = 11.53, y' = 3500sin30° + 6039.11cos30° = 6980.02, z unchanged. **r_ECI = (11.53, 6980.02, 528.35) km.** Declination = asin(528.35/7000) = 4.33° ≤ i = 5°, as required (a satellite never exceeds latitude i for i<90°). Matched to 1e-12 km by code.

**A larger-i cross-check**: i=30°, node on +X (Ω=0), θ=90° → perifocal (0,7000,0) → after R_x(30°) → (0, 7000cos30°, 7000sin30°) = (0, 6062.18, 3500.00) km — also reproduced exactly by code.

**Textbook cross-check, Curtis Example 4.7** (3rd ed. = Example 4.5, 1st ed.): h=80000 km²/s, e=1.4 (hyperbolic), i=30°, Ω=40°, ω=60°, θ=30°, μ=398600 → **r_ECI = (−4039.90, 4814.56, 3628.62) km, v_ECI = (−10.386, −4.772, 1.744) km/s**, matching the book's printed (−4040, 4815, 3629) km and (−10.39, −4.772, 1.744) km/s to rounding. This confirms the same pipeline works for e>1 (hyperbolic legs), since it is parameterized by h rather than a.

All hand cases were cross-checked against the master document's code, Curtis's own MATLAB (`sv_from_coe.m`), an independent geometric (Rodrigues-formula) construction of the perifocal basis, and three unrelated open-source implementations (poliastro, hapsira, and a third unaffiliated repo citing "Curtis Algorithm 4.5") — agreement to floating-point precision (~1e-16) in every comparison (see §5, claim 1 for full detail). **One correction is needed in the master document**: its §1.1 prose "Rz(−Ω)Rx(−i)Rz(−ω)" is the *inverse* transform under the active-matrix convention and should read **Rz(+Ω)Rx(+i)Rz(+ω)**; §6.1's actual code is already correct.

### Q2. Why does true anomaly move non-uniformly in time while mean anomaly moves uniformly?

**Rigorous answer.** Central gravity conserves specific angular momentum, h = r²(dθ/dt) (Kepler's second law: equal areas swept in equal times, dA/dt = h/2). Rearranged, **dθ/dt = h/r²**, which is *not* constant because r varies around the ellipse: substituting r(θ) gives dθ/dt = (μ²/h³)(1+e cosθ)², maximal at periapsis and minimal at apoapsis, with a peri/apo ratio of exactly **((1+e)/(1−e))²** — 44.8× for a Molniya-like orbit (e=0.74), but only 1.002× for the near-circular ISS (e≈0.0005).

Mean anomaly, by contrast, is **not a geometric angle** — it is *defined* as a linear clock: M = n(t−τ), n = 2π/T, i.e. the azimuth of a fictitious point moving at constant rate on the auxiliary circle. It is uniform purely by construction. The two are linked through the eccentric anomaly E via the transcendental Kepler's equation M = E − e sinE, requiring Newton–Raphson iteration to solve, then tan(θ/2) = √((1+e)/(1−e))tan(E/2) — implemented as θ = 2·atan2(√(1+e)sin(E/2), √(1−e)cos(E/2)) to avoid quadrant/pole issues at θ=180°.

**Intuition.** Equal areas in equal times means a satellite close to the planet (small r, short lever arm) must sweep a larger angle per second to sweep the same area, while a satellite far away (large r, near apoapsis, long lever arm) sweeps only a small angle in the same time — and it's also *slower* there, since v=h/r for the tangential component (the same vis-viva trade-off between speed and distance for fixed orbital energy). Concretely, for the Molniya orbit: true-anomaly rate is 4.98°/min at perigee vs. 0.111°/min at apogee, while mean anomaly advances steadily at n=0.00836°/s throughout; consequently only ~7.6% of the 12-hour period (≈0.9 h) is spent within ±90° of periapsis, while ~92% (≈11 h) is spent lingering near apogee — exactly why argp=270° Molniya orbits are chosen for long high-latitude dwell time.

### Q3. What are typical element values for LEO / GEO / Molniya / sun-synchronous orbits, and what does each look like?

See the orbit-family table in §3.3. Summary of shape and ground track:

- **LEO/ISS**: a≈6795–6798 km (altitude ~420 km), e≈0.0005, i=51.64°, T≈92.9–93.0 min, v≈7.66 km/s, ~15.5 rev/day. Near-circle hugging Earth (r≈1.07 R_E), tilted 51.6°. Ground track: a sinusoid oscillating between ±51.6° latitude, shifting ~23.5°W per successive pass (Earth spin 23.3° in 93 min plus ~0.3° of nodal regression); plane precesses a full 360° in RAAN every ~73 days.
- **GEO**: circular equatorial (i=0, e=0), a=42164.17 km (altitude 35786 km), v=3.0747 km/s, T=one sidereal day (86164.09 s — **not** 86400 s). Ground track: a single fixed point on the equator (a small figure-8/analemma if slightly inclined); requires station-keeping against lunisolar inclination drift (~0.85°/yr) and triaxiality-driven longitude drift toward stable points at 75.3°E/108°W.
- **Molniya**: highly eccentric (e≈0.74), a≈26600 km, i=63.4° exactly (the critical inclination that freezes apsidal drift). argp=270° places apogee (altitude ~39,900 km) over high northern latitudes; perigee is low (~540 km). Period ≈12 h (2 rev/day); per Q2, ~92% of that period is spent on the apogee half of the ellipse, giving the signature long dwell used for high-latitude communications/early-warning coverage. Ground track: two daisy-chained loops ~180° apart in longitude, repeating daily.
- **Sun-synchronous** (e.g. 700 km circular): near-circular, near-polar and **retrograde** (i≈98.19° at 700 km, generally 96.6°–98.6° across 274–800 km), because only retrograde inclination gives cos i<0, required for J2-driven nodal precession to match the Sun's apparent eastward motion (+0.9856°/day) — keeping the local solar time of every equator crossing constant (e.g., a fixed "10:30 AM descending node" for Earth-imaging missions). Ground track: near-polar, covering nearly all latitudes, shifting ~24.7°W per pass.

## 5. Verification ledger

Six load-bearing claims from this track were independently verified by two separate lenses (a "compute" lens that reproduced the numbers from scratch, and a "source" lens that hunted for corroborating/refuting primary and secondary sources). All six were **confirmed**, with two receiving a **needs_qualification** correction on the exact wording (Kepler-seed robustness) that has been folded into §3.2 above.

| # | Claim | Compute verdict | Source verdict | Confidence | Corrected / final wording |
|---|---|---|---|---|---|
| 1 | Perifocal→ECI matrix is Q = Rz(Ω)Rx(i)Rz(ω) (active convention), identical to Curtis's (R3(ω)R1(i)R3(Ω))ᵀ and Wikipedia's matrix | confirmed (0.9) | confirmed (0.93) | high | Confirmed exactly as stated. **Separately caught**: the master document's own §1.1 prose ("Rz(−Ω)Rx(−i)Rz(−ω)") is a *different, incorrect* matrix — numerically it is Qᵀ (the inverse), not Q — and should be corrected to Rz(+Ω)Rx(+i)Rz(+ω); §6.1's JS code is already right. |
| 2 | GEO period = sidereal day (86164.0905 s), giving a=42164.17 km, altitude 35786 km (not the 86400-s solar day, which errs by ~77 km) | confirmed (0.97) | confirmed (0.97) | high | Confirmed as stated. Minor note: figures depend slightly on equatorial vs. mean Earth radius convention (<8 km on altitude) and tropical/sidereal/Julian year length (<0.001° on other computed quantities) — negligible at the precision quoted. |
| 3 | Molniya critical inclination is exactly 63.4349° (acos(√(1/5))), zeroing the secular argp drift rate (5cos²i−1=0) | confirmed (0.93) | confirmed (0.92) | high | Confirmed, with the added precision note that arccos(√(1/5)) is irrational (63.4349° is a 4-decimal rounding, not an exact terminating value), and that this is a first-order J2-secular result — real Molniya orbits still need some station-keeping against J4/drag/lunisolar effects this formula omits. Retrograde companion root: 116.5651°. |
| 4 | Kepler's equation has no closed-form inverse; Newton seeded at E₀=M can fail/wander for e≳0.99, while E₀=π is robust | needs_qualification (0.9) | **refuted** (0.82) — the E₀=π-is-robust half is backwards | high | **Corrected**: no closed-form inverse is confirmed. But over the *full* mean-anomaly range (0–2π, the physically relevant case for a time-driven animation), E₀=M fails **less** often (~0.7–0.8%) than E₀=π (~6.7%, with genuine chaotic divergence) at e∈[0.9,0.9999]. E₀=M's failures are narrowly concentrated near M≈0 at e≳0.97–0.98. The master document's current `e<0.8 ? M : π` hybrid fails ~11% of the time in the same test. **The seed that is actually robust (0 failures out of 7,600 test cases up to e=0.9999) is the Vallado/poliastro seed**: E₀ = M−e if M∈(−π,0)∪(π,∞), else M+e. |
| 5 | 700-km circular sun-synchronous orbit requires i≈98.19° (retrograde), from cos i = −0.9856°/day / (1.5·n·J2·(R_E/a)²) | confirmed (0.95) | confirmed (0.93) | high | Confirmed exactly (98.188°–98.189° across two independent formulas). Minor unit-hygiene note: the formula as literally written mixes a deg/day numerator with an SI-unit n in the denominator; n must be expressed in matching units (deg/day) or the whole expression converted consistently to avoid a silent unit bug in an implementation. |
| 6 | satvis's EntityInfoPanel never displays semi-major axis, orbital period, or true anomaly — only a live lat/lon/alt/velocity strip, derived facts (orbit class, apogee/perigee, sun-sync flag, LTAN/LTDN), and raw OMM/TLE fields | confirmed (0.95) | confirmed (0.93) | high | Confirmed by direct source read. One precision note: "raw OMM fields" applies only to OMM-sourced satellites; TLE-sourced satellites instead show the raw two-line TLE text verbatim (not an OMM-style key/value table) — the underlying truth (no SMA/period/true-anomaly label anywhere) holds either way. A period value (`approximatePeriodMinutes`) is computed internally but used only for ground-track window sizing, never surfaced in the UI. |

## 6. Implications for the build

1. **Fix the master document's §1.1 sign error.** Replace "Rz(−Ω)·Rx(−i)·Rz(−ω)" with "Rz(+Ω)·Rx(+i)·Rz(+ω)" (active-matrix convention). §6.1's code needs no change — it is already correct. Add a unit test that reproduces Curtis Example 4.7 (tolerance 1 km / 0.005 km/s) and the a=7000 km hand cases in §4 Q1 (tolerance 1e-9 km).
2. **Add the velocity line to the elements→ECI pipeline.** The master document's §6.1 sketch computes position only; add v_pf = (μ/h)(−sinθ, e+cosθ, 0), v_ECI = Q·v_pf, and an (h, e, θ) entry point (rather than requiring a) so hyperbolic Lambert-arc legs (Phase B/C, e>1) work through the same code path.
3. **Replace the Kepler-solver seed logic.** Swap the current `e<0.8 ? M : π` hybrid for the Vallado seed E₀ = M−e if M∈(−π,0)∪(π,∞) else M+e, which showed zero failures across 7,600 test cases up to e=0.9999 in this verification pass — strictly better than either alternative named in the original design. Keep a hard iteration cap (≈50) with a bisection fallback as a defensive measure for e→1 sliders.
4. **Cap or gracefully degrade the eccentricity slider near e=1.** Even with the improved seed, Kepler-solver robustness has not been tested past e=0.9999 and orbital mechanics itself becomes physically degenerate (parabolic escape) as e→1; recommend a UI cap around e≤0.95–0.97 for the teaching sandbox, or an explicit "near-parabolic, results may be imprecise" warning above that.
5. **Use the verified GEO/Molniya/SSO/ISS/GPS numbers in §3.3 as sandbox presets.** These are independently checked to the km/degree and give a reviewer immediately recognizable visual sanity checks: GEO renders as a fixed equatorial point; Molniya apogee sits at 63.4°N with argp=270°; SSO is retrograde ~98°; ISS ground track shifts ~23.5° west per pass (not the previously-stated ~22.5° — corrected number).
6. **Element-sandbox UI should show what satvis's panel does not**: semi-major axis in km, period as a labeled number, true anomaly (not just mean anomaly), and the mean-vs-true-anomaly distinction live (an equal-area wedge animation, per PhET's Kepler's Laws sim, is the cleanest way to show *why* true anomaly is non-uniform). Mirror satvis's derivation style (alta/altp × 6378.135, 2π/satrec.no, the same J2 sun-sync test) so numbers agree with satvis.space to the digit where the same quantity is computed.
7. **Tests/oracles to commit to the repo**: (a) Curtis Example 4.7 (position/velocity to 1 km / 0.005 km/s); (b) the four hand cases in §4 Q1 (equatorial circular, i=30° node-on-X, i=5°/Ω=30° small-tilt, i=30°/Ω=60°) to 1e-9 km; (c) Kepler-equation solver vs. independent bisection over the e∈[0,0.95]×M∈[0,2π) grid (max 1e-13 rad tolerance) plus the Vallado-seed zero-failure sweep up to e=0.9999; (d) GEO semi-major axis from the sidereal day (42164.17 km ± 0.1 km); (e) Molniya critical inclination (63.4349° ± 0.001°); (f) sun-synchronous inclination formula at 700 km (98.188° ± 0.01°).
8. **Pitfalls to document in code comments**: radians everywhere internally, degrees only at UI boundaries; wrap M into [0,2π) before solving; ω is undefined/meaningless at e=0 and Ω at i=0 (grey out or hide those sliders in the UI); GEO period must be the sidereal day, never 86400 s; TLE mean elements must never be fed into the pure-Keplerian pipeline — they are SGP4-only (a direct comparison in the T1.4 reader pass found an 11.7 km discrepancy at epoch, which is the honest number to quote if asked "why not just use TLEs everywhere").

## 7. Still uncertain / to read next

- The master document's §1.1 sign correction (item 1 above) has been identified and verified across two independent reader/verifier passes but **has not yet been edited into the master document itself** — this remains an open action item, not a completed fix.
- Curtis's textbook itself (3rd/4th edition, whose equation numbers the master document cites) was never directly opened by any reader in this track; verification instead used a freely available 1st-edition (2005) PDF mirror, where the same worked example carries different numbering (1st ed. Example 4.5/Algorithm 4.2/eq. 4.44 vs. 3rd ed. Example 4.7/Algorithm 4.5/eq. 4.49). The numeric results and matrices match exactly, but citation numbers in the master document should be checked against an actual 3rd/4th-edition copy if precise equation-number citations matter for the professor.
- Braeunig's orbital-mechanics page (braeunig.us) could not be fetched live in any session this track ran (TLS certificate mismatch, cert served for `*.securedata.net`); all Braeunig-sourced material relies on a previously saved local text copy with degraded/missing equation images. If exact formula presentation matters, this source should be re-attempted from a different network or via the Wayback Machine (also found unfetchable from this environment).
- Real operational Molniya TLEs were not pulled from CelesTrak to reconcile the idealized textbook elements (a=26600 km, e=0.74 → perigee altitude 538 km) against Wikipedia's quoted operational figures (~600 km perigee, RAAN drift −0.3°/day vs. the ~−0.15°/day computed here) — worth resolving with a live TLE before quoting "operational" Molniya numbers to the professor.
- Charles & Tatum (1997/98) on Newton-Raphson convergence pathology, and J. D. Cook's "bad-newton" post, were read only via abstract/search snippet, not full text; their qualitative claims were independently reproduced numerically in this track's verification pass, but the primary papers were not read.
- Hyperbolic (e>1) and parabolic forms of Kepler's equation (needed for Phase C escape/arrival legs, using hyperbolic anomaly F) were not covered here — only 0≤e<1 was addressed in depth; e=1.4 was validated only as a single position/velocity snapshot (Curtis Example 4.7), not the time-domain hyperbolic Kepler equation.
- The Orbit Architect and orbitalmechanics.info interactive tools were assessed only from their public landing pages, not run hands-on; exact slider ranges and UI behavior described in the T1.4 notes are as advertised by the vendors, not independently confirmed by interaction.

## 8. Glossary of credibility vocabulary encountered

- **verified**: the claim was read from a primary source and/or independently computed/reproduced by script in this session (or a prior reader session whose script and output were re-examined).
- **likely**: supported by a secondary source, a search-snippet/abstract (not the full primary text), or strong background knowledge, but not independently computed or read in full.
- **uncertain**: insufficient evidence to assign a confident label; flagged explicitly where it appears.
- **confirmed** (verification-ledger verdict): an independent lens (compute or source) reproduced or corroborated the claim and found no material error.
- **needs_qualification** (verification-ledger verdict): the core claim is broadly right but the exact wording overstates precision, omits a scope condition, or needs a caveat added; used here for the Kepler-seed claim, whose fix is folded into the corrected wording.
- **refuted** (verification-ledger verdict): an independent lens found the claim, or part of it, to be actually wrong, not just imprecisely worded; used here for the "E₀=π is robust" half of the Kepler-seed claim, which testing showed backwards for the full-mean-anomaly-range regime that matters for this project's animation use case.
- **PLAUSIBLE / CONFIRMED** (used by some verification passes as alternate labels for the same compute/source verdict scale): treated as synonymous with "likely"/"confirmed" above where encountered in the raw JSON inputs to this document.
- **primary source**: the original textbook, paper, or source-code file itself (e.g., Curtis's PDF, Wikipedia's own cited formula page, poliastro's actual `.py` file read directly).
- **secondary source**: a page or article that reports or restates a primary claim without being the origin (e.g., orbital-mechanics.space's worked examples, Braeunig's textbook-style page).
- **oracle**: an independently-built reference implementation or known-answer test case (Curtis's own MATLAB code, scipy's `brentq`, a from-scratch geometric construction) used to cross-check a claim without relying on the same code path being tested.
