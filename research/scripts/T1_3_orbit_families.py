"""
T1.3 -- Orbit families: typical elements, periods, J2 secular rates, and
first-principles checks (elements -> ECI, Kepler's 2nd law).

Run:  <scratchpad>/venv/Scripts/python.exe notes/T1_3_orbit_families.py

Conventions (state them to the professor; conventions differ between texts):
  * Angles in code are radians; printed in degrees.
  * Classical elements (a, e, i, RAAN=Omega, argp=omega, true anomaly=theta).
  * Perifocal frame: x toward periapsis, z along angular momentum h.
  * Perifocal -> ECI is the 3-1-3 sequence: rotate by argp about z, then by i
    about the (new) x = node line, then by RAAN about z. As a matrix acting on
    perifocal column vectors:  Q = Rz(RAAN) @ Rx(i) @ Rz(argp)  with the
    *active* rotation matrices below (Curtis eq. 4.49 writes the same thing as
    the transpose of the passive DCM; the numbers are identical).
  * ECI x-axis = vernal equinox direction, z = Earth's spin axis (north).
  * J2 secular rates are the standard first-order averaged results
    (Vallado Sec. 9.x / Curtis Sec. 4.7 / Braeunig "Perturbations").
"""
import math
import numpy as np

# ---------------------------------------------------------------- constants
MU   = 398600.4418        # km^3/s^2  (Earth GM, WGS-84/EGM value; brief)
RE   = 6378.137           # km        (Earth equatorial radius, WGS-84)
J2   = 1.08263e-3         # -         (Earth oblateness coefficient; brief)
SIDEREAL_DAY = 86164.0905 # s         (one rotation of Earth wrt the stars)
TROPICAL_YEAR = 365.2422  # mean solar days (Sun returns to same RA)
OMEGA_E = 2*math.pi/SIDEREAL_DAY          # rad/s Earth spin rate
SUN_RATE = 2*math.pi/(TROPICAL_YEAR*86400) # rad/s mean motion of the Sun in RA
DEG = math.pi/180.0

# ---------------------------------------------------------------- basics
def period(a):            # Kepler III: T = 2*pi*sqrt(a^3/mu)
    return 2*math.pi*math.sqrt(a**3/MU)

def sma_from_period(T):   # inverse of Kepler III
    return (MU*(T/(2*math.pi))**2)**(1/3)

def mean_motion(a):       # n = sqrt(mu/a^3)  [rad/s]
    return math.sqrt(MU/a**3)

def vis_viva(r, a):       # v^2 = mu(2/r - 1/a)
    return math.sqrt(MU*(2/r - 1/a))

def raan_rate(a, e, i):
    """Secular nodal regression from J2 [rad/s].
    dOmega/dt = -(3/2) n J2 (RE/p)^2 cos(i),  p = a(1-e^2).
    Negative (westward) for prograde (i<90), positive for retrograde."""
    n = mean_motion(a); p = a*(1-e**2)
    return -1.5*n*J2*(RE/p)**2*math.cos(i)

def argp_rate(a, e, i):
    """Secular apsidal rotation from J2 [rad/s].
    domega/dt = (3/4) n J2 (RE/p)^2 (5 cos^2 i - 1)
    (identical to Wikipedia's (4 - 5 sin^2 i) form since sin^2 = 1 - cos^2).
    Zero at the critical inclinations cos^2 i = 1/5 -> i = 63.435 or 116.565 deg."""
    n = mean_motion(a); p = a*(1-e**2)
    return 0.75*n*J2*(RE/p)**2*(5*math.cos(i)**2 - 1)

def sun_sync_inclination(a, e=0.0):
    """Inclination that makes dOmega/dt = +360 deg / tropical year."""
    n = mean_motion(a); p = a*(1-e**2)
    cos_i = -SUN_RATE/(1.5*n*J2*(RE/p)**2)
    if abs(cos_i) > 1:
        return float('nan')
    return math.acos(cos_i)

def rad_s_to_deg_day(x):
    return x*86400/DEG

# ---------------------------------------------------------------- rotations
def Rz(t):
    c, s = math.cos(t), math.sin(t)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])

def Rx(t):
    c, s = math.cos(t), math.sin(t)
    return np.array([[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]])

