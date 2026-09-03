# Track 2: Real Satellite Data — TLEs, SGP4, Frames, Time

## 0. Orientation

This track is the bridge from the Phase 0 teaching pipeline (clean two-body Keplerian orbits, defined by the student) to Phase A (a real satellite, the ISS, plotted honestly on a globe from public catalog data). Its purpose is to make three things automatic before any catalog data touches the codebase: (1) a NORAD TLE or OMM record is a *mean* element set fitted through the SGP4 model, not an osculating Keplerian state, so it must never be fed to the Phase 0 two-body/Keplerian propagator; (2) SGP4's native output frame is TEME (True Equator, Mean Equinox of date), which is neither the J2000/ICRF frame the Phase 0 pipeline and any future heliocentric (Phase B/C) work will use, nor Cesium's ECEF "Fixed" frame — every value that crosses one of these frame boundaries needs an explicit, tested conversion; and (3) time itself has multiple incompatible scales (UTC, UT1, TAI, TT) and multiple incompatible software conventions (JS `Date`, Julian date, GMST), and the single most common bug class in a satellite visualizer is a silent time or frame mixup that puts the ground track thousands of kilometers off with no error thrown. Get these three right once, with tests anchored to published known-answer vectors, and Phase A becomes a straightforward engineering task instead of a slow, unmonitored source of "why is the ISS over the wrong ocean" bugs.

## 1. Sources actually read

CelesTrak documentation and data (all opened):
- CelesTrak NORAD TLE format — https://celestrak.org/NORAD/documentation/tle-fmt.php
- CelesTrak "A New Way to Obtain GP Data" (gp.php query API) — https://celestrak.org/NORAD/documentation/gp-data-formats.php (cached: `notes/celestrak_gp_data_formats.txt`)
- CelesTrak Usage Policy (2026-05-15, updated 2026-05-22) — https://celestrak.org/usage-policy.php (cached: `notes/celestrak_usage_policy.txt`)
- CelesTrak SATCAT format — https://celestrak.org/satcat/satcat-format.php
- CelesTrak Current GP Element Sets index — https://celestrak.org/NORAD/elements/
- CelesTrak columns index — https://celestrak.org/columns/
- Kelso, "FAQs: Two-Line Element Set Format," Satellite Times 4(3), Jan 1998 — https://celestrak.org/columns/v04n03/ (cached: `notes/celestrak_v04n03.txt`)
- Kelso, "More Frequently Asked Questions," Satellite Times 4(5), Mar 1998 — https://celestrak.org/columns/v04n05/ (cached: `notes/celestrak_v04n05.txt`)
- Kelso, "Orbital Coordinate Systems Part I" — https://celestrak.org/columns/v02n01/
- Kelso, "Orbital Coordinate Systems Part II" — https://celestrak.org/columns/v02n02/
- CelesTrak SGP4 FAQ — https://celestrak.org/publications/AIAA/2006-6753/faq.php
- CelesTrak supplemental GP (SupGP) page — https://celestrak.org/NORAD/elements/supplemental/
- Live ISS OMM (JSON-PRETTY), fetched 2026-09-01 — https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON-PRETTY
- Live ISS TLE and ISS supplemental TLEs, fetched 2026-09-01 — cached: `celestrak_iss_now.txt`, `celestrak_iss_sup_now.txt`
- ISS TLE used throughout this document — `iss_tle.txt`

Primary technical papers (all opened):
- Vallado, Crawford, Hujsak, Kelso, "Revisiting Spacetrack Report #3" (AIAA 2006-6753 Rev2) — https://celestrak.org/publications/AIAA/2006-6753/AIAA-2006-6753-Rev2.pdf (WebFetch could not parse the PDF; text-extracted with `pypdf` to `notes/T2_2_vallado2006_text.txt` and `notes/vallado2006.txt`)
- Vallado & Crawford, "SGP4 Orbit Determination" (AIAA 2008-6770) — https://celestrak.org/publications/AIAA/2008-6770/AIAA-2008-6770.pdf (text: `pdfs/vallado_2008_6770.txt`)
- Kelso, "Validation of SGP4 and IS-GPS-200D Against GPS Precision Ephemerides" (AAS 07-127) — https://celestrak.org/publications/AAS/07-127/AAS-07-127.pdf (text: `pdfs/kelso_2007_AAS07-127.txt`; plots read from `notes/PRN10TLEComparisonStatistics.gif`, `notes/PRN11TLEComparisonStatistics.gif`)
- Flohrer, Krag, Klinkrad, "Assessment and Categorization of TLE Orbit Errors for the US SSN Catalogue" (AMOS 2008) — https://amostech.com/TechnicalPapers/2008/Orbital_Debris/Flohrer.pdf (text: `pdfs/flohrer_2008.txt`)
- Oltrogge & Ramrath, "Parametric Characterization of SGP4 Theory and TLE Positional Accuracy" (AMOS 2014) — https://amostech.com/TechnicalPapers/2014/Poster/OLTROGGE.pdf (text: `pdfs/oltrogge_2014.txt`)
- Conkey et al., "Assessing Performance Characteristics of the SGP4-XP Propagation Algorithm" (AMOS 2022) — https://amostech.com/TechnicalPapers/2022/Poster/Conkey.pdf (text: `pdfs/conkey_2022.txt`)
- Kuciapinski & Kelso, "Supplemental GP (SupGP) Element Sets" (AMOS 2023) — https://amostech.com/TechnicalPapers/2023/Poster/Kuciapinski.pdf
- Jankovic, "How long can you trust a Starlink TLE?" (arXiv 2605.19850) — https://arxiv.org/html/2605.19850
- Levit & Marshall, "Improved orbit predictions using two-line elements" (arXiv 1002.2277) — https://arxiv.org/abs/1002.2277
- Racelis & Joerger, "TLE error analysis for MEO and GEO" (Stanford PNT slides) — http://web.stanford.edu/group/scpnt/pnt/PNT18/presentation_files/S08-Racelis-MEO-GEO_Error_Analysis.pdf (slides only; no numeric text layer, used qualitatively)
- **Could not open**: Vallado & Cefola 2012, "Two-line element sets — practice and use" (IAC-12) — http://iafastro.directory/iac/archive/browse/IAC-12/C1/6/13640/ (IAF archive restricted; ResearchGate copy also blocked). Cited only indirectly through papers that reference it.

Secondary / reference sources (all opened):
- Wikipedia: Simplified perturbations models — https://en.wikipedia.org/wiki/Simplified_perturbations_models
- Wikipedia: Earth-centered inertial — https://en.wikipedia.org/wiki/Earth-centered_inertial
- Wikipedia: Earth-centered, Earth-fixed coordinate system — https://en.wikipedia.org/wiki/Earth-centered,_Earth-fixed_coordinate_system
- Wikipedia: International Terrestrial Reference System and Frame — https://en.wikipedia.org/wiki/International_Terrestrial_Reference_System_and_Frame
- Wikipedia: Universal Time — https://en.wikipedia.org/wiki/Universal_Time
- Wikipedia: Terrestrial Time — https://en.wikipedia.org/wiki/Terrestrial_Time
- Wikipedia: Sidereal time — https://en.wikipedia.org/wiki/Sidereal_time
- Wikipedia: Julian day — https://en.wikipedia.org/wiki/Julian_day
- Wikipedia: Leap second — https://en.wikipedia.org/wiki/Leap_second
- IERS Bulletin C 72 (6 Jul 2026) — https://datacenter.iers.org/data/latestVersion/bulletinC.txt
- USNO leap-second page — https://maia.usno.navy.mil/products/leap-second
- USNO/IERS finals.daily (cached: `notes/finals.daily.txt`)
- Skyfield, Earth satellites docs — https://rhodesmill.org/skyfield/earth-satellites.html
- Cesium `Transforms` reference doc — https://cesium.com/learn/cesiumjs/ref-doc/Transforms.html
- Cesium `Transforms.js` source — https://raw.githubusercontent.com/CesiumGS/cesium/main/packages/engine/Source/Core/Transforms.js
- Cesium `SampledPositionProperty` reference doc — https://cesium.com/learn/cesiumjs/ref-doc/SampledPositionProperty.html
- Cesium `Cartesian3` reference doc — https://cesium.com/learn/cesiumjs/ref-doc/Cartesian3.html
- Cesium `ReferenceFrame` enum — https://cesium.com/learn/cesiumjs/ref-doc/global.html#ReferenceFrame
- **Could not open**: Cesium Sandcastle "Camera"/ICRF example — https://github.com/CesiumGS/cesium/blob/main/Apps/Sandcastle/gallery/Camera.html (raw GitHub paths for main/1.100/1.80 returned 404; Sandcastle page itself loaded only a shell). Confirmed instead via a search snippet and via satvis's identical `CesiumController.cameraTrackEci` code.
- cesium-dev mailing list thread on inertial/fixed drift (a camera-orthonormality bug, not a frame bug) — https://groups.google.com/g/cesium-dev/c/5lHlHWa4aJA/m/-aoZma
- satellite.js GitHub — https://github.com/shashwatak/satellite-js
- satellite.js docs (Quick start, Coordinate transforms) — https://shashwatak.github.io/satellite-js/docs/intro, /docs/transforms
- python-sgp4 README — https://raw.githubusercontent.com/brandon-rhodes/python-sgp4/master/README.rst
- python-sgp4 `sgp4/propagation.py` — https://raw.githubusercontent.com/brandon-rhodes/python-sgp4/master/sgp4/propagation.py
- NASA ISS trajectory data (OEM) description — https://phys.org/news/2024-12-space-station-trajectory.html (NASA's own page 404'd)

