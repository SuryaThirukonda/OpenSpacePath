"""T1.4 — worked numbers: elements->ECI by hand vs code, satrec field derivation (mirrors satvis),
typical element tables for LEO/GEO/Molniya/SSO. Run with the scratchpad venv python."""
import math, numpy as np
from sgp4.api import Satrec, WGS72
from sgp4 import earth_gravity
MU = 398600.4418  # km^3/s^2 (WGS-84 value used in Curtis)
RE = 6378.137
J2 = 1.08262668e-3

def kepler(M, e, tol=1e-12):
    E = M if e < 0.8 else math.pi
    for _ in range(50):
        d = (E - e*math.sin(E) - M)/(1 - e*math.cos(E)); E -= d
        if abs(d) < tol: break
    return E

def elements_to_eci(a, e, i, raan, argp, theta):
    """Curtis Algorithm 4.5: perifocal -> ECI via Rz(-raan) Rx(-i) Rz(-argp) (all angles rad)."""
    p = a*(1-e*e); r = p/(1+e*math.cos(theta))
    rp = np.array([r*math.cos(theta), r*math.sin(theta), 0.0])
    vp = math.sqrt(MU/p)*np.array([-math.sin(theta), e+math.cos(theta), 0.0])
    cO,sO,ci,si,cw,sw = math.cos(raan),math.sin(raan),math.cos(i),math.sin(i),math.cos(argp),math.sin(argp)
    Q = np.array([[cO*cw-sO*sw*ci, -cO*sw-sO*cw*ci, sO*si],
                  [sO*cw+cO*sw*ci, -sO*sw+cO*cw*ci, -cO*si],
                  [sw*si,           cw*si,           ci]])
    return Q@rp, Q@vp

d = math.radians
print("=== Q1a: equatorial circular, a=7000 km, e=0, i=0, RAAN=0, argp=0, theta=90 deg")
r,v = elements_to_eci(7000,0,0,0,0,d(90))
print("hand: r=(0,7000,0) km, v=(-sqrt(mu/a),0,0)=(-%.4f,0,0) km/s" % math.sqrt(MU/7000))
print("code: r=",np.round(r,4)," v=",np.round(v,4))
print("=== Q1b: same but i=30 deg, RAAN=0, argp=0, theta=90")
r,v = elements_to_eci(7000,0,d(30),0,0,d(90))
print("hand: r=(0, 7000cos30, 7000sin30)=(0,%.4f,%.4f)" % (7000*math.cos(d(30)),7000*math.sin(d(30))))
print("code: r=",np.round(r,4)," v=",np.round(v,4))
print("=== Q1c: i=30, RAAN=60, argp=0, theta=90 -> r = 7000*( -sin60 cos30, cos60 cos30, sin30 )")
r,v = elements_to_eci(7000,0,d(30),d(60),0,d(90))
print("hand:",np.round(7000*np.array([-math.sin(d(60))*math.cos(d(30)), math.cos(d(60))*math.cos(d(30)), math.sin(d(30))]),4))
print("code:",np.round(r,4), " |r|=%.4f"%np.linalg.norm(r), " |v|=%.4f"%np.linalg.norm(v))
print("=== Q1d: Curtis Example 4.7 check: h=80000 km2/s, e=1.4, i=30, RAAN=40, argp=60, theta=30 -> expect r=(-4040,4815,3629) km, v=(-10.39,-4.772,1.744) km/s")
h=80000; e=1.4; p=h*h/MU; a=p/(1-e*e)   # hyperbolic: a<0, a(1-e^2)=p still holds
r,v = elements_to_eci(a,e,d(30),d(40),d(60),d(30))
print("code:",np.round(r,0),np.round(v,3))

print("\n=== Q2: anomaly rates, e=0.7, a=26562 km (Molniya-like)")
e=0.7; a=26562.0; n=math.sqrt(MU/a**3)
for thdeg in (0,90,180):
    th=d(thdeg); r=a*(1-e*e)/(1+e*math.cos(th)); h=math.sqrt(MU*a*(1-e*e))
    print(f"theta={thdeg:3d}: r={r:8.0f} km  dtheta/dt=h/r^2={h/r**2*3600*180/math.pi:8.2f} deg/h  vs n={n*3600*180/math.pi:6.2f} deg/h  ratio={h/r**2/n:5.2f}")

