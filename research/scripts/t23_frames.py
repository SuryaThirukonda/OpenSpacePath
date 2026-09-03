"""T2.3: TEME vs J2000/GCRS vs ITRS numbers for 2026-09-01, using the ISS TLE.
Run: venv/Scripts/python.exe notes/t23_frames.py
"""
import math, numpy as np
from sgp4.api import Satrec, jday
from skyfield.api import load, EarthSatellite, wgs84
from skyfield.framelib import itrs

lines=[l.strip() for l in open('iss_tle.txt') if l.strip()]
l1=[l for l in lines if l.startswith('1 ')][0]; l2=[l for l in lines if l.startswith('2 ')][0]
print("TLE:",l1,"\n    ",l2)

# --- 1. General precession since J2000 ---
# IAU 2006 general precession in longitude p_A ~ 5028.796195"/century (Capitaine et al. 2003)
T = (2461284.5 + 0.5 - 2451545.0)/36525.0   # 2026-09-01 12:00 TT approx (JD 2461285.0)
pA = 5028.796195*T + 1.1054348*T**2
print(f"\nJulian centuries since J2000 T = {T:.5f} ({T*100:.2f} yr)")
print(f"general precession in longitude p_A = {pA:.1f} arcsec = {pA/3600:.4f} deg")
# the x-axis (equinox) rotation in the equator is roughly p_A*cos(eps); the pole tilt (in obliquity direction) ~ 20.04"/yr*T*100 (theta_A)
eps=math.radians(23.4393)
print(f"rough equinox shift along equator ~ p_A cos(eps) = {pA*math.cos(eps):.0f} arcsec = {pA*math.cos(eps)/3600:.3f} deg")
thetaA = 2004.191903*T - 0.4294934*T**2
print(f"pole displacement theta_A = {thetaA:.1f} arcsec = {thetaA/3600:.4f} deg")
print(f"rule-of-thumb 50.29 arcsec/yr * {T*100:.2f} yr = {50.29*T*100:.0f} arcsec = {50.29*T*100/3600:.3f} deg")
# angular error in km at ISS radius
r_iss = 6371+420
for name,ang in [("p_A",pA),("theta_A",thetaA)]:
    print(f"  {name} at r={r_iss} km -> {r_iss*math.radians(ang/3600):.1f} km ; at GEO 42164 km -> {42164*math.radians(ang/3600):.0f} km")

# --- 2. Actual TEME vs GCRS vs ITRS from skyfield for ISS at 2026-09-01 12:00 UTC ---
ts=load.timescale()
sat=EarthSatellite(l1,l2,'ISS',ts)
t=ts.utc(2026,9,1,12,0,0)
# raw TEME from sgp4 (km)
jd,fr=jday(2026,9,1,12,0,0)
e,r_teme,v_teme=sat.model.sgp4(jd,fr)
r_teme=np.array(r_teme)
geo=sat.at(t)
r_gcrs=geo.position.km
r_itrs=geo.frame_xyz(itrs).km
print(f"\nISS 2026-09-01 12:00 UTC")
print(f"  TEME  (raw SGP4)   = {r_teme}")
print(f"  GCRS  (skyfield)   = {r_gcrs}")
print(f"  ITRS  (skyfield)   = {r_itrs}")
ang=lambda a,b: math.degrees(math.acos(np.dot(a,b)/np.linalg.norm(a)/np.linalg.norm(b)))
print(f"  |TEME-GCRS| = {np.linalg.norm(r_teme-r_gcrs):.2f} km  angle = {ang(r_teme,r_gcrs):.4f} deg")
print(f"  |TEME-ITRS| = {np.linalg.norm(r_teme-r_itrs):.2f} km  angle = {ang(r_teme,r_itrs):.2f} deg  (this is the GMST rotation)")
print(f"  |r| = {np.linalg.norm(r_teme):.2f} km, alt ~ {np.linalg.norm(r_teme)-6371:.0f} km")
sp=wgs84.subpoint(geo)
print(f"  subpoint lat {sp.latitude.degrees:.4f} lon {sp.longitude.degrees:.4f} alt {sp.elevation.km:.2f} km")

# --- 3. Manual TEME -> PEF via GMST (IAU 1982, Vallado eq C-1) and compare to skyfield ITRS ---
def gmst_rad(jd_ut1):
    T=(jd_ut1-2451545.0)/36525.0
    g=67310.54841 + (876600*3600+8640184.812866)*T + 0.093104*T**2 - 6.2e-6*T**3  # seconds
    g=(g % 86400)
    return math.radians(g/240.0)
g=gmst_rad(jd+fr)  # UTC used as UT1 (Cesium and satellite.js do the same)
R=np.array([[math.cos(g),math.sin(g),0],[-math.sin(g),math.cos(g),0],[0,0,1]])
r_pef=R@r_teme
print(f"\n  GMST = {math.degrees(g):.5f} deg")
print(f"  PEF via GMST       = {r_pef}")
print(f"  |PEF-ITRS| = {np.linalg.norm(r_pef-r_itrs)*1000:.0f} m (UT1-UTC + polar motion + TEME/CIRS nuance)")
lon=math.degrees(math.atan2(r_pef[1],r_pef[0])); print(f"  lon from PEF = {lon:.4f} deg (skyfield {sp.longitude.degrees:.4f})")

# --- 4. The classic bug: treat TEME as if it were ICRF then rotate ICRF->ITRF ---
# Equivalent: error = |TEME - GCRS| computed above; express as ground error
err=np.linalg.norm(r_teme-r_gcrs)
print(f"\nCLASSIC BUG: feeding TEME into an ICRF->Fixed transform misplaces ISS by ~{err:.1f} km ({ang(r_teme,r_gcrs)*60:.1f} arcmin)")
print(f"  UT1-UTC ignored (|dUT1|<0.9 s): Earth rotates 15.04 arcsec/s -> up to {0.9*15.04:.1f} arcsec -> {r_iss*math.radians(0.9*15.04/3600)*1000:.0f} m at ISS radius")
print(f"  polar motion (~0.3 arcsec) -> {6371*math.radians(0.3/3600)*1000:.0f} m on the ground")