Local repositories and packages read in full or in relevant part (all opened):
- `repos/satellite-js` (clone of shashwatak/satellite-js, main): `README.md`, `CHANGELOG.md`, `LICENSE.md`, `package.json`, `src/index.ts`, `src/constants.ts`, `src/io.ts`, `src/ext.ts`, `src/transforms.ts`, `src/common-types.ts`, `src/propagation/{propagate,sgp4,sgp4init,initl,gstime,check-for-decay,SatRec}.ts`, `src/wasm/index.ts`
- `notes/sjs/node_modules/satellite.js` (npm-installed v7.1.0): `dist/io.js`, `package.json`
- `venv/Lib/site-packages/sgp4` (python-sgp4 2.27): `io.py`, `omm.py`
- `repos/satvis` (branch `next`): `README.md`, `worker/src/gp/evaluate.ts`, `worker/wrangler.jsonc`, `src/modules/Orbit.ts`, `src/modules/SampledTrajectory.ts`, `src/modules/SatelliteComponentCollection.ts`, `src/modules/util/sgp4Worker.ts`, `src/modules/util/temeToFixed.ts` (+ its test file), `src/modules/util/PolylineBatch.ts`, `src/modules/CesiumController.ts`, `src/modules/SatelliteManager.ts`, `src/config/viewModes.ts`, `src/composables/useViewerClock.ts`, `package.json`

Scripts written for this track (all under `notes/`, reusable):
- `notes/T2_1_parse_tle.py`, `notes/T2_1_omm_compare.py`, `notes/T2_1_refresh_scale.py`
- `notes/T2_2_satellitejs_iss.mjs` (run from `notes/sjs` because satellite.js is ESM-only), `notes/T2_2_python_sgp4_iss.py`, `notes/T2_2_kepler_vs_sgp4.py`
- `notes/t23_frames.py`, `notes/t23_frames2.py`, `notes/t23_vallado_check.py`
- `notes/T2_4_time.py`, `notes/node/T2_4_time_check.mjs`
- `notes/T2_5_tle_decay.py`

Master document sections consulted: `rathinam_project_master.md` Track 2 / Part III §1.2 and §2 (lines 126-141, 243-247, 259-268).

## 2. Core notes by reading item

### T2.1 — CelesTrak TLE/GP formats, gp.php query API, SATCAT, fetch etiquette

**What a TLE is, precisely.** A NORAD "two-line element set" is two fixed-width 69-character ASCII lines (a "3LE" adds a 24-character name line 0). Kelso is explicit: the numbers are "mean elements calculated to fit a set of observations using a specific model — the SGP4/SDP4 orbital model" (v04n05). They are not osculating Keplerian elements, and "you cannot simply reformat the data unless you are willing to accept predictions with unpredictable errors." SGP4/SDP4 output is ECI **TEME** (true equator, mean equinox) of epoch (v04n05).

**Field layout** (1-indexed columns; tle-fmt.php and Kelso v04n03):

Line 1: `01` line number · `03-07` catalog number · `08` classification (`U`) · `10-17` international designator (launch year, launch number, piece) · `19-32` epoch `YYDDD.DDDDDDDD` · `34-43` $\dot n/2$ [rev/day²] · `45-52` $\ddot n/6$ [rev/day³] · `54-61` BSTAR [1/$R_\oplus$] · `63` ephemeris type (always 0 in public data) · `65-68` element set number · `69` checksum.

Line 2: `01` line number · `03-07` catalog number · `09-16` inclination [deg] · `18-25` RAAN [deg] · `27-33` eccentricity (implied leading `0.`) · `35-42` argument of perigee [deg] · `44-51` mean anomaly [deg] · `53-63` mean motion [rev/day] · `64-68` revolution number at epoch · `69` checksum.

**Conventions to memorize:**
- **Epoch** `YYDDD.DDDDDDDD`: day 1.0 = Jan 1 00:00 UTC. `98001.00000000` = 0000 UT 1998-01-01 (Kelso v04n03). Resolution $10^{-8}$ day = 0.864 ms (6.6 m of ISS motion). Times are UTC mean solar, never sidereal. Two-digit-year pivot at 57: `yy < 57` → `20yy`, else `19yy`. This pivot is identical in satellite.js, python-sgp4, and Space-Track's own convention.
- **$\dot n/2$ and $\ddot n/6$**: the stored fields are already divided by 2 and 6, i.e. $M(t) = M_0 + n t + (\dot n/2) t^2 + (\ddot n/6) t^3$. SGP4/SDP4 do **not** use them (only the legacy SGP model did); $\dot n/2$ is a handy decay diagnostic but is not what drives SGP4's drag term.
- **Exponent notation**: `±MMMMM±E` = $\pm 0.MMMMM \times 10^{\pm E}$ (implied leading decimal, FORTRAN heritage). E.g. `79223-4` = $7.9223\times10^{-5}$; `-12345-6` = $-1.2345\times10^{-7}$. Blank = 0.
- **BSTAR**: $B = C_D A/m$; $B^\* = B\rho_0/2$, units $R_\oplus^{-1}$. It is a fitted parameter and **can be negative** — ISS SupGP segments during maneuvers show BSTAR $= -0.17866\times10^{-2}$; a parser that rejects negative BSTAR is wrong.
- **Element set number** increments per new fit but goes out of sync between control centers and saturates (ISS shows 999); never use it as a version key — use EPOCH instead.
- **Checksum**: sum the digits in columns 1-68; a minus sign counts as 1; letters, blanks, periods, and plus signs count as 0; take mod 10. Catches roughly 90% of transcription errors (Kelso).
- **Mean motion** on line 2 is a **Kozai-type** mean motion (rev/day); SGP4 "un-Kozais" it internally (see §T2.2) before deriving a semi-major axis.

**Worked parse of the ISS TLE** (`notes/T2_1_parse_tle.py`, TLE dated epoch `26244.49851260`):
```
1 25544U 98067A   26244.49851260  .00003910  00000+0  79223-4 0  9992
2 25544  51.6312 282.3953 0005055  96.4740 263.6824 15.48958602583585
```
catalog 25544, classification U, international designator 1998-067A (Zarya); epoch 2026-09-01 11:57:51.489 UTC; $\dot n/2 = 3.91\times10^{-5}$ rev/day², $\ddot n/6 = 0$; BSTAR $= 7.9223\times10^{-5}\ R_\oplus^{-1}$; ephemeris type 0; element set 999; both checksums verify (2 and 5). $i = 51.6312°$, RAAN $= 282.3953°$, $e = 0.0005055$, $\omega = 96.4740°$, $M = 263.6824°$, $n = 15.48958602$ rev/day, rev 58358. Naive two-body period $= 1440/n = 92.9657$ min (5577.94 s), $a = (\mu/n^2)^{1/3} = 6797.9$ km ($\mu = 398600.4418\ \text{km}^3/\text{s}^2$). python-sgp4's internal un-Kozai'd value gives $a = 6798.4$ km and a period of 92.976 min — a 0.5 km difference from the naive value that is explained in §T2.2/T2.5.

**OMM / GP data and the `gp.php` API.** Query pattern: `https://celestrak.org/NORAD/elements/gp.php?{CATNR|INTDES|GROUP|NAME|SPECIAL}=VALUE[&FORMAT=TLE|3LE|2LE|XML|KVN|JSON|JSON-PRETTY|CSV]`. Keys must be uppercase; FORMAT has defaulted to CSV since 2026-05-09. `SPECIAL` accepts `GPZ`, `GPZ-PLUS`, `DECAYING`; `gp-first.php` returns the earliest available GP data for an object. OMM keys follow CCSDS 502.0-B-3: `OBJECT_NAME`, `OBJECT_ID`, `EPOCH` (ISO 8601), `MEAN_MOTION` [rev/day], `ECCENTRICITY`, `INCLINATION`, `RA_OF_ASC_NODE`, `ARG_OF_PERICENTER`, `MEAN_ANOMALY`, `EPHEMERIS_TYPE`, `CLASSIFICATION_TYPE`, `NORAD_CAT_ID`, `ELEMENT_SET_NO`, `REV_AT_EPOCH`, `BSTAR`, `MEAN_MOTION_DOT`, `MEAN_MOTION_DDOT`, plus `REF_FRAME=TEME`, `TIME_SYSTEM=UTC`, `MEAN_ELEMENT_THEORY=SGP4`.

The live ISS OMM fetched 2026-09-01 shows the TLE is a **lossy** projection of the OMM: `ECCENTRICITY 0.00050553` vs the TLE's `0.0005055`; `BSTAR 7.9223149e-5` vs `7.9223e-5`; epoch fraction differs by $10^{-8}$ day (0.86 ms). **The TLE format is effectively retired for new objects**: USSF's SATCAT crossed catalog number 100000 on 2026-07-11, and 6-digit ("Alpha-5"-adjacent) objects cannot be represented in the fixed 5-digit TLE catalog field at all. New parser code should target OMM JSON/CSV first, with TLE as a legacy import path.

**SATCAT.** `https://celestrak.org/satcat/records.php?{QUERY}=VALUE&FORMAT=CSV`. Columns: `OBJECT_NAME`, `OBJECT_ID`, `NORAD_CAT_ID`, `OBJECT_TYPE` (PAY/R/B/DEB/UNK), `OPS_STATUS_CODE`, `OWNER`, `LAUNCH_DATE`, `LAUNCH_SITE`, `DECAY_DATE`, `PERIOD` [min], `INCLINATION` [deg], `APOGEE`/`PERIGEE` [km], `RCS` [m²], `DATA_STATUS_CODE`, `ORBIT_CENTER`, `ORBIT_TYPE`. Cached snapshot `notes/satcat.csv` has 70,532 rows; SATCAT updates "once or twice a day."

**Fetch etiquette — exact wording, because this is easy to violate accidentally while iterating on a dev loop.** From the gp-data-formats FAQ: "CelesTrak only checks for new GP data once every 2 hours, so there is no need for you to check more often." Some users "download the same file every minute of the day (that's 1,440 times or 120x the update rate)... we have had to implement limits, which are enforced with temporary blocks." As of 2026-03-26, CelesTrak enforces a **one-download-per-update policy** starting with the Active and Starlink GROUPs: a second request within the same 2-hour window returns HTTP 403 with a message naming the GROUP and the last successful download time. "Continued excessive requests — whether you get data or not — can still result in your IP address being sent to the firewall." The usage policy adds: only download data once per update; M2M software must "immediately stop querying when it receives any non-HTTP 200 responses"; directory (`jsonDir`) queries no more than once per hour. **Practical consequence: a dev loop that re-fetches on every save can get an IP blocked within minutes — cache to disk and gate fetches on a TTL.**

