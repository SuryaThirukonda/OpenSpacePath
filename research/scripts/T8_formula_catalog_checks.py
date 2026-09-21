"""T8 (2026-09-14): checks for formulas in research/05_formula_catalog.md that the T7 scripts did not cover."""
import math
import numpy as np
DEG = math.pi/180; TWO_PI = 2*math.pi

print("=== SGP4 un-Kozai mean motion (WGS-72), ISS TLE 2026-09-01 ===")
RE, MU72, J2_72 = 6378.135, 398600.8, 0.001082616
xke = 60.0/math.sqrt(RE**3/MU72)
no_k = 15.48958602*TWO_PI/1440.0; e = 0.0005055; inc = 51.6312*DEG
ak = (xke/no_k)**(2/3); d1 = 0.75*J2_72*(3*math.cos(inc)**2 - 1)/(1 - e*e)**1.5
de = d1/ak**2; adel = ak*(1 - de*de - de*(1/3 + 134*de*de/81)); de = d1/adel**2
no_b = no_k/(1 + de)
for label, n in (("Kozai", no_k), ("Brouwer", no_b)):
    ns = n/60
    print(f"{label:8s}: period {TWO_PI/n:.4f} min, a(WGS-84 mu) {(398600.4418/ns**2)**(1/3):.1f} km, a(WGS-72 mu) {(MU72/ns**2)**(1/3):.1f} km")

print("\n=== TLE epoch and checksum ===")
l1 = "1 25544U 98067A   26244.49851260  .00003910  00000+0  79223-4 0  9992"
l2 = "2 25544  51.6312 282.3953 0005055  96.4740 263.6824 15.48958602583585"
yy = int(l1[18:20]); doy = float(l1[20:32]); year = 2000 + yy if yy < 57 else 1900 + yy
from datetime import datetime, timedelta, timezone
ep = datetime(year, 1, 1, tzinfo=timezone.utc) + timedelta(days=doy - 1)
print("epoch:", ep.isoformat())
ck = lambda s: sum(int(c) if c.isdigit() else (1 if c == '-' else 0) for c in s[:68]) % 10
print("checksums:", ck(l1), "vs", l1[68], "|", ck(l2), "vs", l2[68])

print("\n=== Maneuvers ===")
AU = 149597870.7; MU_S = 1.32712440018e11
r1, r2 = 1.00000261*AU, 1.52371034*AU
print(f"Earth-Mars Hohmann phase angle (target ahead at departure): {math.degrees(math.pi*(1 - ((r1+r2)/(2*r2))**1.5)):.1f} deg")
v = 7.7258; di = 28.5*DEG
print(f"pure plane change 28.5 deg at 7.7258 km/s: {2*v*math.sin(di/2):.3f} km/s; combined formula with v1=v2: {math.sqrt(2*v*v - 2*v*v*math.cos(di)):.3f} km/s")
print(f"rocket equation, dv 3.59 km/s, Isp 450 s: mass ratio {math.exp(3590/(450*9.80665)):.3f}")

print("\n=== Linear extrapolation error, ISS over 0.5 s ===")
r = 6798.4; print(f"0.5 * (mu/r^2) * dt^2 = {0.5*398600.4418/r**2*0.25*1000:.2f} m")

print("\n=== CR3BP Earth-Moon ===")
mu = 4902.800066/(398600.4418 + 4902.800066); a_em = 384400.0
def dUdx(x):
    return x - (1-mu)*(x+mu)/abs(x+mu)**3 - mu*(x-1+mu)/abs(x-1+mu)**3
def bisect(lo, hi):
    for _ in range(200):
        m = 0.5*(lo+hi)
        if dUdx(lo)*dUdx(m) <= 0: hi = m
        else: lo = m
    return 0.5*(lo+hi)
xL1 = bisect(0.5, 1-mu-1e-6); xL2 = bisect(1-mu+1e-6, 1.5)
print(f"mass ratio {mu:.6f}; L1 {abs(xL1-(1-mu))*a_em:,.0f} km and L2 {abs(xL2-(1-mu))*a_em:,.0f} km from the Moon; Hill estimate {(mu/3)**(1/3)*a_em:,.0f} km")
x = xL1; r1c = abs(x+mu); r2c = abs(x-1+mu)
print(f"Jacobi constant at L1: {x*x + 2*(1-mu)/r1c + 2*mu/r2c:.5f}")

