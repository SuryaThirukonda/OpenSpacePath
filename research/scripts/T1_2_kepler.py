"""
T1_2_kepler.py -- Track 1, item T1.2: Kepler's equation, time, and anomalies.

Verifies the master document's Phase-0 seed (Part III, sec. 6.1: solveKepler + the
atan2 form of the E->theta conversion) against INDEPENDENT root finders (bisection,
scipy brentq, Bessel series) on a grid e in [0, 0.95], M in [0, 2pi).
Also: seed/convergence study for e -> 1, mean motion and period anchors, and the
Molniya (e = 0.74) non-uniform true-anomaly quantification.

Run:  <scratchpad>/venv/Scripts/python.exe notes/T1_2_kepler.py
Deps: numpy, scipy (pip installed into the venv on 2026-09-01).
"""
import math
import numpy as np
from scipy import optimize, special

MU = 398600.4418          # km^3/s^2, Earth GM (same constant as master doc)
TWO_PI = 2.0 * math.pi
DEG = 180.0 / math.pi

# ----------------------------------------------------------------------------
# 1. Verbatim port of the master doc's JS (Part III, 6.1)
# ----------------------------------------------------------------------------
def solve_kepler_master(M, e, tol=1e-10, max_iter=30):
    """JS:  let E = e < 0.8 ? M : Math.PI;  Newton on f(E) = E - e sinE - M."""
    E = M if e < 0.8 else math.pi
    iters = 0
    for k in range(max_iter):
        d = (E - e * math.sin(E) - M) / (1.0 - e * math.cos(E))
        E -= d
        iters = k + 1
        if abs(d) < tol:
            break
    return E, iters


def theta_from_E_master(E, e):
    """JS: 2*atan2(sqrt(1+e) sin(E/2), sqrt(1-e) cos(E/2)) -- returns theta in (-pi, pi]."""
    return 2.0 * math.atan2(math.sqrt(1.0 + e) * math.sin(E / 2.0),
                            math.sqrt(1.0 - e) * math.cos(E / 2.0))


# ----------------------------------------------------------------------------
# 2. Independent solvers / identities
# ----------------------------------------------------------------------------
def kepler_f(E, e, M):
    return E - e * math.sin(E) - M


def solve_kepler_bisect(M, e, tol=1e-14):
    """Bisection. f(E) = E - e sinE - M is strictly increasing (f' = 1 - e cosE > 0 for e<1),
    so the root is unique and bracketed by [M-e, M+e]:
      f(M-e) = -e(1 + sin(M-e)) <= 0,   f(M+e) = e(1 - sin(M+e)) >= 0."""
    lo, hi = M - e, M + e
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if kepler_f(mid, e, M) < 0.0:
            lo = mid
        else:
            hi = mid
        if hi - lo < tol:
            break
    return 0.5 * (lo + hi)


def solve_kepler_brentq(M, e):
    if e == 0.0:
        return M
    return optimize.brentq(kepler_f, M - e - 1e-9, M + e + 1e-9, args=(e, M),
                           xtol=1e-15, rtol=4 * np.finfo(float).eps, maxiter=500)


def solve_kepler_bessel(M, e, nterms):
    """Kapteyn/Bessel series  E = M + sum_{m>=1} (2/m) J_m(m e) sin(m M)  (converges for all e<1,
    but slower and slower as e -> 1). Independent of Newton entirely."""
    m = np.arange(1, nterms + 1, dtype=float)
    return M + np.sum(2.0 / m * special.jv(m, m * e) * np.sin(m * M))


def theta_from_E_independent(E, e):
    """cos(theta) = (cosE - e)/(1 - e cosE), sin(theta) = sqrt(1-e^2) sinE/(1 - e cosE)
    -> theta = atan2(sqrt(1-e^2) sinE, cosE - e). (Denominator 1 - e cosE > 0 cancels in atan2.)"""
    return math.atan2(math.sqrt(1.0 - e * e) * math.sin(E), math.cos(E) - e)


