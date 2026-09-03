"""
T2.5 -- TLE accuracy decay experiment (Rathinam project, Track 2).

Parts
  A. SGP4 (python-sgp4) vs pure Keplerian propagation seeded from the SAME TLE mean
     elements (master doc 6.1 pipeline), 0-3 days, RIC decomposition.
     Variants: A = mean elements straight into two-body (the "wrong" pipeline use),
               B = two-body seeded from SGP4's osculating state at epoch,
               C = mean elements + J2 secular rates (teaching: what SGP4 mostly adds).
  B. Public 18 SDS ISS TLE vs CelesTrak *supplemental* ISS TLEs (fits to NASA OEM
     ephemeris in 6-hour segments) => empirical error growth of a real ISS TLE.
  C. Pixel-scale table ("visually truthful" at globe scale).
  D. Refresh-cadence table from an error model err(t) = e0 + k*t.
  E. ISS decay rate implied by the TLE's ndot/2 field.

Run:  <scratchpad>/venv/Scripts/python.exe notes/T2_5_tle_decay.py
Inputs: <scratchpad>/iss_tle.txt, <scratchpad>/celestrak_iss_sup_now.txt (curl of
        https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?CATNR=25544&FORMAT=TLE)
"""
import math, os
import numpy as np
from sgp4.api import Satrec, jday, WGS72

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MU_PIPE = 398600.4418   # km^3/s^2  (master doc 6.1 pipeline)
MU_WGS72 = 398600.8     # km^3/s^2  (SGP4 internal constant)
RE = 6378.135           # km (WGS72, what SGP4 uses)
J2 = 0.001082616        # WGS72 J2 (sgp4 lib value)
D2R = math.pi / 180


def read_tle(path):
    lines = [l.rstrip("\n") for l in open(path) if l.strip()]
    return lines[-2], lines[-1]


def tle_epoch_jd(l1):
    yy = int(l1[18:20]); doy = float(l1[20:32])
    year = 2000 + yy if yy < 57 else 1900 + yy
    jd, fr = jday(year, 1, 1, 0, 0, 0.0)
    return jd + fr + doy - 1.0


def mean_elems(l1, l2):
    return dict(
        i=float(l2[8:16]) * D2R, raan=float(l2[17:25]) * D2R,
        e=float("0." + l2[26:33].strip()), argp=float(l2[34:42]) * D2R,
        M0=float(l2[43:51]) * D2R, n_rev=float(l2[52:63]),
        ndot2=float(l1[33:43]))  # ndot/2, rev/day^2


