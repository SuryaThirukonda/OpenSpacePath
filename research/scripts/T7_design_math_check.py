"""T7 design math check (2026-09-14): numerical verification of every formula in research/04_system_design.md, section 7.
Pure Python + numpy. Run: python3 T7_design_math_check.py"""
import math, random
import numpy as np

PI = math.pi; TWO_PI = 2*PI
MU_E = 398600.4418; R_E = 6378.137; J2 = 1.08262668e-3; W_E = 7.2921159e-5
MU_S = 1.32712440018e11; AU = 149597870.7
MU_M = 42828.375214; R_M = 3396.19
norm = np.linalg.norm

def hdr(s): print(f"\n=== {s} ===")

# ---------- rotations, elements <-> state ----------
def Rz(a): c, s = math.cos(a), math.sin(a); return np.array([[c,-s,0],[s,c,0],[0,0,1.0]])
def Rx(a): c, s = math.cos(a), math.sin(a); return np.array([[1.0,0,0],[0,c,-s],[0,s,c]])

def coe2rv(p, e, i, raan, argp, nu, mu):
    r = p/(1+e*math.cos(nu))
    rp = np.array([r*math.cos(nu), r*math.sin(nu), 0.0])
    vp = math.sqrt(mu/p)*np.array([-math.sin(nu), e+math.cos(nu), 0.0])
    Q = Rz(raan) @ Rx(i) @ Rz(argp)
    return Q@rp, Q@vp

def rv2coe(r, v, mu):
    rn, vn = norm(r), norm(v)
    h = np.cross(r, v); hn = norm(h)
    i = math.acos(h[2]/hn)
    n = np.cross([0, 0, 1.0], h)
    ev = ((vn*vn - mu/rn)*r - np.dot(r, v)*v)/mu; e = norm(ev)
    raan = math.atan2(n[1], n[0]) % TWO_PI
    argp = math.atan2(np.dot(np.cross(n, ev), h)/hn, np.dot(n, ev)) % TWO_PI
    nu = math.atan2(np.dot(np.cross(ev, r), h)/hn, np.dot(ev, r)) % TWO_PI
    return hn*hn/mu, e, i, raan, argp, nu

hdr("Curtis Example 4.7 (h=80000, e=1.4, i=30, RAAN=40, argp=60, nu=30)")
d = math.radians
r, v = coe2rv(80000**2/MU_E, 1.4, d(30), d(40), d(60), d(30), MU_E)
print("r =", np.round(r, 2), " expected (-4040, 4815, 3629)")
print("v =", np.round(v, 4), " expected (-10.39, -4.772, 1.744)")

hdr("rv2coe round trip, 20000 random elliptic orbits")
random.seed(1); worst = 0.0
for _ in range(20000):
    a = random.uniform(6700, 60000); e = random.uniform(0.001, 0.9)
    i = random.uniform(0.01, PI-0.01); raan, argp, nu = (random.uniform(0, TWO_PI) for _ in range(3))
    p = a*(1-e*e); r, v = coe2rv(p, e, i, raan, argp, nu, MU_E)
    p2, e2, i2, raan2, argp2, nu2 = rv2coe(r, v, MU_E)
    angdiff = lambda x, y: abs(math.remainder(x-y, TWO_PI))
    worst = max(worst, abs(p2-p)/p, abs(e2-e), angdiff(i2, i), angdiff(raan2, raan), angdiff(argp2, argp), angdiff(nu2, nu))
print(f"worst relative/absolute error: {worst:.2e}")

# ---------- Kepler's equation ----------
hdr("Kepler's equation: Newton seed comparison, e in [0.9, 0.9999]")
def newton(M, e, E0, it=50, tol=1e-12):
    E = E0
    for _ in range(it):
        f = E - e*math.sin(E) - M; fp = 1 - e*math.cos(E)
        if fp == 0 or not math.isfinite(E): return None
        dE = f/fp; E -= dE
        if abs(dE) < tol: break
    return E if (math.isfinite(E) and abs(E - e*math.sin(E) - M) < 1e-9) else None
cases = 0; fails = {"E0=M": 0, "E0=pi": 0, "Vallado": 0}
for e in np.linspace(0.9, 0.9999, 40):
    for M in np.linspace(-PI+1e-6, PI-1e-6, 190):
        cases += 1
        if newton(M, e, M) is None: fails["E0=M"] += 1
        if newton(M, e, PI) is None: fails["E0=pi"] += 1
        E0 = M - e if -PI < M < 0 else M + e
        if newton(M, e, E0) is None: fails["Vallado"] += 1
