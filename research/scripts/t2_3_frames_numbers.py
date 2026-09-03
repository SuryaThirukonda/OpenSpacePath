"""T2.3 frames: quantify TEME vs GCRF(J2000) vs ECEF for the fresh ISS TLE (epoch 2026-09-01).
Run: <venv>/python.exe t2_3_frames_numbers.py   (set PYTHONIOENCODING=utf-8 on Windows)
"""
import math
import numpy as np
from sgp4.api import Satrec, WGS72, WGS84
from skyfield.api import load, EarthSatellite, wgs84
from skyfield.framelib import itrs
from skyfield.sgp4lib import TEME

SP = r"C:/Users/thiru/AppData/Local/Temp/claude/C--Users-thiru-tamu2-ecs-research-rathinam/5b6188bd-1182-4842-a6a3-cb49230254ab/scratchpad"
lines = open(SP + "/iss_tle.txt").read().strip().splitlines()
name, l1, l2 = lines[0], lines[1], lines[2]
print("TLE:", name)
print(l1)
print(l2)

ts = load.timescale()
sat = EarthSatellite(l1, l2, name, ts)
t_epoch = sat.epoch
dut1 = float(t_epoch.dut1)          # UT1 - UTC, seconds
jd_utc_full = t_epoch.ut1 - dut1 / 86400.0
print("\nTLE epoch (UTC):", t_epoch.utc_iso())
print("JD(UTC) = %.8f   JD(UT1) = %.8f   DUT1 = UT1-UTC = %.4f s   delta_T = TT-UT1 = %.3f s"
      % (jd_utc_full, t_epoch.ut1, dut1, float(t_epoch.delta_t)))

# ---- 1. Precession since J2000 (back-of-envelope) ----
years_since_j2000 = (t_epoch.tt - 2451545.0) / 365.25
p_rate_arcsec_per_yr = 5028.796195 / 100.0   # IAU 2006 general precession in longitude, arcsec/Julian yr
prec_arcsec = p_rate_arcsec_per_yr * years_since_j2000
prec_deg = prec_arcsec / 3600
print("\n== Precession since J2000 (back of envelope) ==")
print("Julian years since J2000.0 (TT): %.3f" % years_since_j2000)
print("rate %.3f arcsec/yr  ->  accumulated %.1f arcsec = %.4f deg = %.6f rad" % (p_rate_arcsec_per_yr, prec_arcsec, prec_deg, math.radians(prec_deg)))
for label, r_km in [("LEO r=6790 km", 6790.0), ("GEO r=42164 km", 42164.0)]:
    print("  chord displacement at %s: %.1f km" % (label, r_km * math.radians(prec_deg)))

# ---- 2. Exact rotation angle TEME <-> GCRS from Skyfield at the epoch ----
R = TEME.rotation_at(t_epoch)           # rotates GCRS(ICRF) vectors into TEME
ang = math.acos(max(-1.0, min(1.0, (np.trace(R) - 1) / 2)))
print("\n== Skyfield TEME.rotation_at(epoch): rotation angle between GCRS and TEME axes ==")
print("angle = %.1f arcsec = %.4f deg" % (math.degrees(ang) * 3600, math.degrees(ang)))
w = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
w = w / np.linalg.norm(w)
print("rotation axis (GCRS coords):", np.round(w, 4), " (ecliptic pole is (0, -0.398, 0.917): precession about it)")

# ---- 3. Positions of the ISS at epoch in every frame ----
satrec = Satrec.twoline2rv(l1, l2, WGS72)
jd_utc = math.floor(jd_utc_full)
fr_utc = jd_utc_full - jd_utc
e, r_teme, v_teme = satrec.sgp4(jd_utc, fr_utc)
r_teme = np.array(r_teme)
v_teme = np.array(v_teme)
print("\n== ISS at TLE epoch ==")
print("sgp4 error code:", e)
print("r_TEME (km) [python-sgp4]:", np.round(r_teme, 3), " |r| = %.3f km (%.1f km above R=6371)" % (np.linalg.norm(r_teme), np.linalg.norm(r_teme) - 6371))
print("v_TEME (km/s):", np.round(v_teme, 5), " |v| = %.4f km/s" % np.linalg.norm(v_teme))

geo = sat.at(t_epoch)
r_gcrs = geo.position.km
r_teme_sf = geo.frame_xyz(TEME).km
r_itrs = geo.frame_xyz(itrs).km
print("r_GCRS/ICRF (km) [skyfield sat.at(t).position]:", np.round(r_gcrs, 3))
print("r_TEME  (km) [skyfield frame_xyz(TEME)]     :", np.round(r_teme_sf, 3), " |diff vs raw sgp4| = %.4f km (skyfield feeds UT1 to sgp4)" % np.linalg.norm(r_teme_sf - r_teme))
print("r_ITRS  (km) [skyfield frame_xyz(itrs)]     :", np.round(r_itrs, 3))

