# Rathinam project research notes (Part II of the master document, executed)

Date: 2026-09-01. These files answer the three asks from the August 31 meeting: learn the field, scout existing projects, and prepare a v1 proposal. They were produced by reading primary sources, running the numbers with Python and Node, and adversarially verifying the load-bearing claims. The master document they follow is `../rathinam_project_master.md`.

## Start here

| File | What it is |
|---|---|
| `00_landscape_one_pager.md` | One-page landscape summary and v1 proposal, written for Prof. Rathinam. |
| `01_master_doc_errata.md` | Corrections and qualifications to the master document found during the research (sign error in the rotation formula, ground-track shift, Kepler seed, CelesTrak policy, gap statement, naming of MOPBD*, public_emoa license, and more). |
| `gap_statement.md` | The defensible gap claim with a 30-row comparison table, ranked nearest neighbours, caveats, and the search coverage behind it. |
| `02_meeting_brief.md` | Pre-meeting brief for the week of 2026-09-07: landscape, library shelf, plan, questions, and things not to get wrong. |
| `03_tech_stack.md` | First tech stack recommendation (2026-09-07), superseded by 04. |
| `04_system_design.md` | System design: decisions, game-engine evaluation, architecture, full stack, the mathematics reference with a verification ledger. |
| `05_mission_path_plan.md` | Implementation plan for the satellite-tour visualization: Lambert rendezvous with moving targets, 2- to 4-burn strategies, ship model, path and burn animation, camera follow; §13 adds the launch-from-the-ground model. Implemented; this is the design record. |
| `06_routing_algorithm_format.md` | The standard format for asteroid routing algorithms (ARP-ALGORITHM 1) used by the Routing tab: the problem as implemented, the `solve(problem, tools)` interface, run rules, where the code runs, the transfer modes and the Path section, the Lambert solver comparison, and the differences from the two papers. |
| `07_three_burn_transfer.md` | How the three-burn rendezvous derivation sheet (in-plane shaping, plane change at the node, velocity match) was implemented as the app's default transfer: the mapping from the sheet's sections to the code, the four places the code departs from the sheet and why, where it is used, what to expect of the numbers, and the tests. |
| `08_interface_conventions.md` | How space viewers (NASA Eyes, Cesium, OpenSpace, Celestia, KeepTrack, Stuff in Space) and 3D-tool research handle layout, camera moves, selection, labels, time and help, with sources; what Orbit Lab took from them in the 2026-11-07 interface sweep, and what it left out and why. |

## Track study documents (Part II, Tracks 1 to 6)

| File | Track | Words | Verification |
|---|---|---|---|
| `track1_orbital_mechanics.md` | Orbital mechanics fundamentals | about 5,800 | 6 claims, 2 lenses each |
| `track2_tle_sgp4_frames_time.md` | TLEs, SGP4, frames, time | about 10,400 | 5 claims, 2 lenses each |
| `track3_existing_projects.md` | Teardowns of satvis, KeepTrack, Stuff in Space, Gpredict/PREDICT, spacekit, NASA Eyes, GMAT, CesiumJS, GitHub landscape | about 10,700 | 6 claims, 2 lenses each |
| `track4_mission_design_transfers.md` | Lambert, patched conics, computed porkchop, delta-v maps, cislunar, fidelity ladder | about 8,700 | 5 claims, 2 lenses each |
| `track5_multi_objective_search.md` | EMOA*, BOA*, MOPBD* (MO-D* Lite), MO-CBS and MOM*, the 2025 survey, public_emoa, pygmo contrast | about 7,600 | 6 claims, 2 lenses each |
| `track6_space_logistics_research_frame.md` | Georgia Tech space logistics, NASA Trajectory Browser, GTOC, HLS refueling, cislunar delta-v table | about 8,400 | 6 claims, 2 lenses each |

Each track document has the same structure: orientation, sources actually read (with what could not be opened), core notes per reading item with worked numbers, answers to the track's questions from the master document, a verification ledger (each claim checked by an independent-computation lens and a primary-source lens), implications for the build, open items, and a glossary.

## Scripts and data

`scripts/` holds the Python and Node scripts that produced the numbers, with their captured outputs (`*_output.txt`). They run against a virtual environment with numpy, sgp4, skyfield, lamberthub and jplephem. Highlights:

- `T1_1_elements_to_eci.py` elements to ECI, checked against Curtis Example 4.7 and an ISS-like case.
- `T1_2_kepler.py` and `kepler_newton_seed_test.py` Kepler-equation solver sweeps over e and M, including the seed comparison.
- `T2_1_parse_tle.py` field-by-field parse of the ISS TLE; `T2_2_satellitejs_iss.mjs` and `T2_2_python_sgp4_iss.py` cross-check satellite.js against python-sgp4; `T2_5_tle_decay.py` SGP4 versus two-body drift.
- `T3_4_pass_math.py` look angles, footprint and pass prediction checked against skyfield.
- `T4_1_lambert.py` Lambert check against Curtis Example 5.2; `T4_3_porkchop.py` with `T4_3_porkchop.csv` and `T4_3_porkchop.png`, the computed 2026 to 2029 Earth-Mars porkchop; `T4_2_patched_conics.py` Hohmann, SOI and synodic numbers.
- `weighted_sum_counterexample.py` the non-convex Pareto counterexample; `t6_2_network_size_estimate.py` the time-expanded network size estimate.
- `gtoc11_catalogue.py` (2026-10-19) builds `api/data/gtoc11.npz`, the GTOC11 asteroid catalogue the routing papers sample, from the first paper's reproducibility package (Zenodo record 6034335, CC BY 4.0) with a stub-only unpickler, so none of the package's code runs.
- `T7_design_math_check.py` and `T7_extra_checks.py` (2026-09-14) check every formula in `04_system_design.md` section 7, including a Lambert solver cross-check over 4,891 random cases; outputs saved beside them.

`data/iss_tle_2026-09-01.txt` is the ISS element set used throughout (CelesTrak, epoch 2026-09-01).

## How this was produced and what to trust

Reading and computation were done by many parallel research agents on 2026-09-01; every load-bearing claim was then attacked by two independent verifier agents, and each document was reviewed by a critic against the master document's reading list and questions. Sources that could not be opened are named in each document rather than paraphrased from memory. Confidence labels (verified, likely, uncertain) are carried through. Anything labelled uncertain, and anything in the "still uncertain" sections, should be checked by hand before it is said to the professor or written into a paper.

## Suggested next steps

1. Apply the "apply" items in `01_master_doc_errata.md` to the master document.
2. Build Phase 0 (the lecture as code) using `T1_1_elements_to_eci.py` as the oracle, then A1 (live ISS on a token-free Cesium globe) using the frame chain documented in Track 2.
3. Bring `00_landscape_one_pager.md` and the narrowed gap statement to the Monday 3 PM meeting, and ask the open questions from the master document's Part I section 7, especially public_emoa licensing and whether to reimplement EMOA* in TypeScript.
