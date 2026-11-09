# Mathematics

The formulas Orbit Lab uses, with the known answers they are tested against. The browser's versions are in `app/src/core/` and `app/src/propagation/`; the planner's are in `api/propagation.py`, `api/lambert.py` and `api/launch.py`. The three-burn rendezvous has [its own document](three-burn-transfer.md), and the ship and launch models are in [mission-planner.md](mission-planner.md).

Vectors are bold, $\lVert\cdot\rVert$ is the Euclidean norm, and angles are in radians unless marked.

## 1. Conventions and constants

- Units inside the code are km, s and rad. Degrees exist only where the UI takes them.
- Rotation matrices are active: $R_z(\theta)$ rotates a vector by $+\theta$ about $z$.

| Quantity | Value | Used for |
|---|---|---|
| Earth's gravitational parameter, WGS-84 | 398,600.4418 km³/s² | Keplerian propagation |
| Earth's gravitational parameter inside SGP4, WGS-72 | 398,600.8 km³/s² | Only inside SGP4 |
| Earth's equatorial radius | 6,378.137 km | Altitudes, the launch pad |
| WGS-84 flattening | 1/298.257223563 | The pad's position, the globe's shape |
| Sidereal day | 86,164.0905 s | Synchronous orbits, Earth's rotation |
| The Sun's gravitational parameter | 1.327124400419 × 10¹¹ km³/s² | The Sun as a central body |
| The routing papers' constants | μ☉ = 1.32712440018 × 10¹¹ km³/s², 1 AU = 1.49597870691 × 10⁸ km | Asteroid instances |
| J2000 epoch | JD 2,451,545.0 | Sidereal time, the Sun's direction |

Every central body's gravitational parameter, radius, flattening and rotation period is in `app/src/data/bodies.ts`, taken from the NASA planetary fact sheets and JPL.

## 2. The two-body problem

$$
\ddot{\mathbf r} = -\frac{\mu}{r^{3}}\,\mathbf r
$$

Angular momentum and specific energy are conserved:

$$
\mathbf h = \mathbf r \times \mathbf v, \qquad \varepsilon = \frac{v^{2}}{2} - \frac{\mu}{r} = -\frac{\mu}{2a}
$$

which gives the vis-viva equation, the starting point of every speed and Δv:

$$
v^{2} = \mu\left(\frac{2}{r} - \frac{1}{a}\right)
$$

Satellites entered by their elements, the ship's coasts and the asteroids all follow this model: no J2, drag or third bodies.

## 3. Conic geometry and shape from altitudes

$$
r = \frac{p}{1 + e\cos\nu}, \qquad p = a\,(1-e^{2}) = \frac{h^{2}}{\mu}, \qquad r_p = a(1-e), \qquad r_a = a(1+e)
$$

Orbits are entered by periapsis and apoapsis altitude above the surface, so that they stay valid when the central body changes (`shapeFromAltitudes`, `rescaleToBody`):

$$
r_p = R + h_p, \qquad r_a = R + h_a, \qquad a = \frac{r_p + r_a}{2}, \qquad e = \frac{r_a - r_p}{r_a + r_p}
$$

A synchronous orbit has the period of the body's rotation $T_{\mathrm{rot}}$:

$$
a_{\mathrm{sync}} = \left(\mu\left(\frac{T_{\mathrm{rot}}}{2\pi}\right)^{2}\right)^{1/3}
$$

For Earth, with the sidereal day, this is 42,164.17 km: an altitude of 35,786.03 km and a speed of 3.0747 km/s. Using 86,400 s instead of the sidereal day would put it 77 km too high.

## 4. Position in time: Kepler's equation

$$
n = \sqrt{\frac{\mu}{a^{3}}}, \qquad T = \frac{2\pi}{n}, \qquad M = M_0 + n\,(t - t_0)
$$

$$
M = E - e\sin E
$$

There is no closed-form inverse, so $E$ is found with Newton's method after wrapping $M$ into $(-\pi, \pi]$:

$$
E_{k+1} = E_k - \frac{E_k - e\sin E_k - M}{1 - e\cos E_k}
$$

**Seed.** Vallado's: $E_0 = M - e$ when $-\pi < M < 0$, otherwise $E_0 = M + e$. Over 7,600 cases with $e \in [0.9, 0.9999]$ it never failed, where $E_0 = \pi$ failed in 318 cases and $E_0 = M$ in 20. Iteration stops when $\lvert\Delta E\rvert < 10^{-12}$, capped at 60 iterations.

