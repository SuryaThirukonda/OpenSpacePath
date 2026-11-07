# How space viewers and 3D tools handle navigation, and what Orbit Lab took from them

Date: 2026-11-07. Written alongside the interface sweep of that day (commits a2d4537 and 17812f3), which fixed the visual bugs found at 1920x1080 and reworked how the view is navigated. It adds to the UI notes in `track3_existing_projects.md` (dim rather than hide, about 40 labels kept apart, a 15 px pick box, Eyes' rate dial and ride-along camera) rather than repeating them.

Sources were read on the web on the day. NASA Eyes was read from its production bundle and in-app help text, because the browser used had no WebGL. The KSP wiki and forum, the GMAT OrbitView page, Stellarium Web and Eyes on the Earth could not be checked.

## What the established tools do

**Layout.** The scene owns the window and the controls sit at its edges, collapsible:
- **Cesium Viewer** puts the clock dial bottom-left, the timeline along the bottom, a toolbar top-right (home, layers, help) and full screen bottom-right. Its info box and selection marker appear only while something is selected ([Viewer.js](https://github.com/CesiumGS/cesium/blob/main/packages/widgets/Source/Viewer/Viewer.js)).
- **NASA Eyes** has an object panel on the left, search, collapsible time controls, and one settings button for lighting, layers, labels and full screen.
- **KeepTrack** has a top bar with search, clock and help, a drawer of tools along the bottom, and an info box that exists only while a satellite is selected ([walkthrough](https://docs.keeptrack.space/intro/interface-walkthrough/)).
- **OpenSpace** has panels that float or detach, and F1 hides them all ([orientation](https://docs.openspaceproject.com/latest/getting-started/orientation/index.html)).
- **MapLibre** shifts the camera's vanishing point by a sidebar's width (`padding`), so what is in focus stays centred in the part of the screen that can be seen ([example](https://maplibre.org/maplibre-gl-js/docs/examples/offset-the-vanishing-point-using-padding/)).

**Camera.** In space viewers the camera orbits the object in focus:
- OpenSpace always has a Focus.
- Celestia orbits the selection.
- KeepTrack orbits the selection, or Earth when nothing is selected ([mouse](https://docs.keeptrack.space/intro/mouse-controls/)).

Zooming toward the cursor is a globe convention (Cesium). It is off by default in three.js OrbitControls and in camera-controls. Camera moves are animated rather than cut:
- Autodesk's ViewCube study found that novices misread jump cuts, and it animates view changes over 0.5 s ([paper](https://research.autodesk.com/app/uploads/2023/03/viewcube-a-3d-orientation.pdf_recsg8BsEjf1BeIbZ.pdf)).
- NASA Eyes takes about 0.75 s for a go-to.
- Celestia uses 5 s with exponential easing ([observer.cpp](https://github.com/CelestiaProject/Celestia/blob/master/src/celengine/observer.cpp)).
- Cesium's flyTo takes 3 s ([CameraFlightPath](https://github.com/CesiumGS/cesium/blob/main/packages/engine/Source/Scene/CameraFlightPath.js)).
- Van Wijk and Nuij scale the duration with the length of the zoom-and-pan path ([d3](https://d3js.org/d3-interpolate/zoom)).

Any user input cancels a move, as in OpenSpace's camera paths and Stuff in Space's lock. Reduced motion should cut instead of fly ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)).

**Selection and labels:**
- A drag never selects, and a click on empty space deselects (KeepTrack, Celestia, Stuff in Space).
- Cesium selects on a click and tracks on a double-click. Stuff in Space shows the hovered satellite's orbit, its name and a pointer cursor ([main.js](https://github.com/jeyoder/StuffInSpace/blob/master/web-root/scripts/main.js)).
- NASA Eyes draws labels as HTML and resolves overlaps by priority per category (star 100, planet 50, spacecraft 30, moon 25, asteroid 15).
- Cesium can cluster labels within 80 px ([EntityCluster](https://cesium.com/learn/cesiumjs/ref-doc/EntityCluster.html)).

**Time:**
- Eyes steps the rate through a ladder (1 s to 3 years a second) and keeps time and rate in the URL.
- Cesium has a shuttle ring and a timeline that scrubs, zooms and pans ([Timeline.js](https://github.com/CesiumGS/cesium/blob/main/packages/widgets/Source/Timeline/Timeline.js)).
- Celestia, Stellarium and KeepTrack bind keys for slower and faster ([keys](https://docs.keeptrack.space/basic-tut/keyboard-shortcuts/)).

**Discoverability:**
- Cesium's "?" button shows the mouse and touch controls ([source](https://github.com/CesiumGS/cesium/blob/main/packages/widgets/Source/NavigationHelpButton/NavigationHelpButton.js)).
- Stellarium's F1 lists every hotkey.
- "?" for a shortcut list is a common web convention ([GitHub](https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts)).
- WCAG 2.1.4 asks that single-character shortcuts can be turned off, remapped, or limited to a focused control ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html)).
- Nielsen Norman Group recommend help in context over up-front tutorials ([onboarding](https://www.nngroup.com/articles/onboarding-tutorials/)), empty states that say what to do next ([empty states](https://www.nngroup.com/articles/empty-state-interface-design/)), and nothing more than two levels deep ([progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)).

## What Orbit Lab does now

| Convention | In Orbit Lab |
|---|---|
| The view centres on what can be seen | A camera view offset puts the point looked at in the middle of the area between the panels, eased when a panel opens or closes; framing fits that area (`SceneManager.applyViewOffset`, `fitDistance`). |
| Animated, interruptible camera moves | Frame body, Frame orbit, Frame all and the way out of Chase or Bird's-eye fly in 0.7 to 1.4 s, eased, through log distance, rolling back to level; any input cancels; reduced motion cuts (`flyTo`, `stepFlight`). |
| Click, double-click, hover | Click selects a satellite or asteroid (or its label), double-click flies to its orbit, a click on empty space or Esc clears; hover brightens the orbit and names the object (`pickAt`). |
| Labels by priority, never over each other | One screen-space pass a frame: labels draw over the scene; any behind the planet or the camera are hidden; the rest are placed ship, hover, selection, leg in play, others, each trying four sides, with hysteresis (`scene/labels.ts`). |
| Help and shortcuts | A help dialog (the `?` key or the toolbar) lists mouse, touch and keys; the single-key shortcuts (rate, previous and next burn, camera modes, framing, labels, panels) can be switched off there (`ui/keys.ts`, `ui/HelpDialog.tsx`). |
| Full screen and hide the interface | Full screen in the toolbar; Hide panels in the View menu and on `P`. |
| Home | Frame body, also on `H`. |
| Contextual onboarding | A one-line hint on a first visit, gone at the first touch of the scene and remembered. |
| Rate steps by key, events on the timeline | `,` and `.` step through the rate ladder; `[` and `]` and two timeline buttons jump between burns. |
| Close look at the followed object | In Follow the zoom limit applies to the ship, not to the body's centre, so the ship can be seen from about 25 km. |

## What it does not do, and why

- **Zoom toward the cursor.** Space viewers orbit the object in focus, and the wheel stays aimed at it, as OpenSpace and Celestia do.
- **Make a selected satellite the camera's pivot and follow it.** Double-click frames its orbit instead. Following any object is a larger change to the camera model and is left for later.
- **Reverse time, a timeline that zooms, a search box.** These are not done yet. The scenarios are small enough that the list in the left panel serves as search.
- **Show the Elements panel only while something is selected.** It stays docked with an empty state, because showing and hiding it would shift the centred view at every selection.
