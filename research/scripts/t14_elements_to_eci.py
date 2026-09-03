"""T1.4 / Track-1 Q1: elements -> ECI position, hand cases, and independent checks.

Conventions (Curtis ch. 4, professor's 3-1-3 notebook):
  perifocal frame: x_p toward periapsis, y_p 90 deg ahead in the direction of motion, z_p along h.
  ECI = Rz(RAAN) . Rx(i) . Rz(argp) . perifocal      (active rotations, i.e. Q_{pX} = [Q_{Xp}]^T in Curtis eq 4.49)
  r   = a(1-e^2)/(1+e cos(theta)), theta = true anomaly.
Units: km, rad, s. mu_Earth = 398600.4418 km^3/s^2 (master doc value; SGP4/WGS72 uses 398600.8).
"""
import math
import numpy as np

MU = 398600.4418

def Rz(t):
    c, s = math.cos(t), math.sin(t)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])

def Rx(t):
    c, s = math.cos(t), math.sin(t)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])

def perifocal_rv(a, e, theta):
    p = a * (1 - e * e)
    r = p / (1 + e * math.cos(theta))
    r_p = np.array([r * math.cos(theta), r * math.sin(theta), 0.0])
    h = math.sqrt(MU * p)
    v_p = (MU / h) * np.array([-math.sin(theta), e + math.cos(theta), 0.0])   # Curtis eq 4.38
    return r_p, v_p

def elements_to_eci(a, e, i, raan, argp, theta):
    Q = Rz(raan) @ Rx(i) @ Rz(argp)          # perifocal -> ECI
    r_p, v_p = perifocal_rv(a, e, theta)
    return Q @ r_p, Q @ v_p

