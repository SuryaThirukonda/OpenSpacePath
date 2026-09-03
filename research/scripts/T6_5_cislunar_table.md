# T6.5 -- Cislunar delta-v / time-of-flight starter table

Primary sources actually opened this session:
- Whitley, R. & Martinez, R., "Options for Staging Orbits in Cislunar Space," IEEE Aerospace
  Conference, March 2016. NASA NTRS id 20160003079.
  https://ntrs.nasa.gov/api/citations/20160003079/downloads/20160003079.pdf
- McGuire, M.L. et al., "Overview of the Lunar Transfer Trajectory of the Co-Manifested First
  Elements of NASA's Gateway," AAS 21-697, 2021. NASA NTRS id 20210020022.
  https://ntrs.nasa.gov/api/citations/20210020022/downloads/AAS_McGuire_AAS%2021-697_final_no%20voiceover.pdf
- Foster, C.W., Brandt, P.M., Pellegrino, M.M., "Trajectory Design Considerations for Low Lunar
  Orbit to Near Rectilinear Halo Orbit Transfers," NASA NTRS id 20220014057 (extended abstract,
  qualitative only -- no numeric delta-v given in the abstract text itself).
  https://ntrs.nasa.gov/api/citations/20220014057/downloads/Foster_etal_ExtendedAbstract.pdf
- NASA CAPSTONE mission page, https://www.nasa.gov/mission/capstone/ (launch/insertion dates).