def elements_to_eci(a, e, i, raan, argp, theta):
    """Return (r_vec, v_vec) in ECI [km, km/s] from classical elements (radians)."""
    p = a*(1-e**2)
    r = p/(1+e*math.cos(theta))                     # the professor's circled equation
    r_pf = np.array([r*math.cos(theta), r*math.sin(theta), 0.0])
    h = math.sqrt(MU*p)                             # specific angular momentum
    v_pf = (MU/h)*np.array([-math.sin(theta), e+math.cos(theta), 0.0])  # Curtis 4.39
    Q = Rz(raan) @ Rx(i) @ Rz(argp)                 # perifocal -> ECI (3-1-3)
    return Q @ r_pf, Q @ v_pf

def elements_to_eci_independent(a, e, i, raan, argp, theta):
    """Independent check that never builds a rotation matrix:
    r = r * (cos(u) n_hat + sin(u) m_hat), u = argp + theta (argument of latitude),
    n_hat = node-line unit vector, h_hat = orbit normal, m_hat = h_hat x n_hat."""
    p = a*(1-e**2)
    r = p/(1+e*math.cos(theta))
    u = argp + theta
    n_hat = np.array([math.cos(raan), math.sin(raan), 0.0])
    h_hat = np.array([math.sin(i)*math.sin(raan), -math.sin(i)*math.cos(raan), math.cos(i)])
    m_hat = np.cross(h_hat, n_hat)
    return r*(math.cos(u)*n_hat + math.sin(u)*m_hat)

def solve_kepler(M, e, tol=1e-12):
    E = M if e < 0.8 else math.pi
    for _ in range(50):
        d = (E - e*math.sin(E) - M)/(1 - e*math.cos(E))
        E -= d
        if abs(d) < tol:
            break
    return E

def true_anomaly_from_E(E, e):
    return 2*math.atan2(math.sqrt(1+e)*math.sin(E/2), math.sqrt(1-e)*math.cos(E/2))

# ---------------------------------------------------------------- 1. headline numbers
print("="*78)
print("1. HEADLINE NUMBERS (mu = %.4f km^3/s^2, RE = %.3f km, J2 = %.5e)" % (MU, RE, J2))
print("="*78)
r_geo = sma_from_period(SIDEREAL_DAY)
print(f"GEO radius from sidereal day {SIDEREAL_DAY} s:  r = (mu T^2/4pi^2)^(1/3) = {r_geo:.3f} km")
print(f"GEO altitude = r - RE = {r_geo-RE:.3f} km;  circular speed = sqrt(mu/r) = {math.sqrt(MU/r_geo):.4f} km/s")
print(f"Check: period of a = {r_geo:.1f} km -> {period(r_geo):.4f} s = {period(r_geo)/60:.3f} min = {period(r_geo)/3600:.4f} h")
print(f"Earth spin rate omega_E = {OMEGA_E:.6e} rad/s = {OMEGA_E/DEG*3600:.4f} deg/h")
print(f"Sun mean rate in RA = 360/{TROPICAL_YEAR} = {SUN_RATE/DEG*86400:.5f} deg/day = {SUN_RATE:.5e} rad/s")
print()

a_mol, e_mol, i_mol = 26600.0, 0.74, 63.4*DEG
rp, ra = a_mol*(1-e_mol), a_mol*(1+e_mol)
print(f"Molniya a={a_mol} km, e={e_mol}:  r_p = a(1-e) = {rp:.1f} km (alt {rp-RE:.1f} km),"
      f"  r_a = a(1+e) = {ra:.1f} km (alt {ra-RE:.1f} km)")
print(f"        period = {period(a_mol):.1f} s = {period(a_mol)/60:.2f} min = {period(a_mol)/3600:.4f} h"
      f"  (half a sidereal day = {SIDEREAL_DAY/2/60:.2f} min)")