def E_from_theta(theta, e):
    """Inverse: tan(E/2) = sqrt((1-e)/(1+e)) tan(theta/2), atan2 form."""
    return 2.0 * math.atan2(math.sqrt(1.0 - e) * math.sin(theta / 2.0),
                            math.sqrt(1.0 + e) * math.cos(theta / 2.0))


def wrap(x):
    return (x % TWO_PI + TWO_PI) % TWO_PI


def angdiff(a, b):
    """smallest |a-b| modulo 2pi"""
    d = wrap(a - b)
    return min(d, TWO_PI - d)


# ----------------------------------------------------------------------------
# 3. Grid verification  e in [0, 0.95], M in [0, 2pi)
# ----------------------------------------------------------------------------
def grid_verification():
    print("=" * 78)
    print("3. GRID VERIFICATION of master-doc solveKepler + theta conversion")
    print("=" * 78)
    e_grid = np.linspace(0.0, 0.95, 39)            # step 0.025; includes e=0.8 (seed switch)
    M_grid = np.linspace(0.0, TWO_PI, 720, endpoint=False)   # 0.5 deg steps
    a = 1.0                                        # r identity is scale-free; use a = 1
    maxE_bis = maxE_brent = max_resid = max_theta = max_round = max_r = 0.0
    max_it, sum_it, count = 0, 0, 0
    worst_E = None
    for e in e_grid:
        for M in M_grid:
            E, it = solve_kepler_master(M, e)
            Eb = solve_kepler_bisect(M, e)
            Ebr = solve_kepler_brentq(M, e)
            dE = abs(E - Eb)
            if dE > maxE_bis:
                maxE_bis, worst_E = dE, (e, M, it)
            maxE_brent = max(maxE_brent, abs(E - Ebr))
            max_resid = max(max_resid, abs(kepler_f(E, e, M)))
            max_it = max(max_it, it); sum_it += it; count += 1
            # theta: master atan2 form vs independent cos/sin form
            th = theta_from_E_master(E, e)
            th_ind = theta_from_E_independent(E, e)
            max_theta = max(max_theta, angdiff(th, th_ind))
            # round trip theta -> E -> M
            E_back = E_from_theta(th, e)
            M_back = E_back - e * math.sin(E_back)
            max_round = max(max_round, angdiff(M_back, M))
            # r identity: a(1-e^2)/(1+e cos theta) == a(1 - e cos E)
            r1 = a * (1 - e * e) / (1 + e * math.cos(th))
            r2 = a * (1 - e * math.cos(E))
            max_r = max(max_r, abs(r1 - r2) / r2)
    print(f"grid: {len(e_grid)} e-values x {len(M_grid)} M-values = {count} solves")
    print(f"max |E_newton - E_bisection|      = {maxE_bis:.3e} rad  (worst at e={worst_E[0]:.3f}, M={worst_E[1]*DEG:.1f} deg, {worst_E[2]} iters)")
    print(f"max |E_newton - E_brentq(scipy)|  = {maxE_brent:.3e} rad")
    print(f"max |E - e sinE - M| residual     = {max_resid:.3e} rad")
    print(f"Newton iterations: max = {max_it}, mean = {sum_it/count:.2f}  (master doc says about 5)")
    print(f"max |theta_atan2 - theta_cos/sin|  = {max_theta:.3e} rad")
    print(f"max round-trip |M(theta(E(M))) - M| = {max_round:.3e} rad")
    print(f"max rel |a(1-e^2)/(1+e cos th) - a(1-e cosE)| = {max_r:.3e}")

    # Bessel series spot check (independent of any root finder)
    print("\nBessel/Kapteyn series check (N terms), max |E_series - E_newton| over M grid:")
    for e, N in [(0.1, 30), (0.5, 100), (0.8, 400), (0.9, 1500), (0.95, 6000)]:
        worst = 0.0
        for M in M_grid[::4]:
            Es = solve_kepler_bessel(M, e, N)
            En, _ = solve_kepler_master(M, e)
            worst = max(worst, abs(Es - En))
        ratio = e * math.exp(math.sqrt(1 - e * e)) / (1 + math.sqrt(1 - e * e))
        print(f"  e={e:.2f}  N={N:5d}  max|dE| = {worst:.2e} rad   (term decay ratio per m ~ {ratio:.4f})")

    # random test
    rng = np.random.default_rng(20260901)
    worst = 0.0
    for _ in range(20000):
        e = rng.uniform(0.0, 0.95); M = rng.uniform(0.0, TWO_PI)
        E, _ = solve_kepler_master(M, e)
        worst = max(worst, abs(E - solve_kepler_bisect(M, e)))
    print(f"\n20000 random (e,M) in [0,0.95]x[0,2pi): max |E_newton - E_bisect| = {worst:.3e} rad")


