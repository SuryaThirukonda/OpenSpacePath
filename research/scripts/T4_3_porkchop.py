"""
T4.3 -- Earth-Mars porkchop plot (coarse grid), computed with:
  - Skyfield + JPL DE421 ephemeris for heliocentric Earth/Mars state vectors (ICRF/J2000, km, km/s)
  - lamberthub (Izzo's algorithm) for the Lambert solve, prograde, zero revolutions

Grid: departures 2026-01-01 .. 2029-12-31, step 7 days
      time of flight 100 .. 400 days, step 10 days

For each (departure, ToF) cell:
  - r1, v1 = Earth heliocentric state at departure
  - r2, v2 = Mars heliocentric state at arrival = departure + ToF
  - Lambert solve (mu_sun, r1, r2, ToF) -> (v1_transfer, v2_transfer), prograde, 0 revs
  - v_inf_dep = |v1_transfer - v1|          (hyperbolic excess speed leaving Earth's SOI, patched-conic approx)
  - v_inf_arr = |v2_transfer - v2|          (hyperbolic excess speed relative to Mars on arrival)
  - C3_dep = v_inf_dep^2                    (km^2/s^2, "launch energy")
  - v_inf_sum = v_inf_dep + v_inf_arr       (a cheap proxy for total impulsive-manoeuvre cost)

Output: notes/T4_3_porkchop.csv (full grid) and console summary of best windows.
If matplotlib is available, notes/T4_3_porkchop.png (C3 departure contours).
"""
import csv
import datetime as dt
import math
import sys
import time

import numpy as np
from skyfield.api import load
from lamberthub import izzo2015

MU_SUN_KM3_S2 = 132712440041.279419  # km^3/s^2, DE421 value (close to IAU 2015 nominal 1.32712440018e11)

SCRATCH = "C:/Users/thiru/AppData/Local/Temp/claude/C--Users-thiru-tamu2-ecs-research-rathinam/5b6188bd-1182-4842-a6a3-cb49230254ab/scratchpad"

