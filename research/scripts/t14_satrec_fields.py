"""T1.4: every satrec field satvis's element panel could read, from the fresh ISS TLE.
python-sgp4's Satrec exposes the same fields satellite.js's SatRec does (same Vallado C++ lineage),
so this is a stand-in for satellite.js twoline2satrec + sgp4init.
"""
import math, sys
from sgp4.api import WGS72
from sgp4.model import Satrec   # pure-Python class: exposes no_unkozai as well as no_kozai, a, alta, altp
from sgp4 import exporter

TLE_PATH = r"C:/Users/thiru/AppData/Local/Temp/claude/C--Users-thiru-tamu2-ecs-research-rathinam/5b6188bd-1182-4842-a6a3-cb49230254ab/scratchpad/iss_tle.txt"
lines = [l.rstrip("\n") for l in open(TLE_PATH) if l.strip()]
name, l1, l2 = lines[0], lines[1], lines[2]
print("TLE:", name); print(l1); print(l2)

sat = Satrec.twoline2rv(l1, l2, WGS72)   # satellite.js also uses WGS72 constants
RAD2DEG = 180/math.pi
MIN_PER_DAY = 1440.0
RE_KM = 6378.135          # WGS72 equatorial radius used by SGP4 (satellite.js constants.earthRadius)
MU = 398600.8             # WGS72 mu km^3/s^2 (satellite.js constants.mu)
J2 = 0.001082616

print("\n=== raw TLE-column fields (what twoline2satrec stores) ===")
print(f"satnum          = {sat.satnum}")
print(f"epochyr/days    = {sat.epochyr} / {sat.epochdays:.8f}  (day-of-year, fraction)")
print(f"jdsatepoch      = {sat.jdsatepoch:.6f} + jdsatepochF {sat.jdsatepochF:.8f}  (Julian date, UTC)")
print(f"inclo           = {sat.inclo:.8f} rad  = {sat.inclo*RAD2DEG:.4f} deg   <- TLE col 9-16 line 2 (deg) * deg2rad")
print(f"nodeo (RAAN)    = {sat.nodeo:.8f} rad  = {sat.nodeo*RAD2DEG:.4f} deg   <- TLE col 18-25 line 2")
print(f"ecco            = {sat.ecco:.7f}          <- TLE col 27-33 line 2, implied leading '0.'")
print(f"argpo           = {sat.argpo:.8f} rad  = {sat.argpo*RAD2DEG:.4f} deg   <- TLE col 35-42 line 2")
print(f"mo (mean anom)  = {sat.mo:.8f} rad  = {sat.mo*RAD2DEG:.4f} deg   <- TLE col 44-51 line 2")
print(f"no_kozai        = {sat.no_kozai:.10f} rad/min = {sat.no_kozai*MIN_PER_DAY/(2*math.pi):.8f} rev/day  <- TLE col 53-63 line 2 (rev/day) * 2pi/1440")
print(f"bstar           = {sat.bstar:.6e} 1/earth-radii  <- TLE col 54-61 line 1 (79223-4 -> 0.79223e-4)")
print(f"ndot            = {sat.ndot:.6e} rad/min^2 (TLE col 34-43 line 1 is rev/day^2 /2: .00003910)")
print(f"nddot           = {sat.nddot:.6e}")

print("\n=== SGP4-recovered fields (computed in sgp4init/initl, NOT in the TLE) ===")
print(f"no_unkozai (satellite.js 'no') = {sat.no_unkozai:.10f} rad/min = {sat.no_unkozai*MIN_PER_DAY/(2*math.pi):.8f} rev/day")
print(f"a (semi-major axis, Brouwer)   = {sat.a:.8f} earth radii = {sat.a*RE_KM:.3f} km")
print(f"alta (apogee altitude)         = {sat.alta:.8f} ER = {sat.alta*RE_KM:.3f} km")
print(f"altp (perigee altitude)        = {sat.altp:.8f} ER = {sat.altp*RE_KM:.3f} km")