print(f"        v_p = {vis_viva(rp,a_mol):.3f} km/s,  v_a = {vis_viva(ra,a_mol):.3f} km/s,  ratio v_p/v_a = (1+e)/(1-e) = {(1+e_mol)/(1-e_mol):.3f}")
print(f"        argp rate at i=63.4 deg: {rad_s_to_deg_day(argp_rate(a_mol,e_mol,i_mol)):+.5f} deg/day  (5cos^2 i - 1 = {5*math.cos(i_mol)**2-1:+.5f})")
i_crit = math.acos(math.sqrt(1/5))
print(f"        exact critical inclination: acos(sqrt(1/5)) = {i_crit/DEG:.4f} deg  (and 180 - that = {180-i_crit/DEG:.4f} deg)")
print(f"        for contrast, argp rate of the same Molniya ellipse at i = 51.6 deg: {rad_s_to_deg_day(argp_rate(a_mol,e_mol,51.6*DEG)):+.4f} deg/day;  at i = 0: {rad_s_to_deg_day(argp_rate(a_mol,e_mol,0.0)):+.4f} deg/day")
print(f"        RAAN rate for Molniya (i=63.4): {rad_s_to_deg_day(raan_rate(a_mol,e_mol,i_mol)):+.4f} deg/day")
print()

a_sso = RE + 700.0
i_sso = sun_sync_inclination(a_sso)
print(f"Sun-synchronous 700 km circular: a = {a_sso:.3f} km, period = {period(a_sso)/60:.3f} min")
print(f"        required dOmega/dt = +{SUN_RATE/DEG*86400:.5f} deg/day  ->  cos i = {math.cos(i_sso):+.5f}  ->  i = {i_sso/DEG:.3f} deg")
print(f"        check: raan_rate(a, 0, i) = {rad_s_to_deg_day(raan_rate(a_sso,0,i_sso)):+.5f} deg/day")
print("        table of SSO inclination vs altitude (circular):")
for alt in (274, 400, 500, 567, 600, 700, 800, 900, 1000, 1500, 1681, 2000, 3000, 5000, 5974):
    ii = sun_sync_inclination(RE+alt)
    print(f"          {alt:5d} km  ->  i = {ii/DEG:7.3f} deg   T = {period(RE+alt)/60:6.2f} min")
# Wikipedia's closed form: cos i = -(a/12352 km)^(7/2)
print(f"        Wikipedia closed form at 700 km: cos i = -(a/12352)^(3.5) = {-(a_sso/12352.0)**3.5:+.5f} -> i = {math.acos(-(a_sso/12352.0)**3.5)/DEG:.3f} deg")
print()

# ---------------------------------------------------------------- 2. orbit family table
print("="*78)
print("2. ORBIT FAMILY TABLE")
print("="*78)
# ISS from the fresh TLE (epoch 2026-09-01): n = 15.48958602 rev/day, e = 0.0005055, i = 51.6312
n_iss = 15.48958602*2*math.pi/86400.0
a_iss = (MU/n_iss**2)**(1/3)
families = [
    # name,                a [km],   e,        i [deg], argp [deg] or None
    ("ISS-class LEO (TLE 2026-09-01)", a_iss, 0.0005055, 51.6312, 96.474),
    ("GPS MEO (semi-synchronous)", sma_from_period(SIDEREAL_DAY/2), 0.0, 55.0, None),
    ("GEO", r_geo, 0.0, 0.0, None),
    ("Molniya", a_mol, e_mol, 63.4, 270.0),
    ("Sun-synchronous 700 km", a_sso, 0.0, i_sso/DEG, None),
]
hdr = f"{'orbit':32s} {'a [km]':>9s} {'e':>7s} {'i [deg]':>8s} {'h_p [km]':>9s} {'h_a [km]':>9s} {'T [min]':>8s} {'T [h]':>7s} {'rev/day':>8s} {'v_p':>6s} {'v_a':>6s} {'dRAAN/dt':>9s} {'dargp/dt':>9s} {'dLon/orbit':>10s}"
print(hdr)
print("-"*len(hdr))
rows = {}
for name, a, e, i_deg, argp_deg in families:
    i = i_deg*DEG
    T = period(a)
    rp_, ra_ = a*(1-e), a*(1+e)
    dO = raan_rate(a, e, i); dw = argp_rate(a, e, i)
    # westward longitude shift of the ground track per period (Earth spin minus node drift)
    dlon = -(OMEGA_E - dO)*T/DEG
    rows[name] = dict(a=a, e=e, i=i_deg, hp=rp_-RE, ha=ra_-RE, T=T, dO=rad_s_to_deg_day(dO), dw=rad_s_to_deg_day(dw), dlon=dlon)
    print(f"{name:32s} {a:9.1f} {e:7.4f} {i_deg:8.3f} {rp_-RE:9.1f} {ra_-RE:9.1f} {T/60:8.2f} {T/3600:7.3f} {86400/T:8.3f} "
          f"{vis_viva(rp_,a):6.3f} {vis_viva(ra_,a):6.3f} {rad_s_to_deg_day(dO):+9.4f} {rad_s_to_deg_day(dw):+9.4f} {dlon:+10.2f}")
