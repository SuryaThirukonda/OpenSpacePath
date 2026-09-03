"""T1.4 / Track-1 Q2: why true anomaly runs non-uniformly while mean anomaly runs uniformly.
Rigorous: h = r^2 dtheta/dt is constant (Kepler II / conservation of angular momentum), so
dtheta/dt = h/r^2 varies as 1/r^2; M := n t is *defined* to be uniform (M = 2 pi t/P).
Ratio at any point:  dtheta/dt / n = (1 + e cos theta)^2 / (1-e^2)^{3/2}.
"""
import math
MU = 398600.4418

def solve_kepler(M, e, tol=1e-13):
    E = M if e < 0.8 else math.pi
    hist = [E]
    for k in range(60):
        d = (E - e*math.sin(E) - M)/(1 - e*math.cos(E))
        E -= d; hist.append(E)
        if abs(d) < tol: break
    return E, hist

def theta_of_E(E, e):
    return (2*math.atan2(math.sqrt(1+e)*math.sin(E/2), math.sqrt(1-e)*math.cos(E/2))) % (2*math.pi)

for name, a, e in [("mild ellipse", 10000.0, 0.3), ("Molniya", 26554.0, 0.74)]:
    n = math.sqrt(MU/a**3); P = 2*math.pi/n
    p = a*(1-e*e); h = math.sqrt(MU*p)
    print("="*90)
    print(f"{name}: a={a} km e={e}  n={n:.6e} rad/s  P={P/60:.2f} min  h={h:.1f} km^2/s")
    print(f"  ratio (dtheta/dt)/n at periapsis = (1+e)^2/(1-e^2)^1.5 = {(1+e)**2/(1-e*e)**1.5:.4f}")
    print(f"  ratio (dtheta/dt)/n at apoapsis  = (1-e)^2/(1-e^2)^1.5 = {(1-e)**2/(1-e*e)**1.5:.4f}")
    print(f"  {'t/P':>6} {'M deg':>8} {'E deg':>8} {'theta deg':>10} {'r km':>9} {'dtheta/dt (deg/s)':>18} {'dM/dt (deg/s)':>14} {'iters':>5}")
    for frac in [0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 0.95]:
        M = 2*math.pi*frac
        E, hist = solve_kepler(M, e)
        th = theta_of_E(E, e)
        r = p/(1+e*math.cos(th))
        dth = h/r**2
        print(f"  {frac:6.2f} {math.degrees(M):8.2f} {math.degrees(E):8.2f} {math.degrees(th):10.2f} {r:9.1f} {math.degrees(dth):18.5f} {math.degrees(n):14.5f} {len(hist)-1:5d}")
    # time spent in each half
    # fraction of period with theta in (-90,90) i.e. near periapsis: from E at theta=90: cosE = (e+cos th)/(1+e cos th) = e
    E90 = math.acos(e); M90 = E90 - e*math.sin(E90)
    print(f"  fraction of the period spent within 90 deg of periapsis = 2*M(theta=90)/2pi = {2*M90/(2*math.pi):.3f}  (so {1-2*M90/(2*math.pi):.3f} of the time it is in the apoapsis half)")

print("="*90)
print("Newton-Raphson convergence for Kepler's equation, e=0.74, M=30 deg (seed E0=pi since e>=0.8? no: e<0.8 -> seed M):")
E, hist = solve_kepler(math.radians(30), 0.74)
for k, Ek in enumerate(hist):
    print(f"  iter {k}: E = {math.degrees(Ek):.10f} deg   residual E - e sinE - M = {Ek - 0.74*math.sin(Ek) - math.radians(30):+.3e}")
print("Seed rule from master doc: E0 = M if e<0.8 else pi (Curtis uses E0 = M +/- e/2; both converge quadratically).")