print("\n=== derived quantities, the way satvis computes them ===")
P_kozai = MIN_PER_DAY / (sat.no_kozai*MIN_PER_DAY/(2*math.pi))
P_unkozai = 2*math.pi / sat.no_unkozai
print(f"Period from Kozai mean motion (gp.ts approximatePeriodMinutes): 1440/n_revday = {P_kozai:.4f} min")
print(f"Period from recovered 'no' (Orbit.ts orbitalPeriod = 2pi/satrec.no): {P_unkozai:.4f} min")
print(f"Difference: {abs(P_kozai-P_unkozai)*60:.2f} s   (gp.ts comment says ~1 s typical)")
# check a against Kepler's third law with the recovered mean motion
n_rad_s = sat.no_unkozai/60.0
a_kepler = (MU / n_rad_s**2)**(1/3)
print(f"a from n_unkozai via Kepler III: (mu/n^2)^(1/3) = {a_kepler:.3f} km   vs satrec.a*RE = {sat.a*RE_KM:.3f} km (Brouwer a includes a J2 correction)")
a_kozai = (MU / (sat.no_kozai/60.0)**2)**(1/3)
print(f"a from n_kozai   via Kepler III:                = {a_kozai:.3f} km")
print(f"apogee  from a,e: a(1+e)-RE = {sat.a*RE_KM*(1+sat.ecco)-RE_KM:.3f} km  vs alta*RE = {sat.alta*RE_KM:.3f} km")
print(f"perigee from a,e: a(1-e)-RE = {sat.a*RE_KM*(1-sat.ecco)-RE_KM:.3f} km  vs altp*RE = {sat.altp*RE_KM:.3f} km")

# nodal precession (satvis orbitFacts.ts nodalPrecessionDegPerDay)
one_m_e2 = 1 - sat.ecco**2
rate_per_min = (-1.5 * J2 * sat.no_unkozai * math.cos(sat.inclo)) / (sat.a**2 * one_m_e2**2)
rate_deg_day = rate_per_min * RAD2DEG * MIN_PER_DAY
print(f"\nNodal precession dOmega/dt (satvis formula, a in ER so (Re/a)^2 = 1/a^2): {rate_deg_day:.4f} deg/day")
print(f"Sun's mean motion 360/365.2422 = {360/365.2422:.4f} deg/day -> ISS sun-synchronous? {abs(rate_deg_day-360/365.2422)<=0.05}")
print(f"Days for ISS node to regress 360 deg: {360/abs(rate_deg_day):.1f} d; drifts through all local times in ~{360/abs(rate_deg_day - 360/365.2422):.0f} d (satvis comment: ~2 months)")

# orbit class (gp.ts orbitClassOf)
n_revday = float(l2[52:63]); ecc = float("0."+l2[26:33].strip())
period_min = MIN_PER_DAY/n_revday
cls = "HEO" if ecc>0.25 else ("LEO" if period_min<=128 else ("GEO" if 1400<=period_min<=1470 else "MEO"))
print(f"\norbitClassOf: e={ecc}, P={period_min:.2f} min -> {cls}")

# Sentinel-2A LTAN check, exactly as orbitFacts.ts nodeCrossingRows does it
print("\n=== Sentinel-2A: satvis isSunSynchronous + LTAN/LTDN reproduction ===")
s2l1="1 40697U 15028A   26223.45944444  .00000123  00000-0  62329-4 0  9993"
s2l2="2 40697  98.5663 297.5180 0001357  89.5010 270.6328 14.30818424580123"
s2 = Satrec.twoline2rv(s2l1, s2l2, WGS72)
r2 = (-1.5*J2*s2.no_unkozai*math.cos(s2.inclo))/(s2.a**2*(1-s2.ecco**2)**2)*RAD2DEG*MIN_PER_DAY
print(f"Sentinel-2A i={s2.inclo*RAD2DEG:.4f} deg, a={s2.a*RE_KM:.1f} km, nodal rate = {r2:.4f} deg/day -> sun-sync {abs(r2-360/365.2422)<=0.05}")
# GMST at epoch (IAU 1982 formula, same as satellite.js gstime)
def gstime(jd):
    tut1 = (jd - 2451545.0)/36525.0
    temp = -6.2e-6*tut1**3 + 0.093104*tut1**2 + (876600.0*3600 + 8640184.812866)*tut1 + 67310.54841
    temp = (temp*math.pi/180/240) % (2*math.pi)
    return temp + 2*math.pi if temp < 0 else temp
jd = s2.jdsatepoch + s2.jdsatepochF
ut_hours = (((jd+0.5) % 1)+1) % 1 * 24
node_lon_deg = (s2.nodeo - gstime(jd))*RAD2DEG
ltan = (ut_hours + node_lon_deg*24/360) % 24
ltdn = (ltan+12) % 24
fmt = lambda h: f"{int(h):02d}:{int(round((h-int(h))*60)):02d}"
print(f"epoch JD {jd:.6f}, UT {ut_hours:.4f} h, node longitude {node_lon_deg % 360:.3f} deg -> LTAN {fmt(ltan)} / LTDN {fmt(ltdn)}  (published: 10:30 descending)")