print("units: v in km/s; dRAAN/dt and dargp/dt in deg/day (J2 secular); dLon/orbit = ground-track longitude shift per revolution in deg (negative = westward)")
print()
k_iss = 'ISS-class LEO (TLE 2026-09-01)'
print(f"ISS detail: TLE mean motion 15.48958602 rev/day -> n = {n_iss:.6e} rad/s -> a = (mu/n^2)^(1/3) = {a_iss:.2f} km -> mean alt {a_iss-RE:.1f} km")
print(f"            (TLE mean elements are Brouwer/Kozai means; osculating a differs by a few km -- fine for a table, not for propagation)")
print(f"            RAAN regression {rows[k_iss]['dO']:+.3f} deg/day -> one full turn of the plane every {360/abs(rows[k_iss]['dO']):.1f} days")
print()

# ---------------------------------------------------------------- 3. Q1: elements -> ECI by hand, then code
print("="*78)
print("3. Q1  ELEMENTS -> ECI: hand cases and code cross-check")
print("="*78)
np.set_printoptions(precision=3, suppress=True)
cases = [
    ("A equatorial circular, theta=90",  7000.0, 0.0, 0.0,  0.0,  0.0, 90.0),
    ("B equatorial circular, theta=30",  7000.0, 0.0, 0.0,  0.0,  0.0, 30.0),
    ("C inclined 30 deg, RAAN=0, theta=90", 7000.0, 0.0, 30.0, 0.0, 0.0, 90.0),
    ("D inclined 30, RAAN=90, theta=90", 7000.0, 0.0, 30.0, 90.0, 0.0, 90.0),
    ("E inclined 30, RAAN=90, argp=45, theta=45", 7000.0, 0.0, 30.0, 90.0, 45.0, 45.0),
    ("F ISS-like from TLE (theta~M)", a_iss, 0.0005055, 51.6312, 282.3953, 96.4740, 263.6824),
    ("G Molniya at apogee", a_mol, e_mol, 63.4, 0.0, 270.0, 180.0),
]
for name, a, e, i, O, w, th in cases:
    r_vec, v_vec = elements_to_eci(a, e, i*DEG, O*DEG, w*DEG, th*DEG)
    r_chk = elements_to_eci_independent(a, e, i*DEG, O*DEG, w*DEG, th*DEG)
    print(f"{name}")
    print(f"   r_ECI = {r_vec} km   |r| = {np.linalg.norm(r_vec):.3f} km   (independent n/m-hat method: {r_chk}, max diff {np.max(np.abs(r_vec-r_chk)):.2e} km)")
    print(f"   v_ECI = {v_vec} km/s  |v| = {np.linalg.norm(v_vec):.4f} km/s   vis-viva check {vis_viva(np.linalg.norm(r_vec), a):.4f} km/s;  r.v = {np.dot(r_vec, v_vec):+.3e} (0 at apses/circular)")
    # h vector should have inclination i and RAAN O
    hv = np.cross(r_vec, v_vec); hn = np.linalg.norm(hv)
    i_back = math.acos(hv[2]/hn)/DEG
    nvec = np.cross([0,0,1], hv)
    O_back = (math.atan2(nvec[1], nvec[0])/DEG) % 360 if np.linalg.norm(nvec) > 1e-9 else float('nan')
    print(f"   recovered from r,v: i = {i_back:.4f} deg, RAAN = {O_back:.4f} deg, |h| = {hn:.2f} km^2/s (sqrt(mu p) = {math.sqrt(MU*a*(1-e*e)):.2f})")
print()

