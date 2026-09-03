"""T2_2: Why TLE mean elements only make sense inside SGP4.
(1) semi-major axis from Kozai vs un-Kozai'd mean motion; (2) J2 nodal regression / perigee rate for ISS;
(3) naive Keplerian propagation of the TLE elements vs SGP4 over 0..7 days; (4) drag along-track growth from ndot;
(5) 'visually truthful' pixel budget at globe scale."""
import math, os, numpy as np
from sgp4.api import Satrec, jday, WGS72
from sgp4.model import Satrec as PySatrec
here=os.path.dirname(os.path.abspath(__file__))
lines=open(os.path.join(here,'..','iss_tle.txt')).read().strip().splitlines(); l1,l2=lines[-2],lines[-1]
sat=Satrec.twoline2rv(l1,l2,WGS72); ps=PySatrec.twoline2rv(l1,l2)
MU=398600.8; RE=6378.135; J2=0.001082616   # WGS72 as used by SGP4/satellite.js
n_k=ps.no_kozai; n_u=ps.no_unkozai        # rad/min
def a_of(n_radmin): n=n_radmin/60.0; return (MU/n**2)**(1/3)
a_k,a_u=a_of(n_k),a_of(n_u)
print("mean motion rev/day (TLE line 2)      :", n_k*1440/(2*math.pi))
print("no_kozai   rad/min = %.10f -> a = %.3f km" % (n_k,a_k))
print("no_unkozai rad/min = %.10f -> a = %.3f km   (Brouwer/un-kozai'd; SGP4 uses this internally)" % (n_u,a_u))
print("delta a = %.3f km  (Kozai J2 correction to mean motion; ~%.2f%%)" % (a_u-a_k, 100*(n_k-n_u)/n_u))
print("SGP4 'am' at t=0 (earth radii) -> km:", end=" ")
e,r,v=sat.sgp4(sat.jdsatepoch, sat.jdsatepochF); print(sat.am*RE if hasattr(sat,'am') else 'n/a')
e0=ps.ecco; i0=ps.inclo
p=a_u*(1-e0**2)
n_s=n_u/60
raan_dot=-1.5*n_s*J2*(RE/p)**2*math.cos(i0)          # rad/s
argp_dot= 0.75*n_s*J2*(RE/p)**2*(5*math.cos(i0)**2-1)
print("\nJ2 secular rates for ISS: RAAN dot = %.3f deg/day, argp dot = %.3f deg/day" % (math.degrees(raan_dot)*86400, math.degrees(argp_dot)*86400))
print("  -> cross-track displacement from ignoring RAAN regression after 1 day: ~ %.0f km (a*sin(i)*dRAAN)" % (a_u*math.sin(i0)*abs(raan_dot)*86400))
# (3) naive Kepler propagation of TLE elements
def kepler_state(a,e,i,raan,argp,M0,n,t):
    M=(M0+n*t)%(2*math.pi); E=M if e<0.8 else math.pi
    for _ in range(50):
        d=(E-e*math.sin(E)-M)/(1-e*math.cos(E)); E-=d
        if abs(d)<1e-12: break
    th=2*math.atan2(math.sqrt(1+e)*math.sin(E/2), math.sqrt(1-e)*math.cos(E/2))
    rr=a*(1-e*e)/(1+e*math.cos(th)); xp,yp=rr*math.cos(th),rr*math.sin(th)
    cO,sO,ci,si,cw,sw=math.cos(raan),math.sin(raan),math.cos(i),math.sin(i),math.cos(argp),math.sin(argp)
    return np.array([(cO*cw-sO*sw*ci)*xp+(-cO*sw-sO*cw*ci)*yp,(sO*cw+cO*sw*ci)*xp+(-sO*sw+cO*cw*ci)*yp,(sw*si)*xp+(cw*si)*yp])
print("\nNaive Keplerian (TLE elements verbatim, a from no_kozai vs no_unkozai) vs SGP4, |dr| km:")
print("%8s %12s %12s" % ("t[min]","a(kozai)","a(unkozai)"))
for tmin in [0,10,46,92.9,180,720,1440,4320,10080]:
    jd=sat.jdsatepoch; fr=sat.jdsatepochF+tmin/1440
    e,r,v=sat.sgp4(jd,fr); r=np.array(r)
    dk=np.linalg.norm(kepler_state(a_k,e0,i0,ps.nodeo,ps.argpo,ps.mo,n_k,tmin)-r)
    du=np.linalg.norm(kepler_state(a_u,e0,i0,ps.nodeo,ps.argpo,ps.mo,n_u,tmin)-r)
    print("%8.1f %12.2f %12.2f" % (tmin,dk,du))
# (4) drag: TLE ndot field is n_dot/2 in rev/day^2
ndot_half=float(l1[33:43]); ndot=2*ndot_half
print("\nTLE ndot/2 = %s rev/day^2 -> n_dot = %.3e rev/day^2" % (ndot_half, ndot))
for d in [1,3,7,14]:
    dth=0.5*ndot*d*d   # revolutions of along-track phase error if drag ignored
    print("  ignore drag for %2d d: phase error %.4f rev = %.1f km along-track (x 2*pi*a)" % (d,dth,dth*2*math.pi*a_u))
print("  decay of a per day from ndot: da/day = -(2/3)*a*(ndot/n) = %.3f km/day" % (-(2/3)*a_u*ndot/(n_k*1440/(2*math.pi))))
T=2*math.pi/n_u; print("  period (un-kozai) = %.3f min; nodal-day westward shift per orbit = %.2f deg" % (T, 360*T/1436.07 - math.degrees(raan_dot)*T*60))
# (5) pixel budget
print("\nGlobe scale: Earth diameter 12742 km on a 900-px-tall globe -> %.1f km/pixel" % (12742/900))
print("  1 km/day drift needs %.0f days to move 1 px at globe scale; 3 km/day -> %.0f days" % (12742/900/1, 12742/900/3))
print("  Zoomed view 2000 km across on 1600 px -> %.2f km/px: 3 km/day is visible in ~1 day" % (2000/1600))