Between the anomalies, with quadrant-safe `atan2` (`core/kepler.ts`):

$$
\nu = 2\,\mathrm{atan2}\!\left(\sqrt{1+e}\,\sin\tfrac{E}{2},\; \sqrt{1-e}\,\cos\tfrac{E}{2}\right), \qquad
E = 2\,\mathrm{atan2}\!\left(\sqrt{1-e}\,\sin\tfrac{\nu}{2},\; \sqrt{1+e}\,\cos\tfrac{\nu}{2}\right), \qquad
r = a\,(1 - e\cos E)
$$

**Hyperbolic arcs**, which fast transfers fly, have $a < 0$:

$$
M_h = e\sinh F - F, \qquad n_h = \sqrt{\frac{\mu}{(-a)^{3}}}, \qquad \tanh\frac{F}{2} = \sqrt{\frac{e-1}{e+1}}\,\tan\frac{\nu}{2}
$$

## 5. Elements to state vector

In the perifocal frame (P toward periapsis, Q 90° ahead in the orbit plane, W along $\mathbf h$):

$$
\mathbf r_{PQW} = r\begin{bmatrix}\cos\nu\\ \sin\nu\\ 0\end{bmatrix}, \qquad
\mathbf v_{PQW} = \sqrt{\frac{\mu}{p}}\begin{bmatrix}-\sin\nu\\ e + \cos\nu\\ 0\end{bmatrix}
$$

These are rotated into the body-centred inertial frame by the 3-1-3 sequence of RAAN, inclination and argument of periapsis:

$$
\mathbf r = Q\,\mathbf r_{PQW}, \qquad \mathbf v = Q\,\mathbf v_{PQW}, \qquad Q = R_z(\Omega)\,R_x(i)\,R_z(\omega)
$$

$$
R_z(\theta) = \begin{bmatrix}\cos\theta & -\sin\theta & 0\\ \sin\theta & \cos\theta & 0\\ 0 & 0 & 1\end{bmatrix}, \qquad
R_x(\theta) = \begin{bmatrix}1 & 0 & 0\\ 0 & \cos\theta & -\sin\theta\\ 0 & \sin\theta & \cos\theta\end{bmatrix}
$$

Written out, with $c$ and $s$ for cosine and sine, as in `perifocalToInertial`:

$$
Q = \begin{bmatrix}
c_\Omega c_\omega - s_\Omega s_\omega c_i & -c_\Omega s_\omega - s_\Omega c_\omega c_i & s_\Omega s_i\\
s_\Omega c_\omega + c_\Omega s_\omega c_i & -s_\Omega s_\omega + c_\Omega c_\omega c_i & -c_\Omega s_i\\
s_\omega s_i & c_\omega s_i & c_i
\end{bmatrix}
$$

**Known answer.** Curtis Example 4.7 ($h$ = 80,000 km²/s, $e$ = 1.4, $i$ = 30°, $\Omega$ = 40°, $\omega$ = 60°, $\nu$ = 30°) gives $\mathbf r$ = (−4039.9, 4814.6, 3628.6) km and $\mathbf v$ = (−10.386, −4.772, 1.744) km/s.

## 6. Orbit paths and displayed quantities

Closed orbits are sampled uniformly in eccentric anomaly (`keplerPathSamples`):

$$
\mathbf r_{PQW}(E_k) = \begin{bmatrix} a(\cos E_k - e)\\ a\sqrt{1-e^{2}}\,\sin E_k\\ 0\end{bmatrix}, \qquad E_k = \frac{2\pi k}{N}
$$

Sampling uniformly in time would crowd points at apoapsis and starve periapsis: for a GTO with $e$ = 0.73, equal time steps are 13.1° of true anomaly at perigee against 0.32° at apogee, which shows as a visible kink.

Besides the elements, the Elements panel shows the period, the periapsis and apoapsis altitudes, and the current radius, altitude $r - R$, speed, and true and mean anomaly.

## 7. Special orbits in the presets

The propagation ignores J2, but J2's secular rates set two of the presets' inclinations:

$$
\dot\Omega = -\frac{3}{2}\,n\,J_2\left(\frac{R}{p}\right)^{2}\cos i, \qquad
\dot\omega = \frac{3}{4}\,n\,J_2\left(\frac{R}{p}\right)^{2}\left(5\cos^{2} i - 1\right)
$$

with Earth's $J_2$ = 1.08262668 × 10⁻³.

