"""T1.4 / Track-1 Q3: typical element values for LEO / GEO / Molniya / SSO / MEO(GPS), with derived numbers.
Formulas: P = 2 pi sqrt(a^3/mu); r_p = a(1-e), r_a = a(1+e); vis-viva v = sqrt(mu(2/r - 1/a));
nodal regression dRAAN/dt = -1.5 J2 n (Re/a)^2 cos i /(1-e^2)^2 ;
apsidal rotation dargp/dt = 0.75 J2 n (Re/a)^2 (5cos^2 i - 1)/(1-e^2)^2.
"""
import math
MU = 398600.4418; RE = 6378.137; J2 = 1.08263e-3
SIDEREAL_DAY = 86164.0905          # s
SUN_DEG_PER_DAY = 360/365.2422

def derived(a, e, i_deg):
    i = math.radians(i_deg)
    n = math.sqrt(MU/a**3); P = 2*math.pi/n
    rp, ra = a*(1-e), a*(1+e)
    vp = math.sqrt(MU*(2/rp - 1/a)); va = math.sqrt(MU*(2/ra - 1/a))
    raan_dot = -1.5*J2*n*(RE/a)**2*math.cos(i)/(1-e*e)**2 * 86400*180/math.pi
    argp_dot = 0.75*J2*n*(RE/a)**2*(5*math.cos(i)**2-1)/(1-e*e)**2 * 86400*180/math.pi
    return dict(n=n, P=P, rp=rp, ra=ra, vp=vp, va=va, raan_dot=raan_dot, argp_dot=argp_dot)

zoo = [
    # name, a km, e, i deg, note
    ("ISS (LEO)",            6795.0,  0.0005, 51.64, "TLE 2026-09-01: n=15.4896 rev/day, e=0.0005055, i=51.6312"),
    ("Starlink shell (LEO)", RE+550,  0.0001, 53.0,  "typical v1.5 shell"),
    ("Sun-sync 700 km (SSO)",RE+700,  0.001,  98.19, "i chosen so RAAN rate = +0.9856 deg/day"),
    ("Sentinel-2A (SSO)",    RE+786,  0.0001, 98.57, "TLE from satvis test: 14.308 rev/day, i=98.5663"),
    ("GPS (MEO)",            26560.0, 0.01,   55.0,  "P = half sidereal day"),
    ("GEO",                  42164.0, 0.0,    0.0,   "P = sidereal day, alt 35786 km"),
    ("Molniya (HEO)",        26554.0, 0.74,   63.4,  "P = half sidereal day, argp=270 so apogee over N hemisphere"),
    ("Tundra (HEO)",         42164.0, 0.27,   63.4,  "P = sidereal day, Sirius radio"),
]
print(f"{'orbit':22} {'a km':>8} {'e':>7} {'i deg':>6} {'P min':>9} {'perigee alt':>12} {'apogee alt':>11} {'v_p km/s':>9} {'v_a km/s':>9} {'RAANdot d/day':>14} {'argpdot d/day':>14}")
for name, a, e, i, note in zoo:
    d = derived(a, e, i)
    print(f"{name:22} {a:8.0f} {e:7.4f} {i:6.2f} {d['P']/60:9.2f} {d['rp']-RE:12.1f} {d['ra']-RE:11.1f} {d['vp']:9.3f} {d['va']:9.3f} {d['raan_dot']:14.4f} {d['argp_dot']:14.4f}")
print("\nnotes:"); [print("  ", n, "-", note) for n, *_ , note in zoo]

print("\n--- anchors ---")
a_geo = (MU*(SIDEREAL_DAY/(2*math.pi))**2)**(1/3)
print(f"GEO radius from P = sidereal day: a = (mu (P/2pi)^2)^(1/3) = {a_geo:.1f} km -> altitude {a_geo-RE:.1f} km ; v = {math.sqrt(MU/a_geo):.4f} km/s")
a_semi = (MU*((SIDEREAL_DAY/2)/(2*math.pi))**2)**(1/3)
print(f"Semi-synchronous (GPS/Molniya) a = {a_semi:.1f} km")
# sun-sync inclination for given altitude, circular
for alt in [500, 600, 700, 800, 900]:
    a = RE+alt; n = math.sqrt(MU/a**3)
    cosi = -SUN_DEG_PER_DAY*(math.pi/180)/86400 / (1.5*J2*n*(RE/a)**2)
    print(f"sun-synchronous inclination at {alt} km circular: i = {math.degrees(math.acos(cosi)):.2f} deg (retrograde, >90)")
# critical inclination
print(f"critical inclination (argp_dot = 0): 5cos^2 i = 1 -> i = {math.degrees(math.acos(math.sqrt(0.2))):.2f} deg (Molniya/Tundra use it so apogee stays put)")
# ISS ground track shift per orbit
P_iss = derived(6795.0, 0.0005, 51.64)['P']
shift_rot = 360*P_iss/SIDEREAL_DAY
raan_dot = derived(6795.0, 0.0005, 51.64)['raan_dot']
shift_node = -raan_dot*P_iss/86400
print(f"ISS: period {P_iss/60:.2f} min; Earth rotates {shift_rot:.2f} deg east per orbit; node regresses {shift_node:.2f} deg west per orbit;")
print(f"     successive ascending-node longitudes shift {shift_rot+shift_node:.2f} deg WEST per orbit (master anchor says ~22.5 deg; 23-24 is the two-body+J2 number)")
print(f"     ISS orbits per day: {86400/P_iss:.3f}; TLE says 15.4896 rev/day (Kozai mean motion, includes J2 short-period effect on n)")
print(f"ISS a from TLE mean motion: (mu/(n)^2)^(1/3) with n = 15.48958602 rev/day -> a = {(MU/((15.48958602*2*math.pi/86400)**2))**(1/3):.1f} km ; altitude {(MU/((15.48958602*2*math.pi/86400)**2))**(1/3)-RE:.1f} km")
