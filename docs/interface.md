# Interface

How the scene and the panels behave, and why. Each choice follows a convention of established space viewers or of research on 3D interfaces, linked where it is cited.

## Layout

- **The scene owns the window; the controls sit at its edges and fold away.** The tabs are on the left, the Elements panel on the right, the timeline along the bottom and the toolbar at the top right. The same arrangement appears in the [Cesium Viewer](https://github.com/CesiumGS/cesium/blob/main/packages/widgets/Source/Viewer/Viewer.js) (clock bottom left, timeline along the bottom, toolbar top right), NASA Eyes (an object panel on the left and collapsible time controls), [KeepTrack](https://docs.keeptrack.space/intro/interface-walkthrough/) and [OpenSpace](https://docs.openspaceproject.com/latest/getting-started/orientation/index.html).
- **The view centres on the part of the window the panels leave free.** A camera view offset puts the point looked at in the middle of that area, eased when a panel opens or closes, and framing fits the subject into it (`SceneManager.applyViewOffset`, `fitDistance`). MapLibre does the same with its [`padding`](https://maplibre.org/maplibre-gl-js/docs/examples/offset-the-vanishing-point-using-padding/) option.
- **Full screen, and a way to hide the panels.** Full screen is in the toolbar; Hide panels is in the View menu and on `P`. OpenSpace hides its panels on F1.
- **The Elements panel stays docked**, with an empty state that says what to do. Cesium and KeepTrack show an info box only while something is selected, but showing and hiding the panel would shift the centred view at every selection.

## Camera

- **The camera orbits a focus**, as in OpenSpace, Celestia and [KeepTrack](https://docs.keeptrack.space/intro/mouse-controls/). The wheel zooms toward the focus, not toward the cursor.
- **Camera moves are animated and can be interrupted.** Frame body, Frame orbit, Frame all and the way out of Chase or Bird's-eye fly in 0.7 to 1.4 s. The move is eased, interpolates the distance logarithmically and rolls back to level. Any input cancels it, and with reduced motion it cuts (`SceneManager.flyTo`, `stepFlight`). The precedents:
  - Autodesk's [ViewCube study](https://research.autodesk.com/app/uploads/2023/03/viewcube-a-3d-orientation.pdf_recsg8BsEjf1BeIbZ.pdf) found that novices misread jump cuts, and animates view changes over 0.5 s.
  - NASA Eyes takes about 0.75 s for a go-to.
  - [Van Wijk and Nuij](https://d3js.org/d3-interpolate/zoom) make a move's duration grow with the length of its path.
  - [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) asks for cuts instead of flights.
- **Home** is Frame body, also on `H`.
- **Follow lets the camera come close to the ship.** The zoom limit applies to the ship rather than to the body's centre, so the ship can be seen from about 25 km.

## Selection and labels

- **Click selects, double-click flies to the orbit, a click on empty space or Esc clears**, and a drag never selects. This is how KeepTrack, Celestia and Stuff in Space behave, and Cesium also selects on a click and tracks on a double-click. Hovering brightens the object's orbit and names it, with a pointer cursor, as [Stuff in Space](https://github.com/jeyoder/StuffInSpace/blob/master/web-root/scripts/main.js) does (`SceneManager.pickAt`).
- **Labels never overlap, and are placed by priority.** One screen-space pass each frame (`scene/labels.ts`) handles every label:
  - Labels are drawn over the scene.
  - A label whose anchor is behind the planet or the camera is hidden.
  - The rest are placed in priority order: the ship, the hovered object, the selection, the leg in play, then the others.
  - Each label tries four sides of its anchor before it gives way, with hysteresis so that none flickers.

  NASA Eyes resolves overlaps by a priority for each category of object, and Cesium can [cluster](https://cesium.com/learn/cesiumjs/ref-doc/EntityCluster.html) labels instead.

## Time

- **Keys step the rate, and the timeline jumps between events.** `,` and `.` step through the rate ladder, and `[` and `]` (and two buttons on the timeline) jump to the previous or next burn. NASA Eyes steps its rate through a ladder; Celestia, Stellarium and [KeepTrack](https://docs.keeptrack.space/basic-tut/keyboard-shortcuts/) bind keys for slower and faster.

## Help

- **A help dialog lists every control.** It opens from the toolbar or with `?`, and shows the mouse, touch and keyboard controls. Cesium's [help button](https://github.com/CesiumGS/cesium/blob/main/packages/widgets/Source/NavigationHelpButton/NavigationHelpButton.js) shows the mouse and touch controls, Stellarium's F1 lists every hotkey, and `?` for a list of shortcuts is a common web convention ([GitHub](https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts)).
- **The single-key shortcuts can be switched off** in that dialog, as [WCAG 2.1.4](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html) asks. Space plays and pauses only when focus is not on a control, and no shortcut fires while typing.
- **Help comes in context, not as a tutorial.** A one-line hint on a first visit points to the help, disappears at the first touch of the scene and is remembered. Empty states say what to do next. Nielsen Norman Group recommend [help in context](https://www.nngroup.com/articles/onboarding-tutorials/) over tutorials and [empty states](https://www.nngroup.com/articles/empty-state-interface-design/) that explain the next step.

## Not done, and why

- **Zoom toward the cursor.** That is a globe convention (Cesium), and it is off by default in three.js's OrbitControls. Space viewers orbit the object in focus, and the wheel stays aimed at it, as in OpenSpace and Celestia.
- **Following a selected satellite.** Double-click frames its orbit instead. Making any object the camera's moving pivot is a larger change to the camera model.
- **Reverse time, a timeline that zooms, a search box.** These are not built. The scenarios are small enough that the list in the left panel serves as search.