- **Sun-synchronous:** $\dot\Omega$ equals 360° per 365.2421897 days. A 700 km circular orbit needs 98.19°.
- **Critical inclination:** $\dot\omega = 0$ when $5\cos^{2} i = 1$, so $i$ = 63.4349° or 116.5651°. The Molniya preset sits there.

## 8. Satellites from TLEs

- TLE elements are Brouwer mean elements with a Kozai-convention mean motion, fitted to the SGP4 model itself, and only meaningful inside SGP4 (satellite.js in the browser, `sgp4` in the planner). They never go through section 5: run through the two-body pipeline, the ISS's TLE is 11.7 km wrong at epoch and about 480 km wrong a day later.
- The semi-major axis shown for a TLE satellite follows from the mean motion in rad/s with SGP4's own constant, $a = \left(\mu_{\mathrm{WGS72}}/n^{2}\right)^{1/3}$.
- Element sets age. For Starlink-class LEO objects the median error is about 0.94 km after 6 hours, 2.6 to 4.5 km after a day, 11.7 km after 3 days and 38.5 km after 7 days.

## 9. Time

$$
\mathrm{JD} = \frac{t_{\mathrm{Unix,\,ms}}}{86\,400\,000} + 2\,440\,587.5
$$

Greenwich mean sidereal time, IAU 1982 model, as satellite.js `gstime` implements it and the planner repeats it:

$$
T = \frac{\mathrm{JD}_{\mathrm{UT1}} - 2\,451\,545.0}{36\,525}
$$

$$
\theta_{\mathrm{GMST}}\,[\mathrm{s}] = 67\,310.548\,41 + \left(876\,600 \cdot 3600 + 8\,640\,184.812\,866\right)T + 0.093\,104\,T^{2} - 6.2\times10^{-6}\,T^{3}
$$

$$
\theta_{\mathrm{GMST}}\,[\mathrm{deg}] = \left(\frac{\theta_{\mathrm{GMST}}\,[\mathrm{s}]}{240}\right) \bmod 360
$$

UT1 is taken as UTC; they differ by less than 0.9 s. **Known answer:** 340.1731699° at 2026-09-01 00:00 UTC, checked by the planner's tests.

The scenario stores its epoch as an ISO 8601 UTC string, and simulated time as seconds since that epoch. JavaScript `Date` objects are made from milliseconds only, never from local-time strings.

## 10. Frames

SGP4 returns positions in TEME (true equator, mean equinox of date). The scene treats TEME as its Earth-centred inertial frame and turns the globe by GMST, which is the rotation from TEME to Earth-fixed:

$$
\mathbf r_{\mathrm{ECEF}} = R_z(-\theta_{\mathrm{GMST}})\,\mathbf r_{\mathrm{TEME}}
$$

What the frame mistakes this avoids would cost: skipping the rotation puts a satellite up to about 13,394 km out on the ground; treating TEME as J2000 moves it about 41 km at ISS altitude and about 260 km at GEO in 2026 (the two frames are 0.37° apart). Keplerian satellites share the same inertial frame; for the other bodies the frame is the body's equatorial frame by definition.

A launch site at geodetic latitude $\phi$, longitude $\lambda$ and height $h$ on the WGS-84 ellipsoid, with equatorial radius $a_\oplus$ and eccentricity squared $e_\oplus^{2} = f(2 - f)$:

$$
N(\phi) = \frac{a_\oplus}{\sqrt{1 - e_\oplus^{2}\sin^{2}\phi}}, \qquad
\mathbf r_{\mathrm{site}} = \begin{bmatrix}(N + h)\cos\phi\cos\lambda\\ (N + h)\cos\phi\sin\lambda\\ \left(N(1 - e_\oplus^{2}) + h\right)\sin\phi\end{bmatrix}
$$

is turned into the inertial frame by $R_z(\theta_{\mathrm{GMST}})$, and its velocity is $\boldsymbol\omega_\oplus \times \mathbf r$.

## 11. Lambert's problem

Given two positions $\mathbf r_1$ and $\mathbf r_2$, a time of flight $\Delta t$, the gravitational parameter, a direction of motion and a number of revolutions, find the velocities $\mathbf v_1$ and $\mathbf v_2$ of the conic that connects them. The planner calls one of `lamberthub`'s seven solvers (`api/lambert.py`), Izzo (2015) by default; the solvers and what to expect of each are listed in [routing-algorithm-format.md](routing-algorithm-format.md#73-lambert-solvers).