def main():
    ts = load.timescale()
    eph = load(SCRATCH + "/de421.bsp")
    sun = eph["sun"]
    earth = eph["earth"]
    mars = eph["mars"]

    dep_start = dt.date(2026, 1, 1)
    dep_end = dt.date(2029, 12, 31)
    dep_step_days = 7
    tof_min, tof_max, tof_step = 100, 400, 10

    dep_dates = []
    d = dep_start
    while d <= dep_end:
        dep_dates.append(d)
        d += dt.timedelta(days=dep_step_days)
    tofs = list(range(tof_min, tof_max + 1, tof_step))

    print(f"Grid: {len(dep_dates)} departure dates x {len(tofs)} ToFs = {len(dep_dates)*len(tofs)} cells", file=sys.stderr)

    # Precompute Earth/Mars state vectors relative to Sun for every date we need (departure dates,
    # and every possible arrival date = dep + tof).
    all_dates = set(dep_dates)
    for d0 in dep_dates:
        for tof in tofs:
            all_dates.add(d0 + dt.timedelta(days=tof))
    all_dates = sorted(all_dates)

    t0 = time.time()
    state_cache = {}
    # Batch via skyfield vectorized time array for speed.
    ts_times = ts.utc([d.year for d in all_dates], [d.month for d in all_dates], [d.day for d in all_dates])
    earth_rv = (earth - sun).at(ts_times)
    mars_rv = (mars - sun).at(ts_times)
    r_earth_all = earth_rv.position.km.T   # (N,3)
    v_earth_all = earth_rv.velocity.km_per_s.T
    r_mars_all = mars_rv.position.km.T
    v_mars_all = mars_rv.velocity.km_per_s.T
    for i, d0 in enumerate(all_dates):
        state_cache[d0] = (r_earth_all[i], v_earth_all[i], r_mars_all[i], v_mars_all[i])
    print(f"Ephemeris lookups done in {time.time()-t0:.1f}s for {len(all_dates)} dates", file=sys.stderr)

    rows = []
    t0 = time.time()
    n_fail = 0
    for d0 in dep_dates:
        r1, v1, _, _ = state_cache[d0]
        for tof in tofs:
            d1 = d0 + dt.timedelta(days=tof)
            _, _, r2, v2 = state_cache[d1]
            tof_s = tof * 86400.0
            try:
                v1t, v2t = izzo2015(MU_SUN_KM3_S2, np.array(r1), np.array(r2), tof_s,
                                     M=0, prograde=True, low_path=True, maxiter=35, atol=1e-8, rtol=1e-10)
            except Exception:
                n_fail += 1
                continue
            v_inf_dep = np.linalg.norm(np.array(v1t) - np.array(v1))
            v_inf_arr = np.linalg.norm(np.array(v2t) - np.array(v2))
            c3_dep = v_inf_dep ** 2
            c3_arr = v_inf_arr ** 2
            vinf_sum = v_inf_dep + v_inf_arr
            rows.append((d0.isoformat(), d1.isoformat(), tof, v_inf_dep, v_inf_arr, c3_dep, c3_arr, vinf_sum))
    print(f"Lambert solves done in {time.time()-t0:.1f}s, {n_fail} failures out of {len(dep_dates)*len(tofs)}", file=sys.stderr)

    # Write CSV
    csv_path = SCRATCH + "/notes/T4_3_porkchop.csv"
    with open(csv_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["departure_date", "arrival_date", "tof_days", "v_inf_dep_km_s", "v_inf_arr_km_s",
                    "c3_dep_km2_s2", "c3_arr_km2_s2", "v_inf_sum_km_s"])
        w.writerows(rows)
    print(f"Wrote {len(rows)} rows to {csv_path}", file=sys.stderr)

    # ---- Analysis: best per-departure-date min over ToF, then best windows ----
    rows_by_dep = {}
    for r in rows:
        dep = r[0]
        rows_by_dep.setdefault(dep, []).append(r)

    best_per_dep = []  # (dep_date, best_row) minimizing v_inf_sum over ToF choices
    for dep, rs in rows_by_dep.items():
        best = min(rs, key=lambda r: r[7])
        best_per_dep.append(best)
    best_per_dep.sort(key=lambda r: r[0])

    # global best
    global_best = min(rows, key=lambda r: r[7])
    global_best_c3 = min(rows, key=lambda r: r[5])

    print("\n=== GLOBAL BEST (min v_inf_sum over whole grid, 2026-2029) ===")
    print(f"departure={global_best[0]} arrival={global_best[1]} tof={global_best[2]}d "
          f"v_inf_dep={global_best[3]:.3f} v_inf_arr={global_best[4]:.3f} "
          f"C3_dep={global_best[5]:.3f} v_inf_sum={global_best[7]:.3f} km/s")

    print("\n=== GLOBAL MIN C3 departure ===")
    print(f"departure={global_best_c3[0]} arrival={global_best_c3[1]} tof={global_best_c3[2]}d "
          f"C3_dep={global_best_c3[5]:.3f} km2/s2  v_inf_dep={global_best_c3[3]:.3f} km/s "
          f"v_inf_arr={global_best_c3[4]:.3f} v_inf_sum={global_best_c3[7]:.3f} km/s")

    # Identify launch windows by clustering: find local minima regions in best_per_dep by year
    for yr in (2026, 2027, 2028, 2029):
        yr_rows = [r for r in best_per_dep if r[0].startswith(str(yr))]
        if not yr_rows:
            continue
        best_yr = min(yr_rows, key=lambda r: r[7])
        print(f"\n=== Best in calendar year {yr} (departures dated {yr}) ===")
        print(f"departure={best_yr[0]} arrival={best_yr[1]} tof={best_yr[2]}d "
              f"v_inf_dep={best_yr[3]:.3f} v_inf_arr={best_yr[4]:.3f} "
              f"C3_dep={best_yr[5]:.3f} v_inf_sum={best_yr[7]:.3f} km/s")

    # Print the full time series of best-per-departure-date v_inf_sum to find the window envelope minima
    # (helps locate the true synodic-period-spaced windows, since our year buckets can split a window).
    print("\n=== Windows: local minima of best-per-departure v_inf_sum (coarse) ===")
    vals = [r[7] for r in best_per_dep]
    dep_labels = [r[0] for r in best_per_dep]
    minima = []
    for i in range(1, len(vals) - 1):
        if vals[i] <= vals[i-1] and vals[i] <= vals[i+1] and vals[i] < 7.0:
            minima.append((dep_labels[i], vals[i], best_per_dep[i]))
    # collapse consecutive minima within 60 days into one (report the lowest)
    collapsed = []
    for m in minima:
        if collapsed and (dt.date.fromisoformat(m[0]) - dt.date.fromisoformat(collapsed[-1][0])).days < 60:
            if m[1] < collapsed[-1][1]:
                collapsed[-1] = m
        else:
            collapsed.append(m)
    for dep_label, vinf, row in collapsed:
        print(f"window min near departure {dep_label}: v_inf_sum={vinf:.3f} km/s "
              f"(tof={row[2]}d, C3_dep={row[5]:.3f}, v_inf_arr={row[4]:.3f})")

    if len(collapsed) >= 2:
        d1 = dt.date.fromisoformat(collapsed[0][0])
        d2 = dt.date.fromisoformat(collapsed[1][0])
        print(f"\nSpacing between first two window minima: {(d2-d1).days} days "
              f"(expected synodic period Earth-Mars ~= 780 days)")

    # ---- optional plot ----
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.dates as mdates

        dep_arr = np.array([dt.date.fromisoformat(r[0]) for r in rows])
        tof_arr = np.array([r[2] for r in rows])
        c3_arr = np.array([r[5] for r in rows])
        vinf_sum_arr = np.array([r[7] for r in rows])

        dep_unique = sorted(set(dep_arr))
        tof_unique = sorted(set(tof_arr))
        dep_idx = {d: i for i, d in enumerate(dep_unique)}
        tof_idx = {t: i for i, t in enumerate(tof_unique)}
        C3 = np.full((len(tof_unique), len(dep_unique)), np.nan)
        VS = np.full((len(tof_unique), len(dep_unique)), np.nan)
        for r in rows:
            di = dep_idx[dt.date.fromisoformat(r[0])]
            ti = tof_idx[r[2]]
            C3[ti, di] = r[5]
            VS[ti, di] = r[7]

        dep_num = mdates.date2num(dep_unique)
        fig, ax = plt.subplots(figsize=(14, 6))
        cs1 = ax.contour(dep_num, tof_unique, C3, levels=[6,8,10,12,14,16,20,25,30,40,60,90],
                          colors="tab:blue", linewidths=0.8)
        ax.clabel(cs1, inline=True, fontsize=6, fmt="C3=%d")
        cs2 = ax.contour(dep_num, tof_unique, VS, levels=[5.5,6,6.5,7,8,9,10,12,15],
                          colors="tab:red", linewidths=0.8, linestyles="dashed")
        ax.clabel(cs2, inline=True, fontsize=6, fmt="vinf_sum=%.1f")
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
        ax.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
        fig.autofmt_xdate()
        ax.set_xlabel("Departure date")
        ax.set_ylabel("Time of flight (days)")
        ax.set_title("Earth->Mars porkchop, 2026-2029 (coarse 7d x 10d grid)\n"
                      "blue: departure C3 [km^2/s^2]   red dashed: v_inf_dep + v_inf_arr [km/s]")
        fig.tight_layout()
        png_path = SCRATCH + "/notes/T4_3_porkchop.png"
        fig.savefig(png_path, dpi=140)
        print(f"\nSaved plot to {png_path}")
    except Exception as e:
        print(f"\n(matplotlib plot skipped: {e})")


if __name__ == "__main__":
    main()
