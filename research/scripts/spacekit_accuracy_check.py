"""T3.5 spacekit.js accuracy check.
1. Reproduce spacekit's fixed-element planetary presets (EphemPresets.ts) and compare
   heliocentric ecliptic positions on 2026-09-01 against JPL DE421 via skyfield.
2. Measure the fixed-point Kepler iteration (E_{k+1} = M + e sin E_k, tol 1e-7, cap 100)
   used in Orbit.ts / shaders.ts vs Newton-Raphson, for several e.
3. float32 precision budget when 1 scene unit = 1 AU.
"""
import math, numpy as np
from skyfield.api import load
from skyfield.framelib import ecliptic_J2000_frame

AU_KM = 149597870.7
GM_SUN = 1.3271244004193938e20  # m^3/s^2 (spacekit Ephem.ts)
METERS_IN_AU = 149597870700.0

# spacekit presets (deg), from src/EphemPresets.ts
presets = {
 'MERCURY': dict(epoch=2458426.5, a=3.870968969437096e-1, e=2.056515875393916e-1, i=7.003891682749818, om=4.830774804443502e1, w=2.917940253442659e1, ma=2.56190975209273e2),
 'VENUS':   dict(epoch=2458426.5, a=7.233458663591554e-1, e=6.762510759617694e-3, i=3.394567787211735, om=7.662534150657346e1, w=5.474567447560867e1, ma=2.756687596099721e2),
 'EARTH':   dict(epoch=2451545.0, a=1.00000261, e=0.01671123, i=-0.00001531, om=0.0, wBar=102.93768193, L=100.46457166),
 'MARS':    dict(epoch=2458426.5, a=1.52371401537107, e=9.336741335309606e-2, i=1.848141099825311, om=4.950420572080223e1, w=2.866965847685386e2, ma=2.538237617924876e1),
 'JUPITER': dict(epoch=2458426.5, a=5.20180355911023, e=4.89912558249006e-2, i=1.303560894624275, om=1.005203828847816e2, w=2.73736301845404e2, ma=2.31939544389401e2),
 'SATURN':  dict(epoch=2458426.5, a=9.577177295536776, e=5.101889921719987e-2, i=2.482782449972317, om=1.136154964073247e2, w=3.394422648650336e2, ma=1.870970898012944e2),
 'URANUS':  dict(epoch=2458426.5, a=1.914496966635462e1, e=4.832662948112808e-2, i=7.697511134483724e-1, om=7.414239045667875e1, w=9.942704504702185e1, ma=2.202603033874267e2),
 'NEPTUNE': dict(epoch=2458426.5, a=3.00962226342805e1, e=7.36257118719377e-3, i=1.774569249829094, om=1.318695882492132e2, w=2.586226409499831e2, ma=3.152804988924479e2),
}

def fill(p):
    p = dict(p)
    if 'w' in p and 'om' in p and 'wBar' not in p: p['wBar'] = p['w'] + p['om']
    if 'wBar' in p and 'om' in p and 'w' not in p: p['w'] = p['wBar'] - p['om']
    if 'ma' not in p: p['ma'] = p['L'] - p['wBar']
    a_m = p['a'] * METERS_IN_AU
    p['period'] = 2*math.pi*math.sqrt(a_m**3/GM_SUN)/86400.0
    p['n'] = 2*math.pi/p['period']  # rad/day
    return p

def kepler_fixed(M, e, tol=1e-7, cap=100):
    E0 = M; k = 0
    for k in range(1, cap+1):
        E1 = M + e*math.sin(E0)
        d = abs(E1-E0); E0 = E1
        if d < tol: break
    return E0, k

def kepler_newton(M, e, tol=1e-12):
    E = M if e < 0.8 else math.pi
    for k in range(1, 60):
        f = E - e*math.sin(E) - M
        E -= f/(1 - e*math.cos(E))
        if abs(f) < tol: return E, k
    return E, k

