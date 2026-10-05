# Orbit Lab

A small, open-source 3D orbit visualizer: put Earth, the Moon, Mars, Venus, Jupiter or the Sun at the centre, add satellites from their classical orbital elements (or a TLE for Earth), see their paths, scrub time at any rate, and look at the geometry from any angle.

This is Phase 0 of the Rathinam group project described in `../rathinam_project_master.md`: the professor's lecture on the six classical elements, turned into code and validated against known answers.

## Run

```bash
npm install
npm run dev
```

Then open the printed URL. `npm test` runs the known-answer tests, `npm run build` produces a static site in `dist/`. The Mission tab needs the Python planner in `../api` (see its README): run `npm run dev:api` in a second terminal and the dev server proxies `/api` to it. In production the planner is a Vercel Python function in the same deployment. No API keys, no tokens.

## What it does

- Central body registry with gravitational parameters and radii from NASA/JPL fact sheets (`src/data/bodies.ts`).
- Satellites from periapsis and apoapsis altitude above the surface plus i, RAAN, argument of periapsis and true anomaly at epoch (`Elements` tab; a and e are derived and shown), which keeps every orbit above the surface and visible when you switch the central body, from presets (ISS-class LEO, GPS, GEO, Molniya, sun-synchronous, areostationary, low lunar orbit), or from a pasted TLE propagated with SGP4 (`TLE` tab, Earth only).
- Orbit paths sampled uniformly in eccentric anomaly so eccentric orbits look right near periapsis; TLE paths cover one period from the current time.
- Timeline: play/pause (space bar), scrub slider over a span (one orbit of the selected satellite, 1 hour to 30 days, or custom), playback rates from real time to one day per second, editable epoch.
- Elements panel with live derived quantities: period, periapsis and apoapsis altitude, radius, speed, true and mean anomaly.
- Camera: drag to orbit, wheel to zoom, right-drag to pan; Frame body, Frame orbit, Reset view; axes and label toggles.
- Real Earth: Natural Earth 1:110m country polygons painted onto the globe with correct longitude and latitude, coastlines and borders as crisp lines, the equator and prime meridian emphasised, and coordinate labels; the globe spins with Greenwich sidereal time so a launch pad sits where it really is. Other bodies keep their procedural surfaces.
- Camera views for a tour: Free (you steer), Follow (travels with the ship), Chase (third person from behind the ship along its flight, body below, like a game), and Bird's-eye (a fixed camera straight above the plane of the current route, so the ship crosses a still frame).
- Shareable URLs: the whole scenario, mission inputs included, is encoded in the `?s=` query parameter (Copy link).
- Mission tab: a spaceship tours the satellites you order. Each leg is a Lambert rendezvous to where the target will be, with a braking burn to match it; three- and four-burn strategies (phasing loops, bi-elliptic, node plane change) are tried by the planner and the cheapest kept. The tour draws as one line, flown part solid and remainder dashed, with burn markers, dwell badges, an engine flare at each burn, and a camera that follows the ship. Ship mass, propellant, Isp and thrust give burn durations and a delta-v budget. The tour can also start on a launch pad: pick a site and a staged vehicle, and the planner finds the launch window, flies the ascent with drag, gravity and steering losses, and reports the propellant, losses, max-Q and the parking orbit before the first Lambert leg.

## Fidelity, stated honestly

- Keplerian satellites are propagated with the two-body problem only: no J2, drag or third-body effects. They are for teaching and for scenario sketches, not for tracking real spacecraft.
- The Earth map is the 1:110m Natural Earth dataset (public domain) shipped by the `world-atlas` package, decoded with `topojson-client`: continent and country outlines at about 10 km resolution, no terrain, no cities.
- A launch is a planar integrated ascent with an exponential atmosphere and a simple guidance law; it gives the right order of losses and propellant, not a flight-ready trajectory.
- Mission legs are impulsive-burn, two-body coasts: no finite burns, drag, or perturbations on the ship. Each leg's endpoint is taken from the target's own propagator at the arrival time, so the ship arrives exactly where that model puts the target.
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
src/mission/      mission types, planner client, ship state by Hermite interpolation of the planner's samples
src/scene/        Three.js scene: inertial frame group, body mesh, orbit paths, markers, camera
src/ui/           React panels
tests/            Vitest known-answer tests (Curtis Example 4.7, circular hand cases, ISS, GEO, SGP4 cross-check)
```

Rule kept from the project plan: nothing under `core/`, `propagation/` or `data/` imports from `scene/` or `ui/`, so the math stays testable and the renderer stays swappable.

## Conventions

Kilometres, seconds and radians everywhere except the UI inputs, which take degrees. The perifocal to inertial rotation is Q = Rz(RAAN) Rx(i) Rz(argp). Kepler's equation is solved by Newton's method with Vallado's seed. Scene units are 1 unit per 1000 km, and the inertial z axis (the pole) is mapped to Three.js +y by rotating one parent group.

## License

MIT.
