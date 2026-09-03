"""T2.3 extra numbers: frame bias (ICRS vs J2000), nutation size, TEME-vs-GCRS offset vs date,
the size of the 'jump' Cesium would show if an INERTIAL entity were first rendered through the
TEME->pseudo-fixed fallback and then through the true ICRF->fixed matrix, and pixel-scale checks.
Run: PYTHONIOENCODING=utf-8 <venv>/python.exe t2_3_frames_extra.py
"""
import math
import numpy as np
from skyfield.api import load
from skyfield.framelib import ICRS_to_J2000, itrs
from skyfield.sgp4lib import TEME, theta_GMST1982

ts = load.timescale()

def rot_angle_arcsec(M):
    c = (np.trace(M) - 1) / 2
    return math.degrees(math.acos(max(-1.0, min(1.0, c)))) * 3600

# 1. Frame bias between ICRS/GCRS axes and the FK5 J2000 mean equator/equinox axes
B = np.array(ICRS_to_J2000)
print("== Frame bias ICRS -> J2000 (skyfield.framelib.ICRS_to_J2000) ==")
print("rotation angle = %.2f mas" % (rot_angle_arcsec(B) * 1000))
print("matrix:\n", np.array2string(B, precision=12))
print("-> at GEO (42164 km) this bias moves a point by %.2f m; at LEO %.2f m" % (42164e3 * math.radians(rot_angle_arcsec(B) / 3600), 6790e3 * math.radians(rot_angle_arcsec(B) / 3600)))

# 2. Precession-only, nutation-only and total (bias+precession+nutation) angles at 2026-09-01
#    (separate Time objects: skyfield caches P/N/M lazily and mixing the accessors trips a reify bug)
args = (2026, 9, 1, 11, 57, 51)
tM = ts.utc(*args)
M = tM.M   # full GCRS -> true equator & equinox of date (bias included)
tP = ts.utc(*args)
P = tP.P   # precession matrix J2000 -> mean of date
tN = ts.utc(*args)
N = tN.N   # nutation matrix mean of date -> true of date
t = ts.utc(*args)
print("\n== At %s ==" % t.utc_iso())
print("precession J2000->mean-of-date rotation angle: %.1f arcsec = %.4f deg" % (rot_angle_arcsec(P), rot_angle_arcsec(P) / 3600))
print("nutation mean-of-date->true-of-date angle    : %.2f arcsec" % rot_angle_arcsec(N))
print("full GCRS->true-of-date (t.M) angle          : %.1f arcsec = %.4f deg" % (rot_angle_arcsec(M), rot_angle_arcsec(M) / 3600))
R_teme = TEME.rotation_at(t)
print("GCRS->TEME rotation angle (TEME.rotation_at) : %.1f arcsec = %.4f deg" % (rot_angle_arcsec(R_teme), rot_angle_arcsec(R_teme) / 3600))
eqeq_rad = (t.gast - t.gmst) * 2 * math.pi / 24
print("equation of the equinoxes GAST-GMST          : %.3f arcsec (= %.1f m at LEO, %.1f m at GEO)" % (math.degrees(eqeq_rad) * 3600, abs(eqeq_rad) * 6790e3, abs(eqeq_rad) * 42164e3))

# 3. The 'ICRF data loaded' jump: Cesium's PositionProperty.convertToReferenceFrame uses
#    computeIcrfToCentralBodyFixedMatrix, which falls back to computeTemeToPseudoFixedMatrix until the IAU2006
#    XYS data is loaded. So an INERTIAL entity is first drawn with Rz(GMST) and later with the full IAU matrix.
R_itrs = itrs.rotation_at(t)                 # GCRS -> ITRS
theta, _ = theta_GMST1982(t.whole, t.ut1_fraction)
c, s = math.cos(theta), math.sin(theta)
Rz = np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])   # TEME -> PEF (eciToEcf convention)
r_icrf = np.array([42164.0, 0.0, 0.0])              # a GEO-radius point given in the INERTIAL frame, km
r_fixed_true = R_itrs @ r_icrf                       # correct ICRF -> ITRS
r_fixed_fallback = Rz @ r_icrf                       # fallback: treats the ICRF vector as TEME
print("\n== Cesium INERTIAL-entity fallback jump (GEO-radius vector, km) ==")
print("ICRF -> fixed via full IAU (itrs.rotation_at):", np.round(r_fixed_true, 3))
print("ICRF -> fixed via TEME/GMST fallback         :", np.round(r_fixed_fallback, 3))
print("|difference| = %.1f km  (angle %.4f deg)" % (np.linalg.norm(r_fixed_true - r_fixed_fallback), math.degrees(math.acos(np.dot(r_fixed_true, r_fixed_fallback) / np.linalg.norm(r_fixed_true) ** 2))))

# 4. Is the TEME<->GCRS offset a function of TLE age? No: it is a function of the calendar date.
print("\n== GCRS->TEME angle by calendar year (independent of any TLE) ==")
for y in [2000, 2010, 2020, 2026, 2030, 2050]:
    ty = ts.utc(y, 9, 1)
    a = rot_angle_arcsec(TEME.rotation_at(ty))
    print("  %d-09-01: %.1f arcsec = %.4f deg  -> %.1f km at LEO, %.1f km at GEO" % (y, a, a / 3600, 6790 * math.radians(a / 3600), 42164 * math.radians(a / 3600)))

# 5. How big is polar motion today (what PEF ignores)?
try:
    sprime, xp, yp = t.polar_motion_angles()
    print("\n== Polar motion at date (IERS finals via skyfield) ==")
    print("xp = %.3f arcsec, yp = %.3f arcsec -> ground displacement ~%.1f m" % (math.degrees(xp) * 3600, math.degrees(yp) * 3600, 6371e3 * math.hypot(xp, yp)))
except Exception as exc:  # noqa: BLE001
    print("polar motion not available:", exc)

# 6. Pixel-scale checks: what is 'visually truthful' on a globe?
print("\n== Pixel scale ==")
globe_km_per_px = 12742.0 / 800.0     # whole Earth filling ~800 px
track_km_per_px = 2000.0 / 1200.0     # tracking a LEO satellite, ~2000 km across a 1200 px view
for label, err_km in [("TEME->PEF via GMST vs full ITRS (LEO)", 0.047), ("UT1 vs UTC in GMST (LEO)", 0.047),
                      ("equation of equinoxes (LEO)", 0.273), ("TEME treated as GCRF, LEO", 40.7),
                      ("TEME treated as GCRF, GEO", 274.0), ("GMST skipped (TEME as ECEF), LEO", 13394.0)]:
    print("  %-42s %9.3f km = %7.2f px globe view, %8.2f px tracking view" % (label, err_km, err_km / globe_km_per_px, err_km / track_km_per_px))