# ----------------------------------------------------------------------------
# 4. Seed / convergence study near e -> 1
# ----------------------------------------------------------------------------
def newton_generic(M, e, E0, tol=1e-12, max_iter=50):
    E = E0
    for k in range(1, max_iter + 1):
        fp = 1.0 - e * math.cos(E)
        d = (E - e * math.sin(E) - M) / fp
        E -= d
        if not math.isfinite(E):
            return E, k, False
        if abs(d) < tol:
            return E, k, True
    return E, max_iter, False


SEEDS = {
    "E0 = M":                 lambda M, e: M,
    "E0 = pi":                lambda M, e: math.pi,
    "E0 = M + e":             lambda M, e: M + e,
    "E0 = M + e sinM":        lambda M, e: M + e * math.sin(M),
    "E0 = M + 0.85e (Danby)": lambda M, e: M + 0.85 * e,
    "master rule (M|pi @0.8)": lambda M, e: (M if e < 0.8 else math.pi),
}


def convergence_study():
    print("\n" + "=" * 78)
    print("4. SEED / CONVERGENCE STUDY (Newton, tol 1e-12, max 50 iters), M in [0, pi] (symmetry)")
    print("=" * 78)
    M_grid = np.linspace(0.0, math.pi, 1801)   # 0.1 deg
    print(f"{'e':>7} | {'seed':<26} | {'fail':>5} | {'max it':>6} | {'mean it':>7} | max |E - E_bisect|")
    for e in [0.1, 0.5, 0.8, 0.9, 0.95, 0.99, 0.999, 0.9999]:
        for name, seed in SEEDS.items():
            fails = 0; max_it = 0; sum_it = 0; worst = 0.0
            for M in M_grid:
                E, it, ok = newton_generic(M, e, seed(M, e))
                Eb = solve_kepler_bisect(M, e)
                if (not ok) or abs(E - Eb) > 1e-8:
                    fails += 1
                max_it = max(max_it, it); sum_it += it
                if ok:
                    worst = max(worst, abs(E - Eb))
            print(f"{e:7.4f} | {name:<26} | {fails:5d} | {max_it:6d} | {sum_it/len(M_grid):7.2f} | {worst:.1e}")
        print("-" * 78)

    # Illustrate the mechanism of the e->1, M->0 trouble with E0 = M
    print("\nMechanism: first Newton step from E0 = M is  dE = e sinM / (1 - e cosM)  (blows up as e->1, M->0)")
    for e, M in [(0.99, 0.01), (0.999, 0.01), (0.9999, 0.01), (0.99, 0.5)]:
        d1 = e * math.sin(M) / (1 - e * math.cos(M))
        E_true = solve_kepler_bisect(M, e)
        Eq, it, ok = newton_generic(M, e, M)
        Ep, itp, okp = newton_generic(M, e, math.pi)
        print(f"  e={e}, M={M}: first step from M = {d1:+.3f} rad (E1={M+d1:.3f}); true E={E_true:.5f}; "
              f"from M: {it} its ok={ok}; from pi: {itp} its ok={okp}")
    print("Approximation near e->1, M->0:  M ~ (1-e)E + eE^3/6   so E ~ (6M)^(1/3) when (1-e) is tiny "
          f"-> (6*0.01)^(1/3) = {(0.06)**(1/3):.4f}")