def elements_to_eci_master_js(a, e, i, raan, argp, theta):
    """Line-for-line port of the master doc sec 6.1 JS expression (cO,sO,ci,si,cw,sw), to prove
    the explicit 3x3 product in the JS is the same matrix as Rz(raan) Rx(i) Rz(argp)."""
    r = a * (1 - e * e) / (1 + e * math.cos(theta))
    xp, yp = r * math.cos(theta), r * math.sin(theta)
    cO, sO = math.cos(raan), math.sin(raan)
    ci, si = math.cos(i), math.sin(i)
    cw, sw = math.cos(argp), math.sin(argp)
    return np.array([
        (cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp,
        (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp,
        (sw * si) * xp + (cw * si) * yp,
    ])

def solve_kepler(M, e, tol=1e-12):
    E = M if e < 0.8 else math.pi
    for k in range(50):
        d = (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
        E -= d
        if abs(d) < tol:
            return E, k + 1
    return E, 50

def true_from_mean(M, e):
    E, iters = solve_kepler(M, e)
    theta = 2 * math.atan2(math.sqrt(1 + e) * math.sin(E / 2), math.sqrt(1 - e) * math.cos(E / 2))
    return theta % (2 * math.pi), E, iters

d2r = math.pi / 180
print("=" * 78)
print("HAND CASES (all a=7000 km unless stated; expected values derived by hand in the notes)")
print("=" * 78)
cases = [
    ("A: equatorial circular, theta=90 deg        -> (0, 7000, 0)",            (7000, 0.0, 0, 0, 0, 90)),
    ("B: polar (i=90), RAAN=0, argp=0, theta=90   -> (0, 0, 7000) over N pole", (7000, 0.0, 90, 0, 0, 90)),
    ("C: i=30, RAAN=60, argp=0, theta=90          -> (-5250.00, 3031.09, 3500.00)", (7000, 0.0, 30, 60, 0, 90)),
    ("D: a=10000 e=0.3, i=0, argp=90, theta=0     -> periapsis r=7000 along +y: (0,7000,0)", (10000, 0.3, 0, 0, 90, 0)),
    ("E: a=10000 e=0.3, i=0, argp=90, theta=180   -> apoapsis r=13000 along -y: (0,-13000,0)", (10000, 0.3, 0, 0, 90, 180)),
    ("F: ISS-like a=6795 e=0.0005 i=51.6 RAAN=282.4 argp=96.5 theta=0", (6795, 0.0005, 51.6, 282.4, 96.5, 0)),
]
for label, (a, e, i, O, w, th) in cases:
    r, v = elements_to_eci(a, e, i * d2r, O * d2r, w * d2r, th * d2r)
    r_js = elements_to_eci_master_js(a, e, i * d2r, O * d2r, w * d2r, th * d2r)
    print(f"\n{label}")
    print(f"   r_ECI = ({r[0]:10.3f}, {r[1]:10.3f}, {r[2]:10.3f}) km   |r| = {np.linalg.norm(r):9.3f} km")
    print(f"   v_ECI = ({v[0]:8.4f}, {v[1]:8.4f}, {v[2]:8.4f}) km/s  |v| = {np.linalg.norm(v):7.4f} km/s   vis-viva sqrt(mu(2/r-1/a)) = {math.sqrt(MU*(2/np.linalg.norm(r)-1/a)):7.4f}")
    print(f"   master-doc JS formula agrees to {np.max(np.abs(r - r_js)):.2e} km")
    # angular momentum direction check: h should be Rz(RAAN) Rx(i) z_hat
    h = np.cross(r, v)
    h_expected = Rz(O * d2r) @ Rx(i * d2r) @ np.array([0, 0, 1.0]) * math.sqrt(MU * a * (1 - e * e))
    print(f"   h = ({h[0]:.1f}, {h[1]:.1f}, {h[2]:.1f}) km^2/s ; expected from (RAAN,i) matches to {np.max(np.abs(h-h_expected)):.2e}")

print("\n" + "=" * 78)
print("Case C by hand, step by step (i=30, RAAN=60, argp=0, theta=90, r=7000):")
print("  perifocal r_p = (7000 cos90, 7000 sin90, 0) = (0, 7000, 0)")
print("  Rz(argp=0): unchanged")
print("  Rx(30):  y' = 7000 cos30 = %.2f ; z' = 7000 sin30 = %.2f" % (7000 * math.cos(30 * d2r), 7000 * math.sin(30 * d2r)))
print("  Rz(60):  x = 0*cos60 - %.2f*sin60 = %.2f ; y = 0*sin60 + %.2f*cos60 = %.2f ; z = %.2f"
      % (7000 * math.cos(30 * d2r), -7000 * math.cos(30 * d2r) * math.sin(60 * d2r), 7000 * math.cos(30 * d2r),
         7000 * math.cos(30 * d2r) * math.cos(60 * d2r), 3500.0))

print("\n" + "=" * 78)
print("INDEPENDENT CHECK 1: round-trip through Skyfield's OsculatingElements (r,v -> elements)")
print("=" * 78)
try:
    from skyfield.api import load
    from skyfield.elementslib import OsculatingElements
    from skyfield.units import Distance, Velocity
    ts = load.timescale(builtin=True)
    t = ts.utc(2026, 9, 1, 12, 0, 0)
    for label, (a, e, i, O, w, th) in cases:
        r, v = elements_to_eci(a, e, i * d2r, O * d2r, w * d2r, th * d2r)
        el = OsculatingElements(Distance(km=r), Velocity(km_per_s=v), t, MU)
        rec = (el.semi_major_axis.km, el.eccentricity, el.inclination.degrees,
               el.longitude_of_ascending_node.degrees, el.argument_of_periapsis.degrees, el.true_anomaly.degrees)
        print(f"{label.split(':')[0]}: in  a={a} e={e} i={i} RAAN={O} argp={w} theta={th}")
        print(f"    skyfield a={rec[0]:.3f} e={rec[1]:.6f} i={rec[2]:.4f} RAAN={rec[3]:.4f} argp={rec[4]:.4f} theta={rec[5]:.4f}"
              "   (RAAN/argp undefined when i=0 or e=0: only their sum/(argp+theta) is meaningful there)")
except Exception as ex:
    print("skyfield check skipped:", repr(ex))

print("\n" + "=" * 78)
print("INDEPENDENT CHECK 2: numerical velocity vs analytic, ISS-like orbit propagated by Kepler's equation")
print("=" * 78)
a, e, i, O, w = 6795.0, 0.0005, 51.6 * d2r, 282.4 * d2r, 96.5 * d2r
n = math.sqrt(MU / a ** 3)
P = 2 * math.pi / n
print(f"n = sqrt(mu/a^3) = {n:.6e} rad/s ; period = {P/60:.3f} min ; circular speed sqrt(mu/a) = {math.sqrt(MU/a):.4f} km/s")
M0 = 0.0
dt = 0.5
for t_s in [0, 600, 1500, 2786, P / 2]:
    th, E, it = true_from_mean(M0 + n * t_s, e)
    r, v = elements_to_eci(a, e, i, O, w, th)
    th2, _, _ = true_from_mean(M0 + n * (t_s + dt), e)
    th1, _, _ = true_from_mean(M0 + n * (t_s - dt), e)
    r2, _ = elements_to_eci(a, e, i, O, w, th2)
    r1, _ = elements_to_eci(a, e, i, O, w, th1)
    v_num = (r2 - r1) / (2 * dt)
    print(f"t={t_s:8.1f} s  M={math.degrees(M0+n*t_s)%360:8.3f} deg  theta={math.degrees(th):8.3f} deg  Newton iters={it}  "
          f"|r|={np.linalg.norm(r):9.3f} km  |v| analytic={np.linalg.norm(v):.4f}  numeric={np.linalg.norm(v_num):.4f} km/s  "
          f"lat={math.degrees(math.asin(r[2]/np.linalg.norm(r))):7.3f} deg")
print("Max |lat| over the orbit should equal i = 51.6 deg (inclination = max latitude reached):",
      f"{max(math.degrees(math.asin(elements_to_eci(a,e,i,O,w,tt)[0][2]/np.linalg.norm(elements_to_eci(a,e,i,O,w,tt)[0]))) for tt in np.linspace(0,2*math.pi,3601)):.3f} deg")