def spacekit_pos(p, jd):
    """Orbit.getPositionAtTimeElliptical + vectorToHeliocentric, in AU (ecliptic J2000)."""
    p = fill(p)
    e = p['e']; ma = math.radians(p['ma']); n = p['n']
    M = ma + n*(jd - p['epoch'])
    E, _ = kepler_fixed(M, e)
    v = 2*math.atan(math.sqrt((1+e)/(1-e))*math.tan(E/2))
    r = p['a']*(1-e*e)/(1+e*math.cos(v))
    i = math.radians(p['i']); o = math.radians(p['om']); pp = math.radians(p['wBar'])
    X = r*(math.cos(o)*math.cos(v+pp-o) - math.sin(o)*math.sin(v+pp-o)*math.cos(i))
    Y = r*(math.sin(o)*math.cos(v+pp-o) + math.cos(o)*math.sin(v+pp-o)*math.cos(i))
    Z = r*math.sin(v+pp-o)*math.sin(i)
    return np.array([X,Y,Z])

ts = load.timescale()
eph = load('de421.bsp')
sun = eph['sun']
names = {'MERCURY':'mercury','VENUS':'venus','EARTH':'earth','MARS':'mars','JUPITER':'jupiter barycenter','SATURN':'saturn barycenter','URANUS':'uranus barycenter','NEPTUNE':'neptune barycenter'}

for date_label, t in [('2018-11-04 (preset epoch)', ts.tt_jd(2458426.5)), ('2026-09-01', ts.utc(2026,9,1)), ('2030-01-01', ts.utc(2030,1,1))]:
    print(f"\n=== {date_label}  JD_TT={t.tt:.3f} ===")
    print(f"{'body':8s} {'|r| spacekit AU':>16s} {'|r| DE421 AU':>14s} {'pos err (km)':>13s} {'pos err (AU)':>13s} {'ang err (deg)':>14s}")
    for k, nm in names.items():
        sk = spacekit_pos(presets[k], t.tt)
        real = (eph[nm] - sun).at(t).frame_xyz(ecliptic_J2000_frame).au
        real = np.array(real)
        err = np.linalg.norm(sk-real)
        ang = math.degrees(math.acos(max(-1.0,min(1.0,np.dot(sk,real)/np.linalg.norm(sk)/np.linalg.norm(real)))))
        print(f"{k:8s} {np.linalg.norm(sk):16.6f} {np.linalg.norm(real):14.6f} {err*AU_KM:13.0f} {err:13.6f} {ang:14.4f}")

print("\n=== Kepler solver: fixed-point (spacekit) vs Newton, M=1.0 rad ===")
for e in [0.0167, 0.2056, 0.5, 0.8, 0.9, 0.95, 0.98, 0.99]:
    Ef, kf = kepler_fixed(1.0, e)
    En, kn = kepler_newton(1.0, e)
    print(f"e={e:6.4f}  fixed-point iters={kf:3d} E={Ef:.8f}  newton iters={kn:2d} E={En:.8f}  |dE|={abs(Ef-En):.2e} rad")

print("\n=== float32 budget with 1 unit = 1 AU (Simulation.unitsPerAu default) ===")
eps32 = 2**-23
for label, dist_au in [('1 AU (Earth)', 1.0), ('5.2 AU (Jupiter)', 5.2), ('30 AU (Neptune)', 30.0)]:
    print(f"{label:18s}: float32 ULP = {dist_au*eps32*AU_KM:8.1f} km  (Earth radius = {6371/AU_KM:.3e} AU, LEO alt 400 km = {400/AU_KM:.3e} AU)")
print(f"ULP at 1 AU / Earth radius = {1.0*eps32*AU_KM/6371:.4f}; ULP at 1 AU / LEO altitude(400km) = {1.0*eps32*AU_KM/400:.3f}")
print(f"Camera near/far in Camera.ts: near=1e-5 AU = {1e-5*AU_KM:.0f} km, far=2000 AU; ratio = {2000/1e-5:.1e} (depth-buffer z-fighting risk without logarithmicDepthBuffer)")
