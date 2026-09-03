# Errata and corrections to rathinam_project_master.md

Produced 2026-09-01 from the six research tracks. Each item names the master-document location, what it says, what the research found, and the evidence. Confidence labels follow the track documents. Items marked "apply" should be edited into the master document; items marked "note" are qualifications to keep in mind.

## Part III section 1.1 (line 239), perifocal to ECI rotation. Apply.
The text gives the perifocal-to-ECI transform as Rz(-Omega) Rx(-i) Rz(-omega). The numerically verified forward transform is Q = Rz(Omega) Rx(i) Rz(omega) in the active convention, which is exactly what the section 6.1 code already implements. The written formula is not the forward transform (and is not simply its inverse either). Verified in Track 1 against Curtis Example 4.7 (r = [-4040, 4815, 3629] km), Wikipedia's perifocal matrix, an independent Rodrigues construction, and three open-source implementations. Fix: replace the formula with Q = Rz(Omega) Rx(i) Rz(omega) and point to section 6.1 as the reference. Evidence: track1_orbital_mechanics.md, verification ledger row 1.

## Part III section 7, "ISS ground track shifts ~22.5 deg westward per orbit". Apply.
Earth rotation during one ISS period (92.9 to 93.0 min) gives 23.3 deg, plus about 0.3 deg from J2 nodal regression, so 23.5 to 23.6 deg westward per pass. Evidence: Track 1 answer Q3 and Track 2 (ground-track section); both computed independently.

## Part III section 6.1 solveKepler seed (line 317). Apply (recommendation).
The seed "E0 = M if e < 0.8 else pi" was tested over the full mean-anomaly range: E0 = pi is not the robust choice (it fails on about 6.7 percent of cases at high e, versus under 1 percent for E0 = M). The seed with zero failures up to e = 0.9999 is Vallado's: E0 = M - e when M is in (-pi, 0) and E0 = M + e otherwise. Evidence: track1_orbital_mechanics.md, ledger row on Kepler seeding, scripts/T1_2_kepler.py.

## Part III section 6.1 validation line (line 347), "ISS-like (a about 6795 km ...)". Note.
From the 2026-09-01 ISS TLE, the Kozai mean semi-major axis implied by the mean motion is 6797.9 km and SGP4's osculating value is about 6804 km; 6795 km is a fine round number for a teaching case but should not be quoted as "the ISS value". Evidence: Track 2, T2.2 and T2.5 notes.

## Part III section 1.2, "TLEs stale in days (LEO)". Note, sharpen.
Track 2's measured and literature-based cadence: LEO and ISS TLEs reach one globe pixel of error (about 12.7 km at a 1000 px full-disk view) in roughly 3 to 4 days; GEO in 1 to 3 weeks absent maneuvers. A nightly CelesTrak pull is enough at globe zoom; the ISS needs 6 to 12 hour pulls only at regional zoom. Evidence: track2_tle_sgp4_frames_time.md, Q3.

## Part III section 2, TLE data source. Apply.
Two changes. (1) CelesTrak enforces a 2-hour update cadence and, since 2026-03-26, a one-download-per-update policy that returns HTTP 403 on repeat requests; a naive dev-loop fetcher can get an IP blocked. Cache on disk and fetch at most once per 2 hours per query. (2) The fixed 5-digit TLE catalog-number field overflowed when USSF numbers passed 100000 on 2026-07-11; new ingestion should target OMM JSON or CSV from gp.php rather than TLE text. Evidence: Track 2, T2.1 (quotes from celestrak.org/NORAD/documentation/gp-data-formats.php).

## Part III section 3, "poliastro/hapsira (friendly but forked; pin versions)". Apply.
poliastro was archived on 2023-10-14 and hapsira's development branch has been dormant for about 2.3 years. Prefer pykep (MPL-2.0, active) for Lambert and optimization dependencies; use lamberthub for a pure-Python Lambert oracle. Evidence: Track 3, T3.9 and ledger.

## Part III section 3 and Track 3 item 5, spacekit.js as a Phase B base. Apply.
spacekit pins three.js r0.135 (WebGL1, which three.js removed at r163), ships fixed 2018 planetary elements (Saturn already 0.38 deg off), and uses float32 AU-scale coordinates (17.8 km precision at 1 AU). Borrow its Ephem and KeplerParticles patterns under MIT; do not build on it. Evidence: track3_existing_projects.md, T3.5.