# ----------------------------------------------------------------------------
# 5. Mean motion, period, TLE anchor
# ----------------------------------------------------------------------------
def mean_motion_and_period():
    print("\n" + "=" * 78)
    print("5. MEAN MOTION n = sqrt(mu/a^3), PERIOD T = 2 pi sqrt(a^3/mu)")
    print("=" * 78)
    rows = [("ISS-like (a=6795 km, master doc)", 6795.0),
            ("LEO 400 km circular (a=6778.137)", 6378.137 + 400.0),
            ("Sun-sync 700 km (a=7078.137)", 6378.137 + 700.0),
            ("GPS/MEO (a=26560)", 26560.0),
            ("Molniya (a=26562)", 26562.0),
            ("GEO (a=42164.17)", 42164.17)]
    for name, a in rows:
        n = math.sqrt(MU / a ** 3)
        T = TWO_PI / n
        print(f"  {name:<36} n = {n:.6e} rad/s = {n*86400/TWO_PI:8.4f} rev/day ; T = {T:9.1f} s = {T/60:8.2f} min = {T/3600:6.3f} h")
    # ISS TLE anchor: line 2 mean motion 15.48958602 rev/day (epoch 26244.49851260 = 2026-09-01)
    n_tle = 15.48958602 * TWO_PI / 86400.0
    a_tle = (MU / n_tle ** 2) ** (1.0 / 3.0)
    print(f"\n  ISS TLE (2026-09-01) n = 15.48958602 rev/day -> T = {1440/15.48958602:.3f} min ; a = (mu/n^2)^(1/3) = {a_tle:.1f} km"
          f" -> mean altitude {a_tle-6378.137:.1f} km  (Kozai mean elements; Kepler-only, fine as an anchor)")
    sidereal_day = 86164.0905
    a_geo = (MU * (sidereal_day / TWO_PI) ** 2) ** (1.0 / 3.0)
    a_mol = (MU * (0.5 * sidereal_day / TWO_PI) ** 2) ** (1.0 / 3.0)
    print(f"  a for T = 1 sidereal day (GEO)  = {a_geo:.2f} km ; for T = 1/2 sidereal day (Molniya) = {a_mol:.2f} km")


