"""T2_2: same ISS TLE at 2026-09-01 12:00:00 UTC through python-sgp4 (+ skyfield), compare with satellite.js output."""
import json, math, sys, os
import numpy as np
from sgp4.api import Satrec, jday, WGS72
from sgp4 import __version__ as sgp4v
here = os.path.dirname(os.path.abspath(__file__))
lines = open(os.path.join(here,'..','iss_tle.txt')).read().strip().splitlines()
l1,l2 = (lines[1],lines[2]) if len(lines)==3 else (lines[0],lines[1])
sat = Satrec.twoline2rv(l1,l2, WGS72); from sgp4.model import Satrec as PySatrec; psat = PySatrec.twoline2rv(l1,l2); # satellite.js hard-codes WGS72 constants (mu=398600.8, Re=6378.135)
jd, fr = jday(2026,9,1,12,0,0)
e, r, v = sat.sgp4(jd, fr)
print("python-sgp4", sgp4v, "error", e)
print("jdsatepoch", sat.jdsatepoch + sat.jdsatepochF, "tsince_min", ((jd+fr)-(sat.jdsatepoch+sat.jdsatepochF))*1440)
print("no_kozai rad/min", sat.no_kozai, "no_unkozai rad/min (pure-python Satrec)", psat.no_unkozai, "bstar", sat.bstar, "method", sat.method)
print("TEME r km", r); print("TEME v km/s", v)
print("|r| km", np.linalg.norm(r), "|v| km/s", np.linalg.norm(v), "alt(sph, Re=6378.137)", np.linalg.norm(r)-6378.137)

# --- own gstime port (Vallado 2004 eq 3-45, same as satellite.js gstime) ---
def gstime(jdut1):
    tut1 = (jdut1 - 2451545.0)/36525.0
    temp = -6.2e-6*tut1**3 + 0.093104*tut1**2 + (876600.0*3600 + 8640184.812866)*tut1 + 67310.54841
    temp = (temp*math.pi/180/240.0) % (2*math.pi)
    return temp + 2*math.pi if temp < 0 else temp
gmst = gstime(jd+fr)
# TEME -> "pseudo-ECEF" by a simple Z rotation through GMST (this is exactly what satellite.js eciToEcf does)
c,s = math.cos(gmst), math.sin(gmst)
ecf = np.array([ r[0]*c + r[1]*s, -r[0]*s + r[1]*c, r[2]])
# eciToGeodetic port (Kelso column v02n03 iterative)
a=6378.137; b=6356.7523142; f=(a-b)/a; e2=2*f-f*f
R=math.hypot(r[0],r[1])
lon = ((math.atan2(r[1],r[0]) - gmst + math.pi) % (2*math.pi)) - math.pi
lat = math.atan2(r[2], R)
for _ in range(20):
    C = 1/math.sqrt(1-e2*math.sin(lat)**2)
    lat = math.atan2(r[2] + a*C*e2*math.sin(lat), R)
h = R/math.cos(lat) - a*C
print("gmst rad", gmst, "deg", math.degrees(gmst))
print("ECF (port) km", ecf)
print("geodetic (port): lat %.6f lon %.6f alt %.4f km" % (math.degrees(lat), math.degrees(lon), h))

# --- skyfield: full-fidelity TEME -> ITRF (polar motion, precession/nutation of GMST path) ---
from skyfield.api import load, EarthSatellite, wgs84
ts = load.timescale()
t = ts.utc(2026,9,1,12,0,0)
es = EarthSatellite(l1,l2,'ISS',ts)
sp = wgs84.subpoint(es.at(t))     # geodetic via skyfield's ITRS path (uses its own gmst + polar motion if IERS data loaded)
print("skyfield: lat %.6f lon %.6f alt %.4f km" % (sp.latitude.degrees, sp.longitude.degrees, sp.elevation.km))
print("skyfield GCRS r km", es.at(t).position.km, " (ICRF/J2000-ish, NOT TEME: differs from TEME by precession+nutation)")
print("skyfield ITRF r km", es.at(t).frame_xyz(__import__('skyfield.framelib',fromlist=['itrs']).itrs).km)
print("skyfield gmst hours", t.gmst, "-> rad", t.gmst*15*math.pi/180, "  delta vs Vallado port (arcsec):", (t.gmst*15*math.pi/180 - gmst)*206265)

# --- compare with satellite.js JSON ---
js = json.load(open(os.path.join(here,'T2_2_satellitejs_output.json')))
rj = np.array([js['teme_r_km'][k] for k in 'xyz']); vj = np.array([js['teme_v_kms'][k] for k in 'xyz'])
print("\n=== satellite.js v%s vs python-sgp4 %s ===" % (js['version'], sgp4v))
print("TEME |dr| m   :", np.linalg.norm(rj-np.array(r))*1000)
print("TEME |dv| mm/s:", np.linalg.norm(vj-np.array(v))*1e6)
print("no_kozai diff :", js['no_kozai_radpermin']-sat.no_kozai, " no_unkozai diff:", js["no_unkozai_radpermin"]-psat.no_unkozai)
g = js['geodetic']
print("geodetic diff vs port: dlat deg %.3e dlon deg %.3e dalt m %.3e" % (g['lat_deg']-math.degrees(lat), g['lon_deg']-math.degrees(lon), (g['alt_km']-h)*1000))
print("geodetic diff vs skyfield: dlat deg %.5f dlon deg %.5f dalt m %.2f" % (g['lat_deg']-sp.latitude.degrees, g['lon_deg']-sp.longitude.degrees, (g['alt_km']-sp.elevation.km)*1000))
print("  -> ground distance of lat/lon diff (m): %.1f" % (6371000*math.radians(math.hypot(g['lat_deg']-sp.latitude.degrees, (g['lon_deg']-sp.longitude.degrees)*math.cos(lat)))))
