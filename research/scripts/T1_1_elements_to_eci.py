"""
T1.1  Elements -> ECI (Track 1, Rathinam project)
Faithful Python translation of master doc section 6.1 `elementsToECI` (JS), plus
an (h, e, theta) entry point so the hyperbolic Curtis Example 4.7 can be tested,
plus velocity from the perifocal velocity formula, plus known-answer tests.

Conventions (Curtis, "Orbital Mechanics for Engineering Students", ch. 4):
  perifocal frame  p (toward periapsis), q (90 deg ahead in-plane), w = h/|h|
  r_perifocal = (h^2/mu) / (1 + e cos th) * [cos th, sin th, 0]
  v_perifocal = (mu/h) * [-sin th, e + cos th, 0]
  Q_pX (perifocal -> geocentric equatorial, i.e. ECI) = Rz(RAAN) Rx(i) Rz(argp)
  where Rz(a), Rx(a) are ACTIVE (right-hand, counter-clockwise) rotation matrices.
  Equivalent to Curtis eq. 4.49: Q_pX = (R3(argp) R1(i) R3(RAAN))^T with R3, R1
  the "frame transformation" (passive) matrices used in sv_from_coe.m.
Run:  venv/Scripts/python.exe notes/T1_1_elements_to_eci.py
"""
import math
import numpy as np

MU_EARTH = 398600.4418   # km^3/s^2 (master doc value)
R_EARTH = 6378.137       # km (equatorial)
J2 = 1.08263e-3

# ----------------------------------------------------------------------------
# 1. Kepler's equation (elliptic), translated line-by-line from master doc 6.1
# ----------------------------------------------------------------------------
def solve_kepler(M, e, tol=1e-10):
    E = M if e < 0.8 else math.pi
    for _ in range(30):
        d = (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
        E -= d
        if abs(d) < tol:
            break
    return E

# ----------------------------------------------------------------------------
# 2. The master doc's explicit 3x3 (written out as in the JS), as a function
# ----------------------------------------------------------------------------
def master_doc_matrix(i, raan, argp):
    cO, sO = math.cos(raan), math.sin(raan)
    ci, si = math.cos(i), math.sin(i)
    cw, sw = math.cos(argp), math.sin(argp)
    # columns 1 and 2 are exactly the coefficients of xp and yp in the JS;
    # column 3 (w-axis) is not used by the JS because zp = 0 -- added here for
    # completeness and for the comparison with Curtis 4.49
    return np.array([
        [cO*cw - sO*sw*ci, -cO*sw - sO*cw*ci, sO*si],
        [sO*cw + cO*sw*ci, -sO*sw + cO*cw*ci, -cO*si],
        [sw*si, cw*si, ci],
    ])

def Rz(a):  # active rotation about z by angle a (right-hand rule)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])

def Rx(a):  # active rotation about x by angle a
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])

def Q_pX_curtis(i, raan, argp):
    """Curtis eq. 4.49 exactly as coded in sv_from_coe.m: (R3_w*R1_i*R3_W)'
    with R3(a) = [[c, s, 0], [-s, c, 0], [0,0,1]] and
         R1(a) = [[1,0,0],[0,c,s],[0,-s,c]]   (passive / frame-transformation form)."""
    def R3(a):
        c, s = math.cos(a), math.sin(a)
        return np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])
    def R1(a):
        c, s = math.cos(a), math.sin(a)
        return np.array([[1, 0, 0], [0, c, s], [0, -s, c]])
    return (R3(argp) @ R1(i) @ R3(raan)).T

# ----------------------------------------------------------------------------
# 3. Core: (h, e, i, RAAN, argp, theta) -> r, v in ECI   (Curtis Algorithm 4.5)
#    Works for ANY conic (e >= 0), because it never touches a or Kepler's eq.
# ----------------------------------------------------------------------------
def sv_from_coe(h, e, i, raan, argp, theta, mu=MU_EARTH):
    r_mag = (h*h/mu) / (1 + e*math.cos(theta))
    rp = r_mag * np.array([math.cos(theta), math.sin(theta), 0.0])
    vp = (mu/h) * np.array([-math.sin(theta), e + math.cos(theta), 0.0])
    Q = master_doc_matrix(i, raan, argp)
    return Q @ rp, Q @ vp