for k, f in fails.items(): print(f"{k:8s}: {f}/{cases} failures ({100*f/cases:.2f}%)")

# ---------- two-body anchors ----------
hdr("Two-body anchors")
T_sid = 86164.0905
a_geo = (MU_E*(T_sid/TWO_PI)**2)**(1/3)
print(f"GEO a = {a_geo:.2f} km, alt = {a_geo-R_E:.2f} km, v = {math.sqrt(MU_E/a_geo):.4f} km/s")
r1, r2 = R_E+300, a_geo; at = (r1+r2)/2
dv1 = math.sqrt(MU_E/r1)*(math.sqrt(2*r2/(r1+r2))-1); dv2 = math.sqrt(MU_E/r2)*(1-math.sqrt(2*r1/(r1+r2)))
print(f"Hohmann 300 km LEO -> GEO: dv1 = {dv1:.4f}, dv2 = {dv2:.4f}, total = {dv1+dv2:.4f} km/s, tof = {PI*math.sqrt(at**3/MU_E)/3600:.3f} h")
a_iss = 6798.4; T_iss = TWO_PI*math.sqrt(a_iss**3/MU_E)
print(f"ISS-class a = {a_iss} km: period = {T_iss/60:.3f} min, circular speed = {math.sqrt(MU_E/a_iss):.4f} km/s")
print(f"Molniya critical inclination = {math.degrees(math.acos(math.sqrt(1/5))):.4f} deg")

hdr("J2 secular rates")
def raan_dot(a, e, i): return -1.5*J2*math.sqrt(MU_E)*R_E**2*math.cos(i)/((1-e*e)**2 * a**3.5)
sso_rate = TWO_PI/(365.2421897*86400)
a_sso = R_E+700; cos_i = -sso_rate*a_sso**3.5/(1.5*J2*math.sqrt(MU_E)*R_E**2)
print(f"Sun-synchronous inclination at 700 km circular: {math.degrees(math.acos(cos_i)):.3f} deg")
rd_iss = raan_dot(a_iss, 0.0005, math.radians(51.6312))
print(f"ISS nodal regression: {math.degrees(rd_iss)*86400:.3f} deg/day")
shift_rot = math.degrees(W_E*T_iss); shift_j2 = math.degrees(-rd_iss*T_iss)
print(f"ISS ground-track westward shift per orbit: {shift_rot:.3f} (rotation) + {shift_j2:.3f} (J2) = {shift_rot+shift_j2:.3f} deg")

hdr("Time and frames")
jd = 2461284.5  # 2026-09-01T00:00:00Z
print("JD from Unix ms check:", (1788220800000/86400000 + 2440587.5), "expected", jd)
T = (jd-2451545.0)/36525.0
gmst_sec = -6.2e-6*T**3 + 0.093104*T**2 + (876600.0*3600 + 8640184.812866)*T + 67310.54841
print(f"GMST 2026-09-01 00:00 UTC = {(gmst_sec/240.0) % 360:.7f} deg  (research: 340.1731699)")
print(f"ISS along-track error per 1 s time slip = {math.sqrt(MU_E/a_iss):.2f} km; TAI-UTC 37 s = {37*math.sqrt(MU_E/a_iss):.1f} km")
print(f"AU/day -> km/s factor = {AU/86400:.6f}")

hdr("Ground coverage")
h = 420.0
for eps_deg in (0.0, 5.0):
    eps = math.radians(eps_deg)
    lam = math.acos(R_E/(R_E+h)*math.cos(eps)) - eps
    print(f"ISS 420 km, min elevation {eps_deg:.0f} deg: Earth central angle {math.degrees(lam):.2f} deg, ground radius {R_E*lam:.0f} km")