d_bug = np.linalg.norm(r_gcrs - r_teme_sf)
cosang = np.dot(r_gcrs, r_teme_sf) / np.linalg.norm(r_gcrs) / np.linalg.norm(r_teme_sf)
print("\n** BUG A: treat TEME as if it were GCRF/J2000 (raw SGP4 xyz into Cesium ReferenceFrame.INERTIAL) **")
print("   |r_GCRS - r_TEME| = %.3f km  (angular error %.4f deg = %.0f arcsec)" % (d_bug, math.degrees(math.acos(cosang)), math.degrees(math.acos(cosang)) * 3600))

# ---- 4. GMST formulas: Vallado/satellite.js vs Cesium ----
def gstime_vallado(jd_ut1):
    tut1 = (jd_ut1 - 2451545.0) / 36525.0
    temp = -6.2e-6 * tut1 ** 3 + 0.093104 * tut1 ** 2 + (876600.0 * 3600 + 8640184.812866) * tut1 + 67310.54841  # seconds
    return (temp * math.pi / 180 / 240.0) % (2 * math.pi)   # 1/240 deg per second

def gha_cesium(jd_utc_float):
    """Replicates Cesium Transforms.computeTemeToPseudoFixedMatrix (constants from Transforms.js)."""
    C0 = 6 * 3600 + 41 * 60 + 50.54841
    C1 = 8640184.812866
    C2 = 0.093104
    C3 = -6.2e-6
    RATE_COEF = 1.1772758384668e-19
    WR = 7.2921158553e-5
    dayNumber = math.floor(jd_utc_float)                 # Cesium JulianDate.dayNumber (day starts at noon)
    secondsOfDay = (jd_utc_float - dayNumber) * 86400.0  # Cesium JulianDate.secondsOfDay
    centuries = (dayNumber - 2451545 + (0.5 if secondsOfDay >= 43200 else -0.5)) / 36525
    gmstSeconds = C0 + centuries * (C1 + centuries * (C2 + centuries * C3))
    angleAt0h = (gmstSeconds * 2 * math.pi / 86400) % (2 * math.pi)
    rotationRate = WR + RATE_COEF * (dayNumber - 2451544.5)
    secondsSinceMidnight = (secondsOfDay + 43200) % 86400
    return (angleAt0h + rotationRate * secondsSinceMidnight) % (2 * math.pi)

g_v = gstime_vallado(jd_utc_full)        # satellite.js gstime(date) feeds UTC (treats UT1 == UTC)
g_c = gha_cesium(jd_utc_full)
g_v_ut1 = gstime_vallado(t_epoch.ut1)
print("\n== GMST at epoch ==")
print("satellite.js gstime(UTC as UT1)  : %.9f rad = %.6f deg" % (g_v, math.degrees(g_v)))
print("Cesium TEME->pseudo-fixed angle  : %.9f rad = %.6f deg" % (g_c, math.degrees(g_c)))
dg = (g_v - g_c + math.pi) % (2 * math.pi) - math.pi
print("difference satellite.js - Cesium : %.3e rad -> %.2f cm at LEO(6790 km), %.2f cm at GEO(42164 km)" % (dg, dg * 6790e5, dg * 42164e5))
print("GMST with true UT1 instead of UTC: %.9f rad; UT1-vs-UTC shift = %.3e rad = %.1f m at LEO (DUT1=%.3f s)"
      % (g_v_ut1, g_v_ut1 - g_v, abs(g_v_ut1 - g_v) * 6790e3, dut1))
print("Skyfield t.gmst (hours->rad)     : %.9f rad" % (t_epoch.gmst * 2 * math.pi / 24))
print("Skyfield t.gast (hours->rad)     : %.9f rad   (GAST-GMST = equation of equinoxes = %.3e rad = %.1f m at LEO)"
      % (t_epoch.gast * 2 * math.pi / 24, (t_epoch.gast - t_epoch.gmst) * 2 * math.pi / 24, abs(t_epoch.gast - t_epoch.gmst) * 2 * math.pi / 24 * 6790e3))

def Rz_eci_to_ecf(th):
    c, s = math.cos(th), math.sin(th)
    return np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])   # satellite.js eciToEcf: x' = x c + y s ; y' = -x s + y c

