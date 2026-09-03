import math

mu = 398600.4418      # km^3/s^2
J2 = 1.08263e-3
R_E = 6378.137         # km, equatorial radius (WGS84 mean equatorial)
alt = 700.0             # km
a = R_E + alt           # 7078.137 km, circular orbit -> a = r

# Mean motion
n_rad_s = math.sqrt(mu / a**3)
n_deg_day = n_rad_s * (180.0/math.pi) * 86400.0
print("n (rad/s) =", n_rad_s)
print("n (deg/day) =", n_deg_day)
print("n (rev/day) =", n_deg_day/360.0)

# Sun-synchronous nodal regression rate target: 360/365.2422 = 0.9856 deg/day
target_rate = 360.0/365.2421897
print("target nodal regression rate (deg/day, tropical year) =", target_rate)
target_rate_sidereal = 360.0/365.25636
print("target rate using sidereal year =", target_rate_sidereal)

# Standard J2 secular nodal regression formula (circular orbit, e=0):
# dOmega/dt = -1.5 * n * J2 * (R_E/a)^2 * cos(i)   [n in same angular units as dOmega/dt]
# Solve for cos(i) given dOmega/dt = +target_rate (posigrade precession matching Sun)
factor = 1.5 * n_deg_day * J2 * (R_E/a)**2
print("1.5*n*J2*(R_E/a)^2 (deg/day) =", factor)

cos_i = -target_rate / factor
print("cos(i) =", cos_i)
i_rad = math.acos(cos_i)
i_deg = math.degrees(i_rad)
print("inclination (deg) =", i_deg)

# Using sidereal year variant
cos_i_sid = -target_rate_sidereal / factor
i_deg_sid = math.degrees(math.acos(cos_i_sid))
print("inclination (deg) using sidereal-year rate =", i_deg_sid)

# Cross-check via Wikipedia closed form: cos(i) = -(a/12352 km)^3.5  (for circular SSO, uses 0.9856 deg/day, J2, mu, R_E baked in)
cos_i_wiki = -(a/12352.0)**3.5
i_deg_wiki = math.degrees(math.acos(cos_i_wiki))
print("cos(i) via Wikipedia closed-form (a/12352km)^3.5 =", cos_i_wiki)
print("inclination (deg) via Wikipedia closed-form =", i_deg_wiki)

# Sensitivity: try R_E = 6371 km (mean radius) instead of equatorial
R_E2 = 6371.0
factor2 = 1.5 * n_deg_day * J2 * (R_E2/a)**2
cos_i2 = -target_rate/factor2
i_deg2 = math.degrees(math.acos(cos_i2))
print("inclination using R_E=6371 (mean) km =", i_deg2)

# Sensitivity: J2 = 1.08262668e-3 (EGM96 value) vs 1.08263e-3
J2b = 1.08262668e-3
factor3 = 1.5*n_deg_day*J2b*(R_E/a)**2
cos_i3 = -target_rate/factor3
i_deg3 = math.degrees(math.acos(cos_i3))
print("inclination using J2=1.08262668e-3 =", i_deg3)

print("--- Wikipedia example check: a=7200 km ---")
a2 = 7200.0
cos_i_wiki2 = -(a2/12352.0)**3.5
print("cos(i) =", cos_i_wiki2, "-> i =", math.degrees(math.acos(cos_i_wiki2)))