| Leg | Delta-v | Time of flight | Source | Confidence | Assumptions / notes |
|---|---|---|---|---|---|
| LEO -> TLI (departure burn) | ~3.1-3.2 km/s | burn is impulsive (seconds) | Computed (this session, two-body, `T6_5_cislunar.py`): 3131 m/s for minimum-energy apogee-384,400 km transfer from 200 km circular LEO; 3155 m/s for the faster ~3-day version | **verified** (own computation) | 200 km circular LEO parking orbit, impulsive burn, two-body Earth-only. Real TLI targets a B-plane aim point in the Moon's SOI, not a literal 384,400 km apogee, and real vehicles use a finite (~6 min) burn -- both effects shift the number by tens of m/s, not the order of magnitude. |
| Direct TLI -> LLO (LOI into ~100 km LLO) | ~0.7-0.9 km/s (rough patched-conic, this session) | ~3 days one-way (matches the "3-5 day" direct chemical transfer window below) | Computed (this session): 694 m/s rough scalar patched-conic LOI, from the 3-day transfer case above. Literature ballpark (Apollo-era, ~100 nmi LLO) is commonly cited near 0.8-1.0 km/s. | **likely** for the range; the exact 694 m/s number is a **known simplification** (scalar v_infinity, not a full vector patched-conic solve -- see script docstring) | 100 km circular LLO target, impulsive LOI burn, 3-day transfer, two-body Moon-only for the insertion hyperbola. |
| TLI -> NRO/NRHO insertion (direct, chemical, "Orion-style") | 840 m/s total (21-day mission: 178+250.5+190+221.5 m/s across outbound flyby+insertion+departure flyby+insertion); 751 m/s total (60-day mission variant) | Outbound TLI->NRO ~5.1 days (21-day case) / ~5.4 days (60-day case); return NRO->EI ~5.0 days / ~15.9 days | Whitley & Martinez 2016, pp. 5-6 (slide "Orion Transfers from Earth to NRO") | **verified** (read directly from source PDF) | Orion MPCV (~25 t, ~8 t usable propellant, ~1250 m/s total DV budget, 21-day total mission lifetime for 4 crew). The 840/751 m/s figures are **round-trip** totals (outbound insertion + flyby + departure + flyby), not a single insertion burn; McGuire et al. 2021 independently gives "Direct TLI to NRHO (chemical, e.g. Orion): time 3-5 days" as a one-way figure, consistent with the ~5.1-day outbound leg here. |
| Ballistic lunar transfer (BLT) to NRHO (CAPSTONE-style) | Not separately quantified as a single delta-v line in the sources opened this session (BLT is framed as a *mass-delivery* trade, not a stated m/s total) | 120-180 days (chemical propulsion case) | McGuire et al. 2021 (AAS 21-697), "Introduction: Paths to NRHO" slide, 3 path options compared | **verified** (time-of-flight; read directly), delta-v **not found this session -- gap, see notes** | McGuire's DRM-3 (electric-propulsion "low thrust spiral") case is a *different* path with TOF 120-365 days and an explicit worked example: 383-day total TOF, 319 days thrusting + 64 days coasting -- do not confuse this with the BLT case, which is a distinct, purely-ballistic (chemical, single insertion burn) path in the same figure. |
| Ballistic lunar transfer -- CAPSTONE actual flight | Not opened this session (see gaps) | ~138 days (launch 2022-06-28 -> lunar orbit insertion 2022-11-13, per NASA mission page) | https://www.nasa.gov/mission/capstone/ | **verified** for the dates/duration; delta-v breakdown **not found this session** | CAPSTONE's real BLT was unusually long/low-energy (a rideshare-driven, propellant-minimizing trajectory), sitting at the long end of McGuire's 120-180-day BLT band. |
| Transfers to EML1/EML2 halo orbits (from TLI) | 800 m/s (polar landing case) / 750 m/s (equatorial landing case) total | 18-day mission: 5-day stay; 31-day mission: 10-day stay (i.e., ~3-day transfer legs implied by mission-length bookkeeping, matching NRO's ~3-day EM-L2 access legs below) | Whitley & Martinez 2016, p. 6 ("Larger Cislunar Orbits" table, "L2 Halo" row) | **verified** | Same Orion vehicle assumptions as above (1250 m/s budget, 21/60-day-class missions). Figures are total round-trip Orion cost including a stay-time-dependent departure geometry, not a single insertion delta-v. |
| Lunar-surface access leg, EM-L2 <-> LLO-equivalent (i.e., EM-L2 to a polar/equatorial landing-site staging point) | 800 m/s (polar), 750 m/s (equatorial) | 3 days each way | Whitley & Martinez 2016, p. 8 ("All Orbits: Lunar Surface Access" table) | **verified** | This is the same table's per-leg number (distinct from the round-trip Orion total above); "To or From LLO" delta-v column with no additional plane-change term reported for EM-L2. |
| LLO <-> NRHO (near rectilinear orbit, polar) | 730 m/s one-way (polar landing site); 898 m/s one-way (equatorial/far-side landing site) | 0.5 days one-way | Whitley & Martinez 2016, p. 7 ("Accessing the Lunar Surface from NRO") and p. 8 (all-orbits table, "NRO (Pol.)" / "NRO (Eq.)" rows) | **verified** | South-pole-vs-far-side asymmetry is explicit in the source: polar transfer costs noticeably less (730 vs 898-1795 m/s depending on landing latitude) because of NRO's near-polar geometry. Round-trip (LLO<->NRO<->LLO) total is 1461 m/s (South Pole case) / 1795 m/s (far side case) per the same slide. Foster, Brandt & Pellegrino (2022, NTRS 20220014057) independently confirm this leg is *epoch-dependent* -- optimal LLO-to-NRHO transfer time and delta-v vary revolution-to-revolution over a calendar year, driven by the Moon's latitudinal libration setting the LLO-plane/NRHO-plane intersection geometry; no single number is fully epoch-independent. |
| NRHO -> lunar surface (descent-adjacent bookkeeping) | Not separately isolated -- sources give NRHO<->LLO (730-898 m/s, above) as the staging-orbit leg; lander descent/ascent delta-v itself (LLO or NRHO orbit to touchdown) was **not sourced this session** | 0.5 days (LLO<->NRHO leg only) | Whitley & Martinez 2016 (LLO<->NRHO leg only, as above) | **uncertain** for the surface-touchdown segment specifically -- **gap, flagged below** | A commonly cited order-of-magnitude for LLO-to-surface powered descent delta-v (Apollo LM-class, ~100 km LLO to touchdown) is ~1.7-2.0 km/s, but that figure was **not verified from a primary source this session** and is given here only as an "uncertain" placeholder, not a table entry to cite without further sourcing. |

## Cross-check computation (this session, `T6_5_cislunar.py`)

Ran with `<scratchpad>/venv/Scripts/python.exe notes/T6_5_cislunar.py`. Key output:

```
=== 1) Minimum-energy ('Hohmann-like') TLI, 200 km LEO -> apogee 384,400 km ===
v_circ(LEO) = 7.7843 km/s
v_perigee(transfer) = 10.9156 km/s
TLI delta-v = 3131.3 m/s
TOF perigee->apogee (one-way) = 4.98 days

=== 2) Faster ~3-day transfer to r = 384,400 km (same 200 km LEO perigee) ===
TLI delta-v (3-day case) = 3154.5 m/s
Earth-relative speed at r=384,400 km (arrival) = 0.7359 km/s

=== 3) Rough patched-conic LOI into 100 km circular LLO (from the 3-day transfer) ===
v_infinity (rough, scalar) = 0.2824 km/s
v_pericynthion (at 100 km alt) = 2.3273 km/s
v_circ(LLO, 100 km) = 1.6335 km/s
LOI delta-v (rough) = 693.8 m/s

Sanity: LLO period at 100 km alt = 117.8 min -- matches Whitley & Martinez's "~2 hrs" LLO row.
Sanity: two-body Moon-only NRHO period from (r_peri+r_apo)/2 = 7.46 days vs. reported 6.56 days
(~14% high) -- expected, since NRHO is a CR3BP resonant orbit, not a Keplerian Moon-only ellipse.
```

Interpretation: the classic ~3.1-3.2 km/s LEO->TLI figure and ~0.7-0.9 km/s TLI->LLO LOI figure
that appear throughout the popular and technical literature both fall out of a two-body, impulsive,
Earth/Moon-only calculation with unremarkable assumptions (200 km LEO, 100 km LLO, 384,400 km lunar
distance) -- this is a useful "does my orbital mechanics even work" gate before trusting anything
downstream (Lambert solves, EMOA* edge weights) built on the same primitives.

## Gaps / could not verify this session

- BLT delta-v as a single number (only TOF band -- 120-180 days chemical -- was found; the mass
  trade-off framing in McGuire et al. did not give an explicit m/s total for the BLT case the way
  it did narratively for the low-thrust DRM-3 case).
- CAPSTONE's actual flown delta-v budget (TCM count/sizes, insertion burn magnitude) -- only the
  launch and LOI dates were pulled from the NASA mission page; the Advanced Space trajectory-design
  papers (e.g., "CAPSTONE: Trajectory and Orbit Maintenance"-type AAS papers) were not located/opened
  this session. Web search tool was unavailable for most of this session (budget exhausted before
  this task started); all lookups after that point went through WebFetch on NTRS's citation-search
  API directly, which is why NTRS/NASA-hosted numbers dominate this table over Advanced Space's own
  publications.
- Parker & Anderson's *Low Energy Lunar Trajectory Design* book -- not opened (no accessible free
  full text found via the tools available this session; NTRS surfaced two of their conference papers,
  "Targeting Low-Energy Transfers to Low Lunar Orbit" (NTRS 20150006891) and "Targeting Low-Energy
  Ballistic Lunar Transfers" (NTRS 20100031711), but both came back as metadata-only, no PDF).
  Reference for later attempt: Parker, J.S. & Anderson, R.L., *Low-Energy Lunar Trajectory Design*,
  JPL Deep Space Communications and Navigation Series, 2014 (published book/monograph).
- NRHO -> lunar-surface descent delta-v proper (the burn from an NRHO-staged lander orbit to
  touchdown) -- not sourced; only the NRHO<->LLO staging leg was found.
- Artemis mission press-kit-level delta-v budgets (Artemis II/III specific numbers) -- not pulled
  this session; Track 6's brief listed "Artemis mission documents" as a source class but time went
  to the three primary trajectory-design papers instead.
