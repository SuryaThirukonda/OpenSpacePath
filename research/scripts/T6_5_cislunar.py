"""
T6.5 -- Cislunar delta-v / time-of-flight starter table: two-body cross-check.

Computes, with plain two-body (patched-conic, impulsive) mechanics:
  1. TLI delta-v and time-of-flight for the MINIMUM-ENERGY (apogee = 384,400 km) transfer
     from a 200 km circular LEO parking orbit.
  2. TLI delta-v for a FASTER, ~3-day transfer to the same 384,400 km radius (higher-energy
     ellipse than the minimum-energy Hohmann-like transfer -- this is closer to what real
     missions (Apollo, Artemis) actually fly, since they don't want a 5-day one-way coast).
  3. A rough patched-conic estimate of the Lunar Orbit Insertion (LOI) burn into a 100 km
     circular LLO, for the 3-day-transfer case.

These are cross-checks against the literature table in T6_5_cislunar_notes.md, NOT a
replacement for it -- two-body patched conics ignore the Moon's actual approach geometry,
solar perturbations, and the fact that real TLI targets a B-plane aim point in the Moon's
sphere of influence, not literally "384,400 km radius from Earth's center". The v_infinity
step below is a **scalar** approximation (Earth-relative transfer speed at r=384,400 km
minus the Moon's mean circular orbital speed), not a vector patched-conic match -- it is
good for order-of-magnitude / sanity-check purposes only, and is flagged as such in the
notes.

Run: <scratchpad>/venv/Scripts/python.exe notes/T6_5_cislunar.py
"""
import numpy as np

# --- constants (km, s, km^3/s^2) ---
MU_E = 398600.4418          # Earth GM, km^3/s^2 (verified: standard value, e.g. Vallado)
MU_M = 4902.800              # Moon GM, km^3/s^2 (verified: standard value)
R_E = 6378.137                # Earth equatorial radius, km
R_MOON = 1737.4               # Moon mean radius, km
D_EM = 384400.0               # Earth-Moon mean distance, km (verified: IAU mean value)
V_MOON_ORBIT = np.sqrt(MU_E / D_EM)  # Moon's mean circular orbital speed about Earth, km/s

DAY = 86400.0


def hohmann_tli(r_leo_alt_km, r_apogee_km):
    """Minimum-energy 'Hohmann-like' TLI: perigee = LEO radius, apogee = target radius."""
    r_p = R_E + r_leo_alt_km
    r_a = r_apogee_km
    a_t = 0.5 * (r_p + r_a)
    v_circ = np.sqrt(MU_E / r_p)
    v_p_transfer = np.sqrt(MU_E * (2.0 / r_p - 1.0 / a_t))
    dv_tli = v_p_transfer - v_circ
    period = 2 * np.pi * np.sqrt(a_t**3 / MU_E)
    tof = period / 2.0  # time from perigee to apogee
    return dict(r_p=r_p, r_a=r_a, a=a_t, v_circ=v_circ, v_p=v_p_transfer,
                dv=dv_tli, tof_s=tof, tof_days=tof / DAY)


def kepler_E_from_M(M, e, tol=1e-12, itmax=100):
    E = M if e < 0.8 else np.pi
    for _ in range(itmax):
        dE = (E - e * np.sin(E) - M) / (1 - e * np.cos(E))
        E -= dE
        if abs(dE) < tol:
            break
    return E


def tof_to_radius(a, r_p, r_target, mu=MU_E):
    """Time (s) from perigee to first crossing of radius r_target on an ellipse
    with semi-major axis a and perigee radius r_p (r_target must be <= apogee)."""
    e = 1.0 - r_p / a
    p = a * (1 - e**2)
    apogee = a * (1 + e)
    if r_target > apogee * (1 + 1e-9):
        return None
    r_target = min(r_target, apogee)
    cos_th = (p / r_target - 1.0) / e
    cos_th = np.clip(cos_th, -1.0, 1.0)
    theta = np.arccos(cos_th)  # outbound branch, 0<theta<pi
    E = 2 * np.arctan2(np.sqrt(1 - e) * np.sin(theta / 2), np.sqrt(1 + e) * np.cos(theta / 2))
    if E < 0:
        E += 2 * np.pi
    M = E - e * np.sin(E)
    n = np.sqrt(mu / a**3)
    return M / n


def solve_transfer_for_tof(r_leo_alt_km, r_target_km, target_tof_days, mu=MU_E):
    """Bisect on semi-major axis a (> Hohmann a) to hit a desired TOF (days) to r_target."""
    r_p = R_E + r_leo_alt_km
    a_hohmann = 0.5 * (r_p + r_target_km)
    target_tof_s = target_tof_days * DAY

    lo, hi = a_hohmann, a_hohmann * 50  # increasing a -> shorter TOF
    tof_lo = tof_to_radius(lo, r_p, r_target_km, mu)  # this is the MAX possible tof (slowest)
    tof_hi = tof_to_radius(hi, r_p, r_target_km, mu)
    assert tof_hi < target_tof_s < tof_lo, f"target TOF out of bracket: [{tof_hi/DAY:.2f},{tof_lo/DAY:.2f}] days"

    for _ in range(200):
        mid = 0.5 * (lo + hi)
        t_mid = tof_to_radius(mid, r_p, r_target_km, mu)
        if t_mid is None:
            hi = mid
            continue
        if t_mid > target_tof_s:
            lo = mid
        else:
            hi = mid
    a = 0.5 * (lo + hi)
    v_circ = np.sqrt(mu / r_p)
    v_p = np.sqrt(mu * (2 / r_p - 1 / a))
    dv_tli = v_p - v_circ
    v_at_target = np.sqrt(mu * (2 / r_target_km - 1 / a))  # Earth-relative speed at r_target
    return dict(a=a, r_p=r_p, v_circ=v_circ, v_p=v_p, dv_tli=dv_tli,
                v_at_target=v_at_target, tof_days=tof_to_radius(a, r_p, r_target_km, mu) / DAY)