# ----------------------------------------------------------------------------
# 6. Why theta is non-uniform: dtheta/dt = h / r^2 ; Molniya e = 0.74
# ----------------------------------------------------------------------------
def molniya_nonuniformity():
    print("\n" + "=" * 78)
    print("6. NON-UNIFORM TRUE ANOMALY: dtheta/dt = h/r^2 (Kepler 2nd law)   Molniya-like e = 0.74")
    print("=" * 78)
    e = 0.74
    sidereal_day = 86164.0905
    a = (MU * (0.5 * sidereal_day / TWO_PI) ** 2) ** (1.0 / 3.0)
    n = math.sqrt(MU / a ** 3); T = TWO_PI / n
    h = math.sqrt(MU * a * (1 - e * e))            # specific angular momentum, km^2/s
    rp, ra = a * (1 - e), a * (1 + e)
    print(f"  a = {a:.1f} km, e = {e}, T = {T/3600:.3f} h, h = sqrt(mu a (1-e^2)) = {h:.1f} km^2/s")
    print(f"  r_p = a(1-e) = {rp:.1f} km (alt {rp-6378.137:.0f} km), r_a = a(1+e) = {ra:.1f} km (alt {ra-6378.137:.0f} km)")
    wp, wa = h / rp ** 2, h / ra ** 2
    print(f"  dtheta/dt at periapsis = h/rp^2 = {wp:.6e} rad/s = {wp*DEG:.4f} deg/s")
    print(f"  dtheta/dt at apoapsis  = h/ra^2 = {wa:.6e} rad/s = {wa*DEG:.4f} deg/s")
    print(f"  mean motion n          =         {n:.6e} rad/s = {n*DEG:.4f} deg/s  (M advances at exactly this rate)")
    print(f"  ratio peri/apo = (ra/rp)^2 = ((1+e)/(1-e))^2 = {((1+e)/(1-e))**2:.3f}   (direct: {wp/wa:.3f})")
    print(f"  dtheta/dM at periapsis = (1+e)^2/(1-e^2)^1.5 = {(1+e)**2/(1-e*e)**1.5:.4f} ; at apoapsis = (1-e)^2/(1-e^2)^1.5 = {(1-e)**2/(1-e*e)**1.5:.4f}")
    vp, va = h / rp, h / ra
    print(f"  speed: v_p = h/r_p = {vp:.3f} km/s, v_a = h/r_a = {va:.3f} km/s, ratio (1+e)/(1-e) = {(1+e)/(1-e):.3f}")
    # time fractions from Kepler's equation
    def M_of_theta(th):
        E = E_from_theta(th, e)
        return wrap(E - e * math.sin(E))
    M90 = M_of_theta(math.pi / 2)
    frac_near = 2 * M90 / TWO_PI
    print(f"  theta = 90 deg  ->  E = acos(e) = {math.acos(e):.4f} rad, M = {M90:.4f} rad")
    print(f"  fraction of period with |theta| <= 90 deg (periapsis half by ANGLE) = {frac_near*100:.2f}%  = {frac_near*T/3600:.2f} h")
    print(f"  fraction of period with |theta| >  90 deg (apoapsis half)          = {(1-frac_near)*100:.2f}%  = {(1-frac_near)*T/3600:.2f} h")
    print(f"  -> with argp = 270 deg (perigee over the south), satellite is north of the equator for theta in (90,270):"
          f" {(1-frac_near)*T/3600:.2f} h of {T/3600:.2f} h")
    # time with r > a  <=> cosE < 0  <=> E in (pi/2, 3pi/2)
    M_E90 = math.pi / 2 - e
    print(f"  fraction of period with r > a (E in (90,270) deg): M(E=90deg) = pi/2 - e = {M_E90:.4f} -> {(1 - 2*M_E90/TWO_PI)*100:.2f}%")
    # max equation of the centre
    M_grid = np.linspace(0, TWO_PI, 3600, endpoint=False)
    for ee, label in [(0.0005, "ISS e=0.0005"), (0.0741, "e=0.0741 (GPS-ish max)"), (0.74, "Molniya e=0.74")]:
        worst = 0.0
        for M in M_grid:
            E, _ = solve_kepler_master(M, ee)
            th = wrap(theta_from_E_master(E, ee))
            worst = max(worst, angdiff(th, M))
        print(f"  max |theta - M| for {label:<24} = {worst:.5f} rad = {worst*DEG:8.4f} deg  (small-e approx 2e = {2*ee*DEG:.4f} deg)")
    # theta(t) table
    print("\n  theta(t) for the Molniya orbit, t since perigee (note how little theta changes near apogee):")
    print(f"  {'t [h]':>6} {'M [deg]':>8} {'E [deg]':>8} {'theta [deg]':>11} {'r [km]':>9} {'dtheta/dt [deg/s]':>18}")
    for t_h in [0, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11.5, 11.75, T/3600]:
        t = t_h * 3600
        M = wrap(n * t)
        E, _ = solve_kepler_master(M, e)
        th = wrap(theta_from_E_master(E, e))
        r = a * (1 - e * e) / (1 + e * math.cos(th))
        print(f"  {t_h:6.2f} {M*DEG:8.2f} {wrap(E)*DEG:8.2f} {th*DEG:11.2f} {r:9.0f} {h/r**2*DEG:18.5f}")


