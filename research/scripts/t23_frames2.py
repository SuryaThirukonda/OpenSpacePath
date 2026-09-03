"""T2.3 part 2: (a) how the TEME-vs-GCRS error behaves around one ISS orbit and by year,
(b) Vallado 2006 Appendix C known-answer check: TEME->PEF via GMST(UT1) vs published ITRF,
(c) pixel-scale meaning of the errors. Run with venv python."""
import math, numpy as np
from sgp4.api import Satrec, jday
from skyfield.api import load, EarthSatellite
ts=load.timescale()
lines=[l.strip() for l in open('iss_tle.txt') if l.strip()]
l1=[l for l in lines if l.startswith('1 ')][0]; l2=[l for l in lines if l.startswith('2 ')][0]
sat=EarthSatellite(l1,l2,'ISS',ts)
ang=lambda a,b: math.degrees(math.acos(np.clip(np.dot(a,b)/np.linalg.norm(a)/np.linalg.norm(b),-1,1)))
print("(a) TEME vs GCRS separation over one ISS orbit, 2026-09-01:")
errs=[]
for m in range(0,93,10):
    t=ts.utc(2026,9,1,12,m,0); jd,fr=jday(2026,9,1,12,m,0)
    e,r,v=sat.model.sgp4(jd,fr); r=np.array(r); g=sat.at(t).position.km
    errs.append(np.linalg.norm(r-g)); print(f"  +{m:2d} min: |TEME-GCRS| = {errs[-1]:6.2f} km  ({ang(r,g):.3f} deg)")
print(f"  min {min(errs):.1f} km, max {max(errs):.1f} km")
print("\n(a2) same at different years (frame rotation grows ~50 arcsec/yr):")
for y in (2000,2010,2020,2026,2030):
    t=ts.utc(y,9,1,12,0,0); jd,fr=jday(y,9,1,12,0,0)
    e,r,v=sat.model.sgp4(jd,fr); r=np.array(r); g=sat.at(t).position.km
    print(f"  {y}: {ang(r,g):.3f} deg, {np.linalg.norm(r-g):.1f} km")

print("\n(b) Vallado 2006 App. C known answer: TEME -> PEF -> ITRF")
r_teme=np.array([5094.18016210,6127.64465950,6380.34453270])
r_itrf_pub=np.array([-1033.47938300,7901.29527540,6380.35659580])
# Apr 6 2004 07:51:28.386 UTC, dUT1=-0.439961 s, xp=-0.140682", yp=0.333309"
jd,fr=jday(2004,4,6,7,51,28.386)
def gmst_rad(jd_ut1):
    T=(jd_ut1-2451545.0)/36525.0
    g=67310.54841 + (876600*3600+8640184.812866)*T + 0.093104*T**2 - 6.2e-6*T**3
    return math.radians((g%86400)/240.0)
for label,dut1 in (("UT1 (correct)",-0.439961),("UTC as UT1 (Cesium/satellite.js shortcut)",0.0)):
    g=gmst_rad(jd+fr+dut1/86400)
    R=np.array([[math.cos(g),math.sin(g),0],[-math.sin(g),math.cos(g),0],[0,0,1]])
    r_pef=R@r_teme
    xp=math.radians(-0.140682/3600); yp=math.radians(0.333309/3600)
    # ITRF = ROT1(yp) ROT2(xp) PEF  (Vallado C-2, W^T applied to PEF) -- rotation matrices (right-hand, passive)
    def rot1(a): c,s=math.cos(a),math.sin(a); return np.array([[1,0,0],[0,c,s],[0,-s,c]])
    def rot2(a): c,s=math.cos(a),math.sin(a); return np.array([[c,0,-s],[0,1,0],[s,0,c]])
    r_itrf=rot1(yp)@rot2(xp)@r_pef
    print(f"  {label}: PEF={r_pef.round(4)}  ITRF={r_itrf.round(4)}  err vs published = {np.linalg.norm(r_itrf-r_itrf_pub)*1000:.1f} m")

print("\n(c) what an error means on the globe:")
for name,km in (("TEME-as-J2000 bug at ISS",38.7),("TEME-as-J2000 at GEO",274),("UT1-UTC ignored",0.45),("polar motion",0.01),("TLE 1-day LEO error (typ.)",1.0),("TLE 7-day LEO error (typ.)",10.0)):
    px_full=km/(12742/800)   # full-disc Earth ~800 px tall
    px_regional=km/(2000/800)  # ~2000 km across 800 px
    print(f"  {name:28s} {km:7.2f} km -> {px_full:5.1f} px (globe fills 800 px) | {px_regional:5.1f} px (2000-km view)")