**Known answer.** Curtis Example 5.2: $\mathbf r_1$ = (5000, 10000, 2100) km, $\mathbf r_2$ = (−14600, 2500, 7000) km, 3,600 s and $\mu$ = 398,600 give $\mathbf v_1$ = (−5.99249, 1.92536, 3.24564) and $\mathbf v_2$ = (−3.31246, −4.19662, −0.38529) km/s. An independent numpy implementation of Izzo's method in the test suite agrees with `lamberthub` to machine precision on random legs (the tests hold it to 10⁻⁹ km/s).

**Hohmann transfer**, the anchor for the planner's tests, between circular coplanar orbits:

$$
\Delta v_1 = \sqrt{\frac{\mu}{r_1}}\left(\sqrt{\frac{2r_2}{r_1 + r_2}} - 1\right), \qquad
\Delta v_2 = \sqrt{\frac{\mu}{r_2}}\left(1 - \sqrt{\frac{2r_1}{r_1 + r_2}}\right), \qquad
t_H = \pi\sqrt{\frac{a_t^{3}}{\mu}}, \quad a_t = \frac{r_1 + r_2}{2}
$$

From a 300 km orbit to GEO this is 2.4257 + 1.4668 = 3.8926 km/s in 5.275 h.

## 12. Coasting along an arc: universal variables

The planner samples every coast from its starting state $(\mathbf r_0, \mathbf v_0)$ with the universal anomaly $\chi$ (`propagate_universal`), found by Newton's method from $\chi_0 = \sqrt{\mu}\,\lvert\alpha\rvert\,\Delta t$:

$$
\alpha = \frac{2}{r_0} - \frac{v_0^{2}}{\mu}, \qquad v_{r0} = \frac{\mathbf r_0\cdot\mathbf v_0}{r_0}
$$

$$
\frac{r_0 v_{r0}}{\sqrt{\mu}}\,\chi^{2} C(\alpha\chi^{2}) + (1 - \alpha r_0)\,\chi^{3} S(\alpha\chi^{2}) + r_0\,\chi - \sqrt{\mu}\,\Delta t = 0
$$

$$
f = 1 - \frac{\chi^{2}}{r_0}\,C(\alpha\chi^{2}), \qquad g = \Delta t - \frac{\chi^{3}}{\sqrt{\mu}}\,S(\alpha\chi^{2}), \qquad \mathbf r = f\,\mathbf r_0 + g\,\mathbf v_0
$$

with the Stumpff functions

$$
C(z) = \begin{cases} \dfrac{1 - \cos\sqrt{z}}{z} & z > 0\\[6pt] \dfrac{\cosh\sqrt{-z} - 1}{-z} & z < 0\\[6pt] \tfrac{1}{2} & z = 0 \end{cases}
\qquad
S(z) = \begin{cases} \dfrac{\sqrt{z} - \sin\sqrt{z}}{(\sqrt{z})^{3}} & z > 0\\[6pt] \dfrac{\sinh\sqrt{-z} - \sqrt{-z}}{(\sqrt{-z})^{3}} & z < 0\\[6pt] \tfrac{1}{6} & z = 0 \end{cases}
$$

It works for ellipses and hyperbolas alike, so one routine samples every coast. The tests check it against section 5 on random orbits and check that energy is conserved on hyperbolas.

## 13. The Sun's direction

Earth is lit from where the Sun really is on the scenario's date, by the Astronomical Almanac's low-precision formulas (`core/sun.ts`), good to about 0.01° from 1950 to 2050. With $T$ in Julian centuries from J2000 and angles in degrees:

$$
L = 280.46 + 36\,000.771\,T, \qquad
M = 357.529\,109\,2 + 35\,999.050\,34\,T
$$

$$
\lambda = L + 1.914\,666\,471\sin M + 0.019\,994\,643\sin 2M, \qquad
\varepsilon = 23.439\,291 - 0.013\,004\,2\,T
$$

$$
\hat{\mathbf s} = \left(\cos\lambda,\ \cos\varepsilon\sin\lambda,\ \sin\varepsilon\sin\lambda\right)
$$

## 14. Pixel scale

At distance $D$ from the camera, with vertical field of view $\theta$ and a viewport $H$ pixels tall, one pixel spans

$$
w = \frac{2D\tan(\theta/2)}{H}
$$

in scene units (`worldPerPixel`). Markers, labels, the ship and the dashes of the path to come are sized with it, so they keep their size on screen at any zoom.