r_pef = Rz_eci_to_ecf(g_v) @ r_teme
print("\n== TEME -> PEF via Rz(GMST) (satellite.js eciToEcf / Cesium computeTemeToPseudoFixedMatrix) ==")
print("r_PEF (km):", np.round(r_pef, 3))
print("|r_PEF - r_ITRS(skyfield, full IAU 2006/2000A + polar motion + UT1)| = %.1f m" % (np.linalg.norm(r_pef - r_itrs) * 1000))

# ---- 5. BUG B: treat TEME (no rotation) as ECEF ----
d_bugB = np.linalg.norm(r_teme - r_itrs)
print("\n** BUG B: raw TEME xyz straight into Cesium FIXED frame (GMST rotation skipped) **")
print("   |r_TEME - r_ITRS| = %.1f km at epoch (GMST = %.1f deg); the error sweeps 360 deg per sidereal day" % (d_bugB, math.degrees(g_v)))

# ---- 6. BUG C: rotate a GCRS/J2000 vector by plain GMST ----
r_wrong = Rz_eci_to_ecf(g_v) @ r_gcrs
print("\n** BUG C: rotate a true GCRS/J2000 vector by plain GMST (skipping precession/nutation) **")
print("   |Rz(GMST) r_GCRS - r_ITRS| = %.1f km" % np.linalg.norm(r_wrong - r_itrs))

# ---- 7. Geodetic subpoint the right way vs from the buggy vectors ----
sp_ok = wgs84.subpoint_of(geo)
print("\n== Subpoint (skyfield: GCRS -> ITRS -> WGS84 geodetic) ==")
print("lat %.4f deg, lon %.4f deg, height %.2f km" % (sp_ok.latitude.degrees, sp_ok.longitude.degrees, wgs84.height_of(geo).km))

def ecef_to_geodetic(r):
    a = 6378.137
    f = 1 / 298.257223563
    e2 = f * (2 - f)
    x, y, z = r
    lon = math.atan2(y, x)
    p = math.hypot(x, y)
    lat = math.atan2(z, p * (1 - e2))
    for _ in range(10):
        N = a / math.sqrt(1 - e2 * math.sin(lat) ** 2)
        h = p / math.cos(lat) - N
        lat = math.atan2(z, p * (1 - e2 * N / (N + h)))
    N = a / math.sqrt(1 - e2 * math.sin(lat) ** 2)
    h = p / math.cos(lat) - N
    return math.degrees(lat), math.degrees(lon), h

print("Subpoint from PEF (Rz(GMST) TEME)      :", tuple(round(v, 4) for v in ecef_to_geodetic(r_pef)))
print("Subpoint if TEME wrongly used as ECEF   :", tuple(round(v, 4) for v in ecef_to_geodetic(r_teme)), " <- longitude off by GMST")

# ---- 8. WGS72 vs WGS84 constants inside SGP4 ----
s84 = Satrec.twoline2rv(l1, l2, WGS84)
e2_, r84, v84 = s84.sgp4(jd_utc, fr_utc)
print("\n== WGS72 vs WGS84 gravity constants in SGP4 (same TLE) ==")
print("|r_wgs72 - r_wgs84| = %.1f m at epoch" % (np.linalg.norm(r_teme - np.array(r84)) * 1000))
e3, r72d, _ = satrec.sgp4(jd_utc + 1, fr_utc)
e4, r84d, _ = s84.sgp4(jd_utc + 1, fr_utc)
print("|r_wgs72 - r_wgs84| = %.1f m one day after epoch" % (np.linalg.norm(np.array(r72d) - np.array(r84d)) * 1000))

# ---- 9. Ground-track shift per orbit (known-answer anchor) ----
n_rev_per_day = float(l2[52:63])
period_min = 1440.0 / n_rev_per_day
print("\n== Known-answer anchors ==")
print("mean motion %.8f rev/day -> period %.2f min; Earth rotates %.2f deg per orbit (360.9856 deg/day)" % (n_rev_per_day, period_min, 360.9856 * period_min / 1440))

# ---- 10. How fast does BUG A grow/shrink? (it is a fixed frame offset, not time growth) ----
print("\n== BUG A angular offset is a constant of the epoch, not of TLE age ==")
for yrs in [0, 10, 20, 26.67, 30]:
    print("  %5.2f yr after J2000 -> %.0f arcsec = %.3f deg -> %.1f km at LEO, %.1f km at GEO"
          % (yrs, p_rate_arcsec_per_yr * yrs, p_rate_arcsec_per_yr * yrs / 3600,
             6790 * math.radians(p_rate_arcsec_per_yr * yrs / 3600), 42164 * math.radians(p_rate_arcsec_per_yr * yrs / 3600)))