def solve_kepler(M, e, tol=1e-12):
    E = M if e < 0.8 else math.pi
    for _ in range(50):
        d = (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
        E -= d
        if abs(d) < tol:
            break
    return E


def elements_to_rv(a, e, i, raan, argp, M, mu):
    E = solve_kepler(M % (2 * math.pi), e)
    th = 2 * math.atan2(math.sqrt(1 + e) * math.sin(E / 2), math.sqrt(1 - e) * math.cos(E / 2))
    p = a * (1 - e * e); r = p / (1 + e * math.cos(th))
    xp, yp = r * math.cos(th), r * math.sin(th)
    vxp = -math.sqrt(mu / p) * math.sin(th); vyp = math.sqrt(mu / p) * (e + math.cos(th))
    cO, sO, ci, si, cw, sw = math.cos(raan), math.sin(raan), math.cos(i), math.sin(i), math.cos(argp), math.sin(argp)
    R = np.array([[cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci, sO * si],
                  [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci, -cO * si],
                  [sw * si, cw * si, ci]])
    return R @ np.array([xp, yp, 0.0]), R @ np.array([vxp, vyp, 0.0])


def rv_to_elements(r, v, mu):
    r = np.asarray(r); v = np.asarray(v)
    rn = np.linalg.norm(r); vn = np.linalg.norm(v)
    h = np.cross(r, v); hn = np.linalg.norm(h)
    n = np.cross([0, 0, 1], h)
    evec = ((vn ** 2 - mu / rn) * r - np.dot(r, v) * v) / mu; e = np.linalg.norm(evec)
    a = 1 / (2 / rn - vn ** 2 / mu)
    i = math.acos(h[2] / hn)
    raan = math.atan2(n[1], n[0]) % (2 * math.pi)
    argp = math.atan2(np.dot(np.cross(n, evec), h) / hn, np.dot(n, evec)) % (2 * math.pi)
    th = math.atan2(np.dot(np.cross(evec, r), h) / hn, np.dot(evec, r)) % (2 * math.pi)
    E = 2 * math.atan2(math.sqrt(1 - e) * math.sin(th / 2), math.sqrt(1 + e) * math.cos(th / 2))
    M = (E - e * math.sin(E)) % (2 * math.pi)
    return dict(a=a, e=e, i=i, raan=raan, argp=argp, M0=M)


def ric_frame(r, v):
    R = r / np.linalg.norm(r); C = np.cross(r, v); C /= np.linalg.norm(C); I = np.cross(C, R)
    return np.vstack([R, I, C])   # rows: radial, in-track, cross-track


def sgp4_rv(sat, jd_epoch, t_sec):
    jd = jd_epoch + t_sec / 86400.0
    e, r, v = sat.sgp4(math.floor(jd), jd - math.floor(jd))
    if e != 0:
        raise RuntimeError(f"sgp4 error {e}")
    return np.array(r), np.array(v)


def fmt_row(label, d):
    return f"{label:>8s} | {np.linalg.norm(d):9.2f} | {d[0]:9.2f} | {d[1]:9.2f} | {d[2]:9.2f}"


# ---------------------------------------------------------------- Part A
def part_A():
    l1, l2 = read_tle(os.path.join(ROOT, "iss_tle.txt"))
    sat = Satrec.twoline2rv(l1, l2, WGS72)
    jd0 = tle_epoch_jd(l1)
    me = mean_elems(l1, l2)
    n_rad = me["n_rev"] * 2 * math.pi / 86400.0
    a_pipe = (MU_PIPE / n_rad ** 2) ** (1 / 3)
    a_72 = (MU_WGS72 / n_rad ** 2) ** (1 / 3)
    print("=== PART A: SGP4 vs Kepler from the same ISS TLE ===")
    print(f"TLE epoch JD {jd0:.6f}  n = {me['n_rev']:.8f} rev/day -> a(mu=398600.4418) = {a_pipe:.3f} km, a(mu WGS72) = {a_72:.3f} km")
    r0, v0 = sgp4_rv(sat, jd0, 0.0)
    print(f"SGP4 at epoch: |r| = {np.linalg.norm(r0):.3f} km, |v| = {np.linalg.norm(v0):.4f} km/s, alt(spherical, RE=6378.135) = {np.linalg.norm(r0) - RE:.1f} km")
    osc = rv_to_elements(r0, v0, MU_WGS72)
    print(f"Osculating elements from SGP4 state at epoch: a={osc['a']:.3f} km e={osc['e']:.6f} i={osc['i'] / D2R:.4f} RAAN={osc['raan'] / D2R:.4f} argp={osc['argp'] / D2R:.4f} M={osc['M0'] / D2R:.4f} deg")
    print(f"TLE mean elements (Kozai n -> a):             a={a_72:.3f} km e={me['e']:.6f} i={me['i'] / D2R:.4f} RAAN={me['raan'] / D2R:.4f} argp={me['argp'] / D2R:.4f} M={me['M0'] / D2R:.4f} deg")
    dP = (3 / 2) * (osc['a'] - a_72) / a_72 * (2 * math.pi / n_rad)
    print(f"  -> osculating-minus-mean a = {osc['a'] - a_72:+.2f} km; if you used the osculating a as a period, the period would be off by {dP:+.2f} s/rev")

    p = a_72 * (1 - me["e"] ** 2)
    fac = 1.5 * J2 * (RE / p) ** 2 * n_rad
    raan_dot = -fac * math.cos(me["i"])
    argp_dot = fac * (2 - 2.5 * math.sin(me["i"]) ** 2)
    M_dot_corr = fac * math.sqrt(1 - me["e"] ** 2) * (1 - 1.5 * math.sin(me["i"]) ** 2)
    print(f"J2 secular rates from mean elements: RAAN_dot = {raan_dot * 86400 / D2R:+.3f} deg/day, argp_dot = {argp_dot * 86400 / D2R:+.3f} deg/day, dM/dt correction = {M_dot_corr * 86400 / D2R:+.3f} deg/day")

    checkpoints = [0, 600, 3600, 2 * 3600, 6 * 3600, 12 * 3600, 86400, 2 * 86400, 3 * 86400]
    variants = {
        "A: TLE mean elems -> two-body (mu 398600.4418), i.e. the 6.1 pipeline fed a TLE":
            lambda t: elements_to_rv(a_pipe, me["e"], me["i"], me["raan"], me["argp"], me["M0"] + n_rad * t, MU_PIPE),
        "B: two-body seeded from SGP4 osculating state at epoch":
            lambda t: elements_to_rv(osc["a"], osc["e"], osc["i"], osc["raan"], osc["argp"], osc["M0"] + math.sqrt(MU_WGS72 / osc["a"] ** 3) * t, MU_WGS72),
        "C: TLE mean elems + J2 secular rates (no drag, no periodics)":
            lambda t: elements_to_rv(a_72, me["e"], me["i"], me["raan"] + raan_dot * t, me["argp"] + argp_dot * t, me["M0"] + (n_rad + M_dot_corr) * t, MU_WGS72),
    }
    for name, f in variants.items():
        print(f"\n--- Variant {name} ---")
        print(f"{'t':>8s} | {'|dr| km':>9s} | {'radial':>9s} | {'in-track':>9s} | {'cross':>9s}")
        for t in checkpoints:
            rs, vs = sgp4_rv(sat, jd0, t)
            rk, vk = f(t)
            d = ric_frame(rs, vs) @ (rk - rs)
            lab = f"{t / 3600:.1f} h" if t < 86400 else f"{t / 86400:.0f} d"
            print(fmt_row(lab, d))
        ts = np.arange(0, 86400 + 1, 60.0); it = []; tot = []
        for t in ts:
            rs, vs = sgp4_rv(sat, jd0, t); rk, vk = f(t)
            d = ric_frame(rs, vs) @ (rk - rs); it.append(d[1]); tot.append(np.linalg.norm(d))
        it = np.array(it); tot = np.array(tot); slope = np.polyfit(ts, it, 1)[0]
        first_hour = it[:61]
        print(f"in-track drift, linear fit over first 24 h: {slope * 3600:+.3f} km/h = {slope * 86400:+.2f} km/day; "
              f"in-track at 1 h = {first_hour[-1]:+.2f} km; |dr| max within 1 h = {tot[:61].max():.2f} km; |dr| max within 24 h = {tot.max():.2f} km")


# ---------------------------------------------------------------- Part B
def part_B():
    print("\n=== PART B: public ISS TLE (18 SDS) vs CelesTrak supplemental (NASA OEM-derived) 6-h segments ===")
    l1, l2 = read_tle(os.path.join(ROOT, "iss_tle.txt"))
    pub = Satrec.twoline2rv(l1, l2, WGS72); jd_pub = tle_epoch_jd(l1)
    sup_path = os.path.join(ROOT, "celestrak_iss_sup_now.txt")
    if not os.path.exists(sup_path):
        print("supplemental file missing; skip"); return
    lines = [l.rstrip("\n") for l in open(sup_path) if l.strip()]
    segs = [(lines[k + 1], lines[k + 2]) for k in range(0, len(lines) - 2, 3) if lines[k + 1].startswith("1 ")]
    print(f"{len(segs)} supplemental segments; public TLE epoch JD {jd_pub:.5f}")
    ages, errs, ric = [], [], []
    for s1, s2 in segs:
        ss = Satrec.twoline2rv(s1, s2, WGS72); jd_s = tle_epoch_jd(s1)
        for dt_h in np.arange(0, 6.0, 0.5):     # each segment covers ~6 h from its epoch
            jd = jd_s + dt_h / 24.0
            e1, rp, vp = pub.sgp4(math.floor(jd), jd - math.floor(jd))
            e2, rs, vs = ss.sgp4(math.floor(jd), jd - math.floor(jd))
            if e1 or e2:
                continue
            rp, vp, rs, vs = map(np.array, (rp, vp, rs, vs))
            d = ric_frame(rs, vs) @ (rp - rs)
            ages.append(jd - jd_pub); errs.append(np.linalg.norm(d)); ric.append(d)
    ages = np.array(ages); errs = np.array(errs); ric = np.array(ric)
    print(f"{'age bin (d)':>12s} | {'N':>3s} | {'med |dr| km':>11s} | {'max |dr| km':>11s} | {'med in-track km':>15s} | {'med |radial|':>12s} | {'med |cross|':>11s}")
    for lo in np.arange(-1.0, math.ceil(ages.max()), 0.5):
        m = (ages >= lo) & (ages < lo + 0.5)
        if m.sum() == 0:
            continue
        print(f"{lo:5.1f}..{lo + 0.5:4.1f} | {m.sum():3d} | {np.median(errs[m]):11.2f} | {errs[m].max():11.2f} | {np.median(ric[m, 1]):15.2f} | {np.median(np.abs(ric[m, 0])):12.3f} | {np.median(np.abs(ric[m, 2])):11.3f}")
    for lim in (3, 7):
        m = (ages > 0) & (ages < lim)
        k = np.polyfit(ages[m], errs[m], 1)
        print(f"linear fit 0-{lim} d: |dr| = {k[1]:.2f} km + {k[0]:.2f} km/day * age  (N={m.sum()})")
    m2 = (ages > 0.1)
    pl = np.polyfit(np.log(ages[m2]), np.log(errs[m2]), 1)
    print(f"power-law fit (age>0.1 d): |dr| ~ {math.exp(pl[1]):.2f} * age^{pl[0]:.2f} km")
    print("CAVEAT: supplemental TLEs are SGP4 fits to NASA's OEM over 6-h windows (their own error is sub-km); 'truth-ish', not truth. Any reboost inside the span appears as a jump.")
    n0 = float(segs[0][1][52:63]); n1 = float(segs[-1][1][52:63]); span = tle_epoch_jd(segs[-1][0]) - tle_epoch_jd(segs[0][0])
    a0 = (MU_WGS72 / (n0 * 2 * math.pi / 86400) ** 2) ** (1 / 3); a1 = (MU_WGS72 / (n1 * 2 * math.pi / 86400) ** 2) ** (1 / 3)
    print(f"supplemental mean motion {n0:.6f} -> {n1:.6f} rev/day over {span:.2f} d => a: {a0:.2f} -> {a1:.2f} km => {1000 * (a1 - a0) / span:+.0f} m/day average (includes any reboost)")


# ---------------------------------------------------------------- Part C
def part_C():
    print("\n=== PART C: pixel scale at globe scale (what 'visually truthful' means) ===")
    D = 2 * 6371.0
    spans = [("whole Earth disk fills 1000 px", D, 1000), ("Earth disk fills 800 px", D, 800),
             ("continent view 3000 km / 1000 px", 3000, 1000), ("region 500 km / 1000 px", 500, 1000),
             ("city 100 km / 1000 px", 100, 1000), ("4K monitor, disk fills 2000 px", D, 2000)]
    print(f"{'view':>36s} | {'km/px':>7s} | {'1-px km':>8s} | {'3-px km':>8s}")
    for name, km, px in spans:
        print(f"{name:>36s} | {km / px:7.2f} | {km / px:8.2f} | {3 * km / px:8.1f}")
    for H in [3000, 10000, 20000, 35786]:
        gsd = 2 * H * math.tan(30 * D2R) / 1000
        print(f"camera height {H:6d} km, 60 deg vertical FOV, 1000 px tall -> ~{gsd:.1f} km/px at nadir (flat approx)")


# ---------------------------------------------------------------- Part D
def part_D():
    print("\n=== PART D: refresh cadence from err(t) = e0 + k*t (round-number summaries of sources) ===")
    classes = [
        ("ISS ~420 km (drag+reboosts)", 1.0, 3.0),
        ("LEO 500-600 km (Starlink)", 1.0, 3.0),
        ("LEO 800-1200 km (low drag)", 0.5, 1.0),
        ("MEO GPS 20,200 km", 0.5, 1.0),
        ("GEO station-kept", 0.5, 0.5),
    ]
    thresholds = [("3px@12.7km/px", 38.0), ("1px@12.7km/px", 12.7), ("3px@0.5km/px", 1.5), ("1px@0.5km/px", 0.5)]
    print(f"{'class':>30s} | " + " | ".join(f"{t[0]:>16s}" for t in thresholds))
    for name, e0, k in classes:
        cells = []
        for tname, thr in thresholds:
            days = (thr - e0) / k if thr > e0 else 0.0
            cells.append(f"{days:5.1f} d ={days * 24:5.0f} h")
        print(f"{name:>30s} | " + " | ".join(f"{c:>16s}" for c in cells))
    print("(time until modeled error exceeds threshold; refresh before that; 0 = already beyond at epoch)")


# ---------------------------------------------------------------- Part E
def part_E():
    print("\n=== PART E: ISS decay implied by the TLE ndot/2 field ===")
    l1, l2 = read_tle(os.path.join(ROOT, "iss_tle.txt"))
    me = mean_elems(l1, l2)
    n = me["n_rev"]; ndot = 2 * me["ndot2"]
    a = (MU_WGS72 / (n * 2 * math.pi / 86400) ** 2) ** (1 / 3)
    dadt = -(2 * a / (3 * n)) * ndot
    print(f"ndot/2 = {me['ndot2']:.8f} rev/day^2 -> ndot = {ndot:.3e} rev/day^2; a = {a:.2f} km -> da/dt = {dadt * 1000:+.1f} m/day")
    for d in [1, 3, 7]:
        dM_rev = 0.5 * ndot * d ** 2
        print(f"  ignoring drag entirely for {d} d shifts mean anomaly by {dM_rev:.5f} rev = {dM_rev * 2 * math.pi * a:.1f} km along-track")


if __name__ == "__main__":
    part_A(); part_B(); part_C(); part_D(); part_E()
