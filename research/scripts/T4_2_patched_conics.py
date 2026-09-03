"""
T4.2 -- Patched conics, spheres of influence, planetary departure/arrival.

All numbers here are plain patched-conic / two-body arithmetic (vis-viva,
Hohmann, hyperbolic excess velocity). No ephemeris, no plane change, no J2.
This is exactly the "shortcut" fidelity level flagged in the master doc
Part III 1.3 ("v1 may report v-infinity sums and skip planetary spirals").

Sources for formulas:
  - Sphere of influence: Wikipedia "Sphere of influence (astrodynamics)"
    https://en.wikipedia.org/wiki/Sphere_of_influence_(astrodynamics)
  - Patched conic departure hyperbola / C3: Wikipedia "Patched conic approximation"
    https://en.wikipedia.org/wiki/Patched_conic_approximation
  - Departure hyperbola derivation (vp, a, e, delta-v): orbital-mechanics.space
    https://orbital-mechanics.space/interplanetary-maneuvers/planetary-departure-trajectory.html
  - Braeunig "Interplanetary Flight" (braeunig.us/space/interpl.htm) -- same
    equations (v_inf, Hohmann heliocentric transfer, capture delta-v);
    site's TLS cert did not validate through WebFetch (hostname mismatch,
    cert only covers *.securedata.net) and braeunig.space does not resolve,
    so the page itself was not opened directly this session -- formulas
    cross-checked against Wikipedia and orbital-mechanics.space instead,
    which agree.
"""
import math

# ---- constants (km, s, km^3/s^2) ----
mu_sun = 1.32712440018e11
mu_earth = 398600.4418
mu_mars = 42828.37

a_earth = 1.496e8      # km, Earth heliocentric semi-major axis (~1 AU)
a_mars = 2.279e8       # km, Mars heliocentric semi-major axis

m_earth = 5.972e24     # kg
m_mars = 6.4171e23     # kg
m_sun = 1.989e30       # kg

AU = 1.496e8


def soi_radius(a, m, M):
    """Laplace sphere-of-influence radius: r_SOI = a * (m/M)^(2/5)."""
    return a * (m / M) ** (2 / 5)


def v_circular(mu, r):
    return math.sqrt(mu / r)


def hohmann_transfer(mu_central, r1, r2):
    """Returns (a_t, v1_circ, v2_circ, v_t_at_r1, v_t_at_r2, dv1, dv2, dv_total, tof)."""
    a_t = (r1 + r2) / 2
    v1_circ = v_circular(mu_central, r1)
    v2_circ = v_circular(mu_central, r2)
    v_t_r1 = math.sqrt(mu_central * (2 / r1 - 1 / a_t))  # vis-viva at r1 on transfer ellipse
    v_t_r2 = math.sqrt(mu_central * (2 / r2 - 1 / a_t))  # vis-viva at r2 on transfer ellipse
    dv1 = abs(v_t_r1 - v1_circ)
    dv2 = abs(v2_circ - v_t_r2)
    dv_total = dv1 + dv2
    tof = math.pi * math.sqrt(a_t ** 3 / mu_central)
    return dict(a_t=a_t, v1_circ=v1_circ, v2_circ=v2_circ,
                v_t_r1=v_t_r1, v_t_r2=v_t_r2, dv1=dv1, dv2=dv2,
                dv_total=dv_total, tof=tof)


def departure_dv(v_inf, mu_planet, r_p):
    """Delta-v from a circular parking orbit of radius r_p to a hyperbolic
    departure with excess speed v_inf. Same formula for arrival capture
    (run in reverse): dv = sqrt(v_inf^2 + 2*mu/r_p) - sqrt(mu/r_p)."""
    v_p = math.sqrt(v_inf ** 2 + 2 * mu_planet / r_p)
    v_circ = math.sqrt(mu_planet / r_p)
    return v_p - v_circ, v_p, v_circ


def C3(v_inf):
    return v_inf ** 2


def synodic_period(T1, T2):
    """T1 = inner (faster) body's orbital period, T2 = outer body's period, days in -> days out."""
    return 1.0 / abs(1.0 / T1 - 1.0 / T2)


def orbital_period(mu, a):
    return 2 * math.pi * math.sqrt(a ** 3 / mu)


def elliptical_capture_dv(v_inf, mu_planet, r_p, r_a):
    """Capture from a hyperbolic arrival (v_inf) directly onto a periapsis-r_p,
    apoapsis-r_a ellipse (instead of a circle). Burn at periapsis."""
    v_hyp_p = math.sqrt(v_inf ** 2 + 2 * mu_planet / r_p)
    a_ell = (r_p + r_a) / 2
    v_ell_p = math.sqrt(mu_planet * (2 / r_p - 1 / a_ell))
    return v_hyp_p - v_ell_p, v_hyp_p, v_ell_p


