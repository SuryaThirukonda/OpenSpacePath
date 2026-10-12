# Orbit Lab

A small, open-source 3D orbit visualizer: put Earth, the Moon, Mars, Venus, Jupiter or the Sun at the centre, add satellites from their classical orbital elements (or a TLE for Earth), see their paths, scrub time at any rate, and look at the geometry from any angle.

This is Phase 0 of the Rathinam group project described in `../rathinam_project_master.md`: the professor's lecture on the six classical elements, turned into code and validated against known answers.

## Run

```bash
npm install
npm run dev
```

Then open the printed URL. `npm test` runs the known-answer tests, `npm run build` produces a static site in `dist/`. `VITE_ALGORITHM_EDITOR=true npm run dev` (or a line in `app/.env`) switches on the Routing tab's algorithm editor; it is off by default and on the public site. The Mission tab needs the Python planner in `../api` (see its README): run `npm run dev:api` in a second terminal and the dev server proxies `/api` to it. In production the planner is a Vercel Python function in the same deployment. No API keys, no tokens.

## What it does

- Central body registry with gravitational parameters and radii from NASA/JPL fact sheets (`src/data/bodies.ts`).
- Satellites from periapsis and apoapsis altitude above the surface plus i, RAAN, argument of periapsis and true anomaly at epoch (`Elements` tab; a and e are derived and shown), which keeps every orbit above the surface and visible when you switch the central body, from presets (ISS-class LEO, GPS, GEO, Molniya, sun-synchronous, areostationary, low lunar orbit), or from a pasted TLE propagated with SGP4 (`TLE` tab, Earth only).
- Orbit paths sampled uniformly in eccentric anomaly so eccentric orbits look right near periapsis; TLE paths cover one period from the current time.
- Timeline: play/pause (space bar), scrub slider over a span (one orbit of the selected satellite, 1 hour to 30 days, or custom), playback rates from real time to one day per second, editable epoch.
- Elements panel with live derived quantities: period, periapsis and apoapsis altitude, radius, speed, true and mean anomaly.
- Camera: drag to orbit, wheel to zoom, right-drag to pan; Frame body, Frame orbit, Reset view; axes and label toggles.
- Real Earth: Natural Earth country polygons (1:50m on larger screens, 1:110m on small ones) painted onto the globe with correct longitude and latitude, coastlines and borders as crisp lines, glossy oceans that glint in sunlight, the equator and prime meridian emphasised, and coordinate labels; the globe spins with Greenwich sidereal time so a launch pad sits where it really is.
- The other bodies are drawn from their real features: the Moon's maria and rayed craters, Mars's dark regions, volcanoes, Valles Marineris and polar caps, and Jupiter's belts, zones and Great Red Spot all sit at their published coordinates and sizes; the Sun has limb darkening and sunspots in the active latitudes; Venus is the pale, nearly featureless cloud deck it is in visible light. Each body is flattened by its real oblateness (Jupiter visibly so).
- Vehicles are models in real proportions: a capsule-and-service-module spacecraft with four solar wings; a launch vehicle sized from its own numbers (core diameter from the drag area, tank lengths from propellant mass) that sheds its stages at each separation; and the satellites, a communications satellite or a station held in their orbital attitude. In the chase view the satellite being visited is drawn at its size next to the ship.
- Camera views for a tour: Free (you steer), Follow (travels with the ship), Chase (third person from behind the ship along its flight, body below, like a game), and Bird's-eye (a fixed camera straight above the plane of the current route, so the ship crosses a still frame).
- Dashboard: glass panels over the scene; the side panels scroll inside a custom scroll area (a slim draggable thumb that takes no width, with the content fading where it continues); sections fold away and show a one-line summary while closed; headline numbers are tiles; the timeline is one row with a styled scrubber and burn ticks. Below 860 px the view controls become a strip above the timeline, and below 680 px the panels are sheets that start collapsed.
- Shareable URLs: the whole scenario, mission inputs included, is encoded in the `?s=` query parameter (Copy link).
- Mission tab: a spaceship tours the satellites you order. Each leg is a Lambert rendezvous to where the target will be, with a braking burn to match it; three- and four-burn strategies (phasing loops, bi-elliptic, node plane change) are tried by the planner and the cheapest kept. The tour draws as one line, flown part solid and remainder dashed, with burn markers, dwell badges, an engine flare at each burn, and a camera that follows the ship. Ship mass, propellant, Isp and thrust give burn durations and a delta-v budget. The tour can also start on a launch pad: pick a site and a staged vehicle, and the planner finds the launch window, flies the ascent with drag, gravity and steering losses, and reports the propellant, losses, max-Q and the parking orbit before the first Lambert leg.
- Transfer toggle (Mission and Asteroids tabs): every transfer is flown either as the two-burn Lambert rendezvous or, by default, as the three-burn rendezvous of the derivation sheet (`../research/07_three_burn_transfer.md`): burn 1 shapes the approach in the departure plane, burn 2 at the node line reshapes and tilts the orbit in one impulse, burn 3 matches the target's velocity. The choice is saved in the link.
- Lambert solver menu (Mission and Asteroids tabs): every transfer is computed by one solver from `lamberthub`. Izzo (2015) is the default; Gooding, Avanzini, Arora, Vallado, Battin and Gauss can be chosen, each with a note on what to expect of it. The choice is saved in the link.
- Path (in the Asteroids tab): write the route by hand as a list of entries, each an asteroid with all of its orbital elements, the day to arrive there and how long to stay, plus the day of departure from Earth. Edit it as rows, each with its asteroid's name and the six orbital elements (a in AU, angles in degrees, M0 at the epoch) under an "orbit" fold, or type it as text in the `ARP-PATH 1` format (one line per stop: `Ceres: a=2.767 AU e=0.0785 i=10.59 raan=80.3 argp=73.6 M0=130 arrive=760 stay=20`), which also admits asteroids that are not in the instance. The planner flies it exactly as written with the chosen transfer and draws it; the list can be filled from the last algorithm run and saved to or opened from a file.
- Two worlds in one scene: the Satellites and Mission tabs show the satellites around the chosen body; the Asteroids tab shows the Sun with the asteroids of the routing instance. Switching tabs switches the scene, and each world keeps its own clock, plan and camera while the other is shown; the transfer and solver choices are shared.
- Asteroids tab: run an asteroid routing algorithm (leave Earth's orbit, visit every asteroid once) on a Sun-centred instance and watch it work. Every route the algorithm evaluates is charted and listed, the best so far is drawn as it improves, and the final route is flown on the timeline. By default the choice is the four algorithms of the two papers, two from each: greedy nearest neighbour and random search (López-Ibáñez, Chicano and Gil-Merino 2022), the restricted decision diagram and Peel-and-Bound (Rudich et al. 2024). Built with `VITE_ALGORITHM_EDITOR=true` the tab also shows the editor: algorithms are written in the standard format `ARP-ALGORITHM 1`, one Python file with a header docstring and `solve(problem, tools)`, with three more examples, file open and save, and the format reference. Instances can be saved to and opened from files, and a whole run exported as JSON. The specification is `../research/06_routing_algorithm_format.md`.

## Fidelity, stated honestly

- Keplerian satellites are propagated with the two-body problem only: no J2, drag or third-body effects. They are for teaching and for scenario sketches, not for tracking real spacecraft.
- The Earth map is the Natural Earth dataset (public domain) shipped by the `world-atlas` package, decoded with `topojson-client`: continent and country outlines, no terrain, no cities, no clouds.
- The other bodies are procedural drawings, not photographs. Named features are placed from the IAU gazetteer (`src/data/surfaceFeatures.ts`); everything between them is noise. Vehicles are generic designs in realistic proportions, drawn at a constant size on screen rather than to the scale of the scene.
- A launch is a planar integrated ascent with an exponential atmosphere and a simple guidance law; it gives the right order of losses and propellant, not a flight-ready trajectory.
- Mission legs are impulsive-burn, two-body coasts: no finite burns, drag, or perturbations on the ship. Each leg's endpoint is taken from the target's own propagator at the arrival time, so the ship arrives exactly where that model puts the target.
- The three-burn transfer is a restricted family (burn 1 purely tangential or radial in the departure plane, burn 2 keeping the flight-path angle), found by a grid search with refinement rather than an exact method. At a fixed pair of times it can cost more than the two-burn Lambert arc, which is reported beside it; with a plane change or a free arrival time it is usually cheaper. In the Routing tab the times of a transfer are always chosen on the two-burn cost, as the papers define, so three-burn results are not comparable with the papers' tables.
- Routing instances are synthetic main-belt-like orbits drawn from a seed, not the GTOC11 catalogue the papers sample, so costs are not comparable with the papers' tables. A route's cost follows the papers' definition (delta-v plus 2 km/s per 30 days, times chosen by SLSQP from a fixed start) and is only comparable with them under the Izzo or Gooding solver.
- A routing algorithm runs in your own browser (Python through Pyodide, fetched from the jsDelivr CDN the first time, about 8 MB); only its transfer questions go to the planner. It is kept in the browser's local storage and is never put in a link.
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
src/arp/          routing: the algorithm format and examples, instances, the runner client and the tab's state
public/arp-worker.js  the Web Worker that runs an algorithm with Pyodide
src/scene/        Three.js scene: inertial frame group, body mesh, orbit paths, markers, camera
src/ui/           React panels
tests/            Vitest known-answer tests (Curtis Example 4.7, circular hand cases, ISS, GEO, SGP4 cross-check)
```

Rule kept from the project plan: nothing under `core/`, `propagation/` or `data/` imports from `scene/` or `ui/`, so the math stays testable and the renderer stays swappable.

## Conventions

Kilometres, seconds and radians everywhere except the UI inputs, which take degrees. The perifocal to inertial rotation is Q = Rz(RAAN) Rx(i) Rz(argp). Kepler's equation is solved by Newton's method with Vallado's seed. Scene units are 1 unit per 1000 km, and the inertial z axis (the pole) is mapped to Three.js +y by rotating one parent group.

## License

MIT.