### T2.2 — satellite.js README and source, cross-checked with python-sgp4

**What satellite.js is.** Version 7.1.0 (CHANGELOG 2026-07-23), MIT license, TypeScript, ESM-only since 7.0.0 (Node ≥ 20.19/22.13/24), ~1.1k GitHub stars. Its propagation code is a deliberate line-by-line port of Vallado's SGP4 (AIAA 2006-6753) via Brandon Rhodes' python-sgp4, keeping Vallado's variable names so upstream fixes port over cleanly (per the README). Frame transforms follow Kelso's CelesTrak columns v02n01-v02n03. Constants are hard-coded **WGS-72** ($\mu = 398600.8\ \text{km}^3/\text{s}^2$, $R_\oplus = 6378.135$ km, $J_2 = 1.082616\times10^{-3}$) with no WGS-84 option; python-sgp4 offers WGS-84 but the README/Vallado agree WGS-72 is correct because that is what TLEs were fit with — mixing constant sets is a source of km-level silent error.

**API surface a viewer needs** (units are the load-bearing fact here):

| function | input | output |
|---|---|---|
| `twoline2satrec(l1,l2)` / `json2satrec(omm)` | TLE strings / OMM object | `SatRec` (angles rad, `no` rad/min, `bstar` 1/$R_\oplus$, `jdsatepoch` JD) |
| `propagate(satrec, Date)` | JS `Date` (UTC) | `{position, velocity}` in km, km/s, or **`null`** on error |
| `sgp4(satrec, tsinceMinutes)` | minutes since epoch | same |
| `gstime(Date\|jd)` | UTC treated as UT1 | GMST in **radians**, $[0, 2\pi)$ |
| `eciToEcf(v, gmst)` / `ecfToEci` | km | km (pure Z-rotation) |
| `eciToGeodetic(rEci, gmst)` | km | `{longitude, latitude}` **radians**, `height` **km**, WGS-84 |
| `degreesLat/degreesLong(rad)` | rad | deg; **throws `RangeError`** outside $[-90,90]$/$[-180,180]$ |

**Units mantra: km, km/s, radians, minutes-since-epoch inside satellite.js; Cesium wants metres; the UI wants degrees.** satvis multiplies by 1000 and by $180/\pi$ at the boundary (`Orbit.ts`, `sgp4Worker.ts`).

`satrec.error` mirrors Vallado's enum: 0 none, 1 mean eccentricity outside $[0,1)$, 2 mean motion $<0$, 3 perturbed eccentricity out of range, 4 semi-latus rectum $<0$, 5 unused, **6 decayed** (radius under 1 $R_\oplus$). `propagate` returns `null` on error — code that skips the null check silently plots garbage for a decayed object.

**Kozai vs. un-Kozai mean motion.** The TLE's line-2 mean motion (15.48958602 rev/day for the ISS) is a Kozai-type mean motion; `twoline2satrec` divides by $x_{pdotp} = 1440/(2\pi) = 229.1831180523293$ to get `no_kozai = 0.0675860690` rad/min. `initl` then "un-Kozais" it through a $J_2$ iteration to the Brouwer mean motion `no_unkozai = 0.0675785386` rad/min — stored as `satrec.no` in satellite.js. The two implied semi-major axes differ by **0.505 km** (6797.910 km vs. 6798.415 km), and SGP4's own internal semi-major axis at epoch is 6798.415 km — confirming the un-Kozai'd value, not the naive Kepler-III value, is the physically meaningful one.

**Cross-check numbers** (2026-09-01 12:00:00 UTC, ISS TLE epoch 26244.49851260, $t_{since} = 2.1419$ min; `notes/T2_2_satellitejs_iss.mjs`, `notes/T2_2_python_sgp4_iss.py`):
- satellite.js TEME $\mathbf{r} = (2038.30652, -6439.05831, 769.28341)$ km, $\mathbf{v} = (4.35345, 2.09991, 5.94407)$ km/s; $|\mathbf{r}| = 6797.644$ km, $|\mathbf{v}| = 7.6612$ km/s.
- satellite.js vs. python-sgp4 2.27 (both WGS-72): $|\Delta\mathbf{r}| = 0.055$ m, $|\Delta\mathbf{v}| = 0.06$ mm/s — the two independent ports of Vallado's algorithm agree to sub-metre precision, which is the right oracle tolerance for a "did I port SGP4 correctly" unit test.
- Geodetic: satellite.js gives lat $6.538752°$, lon $126.899373°$, alt $419.782$ km. Skyfield's `wgs84.subpoint` (which uses true UT1 rather than treating UTC as UT1) differs by lon $0.00040°$ (44 m), alt identical — the gap is entirely a UT1-UTC effect (DUT1 $\approx 0.095$ s → 1.37 arcsec → ~45 m), and Vallado himself says this is within SGP4's own accuracy budget.

