# Orbit Lab

A small, open-source 3D orbit visualizer: put Earth, the Moon, Mars, Venus, Jupiter or the Sun at the centre, add satellites from their classical orbital elements (or a TLE for Earth), see their paths, scrub time at any rate, and look at the geometry from any angle.

This is Phase 0 of the Rathinam group project described in `../rathinam_project_master.md`: the professor's lecture on the six classical elements, turned into code and validated against known answers.

## Run

```bash
npm install
npm run dev
```

Then open the printed URL. `npm test` runs the known-answer tests, `npm run build` produces a static site in `dist/` that can be hosted anywhere (no API keys, no tokens).

## What it does

- Central body registry with gravitational parameters and radii from NASA/JPL fact sheets (`src/data/bodies.ts`).
- Satellites from periapsis and apoapsis altitude above the surface plus i, RAAN, argument of periapsis and true anomaly at epoch (`Elements` tab; a and e are derived and shown), which keeps every orbit above the surface and visible when you switch the central body, from presets (ISS-class LEO, GPS, GEO, Molniya, sun-synchronous, areostationary, low lunar orbit), or from a pasted TLE propagated with SGP4 (`TLE` tab, Earth only).
- Orbit paths sampled uniformly in eccentric anomaly so eccentric orbits look right near periapsis; TLE paths cover one period from the current time.
- Timeline: play/pause (space bar), scrub slider over a span (one orbit of the selected satellite, 1 hour to 30 days, or custom), playback rates from real time to one day per second, editable epoch.
- Elements panel with live derived quantities: period, periapsis and apoapsis altitude, radius, speed, true and mean anomaly.
- Camera: drag to orbit, wheel to zoom, right-drag to pan; Frame body, Frame orbit, Reset view; axes and label toggles.
- Shareable URLs: the whole scenario is encoded in the `?s=` query parameter (Copy link).

## Fidelity, stated honestly

- Keplerian satellites are propagated with the two-body problem only: no J2, drag or third-body effects. They are for teaching and for scenario sketches, not for tracking real spacecraft.
- TLE satellites use SGP4 through satellite.js. SGP4 outputs the TEME frame; the scene treats TEME as its Earth-centred inertial frame, which differs from J2000 by about 0.37 degrees in 2026. Earth's rotation is applied from Greenwich mean sidereal time, so the grid turns correctly under the satellites.
- Keplerian and TLE satellites share one inertial frame in the scene; for non-Earth bodies the frame is the body's equatorial frame by definition.
- Elements are only valid for closed orbits; the form limits eccentricity to 0.95 and rejects orbits whose periapsis is below the surface.
- Fresh TLEs come from CelesTrak. Fetch them at most once every two hours per query; repeated downloads are refused with HTTP 403.

## Structure

```
src/core/         elements, Kepler's equation, time helpers (no rendering imports)
src/propagation/  Keplerian and SGP4 propagators
src/data/         central bodies, presets, bundled ISS TLE
src/store/        zustand store shared by the panels and the scene
src/url/          scenario <-> URL codec
src/scene/        Three.js scene: inertial frame group, body mesh, orbit paths, markers, camera
src/ui/           React panels
tests/            Vitest known-answer tests (Curtis Example 4.7, circular hand cases, ISS, GEO, SGP4 cross-check)
```

Rule kept from the project plan: nothing under `core/`, `propagation/` or `data/` imports from `scene/` or `ui/`, so the math stays testable and the renderer stays swappable.

## Conventions

Kilometres, seconds and radians everywhere except the UI inputs, which take degrees. The perifocal to inertial rotation is Q = Rz(RAAN) Rx(i) Rz(argp). Kepler's equation is solved by Newton's method with Vallado's seed. Scene units are 1 unit per 1000 km, and the inertial z axis (the pole) is mapped to Three.js +y by rotating one parent group.

## License

MIT.