print("\n=== Lagrange interpolation order on an e = 0.7 orbit, 120 samples per orbit ===")
def pos(Mv, e=0.7, a=1.0):
    E = Mv + e*math.sin(Mv)
    for _ in range(50): E -= (E - e*math.sin(E) - Mv)/(1 - e*math.cos(E))
    return np.array([a*(math.cos(E)-e), a*math.sqrt(1-e*e)*math.sin(E)])
def lagrange(ts, ys, t):
    out = 0
    for i, ti in enumerate(ts):
        w = 1.0
        for j, tj in enumerate(ts):
            if j != i: w *= (t - tj)/(ti - tj)
        out = out + w*ys[i]
    return out
for N in (120, 240):
    h = TWO_PI/N; worst = {4: 0, 6: 0}
    for k in range(N):
        tm = (k + 0.5)*h; truth = pos(tm)
        for npts in (4, 6):
            idx = [k - npts//2 + 1 + j for j in range(npts)]
            ts = [i*h for i in idx]; ys = [pos(t) for t in ts]
            worst[npts] = max(worst[npts], np.linalg.norm(lagrange(ts, ys, tm) - truth))
    print(f"{N} samples/orbit: 4-point (cubic) worst {worst[4]:.2e} a, 6-point (quintic) worst {worst[6]:.2e} a")

print("\n=== Body pole rotation: Rz(90+a0) Rx(90-d0) maps z to the pole direction ===")
def Rz(t): c, s = math.cos(t), math.sin(t); return np.array([[c,-s,0],[s,c,0],[0,0,1.0]])
def Rx(t): c, s = math.cos(t), math.sin(t); return np.array([[1.0,0,0],[0,c,-s],[0,s,c]])
a0, d0 = 317.68*DEG, 52.89*DEG
print("rotated z:", np.round(Rz(math.pi/2 + a0) @ Rx(math.pi/2 - d0) @ np.array([0, 0, 1.0]), 6),
      " expected:", np.round([math.cos(d0)*math.cos(a0), math.cos(d0)*math.sin(a0), math.sin(d0)], 6))

print("\n=== LTAN: 12 h + (RAAN - RA_sun)/15 vs satvis UT + (RAAN - GMST)/15 ===")
for day in (0, 60, 120, 200, 300):
    jd = 2461041.5 + day  # from 2026-01-01
    n = jd - 2451545.0
    L = 280.460 + 0.9856474*n; g = (357.528 + 0.9856003*n)*DEG
    lam = (L + 1.915*math.sin(g) + 0.020*math.sin(2*g))*DEG; eps = (23.439 - 0.0000004*n)*DEG
    ra_sun = math.degrees(math.atan2(math.cos(eps)*math.sin(lam), math.cos(lam))) % 360
    T = (jd - 2451545.0)/36525
    gmst = ((67310.54841 + (876600*3600 + 8640184.812866)*T + 0.093104*T*T - 6.2e-6*T**3)/240) % 360
    raan = 200.0; ut = 0.0
    a_ = (12 + (raan - ra_sun)/15) % 24; b_ = (ut + (raan - gmst)/15) % 24
    print(f"day {day:3d}: apparent-Sun LTAN {a_:.3f} h, mean-time LTAN {b_:.3f} h, difference {60*(((a_-b_+12) % 24) - 12):+.1f} min")

print("\n=== Cylindrical Earth shadow: eclipse duration formula vs sampled orbit, 420 km circular ===")
R, h = 6378.137, 420.0; r = R + h; T_min = TWO_PI*math.sqrt(r**3/398600.4418)/60
beta_star = math.degrees(math.asin(R/r))
print(f"no-eclipse threshold beta* = asin(R/r) = {beta_star:.2f} deg; period {T_min:.2f} min")
for beta_deg in (0, 40, 60, 69, 75):
    b = beta_deg*DEG
    s = np.array([math.cos(b), 0.0, math.sin(b)])        # Sun direction, beta above the orbit plane (x-y)
    th = np.linspace(0, TWO_PI, 400000, endpoint=False)
    pts = r*np.stack([np.cos(th), np.sin(th), np.zeros_like(th)], axis=1)
    along = pts @ s
    perp = np.linalg.norm(pts - np.outer(along, s), axis=1)
    frac_sim = np.mean((along < 0) & (perp < R))
    c = math.sqrt(h*h + 2*R*h)/(r*math.cos(b))
    frac_formula = math.acos(c)/math.pi if c <= 1 else 0.0
    print(f"beta {beta_deg:2d} deg: sampled {frac_sim*T_min:6.2f} min, formula {frac_formula*T_min:6.2f} min")