# ---------------------------------------------------------------- 4. Q2: why theta is non-uniform
print("="*78)
print("4. Q2  MEAN vs TRUE ANOMALY (Kepler 2nd law numerically), e = 0.74 Molniya")
print("="*78)
T = period(a_mol); n = mean_motion(a_mol); p = a_mol*(1-e_mol**2); h = math.sqrt(MU*p)
ts = np.linspace(0, T, 200001)
Ms = n*ts
Es = np.array([solve_kepler(M % (2*math.pi), e_mol) for M in Ms])
ths = np.unwrap(np.array([true_anomaly_from_E(E, e_mol) for E in Es]))
rs = p/(1+e_mol*np.cos(ths))
dth = np.gradient(ths, ts)
print(f"h = sqrt(mu p) = {h:.3f} km^2/s; numerically r^2 dtheta/dt: min {np.min(rs**2*dth):.3f}, max {np.max(rs**2*dth):.3f}  (constant -> equal areas in equal times)")
print(f"dtheta/dt at perigee = h/rp^2 = {h/rp**2/DEG*60:.4f} deg/min;  at apogee = h/ra^2 = {h/ra**2/DEG*60:.4f} deg/min;  ratio = ((1+e)/(1-e))^2 = {((1+e_mol)/(1-e_mol))**2:.2f}")
print(f"mean motion n = {n/DEG*60:.4f} deg/min, uniform by definition (M = n t)")
for frac in (0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95):
    k = int(frac*(len(ts)-1))
    print(f"  t/T = {frac:4.2f}: M = {Ms[k]/DEG:7.2f} deg, E = {Es[k]/DEG:7.2f} deg, theta = {ths[k]/DEG:7.2f} deg, r = {rs[k]:8.1f} km")
mask = (ths > 90*DEG) & (ths < 270*DEG)
print(f"fraction of the period with |theta - 180| < 90 deg (the apogee half of the ellipse): {np.mean(mask):.3f}  -> {np.mean(mask)*T/3600:.2f} h of {T/3600:.2f} h")
mask2 = rs > a_mol
print(f"fraction of the period with r > a: {np.mean(mask2):.3f}")
# time from perigee to theta = 90 deg by Kepler's equation (closed form)
E90 = 2*math.atan(math.sqrt((1-e_mol)/(1+e_mol))*math.tan(45*DEG))
t90 = (E90 - e_mol*math.sin(E90))/n
print(f"closed form: theta=90 deg occurs at E = {E90/DEG:.3f} deg, M = {(E90 - e_mol*math.sin(E90))/DEG:.3f} deg, t = {t90/60:.2f} min after perigee (vs T/4 = {T/240:.2f} min)")
print()

# ---------------------------------------------------------------- 5. ground-track sanity anchors
print("="*78)
print("5. GROUND-TRACK ANCHORS")
print("="*78)
T_iss = rows[k_iss]['T']
print(f"ISS: Earth rotates {OMEGA_E*T_iss/DEG:.2f} deg during one ISS period ({T_iss/60:.2f} min); with J2 node drift the westward shift is {abs(rows[k_iss]['dlon']):.2f} deg/orbit")
print(f"     (master-doc anchor says ~22.5 deg; the arithmetic gives ~23.3-23.6 deg -- use 23.5 deg)")
print(f"ISS max ground-track latitude = inclination = 51.63 deg N/S")
print(f"GPS: period exactly half a sidereal day -> 2 orbits per sidereal day -> ground track repeats every sidereal day (4 min earlier each solar day)")
print(f"GEO: shift per orbit = {abs(rows['GEO']['dlon']):.4f} deg -> a fixed point on the equator (residual is the J2 node term, meaningless at i=0)")
print(f"Molniya: period {rows['Molniya']['T']/60:.2f} min vs half sidereal day {SIDEREAL_DAY/120:.2f} min -> 2 revs per day; ground track repeats daily, apogee alternates between two longitudes ~180 deg apart")
print(f"SSO: plane rotates {rows['Sun-synchronous 700 km']['dO']:+.4f} deg/day eastward = the Sun rate, so local solar time of the ascending node stays fixed")
print()