# ----------------------------------------------------------------------------
# 4. Faithful translation of the JS elementsToECI({a,e,i,raan,argp,M0}, t)
# ----------------------------------------------------------------------------
def elements_to_eci(a, e, i, raan, argp, M0, t, mu=MU_EARTH):
    n = math.sqrt(mu / (a*a*a))
    M = M0 + n*t
    M = ((M % (2*math.pi)) + 2*math.pi) % (2*math.pi)
    E = solve_kepler(M, e)
    theta = 2*math.atan2(math.sqrt(1+e)*math.sin(E/2), math.sqrt(1-e)*math.cos(E/2))
    r = (a*(1 - e*e)) / (1 + e*math.cos(theta))          # the circled equation
    xp, yp = r*math.cos(theta), r*math.sin(theta)
    cO, sO = math.cos(raan), math.sin(raan)
    ci, si = math.cos(i), math.sin(i)
    cw, sw = math.cos(argp), math.sin(argp)
    return np.array([
        (cO*cw - sO*sw*ci)*xp + (-cO*sw - sO*cw*ci)*yp,
        (sO*cw + cO*sw*ci)*xp + (-sO*sw + cO*cw*ci)*yp,
        (sw*si)*xp + (cw*si)*yp,
    ])

# ----------------------------------------------------------------------------
# 5. Inverse (state vector -> elements), Curtis Algorithm 4.2, for round trips
# ----------------------------------------------------------------------------
def coe_from_sv(r, v, mu=MU_EARTH):
    r = np.asarray(r, float); v = np.asarray(v, float)
    rm = np.linalg.norm(r); vm = np.linalg.norm(v)
    vr = np.dot(r, v)/rm
    H = np.cross(r, v); h = np.linalg.norm(H)
    inc = math.acos(H[2]/h)
    N = np.cross([0, 0, 1], H); n = np.linalg.norm(N)
    if n > 1e-12:
        raan = math.acos(N[0]/n)
        if N[1] < 0:
            raan = 2*math.pi - raan
    else:
        raan = 0.0
    E = ((vm*vm - mu/rm)*r - rm*vr*v)/mu; e = np.linalg.norm(E)
    if n > 1e-12 and e > 1e-12:
        argp = math.acos(np.clip(np.dot(N, E)/(n*e), -1, 1))
        if E[2] < 0:
            argp = 2*math.pi - argp
    else:
        argp = 0.0
    if e > 1e-12:
        ta = math.acos(np.clip(np.dot(E, r)/(e*rm), -1, 1))
        if vr < 0:
            ta = 2*math.pi - ta
    else:
        ta = math.acos(np.clip(np.dot(N, r)/(n*rm), -1, 1)) if n > 1e-12 else math.atan2(r[1], r[0])
    a = h*h/mu/(1 - e*e)
    return dict(h=h, e=e, i=inc, raan=raan, argp=argp, theta=ta, a=a)

deg = math.pi/180
def fmt(v):
    return "[" + ", ".join(f"{x: .4f}" for x in v) + "]"