# ----------------------------------------------------------------------------
# 7. Known-answer worked example (Curtis Ex. 3.1 / 3.2 as reproduced on orbital-mechanics.space)
# ----------------------------------------------------------------------------
def worked_example():
    print("\n" + "=" * 78)
    print("7. KNOWN-ANSWER: r_p = 9600 km, r_a = 21000 km (Curtis Ex 3.1/3.2; orbital-mechanics.space)")
    print("=" * 78)
    rp, ra = 9600.0, 21000.0
    e = (ra - rp) / (ra + rp); a = 0.5 * (ra + rp)
    n = math.sqrt(MU / a ** 3); T = TWO_PI / n
    print(f"  e = (ra-rp)/(ra+rp) = {e:.4f}, a = {a:.0f} km, T = {T:.1f} s = {T/3600:.3f} h   (expected e=0.3725, a=15300, T=5.23 h)")
    th1 = 120.0 / DEG
    E1 = E_from_theta(th1, e); M1 = E1 - e * math.sin(E1); t1 = M1 / n
    print(f"  theta = 120 deg -> E = {E1:.4f} rad, M = {M1:.4f} rad, t = {t1:.1f} s = {t1/3600:.3f} h   (expected E=1.73, M=1.36, t=1.13 h)")
    t2 = 3 * 3600.0; M2 = n * t2
    E2, it = solve_kepler_master(M2, e); th2 = wrap(theta_from_E_master(E2, e))
    print(f"  t = 3 h -> M = {M2:.4f} rad, E = {E2:.4f} rad ({it} Newton its), theta = {th2*DEG:.2f} deg   (expected M=3.60, E=3.48, theta=193.16 deg)")
    # Also show the Newton iterates for this case from E0 = M
    E = M2
    print("  Newton iterates from E0 = M:", end="")
    for k in range(6):
        d = (E - e * math.sin(E) - M2) / (1 - e * math.cos(E)); E -= d
        print(f"  E{k+1}={E:.10f} (|d|={abs(d):.1e})", end="")
    print()


# ----------------------------------------------------------------------------
# 8. Bonus: hand-check of elementsToECI for Q1 (equatorial circular; slightly inclined)
# ----------------------------------------------------------------------------
def elements_to_eci(a, e, i, raan, argp, M0, t):
    n = math.sqrt(MU / a ** 3)
    M = wrap(M0 + n * t)
    E, _ = solve_kepler_master(M, e)
    th = theta_from_E_master(E, e)
    r = a * (1 - e * e) / (1 + e * math.cos(th))
    xp, yp = r * math.cos(th), r * math.sin(th)
    cO, sO = math.cos(raan), math.sin(raan)
    ci, si = math.cos(i), math.sin(i)
    cw, sw = math.cos(argp), math.sin(argp)
    return ((cO * cw - sO * sw * ci) * xp + (-cO * sw - sO * cw * ci) * yp,
            (sO * cw + cO * sw * ci) * xp + (-sO * sw + cO * cw * ci) * yp,
            (sw * si) * xp + (cw * si) * yp)


def eci_hand_check():
    print("\n" + "=" * 78)
    print("8. BONUS hand-check of master-doc elementsToECI (Q1)")
    print("=" * 78)
    a = 7000.0
    # circular equatorial, theta = M = 90 deg -> expect (0, 7000, 0)
    p = elements_to_eci(a, 0.0, 0.0, 0.0, 0.0, math.pi / 2, 0.0)
    print(f"  circular equatorial a=7000, theta=90 deg     -> ({p[0]:.3f}, {p[1]:.3f}, {p[2]:.3f}) km ; expect (0, 7000, 0)")
    # inclined 30 deg, RAAN=0, argp=0, theta=90 deg -> (0, 7000 cos30, 7000 sin30) = (0, 6062.178, 3500)
    p = elements_to_eci(a, 0.0, 30 / DEG, 0.0, 0.0, math.pi / 2, 0.0)
    print(f"  i=30 deg, RAAN=0, argp=0, theta=90 deg      -> ({p[0]:.3f}, {p[1]:.3f}, {p[2]:.3f}) km ; expect (0, 6062.178, 3500)")
    # RAAN = 90: node line along +y; theta=0 -> along the node -> (0, 7000, 0)
    p = elements_to_eci(a, 0.0, 30 / DEG, math.pi / 2, 0.0, 0.0, 0.0)
    print(f"  i=30 deg, RAAN=90 deg, argp=0, theta=0      -> ({p[0]:.3f}, {p[1]:.3f}, {p[2]:.3f}) km ; expect (0, 7000, 0)")
    # ISS-like speed via numerical derivative
    el = dict(a=6795.0, e=0.0005, i=51.6 / DEG, raan=0.0, argp=0.0, M0=0.0)
    p0 = elements_to_eci(el['a'], el['e'], el['i'], el['raan'], el['argp'], el['M0'], 0.0)
    p1 = elements_to_eci(el['a'], el['e'], el['i'], el['raan'], el['argp'], el['M0'], 1e-3)
    v = math.dist(p0, p1) / 1e-3
    print(f"  ISS-like a=6795 e=0.0005: |r| = {math.hypot(*p0):.1f} km, speed (num. deriv.) = {v:.4f} km/s ; vis-viva at perigee = {math.sqrt(MU*(2/(el['a']*(1-el['e'])) - 1/el['a'])):.4f}")