# ---------- interplanetary ----------
hdr("Interplanetary anchors")
a_E, a_Mars = 1.00000261*AU, 1.52371034*AU
print(f"Earth SOI = {a_E*(MU_E/MU_S)**0.4:,.0f} km; Mars SOI = {a_Mars*(MU_M/MU_S)**0.4:,.0f} km")
TE, TM = TWO_PI*math.sqrt(a_E**3/MU_S)/86400, TWO_PI*math.sqrt(a_Mars**3/MU_S)/86400
print(f"Earth period {TE:.2f} d, Mars period {TM:.2f} d, synodic = {1/abs(1/TE-1/TM):.1f} d")
at = (a_E+a_Mars)/2
print(f"Earth->Mars Hohmann: a_t = {at/1e6:.2f}e6 km, tof = {PI*math.sqrt(at**3/MU_S)/86400:.1f} d")
vinf_d = math.sqrt(MU_S*(2/a_E-1/at)) - math.sqrt(MU_S/a_E)
vinf_a = math.sqrt(MU_S/a_Mars) - math.sqrt(MU_S*(2/a_Mars-1/at))
rp = R_E+300
print(f"  v_inf dep = {vinf_d:.4f} km/s, C3 = {vinf_d**2:.3f} km^2/s^2, dv from 300 km LEO = {math.sqrt(vinf_d**2+2*MU_E/rp)-math.sqrt(MU_E/rp):.4f} km/s")
rpm = R_M+500; ram = R_M+33000; em = (ram-rpm)/(ram+rpm)
print(f"  v_inf arr = {vinf_a:.4f} km/s; Mars capture 500 km circular dv = {math.sqrt(vinf_a**2+2*MU_M/rpm)-math.sqrt(MU_M/rpm):.4f}; "
      f"500 x 33000 km ellipse dv = {math.sqrt(vinf_a**2+2*MU_M/rpm)-math.sqrt(MU_M*(1+em)/rpm):.4f} km/s")
mu_v, r_v = 324858.592, 6051.8
for vinf in (3.0, 6.0):
    rpv = r_v+300; eh = 1 + rpv*vinf**2/mu_v
    print(f"Venus flyby at 300 km, v_inf {vinf} km/s: max turn angle = {math.degrees(2*math.asin(1/eh)):.1f} deg")

# ---------- Lambert ----------
MU = MU_E
def stumpC(z):
    if z > 0: return (1-math.cos(math.sqrt(z)))/z
    if z < 0: return (math.cosh(math.sqrt(-z))-1)/(-z)
    return 0.5
def stumpS(z):
    if z > 0: s = math.sqrt(z); return (s-math.sin(s))/s**3
    if z < 0: s = math.sqrt(-z); return (math.sinh(s)-s)/s**3
    return 1/6

def lambert_uv(r1v, r2v, dt, mu, fixed=True):
    r1, r2 = norm(r1v), norm(r2v)
    th = math.acos(np.clip(np.dot(r1v, r2v)/(r1*r2), -1, 1))
    if np.cross(r1v, r2v)[2] < 0: th = TWO_PI - th
    A = math.sin(th)*math.sqrt(r1*r2/(1-math.cos(th)))
    y = lambda z: r1 + r2 + A*(z*stumpS(z)-1)/math.sqrt(stumpC(z))
    F = lambda z: (y(z)/stumpC(z))**1.5*stumpS(z) + A*math.sqrt(y(z)) - math.sqrt(mu)*dt
    hi = 4*PI*PI - 1e-9
    if fixed:
        lo = -4*PI*PI
        if A > 0:
            # smallest z with y > 0 (F < 0 there); expand down first if y is still positive at lo
            while y(lo) > 0 and F(lo) > 0: lo = 2*lo
            a_, b_ = lo, hi
            if y(a_) <= 0:
                for _ in range(200):
                    m = 0.5*(a_+b_)
                    if y(m) <= 0: a_ = m
                    else: b_ = m
                lo = b_
        else:
            while F(lo) > 0: lo = 2*lo
    else:
        lo = -4*PI*PI
        while A > 0 and y(lo) <= 0: lo += 1e-3*(1+abs(lo))
    for _ in range(400):
        mid = 0.5*(lo+hi)
        if y(mid) <= 0 or F(mid) < 0: lo = mid
        else: hi = mid
    z = 0.5*(lo+hi); yz = y(z)
    f = 1 - yz/r1; g = A*math.sqrt(yz/mu); gd = 1 - yz/r2
    return (r2v - f*r1v)/g, (gd*r2v - r1v)/g

def hyp2f1b(z, tol=1e-11):
    Sj, Cj, j = 1.0, 1.0, 0
    while True:
        Cj1 = Cj*(3+j)*(1+j)/(2.5+j)*z/(j+1); Sj += Cj1; Cj = Cj1; j += 1
        if abs(Cj1) < tol: return Sj