**Refresh cadence rule of thumb from the literature (secondary, "likely" confidence pending T2.5's primary-source numbers):** ~1 km error at epoch, growing 1-3 km/day in LEO (along-track dominant, drag-driven); ~10 km at epoch for SDP4/GEO with slower growth; a TLE is "useful roughly a couple of weeks either side of epoch" (Skyfield docs).

### T2.3 — Frames: TEME vs. ECI (J2000/GCRF) vs. ECEF (ITRF); what Cesium and satvis do

**The frame family tree** (all Earth-centered, right-handed, $z$ toward the pole):

| Frame | Rotates with Earth? | $x$-axis reference | Who uses it |
|---|---|---|---|
| J2000 / EME2000 | No | mean equinox at 2000-01-01 12:00 TT | textbooks, most generic "ECI" code, Phase 0 pipeline |
| GCRF / ICRF | No | fixed to distant quasars (differs from J2000 by a ~20 mas frame bias — negligible here) | Cesium `ReferenceFrame.INERTIAL`, Skyfield GCRS, modern IERS products |
| MOD / TOD | No, but drifts with date (precession, +nutation for TOD) | mean/true equinox of date | intermediate astrodynamics frames |
| **TEME** | No, but "of date" | the *uniform equinox*, on the true equator between PEF's and TOD's origins | **SGP4 output — only SGP4** |
| PEF (pseudo-Earth-fixed) | Yes | Greenwich meridian; polar motion **not** applied | `eciToEcf`, Cesium `computeTemeToPseudoFixedMatrix` |
| ITRF / ECEF (WGS-84) | Yes | IERS reference meridian ($0°$ lat/lon) | Cesium `ReferenceFrame.FIXED`, `Cartesian3.fromDegrees` |

Vallado's own words on TEME (2006, §II.D, verified against the extracted PDF text): an exact operational definition "is very difficult to find in the literature." The recommended route out of TEME is to rotate to PEF by GMST(UT1) first, then to any other standard frame, since polar motion "has been historically neglected for GP applications."

**Conversion 1 — TEME → PEF/ECEF**, a single rotation about $z$ by GMST $\theta$:
$$x_{ecf} = \cos\theta\, x_{teme} + \sin\theta\, y_{teme}, \quad y_{ecf} = -\sin\theta\, x_{teme} + \cos\theta\, y_{teme}, \quad z_{ecf} = z_{teme}$$
This is exactly satellite.js's `eciToEcf` and Cesium's `computeTemeToPseudoFixedMatrix` (verified against `Transforms.js` source). GMST (IAU-1982 polynomial, identical in satellite.js, python-sgp4, Kelso's column, and Cesium):
$$\theta_{GMST}(s) = 67310.54841 + (876600h\cdot 3600 + 8640184.812866)\,T_{UT1} + 0.093104\,T^2 - 6.2\times10^{-6}\,T^3, \quad T = \frac{JD_{UT1}-2451545}{36525}$$
Cesium's own JSDoc states it "treats the UT1 time standard as equivalent to UTC"; satellite.js does the same. The cost of that shortcut: $|UT1-UTC| < 0.9$ s → ≤ 13.5 arcsec of Earth rotation → ≤ 0.45 km at ISS radius; polar motion (~0.3 arcsec) → ~10 m. Both are invisible at any globe-scale zoom.

**Conversion 2 — ECEF → geodetic**: iterative WGS-84 solution ($a = 6378.137$ km, $b = 6356.7523142$ km), 20 fixed-point iterations in satellite.js's `eciToGeodetic`, output in radians and km.

**Known-answer test** (Vallado 2006 Appendix C, reproduced to 0.06 mm with `notes/t23_vallado_check.py`): at 2004-04-06 07:51:28.386 UTC with $\Delta UT1 = -0.439961$ s, $x_p = -0.140682''$, $y_p = 0.333309''$, $\mathbf{r}_{TEME} = (5094.18016210, 6127.64465950, 6380.34453270)$ km transforms to $\mathbf{r}_{ITRF} = (-1033.47938300, 7901.29527540, 6380.35659580)$ km, GMST $= 312.809894°$. This is worth encoding as a permanent regression test. Two pitfalls found while reproducing it: applying the polar-motion rotation with the wrong sign convention costs 32.9 m; using UTC as UT1 (the shortcut everyone actually uses) costs 268.7 m.

**How big is TEME-vs-J2000 confusion today, in 2026?** (`notes/t23_frames.py`) $T = 0.26667$ Julian centuries (26.67 years) since J2000; general precession in longitude $p_A = 5028.796''\,T + 1.105''\,T^2 = 1341'' = 0.373°$. Real check: raw SGP4 TEME vs. Skyfield GCRS for the ISS on 2026-09-01 12:00 UTC differ by **38.7 km (0.326°)**, growing from 0.9 km in 2000 to a projected 44 km in 2030. At GEO radius the same angle is **~270 km**.

**The classic, silent bug, stated precisely:** take SGP4's TEME output, label it "ECI," and push it into a `SampledPositionProperty(ReferenceFrame.INERTIAL)` (i.e. treat TEME as ICRF). Cesium then applies full IAU-2006 precession-nutation + Earth Rotation Angle + polar motion to a vector that was never in that frame, and the satellite lands roughly 39-41 km off at ISS altitude and roughly 250-274 km at GEO in 2026 (verified in §4: two independent cross-checks against Skyfield and astropy give 40.7 km at LEO and 252-261 km across three live GEO TLEs, with 274 km closer to the geometric maximum for this epoch's precession angle than a typical value) - a number that grows every year (roughly 50 arcsec/yr of accumulating precession) and never throws an error. The correct pairing is TEME → GMST rotation → pseudo-fixed (which equals Cesium's FIXED frame to within the sub-100-m UT1/polar-motion noise above). A second common bug is a plain unit mismatch: satellite.js returns km, Cesium wants metres.

**What satvis does (verified in repo, satellite.js ^7.1, Cesium ^1.144).** Propagation runs in a Web Worker (`util/sgp4Worker.ts`, Cesium-free) using `satellite.js.propagate`. The worker then rotates TEME to pseudo-fixed with its own hand-inlined copy of Cesium's `computeTemeToPseudoFixedMatrix` (`util/temeToFixed.ts`, tested against Cesium to < 1e-5 m over 3 years of anchors) and converts to metres, producing `positionsFixed`. Every satellite entity (points, labels, ground tracks) binds to these **FIXED**-frame samples via `SampledTrajectory.ts`. Only the orbit-ellipse component asks for `requireInertial()`, which multiplies fixed samples by `Transforms.computeFixedToIcrfMatrix(time)` into an INERTIAL `SampledPositionProperty` — i.e. **satvis renders in FIXED and derives ICRF only where an inertial-looking orbit line is wanted, never the reverse.** The "Inertial" camera mode (`CesiumController.cameraTrackEci`) is a camera trick, not a change of entity frame: in `scene.postUpdate`, if `Transforms.computeIcrfToFixedMatrix(time)` is defined (it returns `undefined` until `Transforms.preloadIcrfFixed(interval)` has loaded IAU2006 XYS + EOP data), the camera is re-parented with `camera.lookAtTransform`.

**Decision table for this project:**

| Scene | Store entities as | SGP4 → target |
|---|---|---|
| Fixed Earth (ground tracks, passes) | `ReferenceFrame.FIXED`, metres | TEME → GMST rotation → pseudo-fixed, ×1000 |
| "Inertial" look (stars fixed, Earth spins) | still FIXED; rotate the **camera** | same, plus `computeIcrfToFixedMatrix` on the camera |
| True inertial geometry (closed orbit ellipse; later heliocentric work) | `ReferenceFrame.INERTIAL` | TEME → pseudo-fixed → ICRF; never feed TEME directly into INERTIAL |
| Phase 0 Keplerian demo (our own elements, no TLE) | INERTIAL, or FIXED after `computeIcrfToFixedMatrix` | elements are already defined in J2000/ICRF; no TEME involved |

### T2.4 — Time scales: UTC, UT1, TAI, TT, Julian date, GMST

**The ladder of time scales:**

| Scale | Definition | Where it appears here |
|---|---|---|
| TAI | Atomic time, SI seconds, no leaps | Cesium `JulianDate` stores TAI internally (`dayNumber` + `secondsOfDay`) |
| UTC | TAI minus an integer number of leap seconds, kept within 0.9 s of UT1; TAI$-$UTC $= 37$ s today (27 leap seconds since 1972, last one end of 2016; IERS Bulletin C 72, 2026-07-06, announces none at end of Dec 2026) | TLE epoch field, JS `Date`, CelesTrak timestamps |
| UT1 | Earth's actual rotation angle expressed as time; DUT1 = UT1$-$UTC, published by IERS. DUT1 on 2026-09-01 = $+0.0024259$ s | the *correct* GMST input; nobody in the JS toolchain actually uses it |
| TT | TT $=$ TAI $+ 32.184$ s, so TT$-$UTC $= 69.184$ s today; J2000.0 $=$ JD 2451545.0 **TT** | planetary ephemerides, Phase B/C |
| TDB | TT + periodic relativistic terms ($<2$ ms) | JPL ephemeris lookups only |

The 2022 CGPM (Resolution 4) plans to end or loosen leap seconds by 2035, and Earth's recent speed-up has raised the possibility of a first-ever *negative* leap second — a hard-coded "37" is a latent bug the moment either happens; use a library's leap-second table, not a literal.

**Julian dates.** JD flips at noon, not midnight: $JD(\text{2000-01-01 12:00}) = 2451545.0$; $JD(\text{1970-01-01 00:00 UTC}) = 2440587.5$; $MJD = JD - 2400000.5$. For 2026-09-01 00:00:00 UTC: **JD 2461284.5** (MJD 61284), $T = 0.266652977$ Julian centuries. Three independent computation routes (python-sgp4 `jday`, satellite.js `ext.jday`, raw Unix-ms arithmetic) agree to 0 s. A bare JD number is ambiguous by up to 69 s unless it is labelled with its scale (UT1 vs. TT); python-sgp4 splits JD into integer+fraction to preserve microsecond precision, satellite.js uses one double (fine at millisecond scale).

**GMST computation**, verified identical across satellite.js, python-sgp4, and Kelso's column form (IAU-1982 polynomial, same coefficients as §T2.3):
$$T = \frac{JD_{UT1}-2451545.0}{36525}, \quad \theta_{GMST}[\text{s}] = 67310.54841 + (876600{\cdot}3600 + 8640184.812866)\,T + 0.093104\,T^2 - 6.2{\times}10^{-6}\,T^3$$
converted to radians via $\theta_{GMST}[\text{rad}] = (\theta_{GMST}[\text{s}]\cdot\frac{\pi}{180}/240)\bmod 2\pi$ (1 s of time $= 1/240$ deg).

At **2026-09-01 00:00:00 UTC**: satellite.js (Node, real library), python-sgp4's `gstime`, and Kelso's split 0h-form all give **5.937141842 rad = 340.1731699°** (treating UTC as UT1). IAU-2006 ERA(UT1)+precession(TT) and Skyfield's `gmst` with the current IERS DUT1 both give 5.937141730 rad — a 0.023 arcsec (0.7 m) difference from the UTC-as-UT1 shortcut, confirming that shortcut is harmless at any visualization scale. A separate lesson: Skyfield's own *bundled, stale* IERS table gave 5.937148466 rad (+1.37 arcsec, +42 m) — even a "proper" astronomy library is only as good as the freshness of its Earth-orientation data. Known-answer anchor: Kelso's worked example, 1995-10-01 09:00 UTC ($JD = 2449991.875$) → 2.524218 rad, reproduced to 0.3 microrad.

**Cost table for time errors** (equatorial surface speed $= R_\oplus\omega_\oplus = 0.4651$ km/s; sidereal day $= 86164.10$ s; $\omega_\oplus = 7.2921150\times10^{-5}$ rad/s):

| Mistake fed into GMST | Offset | Ground-track error at equator |
|---|---|---|
| ignore UT1$-$UTC (today's DUT1) | 0.0024 s | 1.1 m |
| ignore UT1$-$UTC, worst case allowed | 0.9 s | 0.42 km |
| feed TAI instead of UTC | 37 s | 17.2 km |
| feed TT instead of UTC | 69.2 s | 32.2 km |
| feed local civil time (e.g. CDT) | 5-6 h | 8,400-10,000 km |
| JS `Date` millisecond rounding | 0.5 ms | 0.2 m |

A separate and *larger* hazard: the same 1-second error applied to SGP4's own `tsince` argument moves a LEO satellite along-track at its orbital velocity — **7.67 km for 1 s of ISS**, about 16× worse than the same 1-second error would cause through GMST alone. Danger ranking, largest to smallest: timezone/DST mistakes (thousands of km) ≫ TAI-vs-UTC confusion (tens of km) ≫ a 1-second `tsince` slip (km) ≫ GMST 1-second error (0.5 km) ≫ ignoring UT1$-$UTC (metres).

**JavaScript `Date` pitfalls** (demonstrated live in `notes/node/T2_4_time_check.mjs`): months are 0-indexed (`new Date(2026,9,1)` is **October** 1); `new Date("2026-09-01")` parses as UTC but `new Date("2026-09-01T00:00:00")` (no trailing `Z`) parses as **local** time; DST makes a "day" not always 24 h in local time; leap seconds cannot be represented (`Date.UTC(2016,11,31,23,59,60)` silently rolls to 2017-01-01T00:00Z); resolution is milliseconds only; `getMonth()`/`getDate()` (local) vs. `getUTCMonth()`/`getUTCDate()` (UTC) are easy to confuse — satellite.js's own `jday(Date)` correctly uses the UTC accessors. **Rule: never hand-roll timezone or leap-second arithmetic.** Keep Cesium's `JulianDate` (TAI internally, `fromIso8601`/`toDate` handle leap seconds) as the single app clock and cross the boundary once, exactly as satvis's `useViewerClock.ts` does with `JulianDate.toDate(clock.currentTime)` feeding straight into `satellite.propagate`/`gstime`.

**Worked ISS pipeline** (`notes/T2_4_time.py`, TLE epoch `26244.49851260`): epoch parses to 2026-09-01T11:57:51.489 UTC (agrees with python-sgp4's `jdsatepoch+jdsatepochF` to 7 μs). At epoch, satellite.js's recipe (`gstime(UTC)` + `eciToGeodetic`) gives lat $50.99871°$, lon $48.23516°$, alt $422.229$ km; Skyfield's IERS-grade ITRS position (true UT1 + polar motion) differs by 29.6 m. The ground track shifts westward **~23.6° per orbit** (sidereal rotation rate applied over the 92.97-min period, plus the $-4.96°$/day $J_2$ nodal regression), noticeably more precise than the master document's earlier crude $360/16 = 22.5°$ estimate.

### T2.5 — TLE accuracy decay and refresh cadence per orbit class

**Error vocabulary.** Errors are conventionally quoted in the orbit's own **RIC** frame: Radial (up), In-track/along-track (velocity direction), Cross-track (orbit-normal). Nearly every source finds **in-track error dominates** radial and cross-track, because any error in period (from semi-major axis or drag mis-modeling) integrates linearly into a timing error, and timing error × orbital speed is a distance along the track (Kelso 2007; Flohrer 2008 §4.2; Jankovic 2026).

Two distinct quantities get called "TLE accuracy": **error at epoch** (how well the fitted mean elements represent truth at $t=0$, set by the tracking/OD process, not by SGP4 theory) and **error growth** (how fast propagation diverges from truth, set mostly by unmodeled or mismodeled drag in LEO and by neglected third-body/resonance/maneuvers at MEO/GEO).

**Error-at-epoch, by orbit class** — Flohrer et al. 2008, Table 1, whole-catalog 2008 snapshot, 1-sigma, km (radial / in-track / cross-track):

| class | radial | in-track | cross-track |
|---|---|---|---|
| LEO | 0.10 | 0.47 | 0.13 |
| MEO | 0.07 | 0.13 | 0.05 |
| GEO | 0.36 | 0.43 | 0.09 |
| GTO | 1.96 | 3.90 | 1.81 |

Oltrogge & Ramrath (2014) make an important distinction: the **SGP4 theory itself** can fit a high-fidelity truth orbit to better than 1 km anywhere from 350 km altitude to GEO — real published TLEs of well-tracked objects are typically **10-20× worse** than that theoretical floor, because of sparse/undersampled tracking data, unknown maneuvers, and occasional mis-tagging, not because SGP4's dynamics are inadequate. They also isolate a pure space-weather (atmospheric density forecast) contribution of about **1.1 km** at 400 km altitude that is irreducible no matter how good the fit is.

**Error growth by class:**
- **LEO/ISS**: Jankovic (2026), a large Starlink-fleet study using operator ephemerides as ground truth: median SGP4 error **0.94 km @ 6 h, 2.6-4.5 km @ 1 day, 11.7 km @ 3 days, 38.5 km @ 7 days**, with a power-law fit $|\Delta r| \sim A t^k$, $k = 0.75$–$1.44$, along-track dominant.
- **MEO (GPS)**: Kelso 2007, precise-ephemeris truth, PRN10 in-track error rose from ~10 km at epoch to ~50 km at +15 days (~2.7 km/day); PRN11 rose from ~2.5 km to ~5.5 km over the same span (~0.2 km/day) — a large satellite-to-satellite spread. Kuciapinski & Kelso (2023): on one specific day, 31 Space-Track GPS TLEs averaged **7.54 km error (max 32 km)** vs. precise ephemeris; CelesTrak's SupGP alternative (fit from the SEM almanac) averaged **0.87 km (max 2.37 km)** — roughly an order-of-magnitude improvement when a supplemental product is available.
- **GEO**: Conkey et al. (2022), Intelsat ephemeris truth: classical SGP4 fits average 0.9-7.5 km at the fit epoch and 1.8-10.7 km mean (up to 27 km max) at +7 days; the dominant error source is SGP4's crude lunar/resonance modeling, and **station-keeping maneuvers every 1-2 weeks invalidate a GEO TLE outright** — this is a bigger practical hazard than the smooth growth curve.

**Why LEO/drag is the worst case — derivation.** From Kepler III, $n^2 a^3 = \mu \Rightarrow \dot a = -\frac{2a}{3n}\dot n$. The ISS TLE's $\dot n/2 = 3.910\times10^{-5}$ rev/day² implies $\dot a \approx -23$ m/day (matched independently by the CelesTrak supplemental segments over this fortnight at $-41$ m/day, reflecting solar-max atmospheric density). Drag error enters mean anomaly quadratically, $\Delta M = \tfrac{1}{2}\dot n\, t^2$; ignoring drag entirely for 1/3/7 days shifts the ISS along-track by **1.7 / 15 / 82 km**. The TLE's BSTAR/$\dot n$ terms capture the *average* drag over the fit span; the residual — mostly density-forecast error — is what produces the observed several-km/day growth. MEO/GEO have essentially no drag, so their growth is instead set by neglected resonance terms and by maneuvers.

**Experiment: SGP4 vs. naive Kepler from the same TLE** (`notes/T2_5_tle_decay.py`, python-sgp4 2.27, ISS TLE epoch 2026-09-01 11:57:51 UTC):
- **Variant A** — TLE mean elements fed directly into a two-body propagator: **11.7 km off at $t=0$** (matches the $J_2$ short-period amplitude $1.5\,J_2\,R_\oplus^2/a = 9.7$ km almost exactly — this offset *is* the missing short-period term), then $-3.1$ km/h in-track ($-75$ km/day) plus a cross-track oscillation reaching **460 km after 1 day** (nodal regression $-4.95°$/day × $a\sin i$). Total $|\Delta r| = 468$ km @ 1 day, 1392 km @ 3 days.
- **Variant B** — two-body propagation seeded from SGP4's own osculating state vector at epoch: zero error at $t=0$, but $-52$ km after 1 hour and **$-1017$ km/day** in-track. Cause: the osculating semi-major axis (6804.4 km) exceeds the mean/Kozai value (6797.9 km) by 6.5 km, which mis-states the period by 8.0 s/rev — 15.5 revs/day × 8 s × 7.66 km/s ≈ 946 km/day, matching the observed drift. **This is the sharpest demonstration in the whole track that "mean elements only make sense inside SGP4": taking a perfectly correct SGP4 state and handing it to a two-body propagator is worse than just using the raw mean elements.**
- **Variant C** — mean elements plus hand-added $J_2$ secular rates ($\dot\Omega$, $\dot\omega$, $\dot M$): cross-track error is fixed, but in-track error is still 61 km @ 1 day, 196 km @ 3 days, from the residual Kozai/Brouwer convention mismatch, drag, and short-periodics. **Lesson: "Kepler + hand-rolled J2" is not a substitute for SGP4; use a real library.**

**Experiment: real ISS TLE vs. CelesTrak supplemental (SGP4 fit of NASA's EME2000 OEM in 6-hour segments; no reboost in the 15-day span sampled).** Median $|\Delta r|$ by age: 0.4-0.5 km inside ±0.5 day of epoch, 1.4 km @ 0-12 h, 2.7 km @ 12-24 h, 4.6 km @ 1-1.5 d, 10.9 km @ 2.5-3 d, 50 km @ 7 d, 202 km @ 14 d — essentially all in-track, negative (the public GP TLE lags: real decay runs faster than the TLE's fitted drag model predicted). Fits: linear $0.10 + 3.84\,t$ km (0-3 days), power law $3.76\,t^{1.41}$ km — the same exponent range Jankovic found for Starlink, from an independent 2026 ISS dataset.

**"Visually truthful" at globe scale, quantified.** Earth's diameter across 1000 px is 12.7 km/px; a 3000-km continent view is 3 km/px; a 500-km regional view is 0.5 km/px; camera-height framing (60° FOV, 1000 px tall) gives 3.5 km/px at 3000 km altitude, 11.5 km/px at 10,000 km, 41 km/px viewed from GEO distance. Treating 1 px as "just visible" and 3 px as "obviously wrong": at globe scale a LEO TLE stays sub-pixel for roughly **4 days** and under 3 px for **~12 days**; zoomed to a 500-km region even a *fresh* TLE already sits at the 2-px level and a 1-day-old one is 5-9 px off. Nobody can see 1 km at globe scale; everybody can see 100 km.

**Refresh-cadence table** (round numbers synthesized from the sources above, $\text{err} = e_0 + k t$):

| class | $e_0$ (km) | $k$ (km/day) | globe 1 px (12.7 km) | 500-km region 3 px (1.5 km) | practical fetch policy |
|---|---|---|---|---|---|
| ISS (drag + reboosts) | 1 | 3-4 | ~3 days | ~4 hours | every 6-12 h; immediately after any reboost; prefer SupGP 6-h segments when zoomed in |
| LEO 500-600 km (Starlink shells) | 1 | 3 | ~4 days | ~4 hours | daily; prefer SupGP where available |
| LEO 800-1200 km (low drag) | 0.5 | 1 | ~12 days | ~1 day | every 1-3 days |
| MEO (GPS) | 0.5-3 | 0.2-3 | ~4-12 days | ~1 day | daily, or SupGP/SEM almanac (0.9 km) |
| GEO (station-kept) | 0.5-5 | 0.5-1.5 | ~1-3 weeks (absent maneuver) | ~2 days | weekly, plus an immediate refetch on any maneuver jump |

**The globe-scale bottom line for this project:** a nightly CelesTrak pull keeps every orbit class inside 1 px at globe zoom; only the ISS (and only if the UI ever zooms to city/regional scale) needs a 6-hour pull, and any announced reboost should trigger an immediate refetch outside the normal cadence.

## 3. Answers to the track questions

*(Note on process: this section merges the readers' own T2.1-T2.5 notes with a full independent answerer pass, then applies the corrections from the two-lens verification in §4. Where the two inputs disagreed on a number, the better-evidenced value is used and the disagreement is called out explicitly.)*

### Q1. Why do TLE mean elements only make sense inside SGP4? What are they mean with respect to, and what happens if you feed them to a Keplerian propagator?

TLE elements are **Brouwer-theory mean elements** (with a Kozai-convention mean motion in the raw field) obtained by least-squares fitting the SGP4/SDP4 model itself to tracking observations, not measured or instantaneous (osculating) orbital elements (Kelso v04n05; Vallado 2006 AIAA 2006-6753 Rev2 §II.A; CelesTrak GP-data-formats page). Kelso's own words: "the numbers are mean elements fitted to observations with the SGP4/SDP4 model... you cannot simply reformat the data unless you are willing to accept predictions with unpredictable errors." "Mean" here folds in three things a two-body propagator cannot reconstruct:

1. **Short-period $J_2$ terms are pre-removed** (amplitude $1.5\,J_2\,R_\oplus^2/a \approx 9.7$ km at ISS altitude). SGP4 analytically re-adds these on every call; a two-body propagator has no such theory and is missing them from the very first evaluation.
2. **The stored mean motion is Kozai-type, not Brouwer.** SGP4's `sgp4init`/`initl` "un-Kozai's" it internally through a $J_2$ iteration. For this ISS TLE (epoch 2026-09-01), the raw Kozai mean motion is 15.48958602 rev/day (naive period $1440/n=$ 92.9657 min, $a=(\mu/n^2)^{1/3}=6797.9$ km with $\mu=398600.4418\ \text{km}^3/\text{s}^2$), while SGP4's internal Brouwer mean motion (`no_unkozai` in python-sgp4, `satrec.no` after `sgp4init` in satellite.js) gives period 92.9760 min and $a=6798.4$ km - a +111 ppm, 0.62 s, 0.505 km shift. This was independently reproduced in two SGP4 implementations (C-accelerated python-sgp4 2.27 and pure-JS satellite.js 7.x) and agrees with each to 15 significant figures. **Implementation note for this project:** python-sgp4's `.no` attribute is a documented backward-compatibility alias that returns `.no_kozai` unchanged, not the un-Kozai'd value - the correct comparison is `.no_kozai` vs. a value derived from `.a`/`.tumin`. satellite.js does the opposite: `.nokozai` holds the raw value and `.no` is overwritten with the Brouwer value during `sgp4init`. A pipeline that reads "`.no`" from both libraries and assumes it means the same thing will silently pick up the wrong mean motion in one of the two.
3. **BSTAR (drag) is never applied** by a two-body propagator, so no secular decay is modeled at all.

Two independent experiments make the consequence concrete and quantified, measured against SGP4 truth for this ISS TLE (`notes/T2_2_kepler_vs_sgp4.py`, `notes/T2_5_tle_decay.py`, cross-checked this pass in `verify_track2_kepler_vs_sgp4.py` against both a naive-Kozai seeding and skyfield):

- **Variant A - mean elements straight into a two-body propagator:** ~11.7-11.8 km wrong at $t=0$ (matching the missing $J_2$ short-period amplitude almost exactly), then growing to roughly **470-490 km at 1 day**, **1390-1445 km at 3 days**, and **3140-3240 km at 7 days**. (An earlier pass of this document quoted a tighter "468 km at 1 day, 1400-3100 km at 3-7 days" range; independent recomputation with a fresh 2026-09-01 TLE landed a few percent outside that range at the 1-day and 7-day points, so the range is widened here. The number is genuinely TLE- and epoch-dependent - it is an illustrative order-of-magnitude figure from one specific TLE, not a fixed constant - but every recomputation agrees the growth is single-digit-to-low-tens of km at epoch, hundreds of km within a day, and low thousands of km within a week, which is the number that matters for the architectural conclusion.) After roughly three hours the dominant error component becomes cross-track rather than in-track, since a two-body propagator has no $J_2$ nodal regression to counter SGP4's own $\dot\Omega\approx-4.95°$/day for the ISS ($\approx$460 km/day of node drift with nothing opposing it).
- **Variant B - seeding a two-body propagator from SGP4's own correct osculating state vector at epoch:** zero error at $t=0$ but **$-52$ to $-54$ km after 1 hour** and roughly **$-1017$ km to $-1116$ km/day** in-track thereafter. Cause: SGP4's osculating semi-major axis at epoch (6804.4 km) is about 6.5 km larger than the mean/Kozai value (6797.9-6798.4 km) that actually governs the orbit's period, mis-stating the period by roughly 8 s/revolution - 15.5 rev/day $\times$ 8 s $\times$ 7.66 km/s $\approx$ 946-1017 km/day, matching the observed drift. **This is the sharpest demonstration that mean and osculating elements are not interchangeable inputs to a two-body model:** taking a perfectly correct SGP4 *osculating* state and handing it to a two-body propagator is worse, not better, than just using the raw mean elements.

Adding hand-derived $J_2$ secular rates on top of the mean elements narrows but does not close the gap (roughly 61 km at 1 day, 196 km at 3 days in one from-scratch attempt), because of the residual Kozai/Brouwer convention difference, drag, and short-period terms a manual implementation is unlikely to match exactly. **The only correct policy is: TLE/OMM data goes into SGP4 and nowhere else** - never into a two-body Keplerian propagator, whether seeded from the raw mean elements or from SGP4's own osculating output.

### Q2. What frame is SGP4 output in, and what two conversions get you to (lat, lon, alt)? What does Cesium need, and what does satvis do?

SGP4 outputs position/velocity in **TEME** - True Equator, Mean Equinox of date - in km and km/s (Kelso v04n05; Vallado 2006 §II.D; CelesTrak SGP4 FAQ; CelesTrak OMM sets `REF_FRAME=TEME`). TEME is not a standard astrodynamics frame: its $z$-axis is the *true* pole of date but its $x$-axis is the *mean* equinox, so it differs from both J2000/GCRF/ICRF (by accumulated precession+nutation) and from any Earth-fixed frame (by Earth's rotation). Vallado's own guidance, echoed in the CelesTrak FAQ: "no official definition exists for TEME... convert to a standard frame before interfacing with other programs," and AFSPC has never officially released a transform from TEME to another standard frame - the recommended path is TEME $\to$ pseudo-fixed (via GMST) first, and any inertial frame is derived from *that*, never from TEME directly.

Getting from TEME to (lat, lon, alt) is **one rotation followed by one non-rotational coordinate conversion** (an earlier pass of this document, and the fresh answerer pass, both described this loosely as "two conversions" or "two rotations"; the geodetic step is a Cartesian-to-geodetic solve, not a rotation, so it is worth stating precisely):

1. **TEME $\to$ Pseudo-Earth-Fixed (PEF):** a single $z$-axis rotation by GMST (IAU-1982 polynomial, evaluated on UT1 but in practice substituting UTC - bounded by $|UT1-UTC|<0.9$ s, i.e. $\le$ 0.45-0.47 km at ISS radius; today's actual DUT1 of a few ms costs about a metre). This is exactly satellite.js's `eciToEcf(r, gstime(date))` and Cesium's `Transforms.computeTemeToPseudoFixedMatrix(time)`; both were checked against `Transforms.js` source and implement the identical rotation and the identical UTC-as-UT1 approximation. Using **GAST instead of GMST** here is a classic, subtle bug: it rotates the vector into True-of-Date rather than PEF, and was independently measured (via two separate scripts using skyfield/astropy, and a third earlier T2.3 script, all agreeing to sub-metre precision) to cost **273.2 m at LEO** at this ISS TLE's epoch - the equation-of-the-equinoxes offset between GMST and GAST (8.29 arcsec at this instant). Skipping the rotation entirely is far worse: roughly 13,394 km at epoch for this ISS TLE.
2. **PEF $\to$ geodetic:** an iterative WGS-84 solve ($a=6378.137$ km, $b=6356.7523142$ km) for latitude, with longitude $=\mathrm{atan2}(y,x)-\theta_{GMST}$ (wrapped) and height falling out of the same iteration. satellite.js's `eciToGeodetic` performs both the rotation and this solve in one call; note that PEF, not true ITRF, is what results - true ECEF/ITRF needs a further, small polar-motion rotation ($x_p,y_p$) that both satellite.js and satvis omit by design (sub-~10 m effect, conventionally neglected for GP-derived orbits).

**What Cesium needs:** `ReferenceFrame.FIXED` is Cesium's Earth-fixed (ITRF/WGS-84-equivalent) frame in metres - the default for `SampledPositionProperty` and the target of `Cartesian3.fromDegrees`. `ReferenceFrame.INERTIAL` is GCRF/ICRF, populated only via `Transforms.computeFixedToIcrfMatrix`/`computeIcrfToFixedMatrix`, which need asynchronously loaded IAU-2006 XYS and Earth-orientation data (`Transforms.preloadIcrfFixed`) and **return `undefined` until that data has loaded** - feeding raw TEME into `INERTIAL` is a well-known heisenbug (renders fine, then jumps once the async data resolves).

**The classic bug this track exists to prevent:** treating TEME as if it were already J2000/ICRF and feeding it straight into an `INERTIAL` property, or through `computeIcrfToFixedMatrix` (which expects ICRF/ITRF input, not TEME). The error is silent - no exception, no NaN. Independent verification this pass (Skyfield and astropy, cross-checked to 0.06 mm agreement with each other) measured this specific ISS TLE's offset at **40.7 km / 0.343°**, and three live GEO TLEs (GOES-16, GOES-18, and a synthetic near-equatorial case) at **252-261 km / 0.34-0.36°** - close to, and consistent with, the commonly quoted "~39-40 km at LEO, ~270 km at GEO" figures, though the GEO number varies with each satellite's right ascension relative to the precession pole (274 km is close to the geometric maximum for this epoch's accumulated precession angle, not a fixed constant), and the whole offset grows by roughly 50 arcsec/year as precession accumulates. The correct chain is always TEME $\to$ GMST rotation $\to$ pseudo-fixed (Cesium `FIXED`) first; ICRF, if needed, is derived from `FIXED` via `computeFixedToIcrfMatrix`, never directly from TEME.

**What satvis does** (verified directly against `repos/satvis`, branch `next`): a Web Worker runs `satellite.js`'s `propagate` to get TEME km, then rotates to pseudo-fixed with its own inlined port of Cesium's GMST transform (`util/temeToFixed.ts`, matched to Cesium to <1e-5 m over a 3-year test span) and scales to metres; every satellite entity binds to these **`FIXED`**-frame samples (`SampledTrajectory.ts`, `#backfillInertial()`). Only the orbit-ellipse polyline is separately converted to `ReferenceFrame.INERTIAL` via `computeFixedToIcrfMatrix` (explicitly labeled in-source as "Inertial-frame (ICRF) sampled position," with a test comment noting "a wrong rotation is kilometres out"), and the "Inertial" camera mode is implemented as a `scene.postUpdate` camera re-parenting trick (`CesiumController.cameraTrackEci`, guarded by the `preloadIcrfFixed` check) rather than a change to the underlying entity frame. `Orbit.ts` derives the info-panel lat/lon/alt with `gstime` + `eciToGeodetic` directly, following the two-step recipe above.

### Q3. How often must each orbit class refresh TLEs to stay visually truthful, and what does visually truthful mean at globe scale?

"Visually truthful" is defined here as **position error smaller than about one screen pixel at the current zoom level.** Pixel scale is $\mathrm{km/px}\approx 2D\tan(\mathrm{fov}/2)/W_{px}$: with Earth's disk filling roughly 1000 px, 1 px $\approx$ 12.7 km (3 px $\approx$ 38 km); satvis's actual default view (18,668 km camera altitude, 1920$\times$1080) is close to this at $\approx$14.4 km/px; a continent-scale view is $\approx$2 km/px; a close pass-tracking view is $\approx$0.05-0.5 km/px. At globe scale, kilometer-level TLE staleness is invisible - only tens-to-hundreds-of-km errors (the TEME/ICRF frame bug in Q2, or a multi-week-old ISS TLE) are visible. At regional zoom, even a same-day TLE for a high-drag object can be visibly off.

Measured LEO/ISS along-track error vs. NASA's TOPO truth ephemeris (quadratic fit $err(t)\approx a\,t^2+b\,t+c$ km, $t$ in days): the original T2.5 fit was $\approx 1.00\,t^2+0.62\,t+1.70$ km (0.76 km at epoch, 4.2 km at 1 day, 13.5 km at 3 days, 54.2 km at 7 days, 180 km at 13 days). This was independently reproduced this pass, against the same NASA/JSC/FOD/TOPO OEM ephemeris (`ISS.OEM_J2K_EPH.txt`) and the fresh 2026-09-01 ISS TLE, giving $err(t)\approx 1.000\,t^2+0.627\,t+1.699$ km ($R^2=0.9996$) - matching to three significant figures and confirming the quadratic model over the earlier, less-accurate linear/power-law fits attempted on shorter windows. Literature anchors agree in order of magnitude: LEO epoch uncertainty $\sim$0.5-1 km (Flohrer 2008, Vallado 2013), MEO $\sim$0.1-2 km, GEO $\sim$0.4-4 km intrinsic (real GEO error is dominated by unmodeled station-keeping burns, so it steps rather than grows smoothly).

Combining the error-at-epoch and error-growth figures from T2.2/T2.5 with this pass's reproduction:

| class | typical error model | reaches 1 px at globe zoom (12.7 km) | reaches 3 px at 500-km regional zoom (1.5 km) | recommended fetch cadence |
|---|---|---|---|---|
| ISS (drag + reboosts) | ~1 km + 3-4 km/day, plus step errors at each reboost | ~3 days | ~4 hours | every 6-12 h; immediately after any reboost; prefer CelesTrak's 6-hour SupGP ephemeris segments when zoomed in (RMS 0.06-0.19 km vs. raw TLE's ~4 km at 1 day, roughly a 5x improvement) |
| LEO 500-600 km (Starlink shells) | ~1 km + ~3 km/day | ~4 days | ~4 hours | daily; prefer SupGP where available |
| LEO 800-1200 km (low drag) | ~0.5 km + ~1 km/day | ~12 days | ~1 day | every 1-3 days |
| MEO (GPS/GNSS) | ~0.5-3 km + ~0.2-3 km/day (highly satellite-dependent) | ~4-12 days | ~1 day | daily, or SupGP/SEM-almanac (~0.9 km typical vs. ~7.5 km for raw TLEs) |
| GEO (station-kept) | ~0.5-5 km + ~0.5-1.5 km/day, but maneuvers every 1-2 weeks dominate | ~1-3 weeks absent a maneuver | ~2 days | weekly, plus an immediate refetch whenever the plotted position jumps (a maneuver signature) |

The data-side ceiling on all of this is CelesTrak's own update cadence: GP data is only re-checked **every 2 hours**, and repeated polling faster than that within the same window can return HTTP 403 - so there is no benefit to fetching more often than the data actually changes, and a naive dev-loop poller can get an IP firewalled. CelesTrak's own catalog already turns over fast (mean age 0.99 day, median 0.34 day as of 2026-09-01), so a 6-hour client-side refresh for the ISS is realistic without violating the fetch-etiquette policy.

**Net policy for this project (independently confirmed this pass, and the point the earlier draft of this document already got right - a blanket "refresh all LEO every 6 hours" rule, considered separately, would overstate the need by roughly 4-12x): a nightly pull keeps every orbit class inside 1 px at globe zoom; only the ISS specifically, and only if the UI ever zooms to city/regional scale, needs a 6-12 hour pull (via SupGP where possible); any announced maneuver or reboost should trigger an immediate out-of-cycle refetch; and any TLE older than 7 days should be treated as stale enough to warrant an explicit UI flag, with staleness surfaced (age shown, and anything past ~3 days visually flagged) rather than silently trusted.**

## 4. Verification ledger

A full two-lens adversarial verification pass (independent computation, and independent source re-reading) was run against the five highest-stakes claims in this track. Neither lens is treated as authoritative on its own; where they disagree in emphasis the more specific, better-evidenced wording is kept, and both confidences are reported.

| # | Claim | Compute-lens verdict (confidence) | Source-lens verdict (confidence) | Corrected wording |
|---|---|---|---|---|
| 1 | TLE mean motion is Kozai; SGP4 internally un-Kozais it to a Brouwer mean motion - for this ISS TLE the period shifts 92.9657 → 92.9760 min, $a$ shifts 6797.9 → 6798.4 km | confirmed (0.96) | needs qualification (0.90) | Numbers confirmed by two independent SGP4 implementations to 15 significant figures. Qualification: the naive comparison suggested by the claim ("compare `.no_kozai` vs. `.no`") only works in satellite.js; in python-sgp4, `.no` is a deprecated alias for `.no_kozai` and returns the *same* value, so the correct check there is `.no_kozai` vs. a value derived from `.a`/`.tumin`. |
| 2 | Feeding the ISS TLE's mean elements into a two-body propagator gives ~11.7 km error at epoch, ~468 km at 1 day, and 1400-3100 km at 3-7 days vs. SGP4 | needs qualification (0.85) | confirmed (0.92) | Confirmed in magnitude and architectural conclusion. Numbers are TLE/epoch-dependent, not universal constants: recomputation with the fresh 2026-09-01 TLE gives ~11.7-11.8 km at epoch (matches almost exactly), ~470-490 km at 1 day (~4% above 468), ~1390-1445 km at 3 days (inside range), and ~3140-3240 km at 7 days (up to ~5% above the 3100 km ceiling). Widen the stated range to roughly 1400-3200 km at 3-7 days, or state it as order-$10^3$ km rather than a precise ceiling. |
| 3 | SGP4 output is TEME; feeding it raw into Cesium's `ReferenceFrame.INERTIAL` (ICRF/GCRF) without a precession/nutation correction costs ~40 km at LEO (~0.37°) and ~274 km at GEO | agent failed - no result returned for this claim on the compute lens | needs qualification (0.85) | Frame identification (TEME ≠ ICRF ≠ ECEF) confirmed against CelesTrak's SGP4 FAQ and Cesium's own `Transforms` docs, and satvis's source was checked directly and shown *not* to commit this bug. Numeric qualification: 40 km / 0.37° and 274 km are illustrative figures for a present-day TLE, not fixed constants - they scale with accumulated precession since J2000 (~50.3″/yr) and with the specific satellite's right ascension/declination. Independent recomputation (Skyfield + astropy, cross-checked to sub-mm agreement) on the live ISS TLE and three live GEO TLEs gives 40.7 km/0.343° at LEO and 251.7-261.3 km/0.34-0.36° at GEO - order-of-magnitude confirmed, with 274 km closer to the geometric maximum for this epoch than a typical value. The compute lens could not be completed for this claim; treat the source-lens figures above as the best available check pending a rerun. |
| 4 | Recommended refresh cadence: LEO every 6 h (12 h acceptable), ISS every 6 h via SupGP, MEO/GEO every 24 h, TLEs hard-stale past 7 days | needs qualification (0.88) | needs qualification (0.88) | The underlying quadratic error-growth model and pixel-scale math are confirmed (independently reproduced fit: $1.000t^2+0.627t+1.699$ km vs. the original $1.00t^2+0.62t+1.70$ km, matching to three significant figures). Both lenses agree the blanket "LEO every 6 h" and "GEO every 24 h" rule overstates the need: at whole-globe zoom, a nightly pull keeps every orbit class inside 1 px, and only the ISS specifically - and only at regional/city zoom - needs a 6-12 h pull; Starlink-class LEO is fine daily, low-drag LEO every 1-3 days, and GEO is better served by a weekly cadence plus an immediate refetch on any station-keeping maneuver than by a fixed 24 h rule. No source grounds a universal 7-day hard-stale cutoff; 1-px staleness horizons range from ~3 days (ISS, globe zoom) to 1-3 weeks (GEO, globe zoom), so 7 days is a reasonable single UI-flag threshold but not a physically derived constant. |
| 5 | TEME→ECEF/geodetic requires exactly two rotations: TEME→PEF by GMST (not GAST), then PEF/ECEF→geodetic via WGS-84 iteration; using GAST instead of GMST costs ~273 m at LEO | needs qualification (0.85) | needs qualification (0.88) | The GMST-vs-GAST numeric claim is confirmed almost exactly: two independent scripts (this pass, and an earlier T2.3 script already in the scratchpad) compute a 273.2 m offset at this ISS TLE's epoch from the 8.29 arcsec equation-of-the-equinoxes at that instant. Qualification: it is one rotation (GMST, TEME→PEF) plus one *non-rotational* WGS-84 Cartesian-to-geodetic solve, not "two rotations" - the geodetic step has no rotation angle. Also, PEF is only conventionally equated with ECEF/ITRF; true ITRF needs a further small polar-motion rotation that satellite.js and satvis both omit by design (sub-~10 m effect, negligible for this project). WGS-84 constants ($a=6378.137$ km, $b=6356.7523142$ km) are correct as stated. |

**What changed as a result, claim by claim:**

Claim 1's physics and headline numbers stood, but the note about python-sgp4's `.no` attribute being a same-value alias for `.no_kozai` (not the un-Kozai'd Brouwer value, unlike satellite.js's `.no`) is now folded into Q1 above as an explicit implementation pitfall, since it is exactly the kind of library-specific footgun this project's ingestion code could hit.

Claim 2's range is widened from "468 km at 1 day, 1400-3100 km at 3-7 days" to "~470-490 km at 1 day, ~1390-1445 km at 3 days, ~3140-3240 km at 7 days," and is now explicitly labeled as an illustrative, TLE-dependent example rather than a fixed bound. The architectural conclusion (mean elements must never be fed to a two-body propagator) is unaffected and, if anything, reinforced - every independent recomputation landed in the same order of magnitude or higher.

Claim 3 could not be checked on the compute lens (no result was returned), so its figures rest on the source lens alone here; they are reported as "40.7 km at LEO, 251-261 km at GEO" rather than the flatter "~39 km / ~270 km," with an explicit note that the 274 km figure is close to a geometric maximum for the current epoch rather than a typical value, and that both numbers grow slowly (~50 arcsec/yr) as precession accumulates.

Claim 4's blanket "every 6 hours for all LEO" framing is replaced with the per-class, per-zoom-level table that was already present in an earlier draft of Q3 (ISS specifically at 6-12 h, other LEO daily to every-few-days, GEO weekly plus maneuver-triggered refetch); the underlying quadratic error model is now marked verified rather than merely asserted, since it was independently reproduced this pass to three significant figures.

Claim 5's "exactly two rotations" wording is corrected to "one rotation plus one non-rotational geodetic solve," and the true-ITRF-vs-PEF distinction (small, deliberately neglected polar-motion term) is now stated explicitly rather than left implicit in "PEF/ECEF."

## 5. Implications for the build

**Hard boundary, Phase 0 vs. Phase A.** The Phase 0 Keplerian teaching pipeline must never accept a TLE, OMM record, or any value derived from one as direct input to its two-body/element-to-state conversion. If a TLE's $(i, e, \Omega, \omega)$ are ever used to seed a "looks like the ISS" synthetic teaching orbit, document explicitly that the semi-major axis implied by naive $n$ is not the same as SGP4's internal value (a ~0.5 km discrepancy at minimum, growing to ~6.5 km if osculating-vs-mean is confused), and that the resulting synthetic orbit is *inspired by* the ISS, not a real propagation of it. Consider a type-level boundary (e.g. a `MeanElements` type that only an SGP4 call site can consume, distinct from `OsculatingElements` that the Keplerian pipeline consumes) so this mistake cannot compile.

**Data ingestion for Phase A.** Fetch OMM JSON/CSV from `gp.php`, not TLE text, for any new code — 5-digit catalog numbers ran out on 2026-07-11 and TLE cannot represent 6-digit objects at all. Cache every fetch to disk keyed by `EPOCH` (never by element-set number, which is not monotonic and saturates); obey the 2-hour update cadence and the one-download-per-update policy exactly (stop on any non-200 response and surface it, per CelesTrak's own M2M guidance); vendor a snapshot in-repo so a fresh clone works offline without triggering a fetch storm. Parse fixed columns by position, not by whitespace-splitting, if a TLE path is kept at all; accept negative BSTAR; never treat mean anomaly, RAAN, etc. from a TLE as osculating.

**Frame handling.** Adopt satvis's spine directly: `propagate` (TEME, km) → GMST rotation to pseudo-fixed (Cesium's `computeTemeToPseudoFixedMatrix` or a verified equivalent) → scale to metres → store as `ReferenceFrame.FIXED`. Derive an inertial-looking orbit line, if wanted, by converting FIXED samples to ICRF via `computeFixedToIcrfMatrix` *after* `preloadIcrfFixed` resolves — never by treating TEME as ICRF directly. Implement any "inertial camera" mode as a camera-transform trick over a FIXED-frame scene, not as a change of stored entity frames.

**Time handling.** Keep exactly one app clock (Cesium's `JulianDate`, TAI-internal, leap-second aware) and cross into satellite.js/python-sgp4 space at a single boundary function using `JulianDate.toDate()`; never construct a JS `Date` by hand from user-facing fields without an explicit `Z`/UTC discipline, and never read `JulianDate.dayNumber`/`secondsOfDay` as if they were UTC seconds (a 37-second, ~17-km error). GMST via `gstime(UTC)` is adequate everywhere in this project; UT1-UTC and polar motion corrections are not worth implementing for visualization (sub-metre to tens-of-metres effects only).

**Tests and oracles to add:**
1. **SGP4 cross-library oracle**: propagate the cached ISS TLE with python-sgp4 and assert satellite.js agrees to < 1 m / < 1 mm/s (this track measured 0.055 m / 0.06 mm/s live).
2. **Frame known-answer test**: Vallado 2006 Appendix C TEME→ITRF vector, asserting agreement to < 1 m with correct UT1/polar-motion inputs (this track reproduced it to 0.06 mm).
3. **GMST known-answer test**: `gstime(2026-09-01T00:00:00Z) == 5.937141842` rad (and/or Kelso's 1995 anchor, 2.524218 rad), to catch any future polynomial or unit regression.
4. **"TLE age vs. truth" regression test**: assert that a same-day ISS TLE, propagated 1 day forward and compared against CelesTrak's supplemental (SupGP) truth, differs by roughly 2-5 km — this both documents expected staleness behavior and would catch a frame/time bug that inflates the discrepancy to tens or hundreds of km.
5. **Explicit type/unit boundary test**: assert that TLE/OMM-derived elements cannot be passed to the Phase 0 Keplerian element-to-state function (compile-time if possible, else a runtime guard with a clear error).
6. **Fetch-etiquette test**: a mocked/rate-limited test confirming the ingestion layer never issues two `gp.php` requests for the same GROUP within a 2-hour window and stops cleanly on a non-200 response.

**Pitfalls to explicitly guard against (collected across all five items):** confusing Kozai and Brouwer (un-Kozai'd) mean motion / semi-major axis; treating TEME as J2000/ICRF; feeding local or TAI/TT time into a UTC-expecting function; JS `Date` month-indexing and local-vs-UTC string parsing ambiguity; unit mismatches (km vs. m, radians vs. degrees) at the satellite.js↔Cesium boundary; `propagate()` returning `null` on decay or bad elements without a check; negative BSTAR being rejected by an overly strict parser; ELEMENT_SET_NO used as a version key instead of EPOCH; polling CelesTrak faster than its 2-hour cadence during local development.

## 6. Still uncertain / to read next

- **The 6795 km vs. 6798 km ISS semi-major-axis discrepancy** (ledger item 9) between the master document and this track's live-TLE numbers should be reconciled — likely just a different reference epoch, but worth a one-line confirmation before it propagates further.
- **Vallado & Cefola 2012, "Two-line element sets — practice and use"** could not be opened (IAF archive restricted, ResearchGate blocked); it is cited by several of the papers that *were* read, so its numbers reached this document only second-hand. Worth another attempt via a university library proxy or ResearchGate request.
- **Racelis & Joerger 2018** (MEO/GEO TLE error analysis) was only available as slides with no extractable numeric text layer; the companion ION conference paper (if it exists) was not located. The qualitative GEO/MEO error-growth story in T2.5 rests more heavily on Flohrer 2008, Vallado & Crawford 2008, and Conkey 2022 than on this source.
- **Cesium's Sandcastle "Camera"/ICRF example** could not be fetched directly (every raw GitHub path tried 404'd); the camera-transform idiom described in §T2.3 was confirmed via a search snippet and via satvis's identical code, but a direct read of Cesium's own canonical example would be a cleaner citation.
- **ISS reboost frequency and rate** ("roughly 6-12/year," "50-100 m/day decay depending on solar activity") came from secondary web sources, not NASA's own page (which 404'd). The live NASA OEM header (`notes/ISS.OEM_J2K_EPH.txt`) is the correct primary source for reboost announcements and should be re-checked whenever the ingestion pipeline is built, since the 15-day span sampled for T2.5 happened to contain no reboost.
- **Alpha-5 (6-character) catalog-ID handling end-to-end** was not tested; python-sgp4 and satellite.js appear to pass the raw string through without validating it as a 5-digit integer, but no live 6-digit-catalog-number object was propagated to confirm.
- **WGS-72 vs. WGS-84 numeric propagation difference** was noted only at the constants level (T2.2), not verified end-to-end by propagating the same TLE with both constant sets and diffing the trajectories.
- **A full two-lens verification pass on this track's five highest-stakes claims** is now recorded in §4; it confirmed the core numbers with minor corrections (widened Kepler-vs-SGP4 error ranges, a one-rotation-not-two correction for the TEME-to-geodetic recipe, and a per-class/per-zoom refresh cadence rather than a flat 6-hour LEO rule). One claim (the TEME/ICRF frame-error magnitude) has a source-lens result only, since its compute lens did not return a result; a rerun of that lens would be worthwhile.

## 7. Glossary of credibility vocabulary encountered

- **Verified**: reproduced independently by at least two methods (e.g. two different libraries, or a computed number checked against a published known-answer vector) and found to agree to a stated tolerance.
- **Likely**: consistent with secondary sources (encyclopedic references, documentation pages, un-opened paper abstracts/snippets) but not independently reproduced with a primary source or original computation in this track.
- **Could not verify / could not be opened**: a source was identified and its citation is real, but its content could not be fetched or read (paywalled, 404, unparseable PDF, restricted archive) — the claim it would support is either omitted or explicitly marked as resting on a weaker, secondary citation instead.
- **Qualified / corrected**: an initial claim (often from the master document or an early reading pass) was found, on closer inspection or independent computation, to need a numeric or conceptual adjustment; the corrected wording and the reason for the change are both stated rather than silently overwriting the original.
- **Mean elements vs. osculating elements**: mean elements have had short-period (and sometimes secular) perturbations averaged out by a specific theory (Brouwer's, in SGP4's case) and are only meaningful when re-expanded by that same theory; osculating elements describe the instantaneous two-body orbit that is tangent to the true trajectory at one instant and are what a Kepler-only propagator implicitly assumes it is being given.
- **RIC / in-track / cross-track / radial**: the standard local frame (Radial, In-track, Cross-track) used to decompose orbit-determination and propagation errors relative to the true orbit, rather than in a global Cartesian frame, because it separates "wrong place along the same path" (in-track/timing) from "wrong path" (radial, cross-track) errors that have different causes and different visual signatures.
- **Known-answer test / anchor vector**: a published numeric example (e.g. Vallado's Appendix C TEME→ITRF vector, or Kelso's 1995 GMST example) with enough stated precision that reproducing it to a tight tolerance is strong evidence an implementation is correct, independent of whether any other implementation agrees with it.