if __name__ == "__main__":
    grid_verification()
    convergence_study()
    mean_motion_and_period()
    molniya_nonuniformity()
    worked_example()
    eci_hand_check()


# ----------------------------------------------------------------------------
# 9. Pathological cases for E0 = M near e -> 1 (Charles & Tatum 1998; J. D. Cook 2022) + remedies
# ----------------------------------------------------------------------------
def newton_clamped(M, e, E0, tol=1e-12, max_iter=50):
    """Newton with the step clamped so that |E - M| <= e always holds (true for the root)."""
    E = E0
    for k in range(1, max_iter + 1):
        d = (E - e * math.sin(E) - M) / (1.0 - e * math.cos(E))
        E -= d
        E = min(max(E, M - e), M + e)
        if abs(d) < tol:
            return E, k, True
    return E, max_iter, False


def pathological_cases():
    print("\n" + "=" * 78)
    print("9. PATHOLOGICAL (e, M) FOR E0 = M, AND REMEDIES")
    print("=" * 78)
    # J. D. Cook's published failure: e = 0.992, M = 0.13 pi, start at M
    e, M = 0.992, 0.13 * math.pi
    E_true = solve_kepler_bisect(M, e)
    print(f"  Cook (2022) case e={e}, M=0.13 pi={M:.6f}: true E (bisection) = {E_true:.10f}")
    E = M; print("  iterates from E0 = M:", end="")
    for k in range(12):
        E -= (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
        print(f" {E:.3g}", end="")
    print()
    for name, fn, E0 in [("plain Newton from M", newton_generic, M), ("plain Newton from pi", newton_generic, math.pi),
                         ("master rule (pi since e>=0.8)", newton_generic, math.pi), ("Newton from M+e", newton_generic, M + e),
                         ("clamped Newton from M", newton_clamped, M)]:
        Ek, it, ok = fn(M, e, E0)
        print(f"    {name:<30}: {it:2d} iters, converged={ok}, |E - E_true| = {abs(Ek - E_true):.1e}")
    # list the failing M values for e = 0.99 from the seed study
    print("\n  M values (deg) in [0,180] where plain Newton from E0 = M fails within 50 iterations, e = 0.99:")
    fails = []
    for M in np.linspace(0.0, math.pi, 1801):
        Ek, it, ok = newton_generic(M, 0.99, M)
        if not ok or abs(Ek - solve_kepler_bisect(M, 0.99)) > 1e-8:
            fails.append(M * DEG)
    print("   ", [round(float(x), 1) for x in fails][:60], f"... ({len(fails)} total)")
    # clamped Newton never fails?
    for e in [0.99, 0.999, 0.9999]:
        nf = 0; mx = 0
        for M in np.linspace(0.0, math.pi, 1801):
            Ek, it, ok = newton_clamped(M, e, M)
            mx = max(mx, it)
            if not ok or abs(Ek - solve_kepler_bisect(M, e)) > 1e-8:
                nf += 1
        print(f"  clamped Newton from E0 = M, e={e}: failures = {nf}, max iters = {mx}")


# ----------------------------------------------------------------------------
# 10. Series solutions: equation of the centre (truncated) -- exist but are infinite series
# ----------------------------------------------------------------------------
def series_demo():
    print("\n" + "=" * 78)
    print("10. SERIES: theta = M + (2e - e^3/4) sinM + (5/4)e^2 sin2M + (13/12)e^3 sin3M + O(e^4)")
    print("    E     = M + e sinM + (e^2/2) sin2M + (e^3/8)(3 sin3M - sinM) + O(e^4)   [Lagrange; converges only for e < 0.6627 (Laplace limit)]")
    print("=" * 78)
    M_grid = np.linspace(0, TWO_PI, 720, endpoint=False)
    print(f"  {'e':>7} | max|theta_series3 - theta_exact| [deg] | max|E_series3 - E_exact| [deg]")
    for e in [0.0005, 0.01, 0.1, 0.3, 0.5, 0.6627, 0.74, 0.9]:
        wt = wE = 0.0
        for M in M_grid:
            E, _ = solve_kepler_master(M, e)
            th = wrap(theta_from_E_master(E, e))
            th_s = M + (2 * e - e ** 3 / 4) * math.sin(M) + 1.25 * e * e * math.sin(2 * M) + (13.0 / 12) * e ** 3 * math.sin(3 * M)
            E_s = M + e * math.sin(M) + 0.5 * e * e * math.sin(2 * M) + (e ** 3 / 8) * (3 * math.sin(3 * M) - math.sin(M))
            wt = max(wt, angdiff(th_s, th)); wE = max(wE, angdiff(E_s, E))
        print(f"  {e:7.4f} | {wt*DEG:37.4f} | {wE*DEG:30.4f}")


if __name__ == "__main__":
    pathological_cases()
    series_demo()


# ----------------------------------------------------------------------------
# 11. Braeunig (braeunig.us/space/problem.htm) Problems 4.13 / 4.14 / 4.15 as known answers
# ----------------------------------------------------------------------------
def braeunig_problems():
    print("\n" + "=" * 78)
    print("11. KNOWN-ANSWER: Braeunig Problems 4.13-4.15 (a = 7500 km, e = 0.1, GM = 3.986005e14 m^3/s^2)")
    print("=" * 78)
    GM = 3.986005e14; a = 7.5e6; e = 0.1
    n = math.sqrt(GM / a ** 3)
    th0, th1 = 30 / DEG, 90 / DEG
    E0, E1 = E_from_theta(th0, e), E_from_theta(th1, e)
    M0, M1 = E0 - e * math.sin(E0), E1 - e * math.sin(E1)
    print(f"  4.13: E0 = {E0:.5f}, E1 = {E1:.5f} rad (expected 0.47557, 1.47063); M0 = {M0:.5f}, M1 = {M1:.5f} (exp 0.42978, 1.37113);"
          f" n = {n:.8f} rad/s (exp 0.00097202); t = {(M1 - M0)/n:.1f} s (expected 968.4 s)")
    M2 = M1 + n * 1200.0
    E2, it = solve_kepler_master(M2, e)
    th2 = wrap(theta_from_E_master(E2, e))
    th2_series = M2 + 2 * e * math.sin(M2) + 1.25 * e * e * math.sin(2 * M2)
    print(f"  4.14: M = {M2:.5f} (exp 2.53755); E = {E2:.5f} rad ({it} its; exp 2.58996); theta = {th2*DEG:.1f} deg (exp 151.3);"
          f" series approx = {th2_series*DEG:.1f} deg (exp 151.2)")
    th3 = 225 / DEG
    r = a * (1 - e * e) / (1 + e * math.cos(th3))
    fpa = math.atan(e * math.sin(th3) / (1 + e * math.cos(th3)))
    v = math.sqrt(GM * (2 / r - 1 / a))
    print(f"  4.15: r = {r:,.0f} m (exp 7,989,977); flight-path angle = {fpa*DEG:.3f} deg (exp -4.351); v = {v:,.0f} m/s (exp 6,828)")


if __name__ == "__main__":
    braeunig_problems()