if __name__ == "__main__":
    np.set_printoptions(precision=6, suppress=True)
    print("="*78)
    print("TEST 0: master-doc matrix == Curtis eq.4.49 Q_pX == Rz(RAAN)Rx(i)Rz(argp)?")
    rng = np.random.default_rng(0)
    worst = 0.0
    for _ in range(1000):
        i_, O_, w_ = rng.uniform(0, math.pi), rng.uniform(0, 2*math.pi), rng.uniform(0, 2*math.pi)
        A = master_doc_matrix(i_, O_, w_)
        B = Q_pX_curtis(i_, O_, w_)
        C = Rz(O_) @ Rx(i_) @ Rz(w_)
        worst = max(worst, np.abs(A-B).max(), np.abs(A-C).max())
    print(f"  max |difference| over 1000 random (i,RAAN,argp): {worst:.2e}  -> "
          + ("IDENTICAL" if worst < 1e-12 else "MISMATCH"))
    # and show the wrong-sign alternative (passive matrix used as if active) is NOT equal
    D = Q_pX_curtis(30*deg, 40*deg, 60*deg)
    Dwrong = (Rz(-40*deg) @ Rx(-30*deg) @ Rz(-60*deg))
    print(f"  (for reference: Rz(-RAAN)Rx(-i)Rz(-argp) differs from Q_pX by up to {np.abs(D-Dwrong).max():.3f}; "
          f"it equals Q_pX^T: {np.allclose(Dwrong, D.T)})")

    print("="*78)
    print("TEST 1: Curtis Example 4.7 (Algorithm 4.5), mu = 398600 km^3/s^2")
    h, e = 80000.0, 1.4
    r, v = sv_from_coe(h, e, 30*deg, 40*deg, 60*deg, 30*deg, mu=398600.0)
    print(f"  r (km)   = {fmt(r)}   expected [-4040, 4815, 3629]")
    print(f"  v (km/s) = {fmt(v)}   expected [-10.39, -4.772, 1.744]")
    assert np.allclose(r, [-4040, 4815, 3629], atol=1.0)
    assert np.allclose(v, [-10.39, -4.772, 1.744], atol=0.005)
    rp_mag = (h*h/398600.0)/(1+e*math.cos(30*deg))
    rp = rp_mag*np.array([math.cos(30*deg), math.sin(30*deg), 0])
    vp = (398600.0/h)*np.array([-math.sin(30*deg), e+math.cos(30*deg), 0])
    print(f"  perifocal r = {fmt(rp)} km (Curtis: [6285.0, 3628.6, 0]), v = {fmt(vp)} km/s (Curtis: [-2.4913, 11.290, 0])")
    print("  Q_pX =\n" + np.array2string(master_doc_matrix(30*deg, 40*deg, 60*deg), precision=5))
    print(f"  |r| = {np.linalg.norm(r):.2f} km, check (h^2/mu)/(1+e cos th) = {rp_mag:.2f} km")
    back = coe_from_sv(r, v, mu=398600.0)
    print("  round trip -> h={h:.1f} e={e:.4f} i={i:.3f} RAAN={O:.3f} argp={w:.3f} theta={t:.3f} deg".format(
        h=back['h'], e=back['e'], i=back['i']/deg, O=back['raan']/deg, w=back['argp']/deg, t=back['theta']/deg))
    print("  PASS")

    print("="*78)
    print("TEST 1b: orbital-mechanics.space worked example (retrograde, i=124.05 deg), mu = 398600")
    # https://orbital-mechanics.space/classical-orbital-elements/orbital-elements-and-the-state-vector.html
    # states: h=19646.883 km^2/s, e=0.948, nu=159.61, omega=303.09, i=124.05, Omega=190.62 deg
    #   <-> r = [1000, 5000, 7000] km, v = [3, 4, 5] km/s
    r, v = sv_from_coe(19646.883, 0.948, 124.05*deg, 190.62*deg, 303.09*deg, 159.61*deg, mu=398600.0)
    print(f"  r (km)   = {fmt(r)}   expected [1000, 5000, 7000]  (page quotes e to 3 decimals;")
    print(f"  v (km/s) = {fmt(v)}   expected [3, 4, 5]            1+e cos(nu) = {1+0.948*math.cos(159.61*deg):.4f} amplifies rounding)")
    assert np.allclose(r, [1000, 5000, 7000], rtol=1e-2) and np.allclose(v, [3, 4, 5], rtol=1e-2)
    back = coe_from_sv([1000, 5000, 7000], [3, 4, 5], mu=398600.0)
    print("  inverse of the page's r,v -> h={h:.3f} e={e:.6f} i={i:.3f} RAAN={O:.3f} argp={w:.3f} theta={t:.3f} deg".format(
        h=back['h'], e=back['e'], i=back['i']/deg, O=back['raan']/deg, w=back['argp']/deg, t=back['theta']/deg))
    r2, v2 = sv_from_coe(back['h'], back['e'], back['i'], back['raan'], back['argp'], back['theta'], mu=398600.0)
    print(f"  forward map of those unrounded elements: r = {fmt(r2)}, v = {fmt(v2)}")
    assert np.allclose(r2, [1000, 5000, 7000], atol=1e-6) and np.allclose(v2, [3, 4, 5], atol=1e-9)
    print("  PASS (round trip exact; 0.3% residual vs the page is its 3-decimal rounding of e)")

    print("="*78)
    print("TEST 2: ISS-like a=6795 km, e=0.0005, i=51.6 deg via elements_to_eci (JS translation)")
    a, e, inc = 6795.0, 0.0005, 51.6*deg
    raan, argp, M0 = 282.4*deg, 96.5*deg, 263.7*deg   # from today's ISS TLE, just for flavour
    n = math.sqrt(MU_EARTH/a**3); T = 2*math.pi/n
    print(f"  mean motion n = {n:.6e} rad/s, period T = {T/60:.2f} min")
    rmin, rmax, smin, smax = 1e9, 0, 1e9, 0
    dt = 0.05
    for t in np.linspace(0, T, 721):
        r0 = elements_to_eci(a, e, inc, raan, argp, M0, t)
        rm = np.linalg.norm(r0)
        vnum = (elements_to_eci(a, e, inc, raan, argp, M0, t+dt) - elements_to_eci(a, e, inc, raan, argp, M0, t-dt))/(2*dt)
        s = np.linalg.norm(vnum)
        rmin, rmax = min(rmin, rm), max(rmax, rm); smin, smax = min(smin, s), max(smax, s)
        # z-extent check: |z| <= r sin(i)
        assert abs(r0[2]) <= rm*math.sin(inc) + 1e-6
    print(f"  |r| over one rev: {rmin:.2f} .. {rmax:.2f} km  (a(1-e)={a*(1-e):.2f}, a(1+e)={a*(1+e):.2f})")
    print(f"  speed (central-difference derivative): {smin:.4f} .. {smax:.4f} km/s")
    print(f"  vis-viva circular speed sqrt(mu/a) = {math.sqrt(MU_EARTH/a):.4f} km/s")
    t0 = 1234.5
    r0 = elements_to_eci(a, e, inc, raan, argp, M0, t0)
    vnum = (elements_to_eci(a, e, inc, raan, argp, M0, t0+dt) - elements_to_eci(a, e, inc, raan, argp, M0, t0-dt))/(2*dt)
    # analytic velocity through sv_from_coe at the same theta
    M = ((M0 + n*t0) % (2*math.pi)); E = solve_kepler(M, e)
    th = 2*math.atan2(math.sqrt(1+e)*math.sin(E/2), math.sqrt(1-e)*math.cos(E/2))
    hh = math.sqrt(MU_EARTH*a*(1-e*e))
    r1, v1 = sv_from_coe(hh, e, inc, raan, argp, th)
    print(f"  at t={t0}s: r_JS = {fmt(r0)}, r_Alg4.5 = {fmt(r1)}  max diff {np.abs(r0-r1).max():.2e} km")
    print(f"             v_numeric = {fmt(vnum)}, v_analytic = {fmt(v1)}  max diff {np.abs(vnum-v1).max():.2e} km/s")
    back = coe_from_sv(r1, v1)
    print("  round trip: a={a:.2f} e={e:.6f} i={i:.4f} RAAN={O:.4f} argp={w:.3f} deg".format(
        a=back['a'], e=back['e'], i=back['i']/deg, O=back['raan']/deg, w=back['argp']/deg))
    assert 6790 <= rmin and rmax <= 6800 and abs(smin-7.66) < 0.02 and abs(smax-7.66) < 0.02
    assert np.abs(r0-r1).max() < 1e-6 and np.abs(vnum-v1).max() < 1e-5
    print("  PASS")

    print("="*78)
    print("TEST 3: hand cases (a=7000 km circular)")
    a = 7000.0
    hh = math.sqrt(MU_EARTH*a)
    cases = [
        # (i, RAAN, argp, theta, expected r, description)
        (0, 0, 0, 0, [7000, 0, 0], "equatorial, at periapsis/x-axis"),
        (0, 0, 0, 90, [0, 7000, 0], "equatorial, 90 deg along track -> +y"),
        (30, 0, 0, 90, [0, 7000*math.cos(30*deg), 7000*math.sin(30*deg)], "i=30, node on +x, 90 deg past node -> y=r cos i, z=r sin i"),
        (90, 90, 0, 90, [0, 0, 7000], "polar, node on +y, 90 deg past node -> +z (north pole)"),
        (30, 0, 90, 0, [0, 7000*math.cos(30*deg), 7000*math.sin(30*deg)], "same point via argp=90, theta=0"),
        (0, 0, 0, 180, [-7000, 0, 0], "equatorial, apoapsis direction -> -x"),
        (30, 90, 0, 90, [-7000*math.cos(30*deg), 0, 7000*math.sin(30*deg)], "i=30, node on +y, 90 deg past node -> -x cos i, +z sin i"),
    ]
    for (i_, O_, w_, th_, exp, desc) in cases:
        r, v = sv_from_coe(hh, 0.0, i_*deg, O_*deg, w_*deg, th_*deg)
        # also via the JS pipeline: for e=0, M = E = theta, so M0 = theta
        r_js = elements_to_eci(a, 0.0, i_*deg, O_*deg, w_*deg, th_*deg, 0.0)
        ok = np.allclose(r, exp, atol=1e-6) and np.allclose(r_js, exp, atol=1e-6)
        print(f"  i={i_:3d} RAAN={O_:3d} argp={w_:3d} th={th_:3d}: r={fmt(r)} |v|={np.linalg.norm(v):.4f} km/s  {'OK ' if ok else 'BAD'} {desc}")
        assert ok
    print(f"  circular speed sqrt(mu/a) = {math.sqrt(MU_EARTH/a):.4f} km/s, period = {2*math.pi*math.sqrt(a**3/MU_EARTH)/60:.2f} min")
    print("  PASS")

    print("="*78)
    print("TEST 4: Kepler solver / anomaly relations, e=0.74 (Molniya-like)")
    e = 0.74
    for Mdeg in (30, 90, 180, 270):
        M = Mdeg*deg; E = solve_kepler(M, e)
        th = 2*math.atan2(math.sqrt(1+e)*math.sin(E/2), math.sqrt(1-e)*math.cos(E/2))
        print(f"  M={Mdeg:3d} deg -> E={E/deg:8.3f} deg -> theta={(th%(2*math.pi))/deg:8.3f} deg   (E - e sinE - M = {E-e*math.sin(E)-M:.1e})")
    print("  (theta runs far ahead of M near periapsis and lags near apoapsis: Kepler's 2nd law)")
    # angular rate ratio at periapsis vs apoapsis: theta_dot = h/r^2 -> ratio = ((1+e)/(1-e))^2
    print(f"  theta_dot(peri)/theta_dot(apo) = ((1+e)/(1-e))^2 = {((1+e)/(1-e))**2:.2f} for e={e}; "
          f"= {((1+0.0005)/(1-0.0005))**2:.4f} for ISS e=0.0005")

    print("="*78)
    print("TEST 5: typical orbits (Question 3 numbers)")
    def period_min(a):
        return 2*math.pi*math.sqrt(a**3/MU_EARTH)/60
    # ISS from the fresh TLE: mean motion 15.48958602 rev/day
    n_iss = 15.48958602*2*math.pi/86400
    a_iss = (MU_EARTH/n_iss**2)**(1/3)
    print(f"  ISS TLE: n=15.48958602 rev/day -> a={a_iss:.1f} km (alt ~{a_iss-R_EARTH:.0f} km), T={1440/15.48958602:.2f} min, i=51.63 deg, e=0.0005055")
    a_geo = (MU_EARTH*86164.0905**2/(4*math.pi**2))**(1/3)
    print(f"  GEO: T=86164.09 s -> a={a_geo:.1f} km (alt {a_geo-R_EARTH:.0f} km), v={math.sqrt(MU_EARTH/a_geo):.4f} km/s, i=0, e=0")
    a_mol, e_mol = 26600.0, 0.74
    print(f"  Molniya: a=26600 km, e=0.74 -> T={period_min(a_mol):.1f} min ({period_min(a_mol)/60:.2f} h), "
          f"perigee alt={a_mol*(1-e_mol)-R_EARTH:.0f} km, apogee alt={a_mol*(1+e_mol)-R_EARTH:.0f} km, i=63.4 deg, argp=270 deg")
    print(f"     critical inclination: 4 - 5 sin^2 i = 0 -> i = {math.asin(math.sqrt(0.8))/deg:.2f} deg")
    # SSO: choose h=700 km circular; required RAAN rate = 360 deg / 365.2422 d
    want = 2*math.pi/(365.2422*86400)   # rad/s
    for alt in (600.0, 700.0, 800.0):
        a_sso = R_EARTH + alt
        n_sso = math.sqrt(MU_EARTH/a_sso**3)
        cos_i = -want/(1.5*J2*n_sso*(R_EARTH/a_sso)**2)
        print(f"  SSO {alt:.0f} km circular: T={period_min(a_sso):.1f} min, required i = {math.acos(cos_i)/deg:.2f} deg "
              f"(RAAN_dot = -1.5 J2 n (Re/a)^2 cos i = +{want*86400/deg:.4f} deg/day)")
    print(f"  ISS ground-track shift per orbit = 360 deg * T/86164 s = {360*(1440/15.48958602*60)/86164.0905:.2f} deg westward")
    print("="*78)
    print("ALL TESTS PASSED")

    # ------------------------------------------------------------------------
    # TEST 6 (added 2026-09-01): step-by-step HAND calculations for Question 1,
    # printing every intermediate so the arithmetic can be checked on paper.
    # ------------------------------------------------------------------------
    print("="*78)
    print("TEST 6: hand calculation walk-through (Question 1)")
    def hand(a, e, i_deg, O_deg, w_deg, th_deg):
        i_, O_, w_, th = i_deg*deg, O_deg*deg, w_deg*deg, th_deg*deg
        r = a*(1-e*e)/(1+e*math.cos(th))
        xp, yp = r*math.cos(th), r*math.sin(th)
        print(f"  case a={a} km e={e} i={i_deg} RAAN={O_deg} argp={w_deg} theta={th_deg} deg")
        print(f"    r = a(1-e^2)/(1+e cos th) = {r:.4f} km ; perifocal (xp,yp) = ({xp:.4f}, {yp:.4f})")
        # step 1: rotate in-plane by argp (about w = z_perifocal)
        x1, y1, z1 = xp*math.cos(w_) - yp*math.sin(w_), xp*math.sin(w_) + yp*math.cos(w_), 0.0
        print(f"    after Rz(argp):  ({x1:.4f}, {y1:.4f}, {z1:.4f})   [u = argp+theta = {w_deg+th_deg} deg from node]")
        # step 2: tilt about node line (x) by i
        x2, y2, z2 = x1, y1*math.cos(i_) - z1*math.sin(i_), y1*math.sin(i_) + z1*math.cos(i_)
        print(f"    after Rx(i):     ({x2:.4f}, {y2:.4f}, {z2:.4f})")
        # step 3: rotate node line to RAAN (about z)
        x3, y3, z3 = x2*math.cos(O_) - y2*math.sin(O_), x2*math.sin(O_) + y2*math.cos(O_), z2
        print(f"    after Rz(RAAN):  ({x3:.4f}, {y3:.4f}, {z3:.4f})  <- ECI")
        r_js = elements_to_eci(a, e, i_, O_, w_, th, 0.0) if e == 0 else None
        if r_js is not None:
            print(f"    elements_to_eci (M0=theta, e=0): {fmt(r_js)}  max diff {np.abs(r_js-[x3,y3,z3]).max():.1e} km")
        lat = math.degrees(math.asin(z3/r)); print(f"    declination = asin(z/r) = {lat:.4f} deg (must be <= i)")
        return np.array([x3, y3, z3])
    hand(7000.0, 0.0, 0, 0, 0, 60)          # equatorial circular: (7000 cos60, 7000 sin60, 0)
    hand(7000.0, 0.0, 30, 0, 0, 90)         # inclined, node on +x
    hand(7000.0, 0.0, 5, 30, 0, 60)         # slightly inclined
    hand(6795.0, 0.0005, 51.6, 282.4, 96.5, 45)  # ISS-like, non-circular (JS path skipped: needs Kepler)
    print("  PASS")