def lambert_izzo(r1v, r2v, tof, mu, lagrange_branch=True):
    r1, r2 = norm(r1v), norm(r2v); c = norm(r2v-r1v); s = (r1+r2+c)/2
    ir1, ir2 = r1v/r1, r2v/r2
    ih = np.cross(ir1, ir2); ih /= norm(ih)
    lam2 = 1 - c/s; lam = math.sqrt(lam2)
    if ih[2] < 0:
        lam = -lam; it1 = np.cross(ir1, ih); it2 = np.cross(ir2, ih)
    else:
        it1 = np.cross(ih, ir1); it2 = np.cross(ih, ir2)
    lam3 = lam*lam2
    T = math.sqrt(2*mu/s**3)*tof
    def x2tof(x):
        dist = abs(x-1)
        if lagrange_branch and 0.01 < dist < 0.2:
            a = 1/(1-x*x)
            if a > 0:
                alfa = 2*math.acos(x); beta = 2*math.asin(math.sqrt(lam2/a))
                if lam < 0: beta = -beta
                return a*math.sqrt(a)*((alfa-math.sin(alfa)) - (beta-math.sin(beta)))/2
            alfa = 2*math.acosh(x); beta = 2*math.asinh(math.sqrt(-lam2/a))
            if lam < 0: beta = -beta
            return -a*math.sqrt(-a)*((beta-math.sinh(beta)) - (alfa-math.sinh(alfa)))/2
        E = x*x - 1; rho = abs(E); z = math.sqrt(1 + lam2*E)
        if dist < 0.01:
            eta = z - lam*x; S1 = 0.5*(1 - lam - x*eta)
            return (eta**3*(4/3)*hyp2f1b(S1) + 4*lam*eta)/2
        yv = math.sqrt(rho); g = x*z - lam*E
        dd = math.acos(g) if E < 0 else math.log(yv*(z-lam*x) + g)
        return (x - lam*z - dd/yv)/E
    T00 = math.acos(lam) + lam*math.sqrt(1-lam2); T1 = 2/3*(1-lam3)
    if T >= T00: x = -(T-T00)/(T-T00+4)
    elif T <= T1: x = 5/2*T1*(T1-T)/((1-lam2*lam3)*T) + 1
    else: x = (T/T00)**(math.log(2)/math.log(T1/T00)) - 1
    it = 0
    for it in range(1, 16):
        tx = x2tof(x); umx2 = 1 - x*x; yy = math.sqrt(1 - lam2*umx2)
        d1 = (3*tx*x - 2 + 2*lam3*x/yy)/umx2
        d2 = (3*tx + 5*x*d1 + 2*(1-lam2)*lam3/yy**3)/umx2
        d3 = (7*x*d2 + 8*d1 - 6*(1-lam2)*lam2*lam3*x/yy**5)/umx2
        delta = tx - T
        xn = x - delta*(d1*d1 - delta*d2/2)/(d1*(d1*d1 - delta*d2) + d3*delta*delta/6)
        if abs(xn - x) < 1e-13: x = xn; break
        x = xn
    gamma = math.sqrt(mu*s/2); rho = (r1-r2)/c; sigma = math.sqrt(1-rho*rho)
    y = math.sqrt(1 - lam2 + lam2*x*x)
    vr1 = gamma*((lam*y - x) - rho*(lam*y + x))/r1
    vr2 = -gamma*((lam*y - x) + rho*(lam*y + x))/r2
    vt = gamma*sigma*(y + lam*x)
    return vr1*ir1 + vt/r1*it1, vr2*ir2 + vt/r2*it2, it, x

def miss_batch(r1s, v1s, tofs, r2s, steps=20000):
    y = np.hstack([np.array(r1s), np.array(v1s)]); h = (np.array(tofs)/steps)[:, None]
    def f(y):
        r = y[:, :3]; rn = np.linalg.norm(r, axis=1)[:, None]
        return np.hstack([y[:, 3:], -MU*r/rn**3])
    for _ in range(steps):
        k1 = f(y); k2 = f(y + 0.5*h*k1); k3 = f(y + 0.5*h*k2); k4 = f(y + h*k3)
        y = y + h/6*(k1 + 2*k2 + 2*k3 + k4)
    return np.linalg.norm(y[:, :3] - np.array(r2s), axis=1)