print("=" * 70)
print("1. SPHERE OF INFLUENCE  r_SOI = a * (m/M)^(2/5)")
print("=" * 70)
r_soi_earth = soi_radius(a_earth, m_earth, m_sun)
r_soi_mars = soi_radius(a_mars, m_mars, m_sun)
print(f"Earth SOI: {r_soi_earth:,.0f} km  ({r_soi_earth/1e6:.4f} x 1e6 km)  "
      f"[expect ~0.925e6 km]")
print(f"Mars  SOI: {r_soi_mars:,.0f} km  ({r_soi_mars/1e6:.4f} x 1e6 km)  "
      f"[expect ~0.577e6 km]")
print(f"Earth SOI in Earth radii (Re=6378 km): {r_soi_earth/6378:.1f} Re")
print(f"Mars  SOI in Mars  radii (Rm=3396 km): {r_soi_mars/3396:.1f} Rm")

print()
print("=" * 70)
print("2. EARTH-MARS HOHMANN TRANSFER (heliocentric, coplanar, circular-orbit approx)")
print("=" * 70)
hoh = hohmann_transfer(mu_sun, a_earth, a_mars)
tof_days = hoh["tof"] / 86400
print(f"Transfer semi-major axis a_t = {hoh['a_t']:,.0f} km")
print(f"Earth circular heliocentric speed v_E = {hoh['v1_circ']:.4f} km/s")
print(f"Mars  circular heliocentric speed v_M = {hoh['v2_circ']:.4f} km/s")
print(f"Transfer orbit speed at Earth (perihelion) v_t1 = {hoh['v_t_r1']:.4f} km/s")
print(f"Transfer orbit speed at Mars  (aphelion)   v_t2 = {hoh['v_t_r2']:.4f} km/s")
print(f"Heliocentric departure v_inf (= v_t1 - v_E) = {hoh['v_t_r1']-hoh['v1_circ']:.4f} km/s "
      f"[expect ~2.94 km/s]")
print(f"Heliocentric arrival   v_inf (= v_M - v_t2) = {hoh['v2_circ']-hoh['v_t_r2']:.4f} km/s "
      f"[expect ~2.65 km/s]")
print(f"Heliocentric dv1 (Earth) = {hoh['dv1']:.4f} km/s")
print(f"Heliocentric dv2 (Mars)  = {hoh['dv2']:.4f} km/s")
print(f"Heliocentric total dv   = {hoh['dv_total']:.4f} km/s  (NOT what you launch with -- "
      f"this is Sun-centered dv assuming the spacecraft is already in solar orbit)")
print(f"Time of flight = {hoh['tof']:.0f} s = {tof_days:.1f} days "
      f"({tof_days/30.44:.2f} months)  [expect ~259 days]")

v_inf_dep = hoh['v_t_r1'] - hoh['v1_circ']
v_inf_arr = hoh['v2_circ'] - hoh['v_t_r2']

print()
print("=" * 70)
print("3. DEPARTURE FROM A 300 KM CIRCULAR LEO PARKING ORBIT")
print("   dv = sqrt(v_inf^2 + 2*mu/rp) - sqrt(mu/rp)")
print("=" * 70)
r_earth = 6378.0
rp_leo = r_earth + 300
dv_dep, v_hyp_p, v_circ_leo = departure_dv(v_inf_dep, mu_earth, rp_leo)
print(f"Parking orbit radius rp = {rp_leo:.0f} km")
print(f"Circular LEO speed v_circ = {v_circ_leo:.4f} km/s")
print(f"Hyperbolic periapsis speed v_p (needed) = {v_hyp_p:.4f} km/s")
print(f"C3 = v_inf^2 = {C3(v_inf_dep):.4f} km^2/s^2")
print(f"Departure delta-v from 300 km LEO = {dv_dep:.4f} km/s  [expect ~3.6 km/s]")

print()
print("=" * 70)
print("4. ARRIVAL / CAPTURE AT MARS")
print("=" * 70)
r_mars = 3396.0
rp_circ500 = r_mars + 500
dv_cap_circ, v_hyp_p_m, v_circ_500 = departure_dv(v_inf_arr, mu_mars, rp_circ500)
print(f"Arrival v_inf (heliocentric excess speed relative to Mars) = {v_inf_arr:.4f} km/s")
print(f"C3 at arrival (informal use of the term; strictly C3 is a departure concept) "
      f"= {C3(v_inf_arr):.4f} km^2/s^2")
print(f"-- Capture into 500 km circular Mars orbit --")
print(f"   rp = {rp_circ500:.0f} km, v_circ = {v_circ_500:.4f} km/s, "
      f"v_hyperbolic_periapsis = {v_hyp_p_m:.4f} km/s")