# ---------------------------------------------------------------- 6. verification against published numbers
print("="*78)
print("6. VERIFICATION AGAINST PUBLISHED NUMBERS (sources in the T1.3 notes)")
print("="*78)
checks = []
# Wikipedia 'Nodal precession': 800 km circular, i = 56 deg -> -7.44e-7 rad/s = -3.683 deg/day, period 6052.4 s
a800 = RE + 800.0
checks.append(("Wikipedia Nodal_precession example: period of 800 km circular [s]", period(a800), 6052.4))
checks.append(("Wikipedia Nodal_precession example: dRAAN/dt at 800 km, i=56 [rad/s]", raan_rate(a800, 0.0, 56*DEG), -7.44e-7))
checks.append(("Wikipedia Nodal_precession example: dRAAN/dt at 800 km, i=56 [deg/day]", rad_s_to_deg_day(raan_rate(a800, 0.0, 56*DEG)), -3.683))
# Wikipedia 'Sun-synchronous orbit' table: 274 km -> 96.6, 567 km -> 97.7, 1681 km -> 103.0, 800 km -> ~98.6/98.7
for alt, ref in ((274, 96.6), (567, 97.7), (800, 98.6), (1681, 103.0)):
    checks.append((f"Wikipedia SSO table: i at {alt} km [deg]", sun_sync_inclination(RE+alt)/DEG, ref))
# Wikipedia 'Geostationary orbit': altitude 35786 km, speed 3074.6 m/s
checks.append(("Wikipedia GEO altitude [km]", r_geo-RE, 35786.0))
checks.append(("Wikipedia GEO speed [km/s]", math.sqrt(MU/r_geo), 3.0746))
# Wikipedia 'Medium Earth orbit' / GPS: altitude ~20200 km, period 11 h 58 min
checks.append(("GPS altitude from half-sidereal-day period [km]", sma_from_period(SIDEREAL_DAY/2)-RE, 20200.0))
checks.append(("GPS period [min]", SIDEREAL_DAY/2/60, 11*60+58))
# Wikipedia 'Molniya orbit': period 718 min, perigee alt ~600 km, apogee alt ~39700 km for a=26600, e=0.74
checks.append(("Molniya period for a=26600 km [min]", period(a_mol)/60, 718.0))
checks.append(("Molniya apogee altitude [km]", ra-RE, 39700.0))
checks.append(("Molniya perigee altitude [km]", rp-RE, 600.0))
checks.append(("Molniya dRAAN/dt [deg/day] (Wikipedia text says -0.3; its own formula with a=26600,e=0.74 gives this)", rad_s_to_deg_day(raan_rate(a_mol, e_mol, i_mol)), -0.3))
# Wikipedia 'International Space Station': period 92.9 min, speed 7.67 km/s
checks.append(("ISS period from TLE mean motion [min]", period(a_iss)/60, 92.9))
checks.append(("ISS speed [km/s]", math.sqrt(MU/a_iss), 7.67))
# Braeunig 'Types of orbits': GEO altitude 35786 km; Molniya ~11 h above northern hemisphere per orbit
checks.append(("Braeunig: hours per orbit Molniya spends in apogee half (theta in 90..270) [h]", np.mean(mask)*T/3600, 11.0))
# Braeunig Problem 4.17: a=7500 km, i=28.5 deg, e=0.1 -> dRAAN/dt = -5.067 deg/day, dargp/dt = +8.250 deg/day
checks.append(("Braeunig Problem 4.17 dRAAN/dt [deg/day]", rad_s_to_deg_day(raan_rate(7500.0, 0.1, 28.5*DEG)), -5.067))
checks.append(("Braeunig Problem 4.17 dargp/dt [deg/day]", rad_s_to_deg_day(argp_rate(7500.0, 0.1, 28.5*DEG)), 8.250))
# Braeunig eq. 4.50 numeric constant: dRAAN/dt = -2.06474e14 a^(-7/2) cos i (1-e^2)^-2 [deg/day, a in km]
K_braeunig = 1.5*J2*RE**2*math.sqrt(MU)*86400/DEG
checks.append(("Braeunig eq. 4.50 constant 1.5 J2 RE^2 sqrt(mu) (86400 s/day)(180/pi) [deg km^3.5/day]", K_braeunig, 2.06474e14))
# Braeunig Problem 4.3: GEO radius from P = 86164.1 s with GM = 3.986005e14 -> 42,164,170 m
checks.append(("Braeunig Problem 4.3 GEO radius [km]", r_geo, 42164.170))
for label, got, ref in checks:
    rel = abs(got-ref)/abs(ref) if ref else float('nan')
    print(f"{'OK ' if rel < 0.02 else 'CHK'} {label}: computed {got:.6g} vs published {ref:.6g} (rel diff {rel*100:.2f}%)")