print("\n=== Q3: typical elements & derived numbers")
def row(name,a,e,i):
    T=2*math.pi*math.sqrt(a**3/MU)/60; n=math.sqrt(MU/a**3)
    raandot=-1.5*J2*n*(RE/a)**2*math.cos(d(i))/(1-e*e)**2*86400*180/math.pi
    print(f"{name:12s} a={a:8.0f} km e={e:.4f} i={i:6.2f} deg  hp={a*(1-e)-RE:7.0f} ha={a*(1+e)-RE:7.0f} km  T={T:8.2f} min  n={1440/T:6.3f} rev/day  RAANdot={raandot:+7.3f} deg/day  dLon/orbit={-360*T/1436.07:7.2f} deg")
row("ISS LEO",6795,0.0005,51.64)
row("Starlink",6921,0.0001,53.0)
row("SSO 700km",RE+700,0.001,98.19)
row("GPS MEO",26560,0.01,55.0)
row("GEO",42164,0.0001,0.05)
row("Molniya",26562,0.74,63.4)
# SSO inclination needed for 360/365.2422 deg/day at 700 km circular:
a=RE+700; n=math.sqrt(MU/a**3); target=360/365.2422/86400*math.pi/180
print("SSO 700km required i = %.2f deg" % math.degrees(math.acos(-target/(1.5*J2*n*(RE/a)**2))))
# GEO radius from T = 1436.07 min (sidereal day)
Ts=86164.0905; print("GEO a from sidereal day = %.1f km, alt=%.0f km" % ((MU*(Ts/(2*math.pi))**2)**(1/3),(MU*(Ts/(2*math.pi))**2)**(1/3)-RE))

print("\n=== satrec fields from fresh ISS TLE (mirrors satvis Orbit.ts / orbitFacts.ts)")
lines=[l.strip() for l in open("iss_tle.txt") if l.strip()]
l1=[l for l in lines if l.startswith("1 ")][0]; l2=[l for l in lines if l.startswith("2 ")][0]
s=Satrec.twoline2rv(l1,l2,WGS72)
r2d=180/math.pi
print("no_kozai (rad/min) =",s.no_kozai," -> rev/day =",s.no_kozai*1440/(2*math.pi))
print("no (unkozai, rad/min)=",s.no," period=2pi/no = %.3f min"%(2*math.pi/s.no)," Kozai period=%.3f min"%(1440/(s.no_kozai*1440/(2*math.pi))))
print("a (earth radii)=",s.a," -> km = %.1f"%(s.a*s.radiusearthkm))
print("alta,altp (earth radii)=",s.alta,s.altp," -> Apogee / Perigee = %.0f / %.0f km"%(s.alta*s.radiusearthkm,s.altp*s.radiusearthkm))
print("inclo=%.4f rad = %.4f deg; nodeo=%.4f rad = %.4f deg; ecco=%.7f; argpo=%.4f deg; mo=%.4f deg; bstar=%g 1/Re"%(s.inclo,s.inclo*r2d,s.nodeo,s.nodeo*r2d,s.ecco,s.argpo*r2d,s.mo*r2d,s.bstar))
print("jdsatepoch=",s.jdsatepoch,"+",s.jdsatepochF," radiusearthkm=",s.radiusearthkm," j2=",s.j2," xke=",s.xke," tumin=",s.tumin)
rate=(-1.5*s.j2*s.no*math.cos(s.inclo))/(s.a*s.a*(1-s.ecco**2)**2)*r2d*1440
print("nodal precession (satvis formula) = %+.4f deg/day; sun = %.4f deg/day; sun-sync? %s"%(rate,360/365.2422,abs(rate-360/365.2422)<=0.05))
# Compare Kepler pipeline vs SGP4 at epoch: use mean anomaly -> true anomaly, a from satrec
M=s.mo; E=kepler(M,s.ecco); th=2*math.atan2(math.sqrt(1+s.ecco)*math.sin(E/2),math.sqrt(1-s.ecco)*math.cos(E/2))
rk,vk=elements_to_eci(s.a*s.radiusearthkm,s.ecco,s.inclo,s.nodeo,s.argpo,th)
err,rs,vs=s.sgp4(s.jdsatepoch,s.jdsatepochF)
print("Kepler-from-satrec r=",np.round(rk,1)," |r|=%.1f"%np.linalg.norm(rk))
print("SGP4 at epoch      r=",np.round(rs,1)," |r|=%.1f  |v|=%.3f"%(np.linalg.norm(rs),np.linalg.norm(vs)))
print("difference |dr| = %.1f km (expected km-scale: mean vs osculating, J2 short-period terms)"%np.linalg.norm(np.array(rs)-rk))
