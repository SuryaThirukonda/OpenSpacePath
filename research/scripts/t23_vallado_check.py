"""Vallado 2006 Appendix C known answer: try polar-motion sign conventions to find the one that reproduces the published ITRF."""
import math, numpy as np, itertools
from sgp4.api import jday
r_teme=np.array([5094.18016210,6127.64465950,6380.34453270])
r_pub=np.array([-1033.47938300,7901.29527540,6380.35659580])
jd,fr=jday(2004,4,6,7,51,28.386); dut1=-0.439961
def gmst_rad(jd_ut1):
    T=(jd_ut1-2451545.0)/36525.0
    g=67310.54841 + (876600*3600+8640184.812866)*T + 0.093104*T**2 - 6.2e-6*T**3
    return math.radians((g%86400)/240.0)
g=gmst_rad(jd+fr+dut1/86400)
print(f"GMST = {math.degrees(g):.6f} deg")
Rz=np.array([[math.cos(g),math.sin(g),0],[-math.sin(g),math.cos(g),0],[0,0,1]])
r_pef=Rz@r_teme; print("PEF =",r_pef)
xp=math.radians(-0.140682/3600); yp=math.radians(0.333309/3600)
def rot1(a): c,s=math.cos(a),math.sin(a); return np.array([[1,0,0],[0,c,s],[0,-s,c]])
def rot2(a): c,s=math.cos(a),math.sin(a); return np.array([[c,0,-s],[0,1,0],[s,0,c]])
best=None
for sx,sy,order in itertools.product((1,-1),(1,-1),("12","21")):
    A=rot1(sy*yp); B=rot2(sx*xp)
    M = A@B if order=="12" else B@A
    r=M@r_pef; err=np.linalg.norm(r-r_pub)*1000
    print(f"  rot1({sy:+d}yp) rot2({sx:+d}xp) order {order}: err = {err:8.2f} m")
    if best is None or err<best[0]: best=(err,sx,sy,order)
print("best:",best)
# Vallado's W = ROT1(yp) ROT2(xp) with his rotation convention (which is the transpose of the 'passive' ones above), and r_PEF = W r_ITRF => r_ITRF = W^T r_PEF