def loi_rough(v_earth_rel_at_moon_dist, llo_alt_km):
    """Very rough scalar patched-conic LOI estimate: treat v_infinity relative to the
    Moon as |v_earth_relative_at_D_EM - V_MOON_ORBIT| (a 1-D approximation -- ignores
    the actual approach-velocity vector geometry, which in reality sets v_infinity via
    a vector subtraction and is normally 0.2-1.2 km/s depending on trajectory design).
    """
    v_inf = abs(v_earth_rel_at_moon_dist - V_MOON_ORBIT)
    r_p_moon = R_MOON + llo_alt_km
    v_pericynthion = np.sqrt(v_inf**2 + 2 * MU_M / r_p_moon)  # hyperbolic approach speed at LLO radius
    v_circ_llo = np.sqrt(MU_M / r_p_moon)
    dv_loi = v_pericynthion - v_circ_llo
    return dict(v_inf=v_inf, v_pericynthion=v_pericynthion, v_circ_llo=v_circ_llo, dv_loi=dv_loi)


if __name__ == "__main__":
    print("=== Constants check ===")
    print(f"MU_E = {MU_E} km^3/s^2, MU_M = {MU_M} km^3/s^2, D_EM = {D_EM} km")
    print(f"V_MOON_ORBIT (Moon's mean circular speed about Earth) = {V_MOON_ORBIT:.4f} km/s")
    print()

    print("=== 1) Minimum-energy ('Hohmann-like') TLI, 200 km LEO -> apogee 384,400 km ===")
    h = hohmann_tli(200.0, D_EM)
    print(f"r_p = {h['r_p']:.1f} km, r_a = {h['r_a']:.1f} km, a = {h['a']:.1f} km")
    print(f"v_circ(LEO) = {h['v_circ']:.4f} km/s")
    print(f"v_perigee(transfer) = {h['v_p']:.4f} km/s")
    print(f"TLI delta-v = {h['dv']*1000:.1f} m/s  ({h['dv']:.4f} km/s)")
    print(f"TOF perigee->apogee (one-way) = {h['tof_days']:.2f} days")
    print()

    print("=== 2) Faster ~3-day transfer to r = 384,400 km (same 200 km LEO perigee) ===")
    s = solve_transfer_for_tof(200.0, D_EM, 3.0)
    print(f"Solved semi-major axis a = {s['a']:.1f} km (vs Hohmann a = {h['a']:.1f} km)")
    print(f"v_perigee(transfer) = {s['v_p']:.4f} km/s")
    print(f"TLI delta-v (3-day case) = {s['dv_tli']*1000:.1f} m/s  ({s['dv_tli']:.4f} km/s)")
    print(f"Check: solved TOF = {s['tof_days']:.3f} days (target 3.0)")
    print(f"Earth-relative speed at r=384,400 km (arrival) = {s['v_at_target']:.4f} km/s")
    print(f"  vs. Hohmann-case arrival speed (this is v_apogee, the ellipse's minimum "
          f"speed -- not zero, since apogee speed is nonzero for a finite-a ellipse) = "
          f"{np.sqrt(MU_E*(2/D_EM-1/h['a'])):.4f} km/s")
    print()

    print("=== 3) Rough patched-conic LOI into 100 km circular LLO (from the 3-day transfer) ===")
    loi = loi_rough(s['v_at_target'], 100.0)
    print(f"[APPROXIMATE / scalar patched-conic only -- see module docstring caveat]")
    print(f"v_infinity (rough, scalar) = {loi['v_inf']:.4f} km/s")
    print(f"v_pericynthion (at 100 km alt) = {loi['v_pericynthion']:.4f} km/s")
    print(f"v_circ(LLO, 100 km) = {loi['v_circ_llo']:.4f} km/s")
    print(f"LOI delta-v (rough) = {loi['dv_loi']*1000:.1f} m/s  ({loi['dv_loi']:.4f} km/s)")
    print()

    print("=== Sanity: LLO orbital period at 100 km altitude ===")
    r_llo = R_MOON + 100.0
    T_llo = 2 * np.pi * np.sqrt(r_llo**3 / MU_M)
    print(f"r_LLO = {r_llo:.1f} km, period = {T_llo/60:.1f} min ({T_llo/3600:.3f} hr)")
    print("(cross-check vs. Whitley & Martinez 2016 table: LLO period '~2 hrs' -- matches)")
    print()

    print("=== Sanity: NRHO (9:2 L2-southern) period from McGuire et al. AAS 21-697 ===")
    print("Reported: mean perilune radius 3,366 km, mean apolune radius 71,100 km, period 6.56 days")
    a_nrho = 0.5 * (3366.0 + 71100.0)
    T_nrho = 2 * np.pi * np.sqrt(a_nrho**3 / MU_M)
    print(f"Two-body (Moon-only) check using a=(r_peri+r_apo)/2 = {a_nrho:.1f} km: "
          f"period = {T_nrho/DAY:.2f} days")
    print("NOTE: NRHO is a CR3BP (Earth+Moon+Sun) periodic orbit, not a Keplerian ellipse about the "
          "Moon alone, so a naive two-body period from (r_peri+r_apo)/2 is only a rough check; "
          f"it lands within ~{abs(T_nrho/DAY-6.56)/6.56*100:.0f}% of the reported 6.56-day period, "
          "which is the expected order of agreement for treating a resonant three-body orbit as a "
          "two-body ellipse.")