## Part I section 3 and Track 3 question 3, the gap statement. Apply.
The sentence "open source today has ... powerful interplanetary optimizers with no viewer" and the implied claim that nobody couples optimization to visualization is too broad. GMAT (Apache-2.0) couples single-objective targeting and NLP optimization to an OpenGL 3D view (output-coupled), and four single-author repositories created in 2026 couple a single-objective Lambert porkchop grid to an interactive 3D solar-system view (chipi/orrery, kevinkicho/k-solar-system-navigator, abc000cool/porkchop-mission-planner, tamiralmas/Orbital-Simulation; 0 to 3 stars, three disclose heavy AI-assisted authorship, one has no license). The defensible claim: no open-source project, mature or not, couples an exact multi-objective (EMOA*-class) optimizer to an interactive 3D view, and no mature, institutionally backed open-source tool couples any optimizer to a browser-based interactive 3D scene. Evidence: gap_statement.md.

## Part II Track 3 item 7, GMAT install size. Note.
A single-platform GMAT install is about 400 to 460 MB, not the multi-gigabyte figure sometimes quoted (which double-counts source plus data bundles). License re-verified as Apache-2.0 from License.txt. Evidence: Track 3, T3.7.

## Part II Track 5 item 3, "MO-D* Lite". Apply (naming).
The RA-L 2022 paper by Ren, Rathinam, Likhachev and Choset is titled "Multi-Objective Path-Based D* Lite" (MOPBD*). "MOD* Lite" is a different, earlier algorithm by Oral and Polat (2015/2016) that MOPBD* uses as a baseline. Use the MOPBD* name with the professor. Evidence: track5_multi_objective_search.md.

## Part II Track 5 item 1, "the BBST trick". Note.
The BBST frontier set gives an asymptotic win only at exactly three objectives (TOA*, O(log|B|) checks); for four or more objectives its worst case equals a linear scan, and the AIJ 2025 experiments show a sorted-array plus binary-search variant (Late-BS) is the fastest configuration in every tested case. Evidence: Track 5, ledger rows on BBST complexity and AIJ 2025 timings.

## Part III section 3 and section 8, public_emoa license. Apply.
The repository has no LICENSE file on any branch; the README carries a usage and citation statement only. Treat it as all-rights-reserved unless the professor grants terms in writing. Keep it an optional plugin, never vendored into an MIT repository. Evidence: Track 5, T5.6 (verified against the local clone).

## Part II Track 6 item 1, "the GT school is single-objective MILP". Note.
Gollins, Grieser and Ho (JSR 63(3), 2026, DOI 10.2514/1.A36412) added an exact multi-objective MIQCP and an evolutionary multi-objective capability. The novelty claim should rest on exact graph-search Pareto enumeration plus interactive visualization, not on the absence of multi-objective work in that school. Evidence: track6_space_logistics_research_frame.md, Q2.

## Part II Track 6 item 2, NASA Trajectory Browser attribution. Note.
The 2013 IEEE Aerospace paper describing the Trajectory Browser is sole-authored by Cyrus J. Foster; "Foster, Jaroux" refers to a distinct 2012 workshop paper. Evidence: Track 6, T6.2.

## Part II Track 6 item 4, HLS tanker counts. Note.
NASA OIG IG-26-004 says only "more than 10" tanker flights with roughly 6-day cadence and a 200-plus-day fill window; "10 to 20" figures are secondary journalism. Quote the primary numbers with their source and date. Evidence: Track 6, T6.4.

## Part II Track 4 item 2, "Earth to Mars Hohmann about 8.6 months". Note.
The circular-coplanar Hohmann time of flight computed with mu_sun = 1.32712440018e11 km^3/s^2 is 258.9 days, which is 8.5 months (8.6 only if a 30-day month is used). Real windows found by the computed porkchop are 300 to 320 day Type II transfers, not Hohmann. Evidence: track4_mission_design_transfers.md, T4.2 and T4.3, scripts/T4_2_patched_conics.py.

## Companion documents cited at the end of the master doc. Note.
rathinam_field_research.md, rathinam_project_deep_dive.md and rathinam_meeting2_prep.md were not found on this machine on 2026-09-01. The satvis teardown and the cislunar delta-v table were redone from scratch in Tracks 3 and 6.