hdr("Lambert: Curtis Example 5.2")
r1v = np.array([5000.0, 10000.0, 2100.0]); r2v = np.array([-14600.0, 2500.0, 7000.0])
v1u, v2u = lambert_uv(r1v, r2v, 3600.0, 398600.0)
v1i, v2i, nit, _ = lambert_izzo(r1v, r2v, 3600.0, 398600.0)
print("universal variables: v1 =", np.round(v1u, 5), " v2 =", np.round(v2u, 5))
print(f"Izzo ({nit} iterations): v1 =", np.round(v1i, 5), " v2 =", np.round(v2i, 5))
print("expected (research, 3 algorithms): v1 = [-5.99249, 1.92536, 3.24564], v2 = [-3.31246, -4.19662, -0.38529]")

hdr("Lambert: Izzo vs universal variables, 5000 random prograde single-revolution cases")
random.seed(7); worst = 0.0; iters = []; stored = []
def rand_vec(rmin, rmax):
    u = np.random.normal(size=3); u /= norm(u); return u*random.uniform(rmin, rmax)
np.random.seed(7)
for _ in range(5000):
    a, b = rand_vec(7000, 40000), rand_vec(7000, 40000)
    ang = math.acos(np.clip(np.dot(a, b)/(norm(a)*norm(b)), -1, 1))
    if ang < 0.2 or abs(ang-PI) < 0.2: continue
    tof = random.uniform(0.1, 1.2)*TWO_PI*math.sqrt(norm(a)**3/MU_E)
    try:
        vu1, vu2 = lambert_uv(a, b, tof, MU_E); vi1, vi2, n, _ = lambert_izzo(a, b, tof, MU_E); stored.append((a, b, tof, vu1, vi1))
    except (ValueError, ZeroDivisionError):
        continue
    worst = max(worst, norm(vu1-vi1), norm(vu2-vi2)); iters.append(n)
print(f"cases {len(iters)}, worst velocity disagreement {worst:.2e} km/s, Householder iterations mean {np.mean(iters):.2f}, max {max(iters)}")

hdr("Lambert: independent RK4 integration of 300 sampled cases (truth check for both solvers)")
random.seed(3); sample = random.sample(stored, 300)
mu_ = miss_batch([s[0] for s in sample], [s[3] for s in sample], [s[2] for s in sample], [s[1] for s in sample])
mi_ = miss_batch([s[0] for s in sample], [s[4] for s in sample], [s[2] for s in sample], [s[1] for s in sample])
print(f"median miss: universal variables {np.median(mu_):.2e} km, Izzo {np.median(mi_):.2e} km; cases missing by > 1 m: UV {int((mu_ > 1e-3).sum())}, Izzo {int((mi_ > 1e-3).sum())}")
k = int(np.argmax(mi_)); a, b, tof, vu1, vi1 = sample[k]
p_, e_, *_ = rv2coe(a, vi1, MU_E); rp_ = p_/(1+e_)
print(f"worst sampled case: miss {mi_[k]:.3e} km (both solvers), transfer periapsis radius {rp_:.1f} km (Earth radius is {R_E} km)")
fine = miss_batch([a], [vi1], [tof], [b], steps=200000)[0]
print(f"same case re-integrated with 10x smaller RK4 step: miss {fine:.3e} km  -> the outlier is the integrator near the centre, not the solver")

# ---------- precision ----------
hdr("Floating-point spacing")
for label, val in (("1 AU in km", AU), ("30 AU in km", 30*AU), ("1 AU in AU units", 1.0), ("GEO radius in 1000-km units", 42.164), ("camera 1000 km away, km", 1000.0)):
    print(f"{label:30s}: float32 step {float(np.spacing(np.float32(val))):.4g}   float64 step {float(np.spacing(np.float64(val))):.4g}")
print(f"float32 step at 1 AU expressed in AU units, converted to km: {float(np.spacing(np.float32(1.0)))*AU:.2f} km")

# ---------- multi-objective ----------
hdr("Weighted-sum counterexample")
pts = {"A": (1, 10), "B": (5, 7), "C": (10, 1)}
wins = {k: 0 for k in pts}
for w in np.linspace(0, 1, 2001):
    best = min(pts, key=lambda k: (w*pts[k][0] + (1-w)*pts[k][1], k))
    wins[best] += 1
dominated = any(all(o[j] <= pts["B"][j] for j in range(2)) and o != pts["B"] for o in pts.values())
print("selections over 2001 weights:", wins, "| B dominated?", dominated, "| chord A-C at f1=5:", 10 + (5-1)*(1-10)/(10-1))