print(f"   Capture delta-v (circular) = {dv_cap_circ:.4f} km/s")

# highly elliptical capture orbit example: periapsis 500 km alt, apoapsis ~ Mars SOI-scale
# use a common "highly elliptical Mars orbit" e.g. apoapsis at 33,000 km altitude (~ Phobos-ish region)
ra_ell = r_mars + 33000.0
dv_cap_ell, v_hyp_p_e, v_ell_p = elliptical_capture_dv(v_inf_arr, mu_mars, rp_circ500, ra_ell)
period_ell = orbital_period(mu_mars, (rp_circ500 + ra_ell) / 2)
print(f"-- Capture into highly elliptical orbit (rp=500 km alt, ra=33,000 km alt) --")
print(f"   a_ellipse = {(rp_circ500+ra_ell)/2:,.0f} km, period = {period_ell/3600:.2f} h")
print(f"   v_ellipse_periapsis = {v_ell_p:.4f} km/s")
print(f"   Capture delta-v (elliptical) = {dv_cap_ell:.4f} km/s")
print(f"   Savings vs circular capture = {dv_cap_circ - dv_cap_ell:.4f} km/s "
      f"({100*(dv_cap_circ-dv_cap_ell)/dv_cap_circ:.1f}% less)")

print()
print("=" * 70)
print("5. THE 'V-INFINITY SUM' SHORTCUT vs. FULL PATCHED-CONIC TOTAL")
print("=" * 70)
print("Shortcut some tools/porkchops report: total mission dv ~= v_inf_dep + v_inf_arr")
print(f"  v_inf_dep + v_inf_arr = {v_inf_dep + v_inf_arr:.4f} km/s")
print("This number is USEFUL for ranking/comparing launch windows (monotonic in")
print("the real cost for fixed parking-orbit radii) but it is NOT a delta-v budget:")
print(f"  actual departure burn from 300 km LEO = {dv_dep:.4f} km/s (uses sqrt, not linear in v_inf)")
print(f"  actual capture burn to 500 km circular Mars orbit = {dv_cap_circ:.4f} km/s")
print(f"  actual total (LEO depart + Mars circular capture) = {dv_dep+dv_cap_circ:.4f} km/s")
print("It hides: the parking-orbit radius / planet mu dependence (Oberth benefit),")
print("that dv is NOT linear in v_inf (sqrt(v_inf^2+2mu/rp) - sqrt(mu/rp) is concave-ish,")
print("not v_inf itself), whether capture is circular vs elliptical vs a flyby (no")
print("capture burn at all), and any plane-change cost between the two orbital planes.")

print()
print("=" * 70)
print("6. LEO -> GEO HOHMANN (anchor number)")
print("=" * 70)
for leo_alt in (300, 200):
    r1 = r_earth + leo_alt
    r_geo = 42164.0  # km, GEO radius
    h = hohmann_transfer(mu_earth, r1, r_geo)
    print(f"LEO alt={leo_alt} km: v1_circ={h['v1_circ']:.4f}, v_t_r1={h['v_t_r1']:.4f}, "
          f"dv1={h['dv1']:.4f} km/s; v_t_r2={h['v_t_r2']:.4f}, v2_circ(GEO)={h['v2_circ']:.4f}, "
          f"dv2={h['dv2']:.4f} km/s")
    print(f"  Total Hohmann LEO({leo_alt})->GEO delta-v = {h['dv_total']:.4f} km/s, "
          f"TOF = {h['tof']/3600:.2f} h")

print()
print("=" * 70)
print("7. SYNODIC PERIODS  T_syn = 1 / |1/T1 - 1/T2|")
print("=" * 70)
T_earth = orbital_period(mu_sun, a_earth) / 86400
T_mars = orbital_period(mu_sun, a_mars) / 86400
a_venus = 1.082e8
mu_placeholder = mu_sun
T_venus = orbital_period(mu_sun, a_venus) / 86400
a_jupiter = 7.785e8
T_jupiter = orbital_period(mu_sun, a_jupiter) / 86400

print(f"T_Earth   = {T_earth:.2f} days")
print(f"T_Mars    = {T_mars:.2f} days")
print(f"T_Venus   = {T_venus:.2f} days")
print(f"T_Jupiter = {T_jupiter:.2f} days")
print()
print(f"Synodic Earth-Mars    = {synodic_period(T_earth, T_mars):.1f} days  [expect ~780 d]")
print(f"Synodic Earth-Venus   = {synodic_period(T_earth, T_venus):.1f} days  [expect ~584 d]")
print(f"Synodic Earth-Jupiter = {synodic_period(T_earth, T_jupiter):.1f} days  [expect ~399 d]")
