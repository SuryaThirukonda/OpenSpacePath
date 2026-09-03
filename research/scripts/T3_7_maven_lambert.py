"""T3.7: real arrival v_inf for a MAVEN-like Earth->Mars transfer (launch 2013-11-18, arrival 2014-09-22) via DE421 + Lambert (lamberthub izzo2015).
Gives the v_inf needed to turn the tutorial's B-plane target (|B| = 7000 km) into a periapsis radius."""
import numpy as np, math
from skyfield.api import load
from lamberthub import izzo2015
MU_SUN=1.32712440018e11; MU_M=42828.375214; R_M=3396.19; MU_E=398600.4418; R_E=6378.1363
ts=load.timescale(); eph=load('de421.bsp')
t1=ts.utc(2013,11,18,20,26,24); t2=ts.utc(2014,9,22,2,24,0)
sun=eph['sun']; earth=eph['earth']; mars=eph['mars barycenter']
def sv(body,t):
    p=(body-sun).at(t); return np.array(p.position.km), np.array(p.velocity.km_per_s)
r1,v1=sv(earth,t1); r2,v2=sv(mars,t2); tof=(t2.tt-t1.tt)*86400
print(f"TOF = {tof/86400:.1f} days; |r1|={np.linalg.norm(r1)/1.495978707e8:.4f} AU |r2|={np.linalg.norm(r2)/1.495978707e8:.4f} AU")
vd,va=izzo2015(MU_SUN,r1,r2,tof,M=0,prograde=True,low_path=True)
vinf_dep=np.linalg.norm(vd-v1); vinf_arr=np.linalg.norm(va-v2)
print(f"Lambert (0-rev, prograde): v_inf depart = {vinf_dep:.3f} km/s (C3 = {vinf_dep**2:.2f} km^2/s^2); v_inf arrive = {vinf_arr:.3f} km/s")
print(f"Tutorial's Earth hyperbola implies v_inf = {math.sqrt(MU_E/32593.216):.3f} km/s (C3 {MU_E/32593.216:.2f}) - compare to Lambert C3 above")
ah=MU_M/vinf_arr**2
for B in (7000.0, math.hypot(2700,7000)):
    rp=math.sqrt(B*B+ah*ah)-ah
    vp_h=math.sqrt(vinf_arr**2+2*MU_M/rp); a_ell=(rp+12000)/2; vp_e=math.sqrt(MU_M*(2/rp-1/a_ell))
    print(f"|B|={B:.0f} km -> r_p = {rp:.0f} km (alt {rp-R_M:.0f} km); MOI dv to 12000-km apoapsis = {vp_e-vp_h:.3f} km/s (GMAT tutorial initial guess -1.603 km/s)")
# capture check: dv to circular at r_p vs to 12000-km apoapsis ellipse
