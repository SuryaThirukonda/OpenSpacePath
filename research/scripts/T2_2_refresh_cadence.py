"""T2.2 - Numbers behind 'how often must TLEs be refreshed to stay visually truthful at globe scale'.

Everything here is arithmetic on published rules of thumb (1-3 km/day LEO TLE error growth; python-sgp4 README)
plus two-body relations. Run: <scratchpad>/venv/Scripts/python.exe T2_2_refresh_cadence.py
"""
import math

MU = 398600.8       # km^3/s^2 (WGS-72, SGP4)
RE = 6378.135       # km
OMEGA_E = 7.2921158553e-5  # rad/s (Cesium wgs84WRPrecessing)

print("=== Globe-scale pixel budget ===")
for px_diam in (400, 800, 1600):
    kmpp = 2 * RE / px_diam
    print(f"Earth drawn {px_diam:4d} px across -> {kmpp:6.1f} km per pixel ; ISS altitude 420 km = {420/kmpp:5.1f} px ; GEO radius 42164 km = {42164/kmpp:6.1f} px")

print("\n=== Along-track error from TLE age (rule of thumb 1-3 km/day, LEO) ===")
for days in (0, 1, 3, 7, 14, 30):
    lo, hi = 1 + 1 * days, 1 + 3 * days  # ~1 km at epoch + growth
    print(f"age {days:2d} d: {lo:4.0f}-{hi:4.0f} km  -> at 16 km/px: {lo/16:4.1f}-{hi/16:4.1f} px ; as ISS timing error: {lo/7.66:5.1f}-{hi/7.66:5.1f} s")

print("\n=== Timing/velocity: how much 1 s of time error moves a satellite ===")
for name, r in (("ISS (r=6798 km)", 6798.0), ("GPS MEO (r=26560 km)", 26560.0), ("GEO (r=42164 km)", 42164.0)):
    v = math.sqrt(MU / r)
    T = 2 * math.pi * math.sqrt(r**3 / MU) / 60
    print(f"{name:22s}: v = {v:5.3f} km/s, period {T:8.2f} min -> 1 s clock error = {v:5.2f} km along-track")

print("\n=== UT1 vs UTC (satellite.js and Cesium TEME->fixed treat UTC as UT1) ===")
dut1 = 0.9  # |UT1-UTC| bound before a leap second is inserted
for name, r in (("ISS", 6798.0), ("GEO", 42164.0)):
    print(f"|DUT1| <= {dut1} s -> ground-track/fixed-frame rotation error <= {dut1*OMEGA_E*r:6.3f} km at r={r:.0f} km ({dut1*OMEGA_E*206264.8:5.1f} arcsec)")

print("\n=== TLE field resolution ===")
print(f"epoch printed to 1e-8 day = {1e-8*86400*1e3:.3f} ms -> {1e-8*86400*7.66:.3f} m along-track for ISS")
print(f"mean motion printed to 1e-8 rev/day: dT = T*dn/n = {92.97*1e-8/15.4896*60*1e3:.4f} ms per orbit")

print("\n=== ISS reboost: why a week-old ISS TLE can be visibly wrong even at globe scale ===")
a = 6798.0
for dv in (0.5, 1.0, 2.0):  # m/s, typical ISS reboost sizes
    da = 2 * a**2 * (dv / 1000) / MU  # km, from vis-viva differential at circular orbit: da = 2 a^2 dv / mu
    T = 2 * math.pi * math.sqrt(a**3 / MU)  # s
    dT = 1.5 * T * da / a  # s per orbit
    orbits_per_day = 86400 / T
    for days in (1, 7):
        dt_total = dT * orbits_per_day * days
        along = dt_total * math.sqrt(MU / a)
        print(f"dv={dv:3.1f} m/s -> da={da:6.3f} km, dT={dT:5.3f} s/orbit ; after {days} d: {dt_total:6.1f} s late/early = {along:7.1f} km along-track = {along/16:5.1f} px at 16 km/px")

print("\n=== Ground-track westward shift per orbit (sanity anchor) ===")
T_iss = 2 * math.pi * math.sqrt(a**3 / MU)
print(f"ISS: {T_iss/60:.2f} min * 360/1436.07 min = {T_iss/60*360/1436.07:.2f} deg west per orbit (plus ~{4.9*T_iss/86400:.2f} deg from nodal regression)")
