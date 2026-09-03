"""
T4.1 -- Lambert's problem / Izzo 2015 algorithm -- verification script.

Verifies lamberthub's izzo2015 implementation against Curtis "Orbital Mechanics
for Engineering Students" Example 5.2 (prograde, short way, single rev):

  r1 = [5000, 10000, 2100] km
  r2 = [-14600, 2500, 7000] km
  dt = 3600 s
  mu_earth = 398600 km^3/s^2 (Curtis uses this rounded value)

Expected (Curtis text):
  v1 = [-5.9925, 1.9254, 3.2456] km/s
  v2 = [-3.3125, -4.1966, -0.38529] km/s

Run with the project venv:
  <scratchpad>/venv/Scripts/python.exe notes/T4_1_lambert.py
"""
import numpy as np
from lamberthub import izzo2015, vallado2013, gooding1990

MU_EARTH_CURTIS = 398600.0  # km^3/s^2, Curtis's rounded constant

r1 = np.array([5000.0, 10000.0, 2100.0])
r2 = np.array([-14600.0, 2500.0, 7000.0])
tof = 3600.0  # s

expected_v1 = np.array([-5.9925, 1.9254, 3.2456])
expected_v2 = np.array([-3.3125, -4.1966, -0.38529])

print("=== Curtis Example 5.2 cross-check ===")
for name, solver in [("izzo2015", izzo2015), ("vallado2013", vallado2013), ("gooding1990", gooding1990)]:
    v1, v2 = solver(MU_EARTH_CURTIS, r1, r2, tof, M=0, prograde=True, low_path=True)
    v1 = np.array(v1)
    v2 = np.array(v2)
    err1 = np.linalg.norm(v1 - expected_v1)
    err2 = np.linalg.norm(v2 - expected_v2)
    print(f"\n-- {name} --")
    print(f"  v1 = {v1}  (expected {expected_v1}, |err| = {err1:.2e} km/s)")
    print(f"  v2 = {v2}  (expected {expected_v2}, |err| = {err2:.2e} km/s)")

print("\n=== Multi-revolution demo (M=0,1,2) on a longer-period case ===")
# Longer time of flight so multiple revolutions are geometrically possible.
r1b = np.array([5000.0, 10000.0, 2100.0])
r2b = np.array([-14600.0, 2500.0, 7000.0])
tof_long = 3600.0 * 10  # 10 hours
for M in range(0, 3):
    try:
        v1, v2 = izzo2015(MU_EARTH_CURTIS, r1b, r2b, tof_long, M=M, prograde=True, low_path=True)
        print(f"  M={M}: v1={np.array(v1)}  v2={np.array(v2)}")
    except Exception as e:
        print(f"  M={M}: no solution / error: {e}")

print("\n=== Synodic period computation (Track 4 Q2) ===")
# Sidereal orbital periods (days), from JPL planetary fact sheets
T_earth = 365.256
T_venus = 224.701
T_mars = 686.980
T_jupiter = 4332.589

def synodic_period(T_inner, T_outer):
    """S = 1 / |1/T_inner - 1/T_outer|, days"""
    return 1.0 / abs(1.0 / T_inner - 1.0 / T_outer)

print(f"  Earth-Venus synodic period:   {synodic_period(T_earth, T_venus):.2f} days")
print(f"  Earth-Mars synodic period:    {synodic_period(T_earth, T_mars):.2f} days")
print(f"  Earth-Jupiter synodic period: {synodic_period(T_earth, T_jupiter):.2f} days")

print("\n=== Worked Earth->Mars Lambert -> v_inf -> C3 example (SIMPLIFIED, coplanar circular orbits) ===")
# NOTE: this is a heliocentric, coplanar, circular-orbit approximation of Earth and
# Mars (no real ephemeris / dates), used only to walk the Lambert -> v_inf -> C3 chain
# with concrete numbers. Real mission design needs planet state vectors from an
# ephemeris (pykep jpl_lp, JPL Horizons, or VSOP87) at the actual departure/arrival
# calendar dates -- see Q1 in the returned notes for the caveat.
MU_SUN = 1.32712440018e11  # km^3/s^2
AU = 1.495978707e8         # km
r_earth = 1.00000011 * AU
r_mars = 1.52366231 * AU

v_earth_mag = np.sqrt(MU_SUN / r_earth)   # circular speed, km/s
v_mars_mag = np.sqrt(MU_SUN / r_mars)

# Place Earth on +x axis, Mars at a chosen transfer angle (short way, < 180 deg)
transfer_angle_deg = 150.0
theta = np.radians(transfer_angle_deg)
r1_h = np.array([r_earth, 0.0, 0.0])
r2_h = np.array([r_mars * np.cos(theta), r_mars * np.sin(theta), 0.0])
v1_planet = np.array([0.0, v_earth_mag, 0.0])          # Earth velocity (ccw circular)
v2_planet = v_mars_mag * np.array([-np.sin(theta), np.cos(theta), 0.0])  # Mars velocity

# Pick a plausible TOF near the low-energy region for this geometry (illustrative)
tof_days = 230.0
tof_s = tof_days * 86400.0

v1_sc, v2_sc = izzo2015(MU_SUN, r1_h, r2_h, tof_s, M=0, prograde=True, low_path=True)
v1_sc = np.array(v1_sc)
v2_sc = np.array(v2_sc)

v_inf_dep = v1_sc - v1_planet
v_inf_arr = v2_sc - v2_planet
C3 = np.dot(v_inf_dep, v_inf_dep)

print(f"  transfer angle = {transfer_angle_deg} deg, TOF = {tof_days} days")
print(f"  spacecraft v1 (heliocentric) = {v1_sc} km/s")
print(f"  Earth v1 (heliocentric)      = {v1_planet} km/s")
print(f"  v_inf at departure           = {v_inf_dep} km/s, |v_inf| = {np.linalg.norm(v_inf_dep):.4f} km/s")
print(f"  C3 = |v_inf_dep|^2           = {C3:.4f} km^2/s^2")
print(f"  spacecraft v2 (heliocentric) = {v2_sc} km/s")
print(f"  Mars v2 (heliocentric)       = {v2_planet} km/s")
print(f"  v_inf at arrival             = {v_inf_arr} km/s, |v_inf| = {np.linalg.norm(v_inf_arr):.4f} km/s")
print(f"  sum |v_inf_dep| + |v_inf_arr| (Curtis-style porkchop metric) = "
      f"{np.linalg.norm(v_inf_dep) + np.linalg.norm(v_inf_arr):.4f} km/s")
