"""T3.1 satvis teardown: reproduce the numbers satvis's design rests on, with the ISS TLE.
Run: venv/Scripts/python.exe notes/t3_1_satvis_numbers.py
"""
import math, re, pathlib
from sgp4.api import Satrec, jday, WGS72
import numpy as np

root = pathlib.Path(__file__).resolve().parents[1]
lines = [l for l in (root/"iss_tle.txt").read_text().splitlines() if l.strip()]
l1, l2 = [l for l in lines if l.startswith("1 ")][0], [l for l in lines if l.startswith("2 ")][0]
sat = Satrec.twoline2rv(l1, l2)
MU = 398600.4418  # km^3/s^2 (WGS-84 value; sgp4 uses WGS72 internally)

# 1. satvis Orbit.orbitalPeriod = 2*pi / satrec.no  (no in rad/min -> minutes)
period_min = 2*math.pi / sat.no_kozai            # Kozai mean motion (what gp.ts approximatePeriodMinutes reads off the TLE)
MU72 = 398600.8; a72 = sat.a*6378.135; period_min_unkozai = 2*math.pi*math.sqrt(a72**3/MU72)/60  # from SGP4-recovered semi-major axis (satrec.a, WGS72 units)
print(f"ISS TLE epoch JD {sat.jdsatepoch + sat.jdsatepochF:.5f}")
print(f"ISS period from Kozai mean motion   : {period_min:.4f} min")
print(f"ISS period from recovered mean motion: {period_min_unkozai:.4f} min  (diff {abs(period_min-period_min_unkozai)*60:.2f} s; satvis measured 0.96 s median)")

# 2. satvis sample grid: SAMPLES_PER_ORBIT samples per revolution; window = 0.5 orbit back, 1.5 forward
SAMPLES_PER_ORBIT = 120
step_s = period_min_unkozai*60/SAMPLES_PER_ORBIT
window_orbits = 0.5 + 1.5
n_samples = int(window_orbits*SAMPLES_PER_ORBIT) + 1
print(f"grid step for ISS: {step_s:.2f} s ; window {window_orbits} orbits -> {n_samples} samples (satvis quotes 241 and ~45 s)")
# LEO speed: how far the satellite moves per grid step (visual bound on sampling coarseness)
a_km = sat.a * 6378.135
v = math.sqrt(MU/a_km)
print(f"ISS a = {a_km:.1f} km, circular speed {v:.3f} km/s, ground-speed-ish per step: {v*step_s:.0f} km per sample (satvis: 'about 45 s, some 350 km')")

# 3. Memory: SampledPositionProperty 13.2 KB/sat vs grid 3 doubles/sample
grid_bytes = n_samples*3*8
print(f"grid storage per satellite = {n_samples}*3*8 = {grid_bytes} B = {grid_bytes/1024:.1f} KB (vs 13.2 KB measured for Cesium SampledPositionProperty; 5000 sats -> {5000*grid_bytes/1e6:.1f} MB vs 66 MB)")

# 4. Geometry refresh schedule: geometryRefreshSeconds(count) = clamp(count/100, 1, 10) and the stale-head error at 7.5 km/s
for n in (1, 74, 500, 1000, 5000, 12000):
    due = min(10, max(1, n/100))
    print(f"  active={n:5d}: re-cut every {due:4.1f} s -> head lag up to {7.5*due:5.1f} km")

# 5. Pass prediction cost: 8 ms SGP4 per sat per station x 5000 sats
print(f"pass prediction 5000 sats x 1 station x 8 ms = {5000*8/1000:.0f} s (why satvis has a separate pass worker)")

# 6. Orbit-class thresholds used by orbitClassOf (gp.ts): period<=128 min LEO, 1400..1470 GEO, e>0.25 HEO
def alt_for_period(T_min):
    T = T_min*60
    a = (MU*(T/(2*math.pi))**2)**(1/3)
    return a-6378.137
print(f"LEO upper bound 128 min  -> circular altitude {alt_for_period(128):.0f} km")
print(f"GEO band 1400..1470 min  -> altitude {alt_for_period(1400):.0f}..{alt_for_period(1470):.0f} km (nominal GEO 1436.07 min -> {alt_for_period(1436.07):.0f} km)")

# 7. Sun-synchronous test (orbitFacts.ts): Omega_dot = -1.5 J2 n (Re/a)^2 cos i /(1-e^2)^2 ; SSO when ~= 360/365.2422 deg/day
J2 = 1.08262998905e-3
def nodal_precession_deg_per_day(a_km, e, i_deg):
    n = math.sqrt(MU/a_km**3)  # rad/s
    return -1.5*J2*n*(6378.137/a_km)**2*math.cos(math.radians(i_deg))/(1-e*e)**2 * 180/math.pi*86400
sun = 360/365.2422
print(f"sun mean motion {sun:.4f} deg/day")
print(f"ISS (i={math.degrees(sat.inclo):.2f} deg): node rate {nodal_precession_deg_per_day(a_km, sat.ecco, math.degrees(sat.inclo)):+.3f} deg/day -> not SSO")
print(f"Sentinel-2 (786 km, i=98.62): node rate {nodal_precession_deg_per_day(6378.137+786, 0.0001, 98.62):+.4f} deg/day -> SSO within 0.05")

# 8. ECI position now vs. pseudo-fixed rotation: check rotation about Z leaves |r| and z unchanged (satvis's own accuracy check)
jd, fr = jday(2026, 9, 1, 12, 0, 0)
e, r, vv = sat.sgp4(jd, fr)
r = np.array(r)
gmst = (280.46061837 + 360.98564736629*((jd+fr)-2451545.0)) % 360
th = math.radians(gmst)
R = np.array([[math.cos(th), math.sin(th), 0],[-math.sin(th), math.cos(th), 0],[0,0,1]])
rf = R@r
print(f"TEME r = {r.round(1)} km, |r|={np.linalg.norm(r):.1f}; fixed r = {rf.round(1)}, |r|={np.linalg.norm(rf):.1f}, z equal: {abs(r[2]-rf[2])<1e-9}")
print(f"ISS altitude now ~ {np.linalg.norm(r)-6371:.0f} km")

# 9. Cesium default-view geometry from CesiumController.setDefaultView: height = R/sin(narrow/2*0.82) - R
fov = math.radians(60); R=6378137
for aspect in (16/9, 9/19.5):
    narrow = 2*math.atan(math.tan(fov/2)/aspect) if aspect>1 else 2*math.atan(math.tan(fov/2)*aspect)
    h = R/math.sin(narrow/2*0.82) - R
    print(f"aspect {aspect:.2f}: narrow fov {math.degrees(narrow):.1f} deg -> opening camera height {h/1e3:.0f} km")
