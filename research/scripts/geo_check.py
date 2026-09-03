import math

mu = 398600.4418  # km^3/s^2, WGS84/EGM Earth GM value commonly used

T_sidereal = 86164.0905  # s, sidereal day
T_solar = 86400.0        # s, mean solar day

def r_from_T(T, mu):
    return (mu * T**2 / (4*math.pi**2))**(1/3)

r_sid = r_from_T(T_sidereal, mu)
r_sol = r_from_T(T_solar, mu)

Re = 6378.137  # km, WGS84 equatorial radius

print("mu =", mu, "km^3/s^2")
print(f"T_sidereal = {T_sidereal} s -> r = {r_sid:.4f} km, alt = {r_sid-Re:.4f} km")
print(f"T_solar    = {T_solar} s -> r = {r_sol:.4f} km, alt = {r_sol-Re:.4f} km")
print(f"delta r (sidereal vs solar) = {r_sol-r_sid:.4f} km")
print(f"delta alt = {(r_sol-Re)-(r_sid-Re):.4f} km")

# Also check with mu = 398600.5 (rounder value often cited)
mu2 = 398600.5
r_sid2 = r_from_T(T_sidereal, mu2)
print(f"\nWith mu={mu2}: r_sidereal = {r_sid2:.4f} km, alt = {r_sid2-Re:.4f} km")
