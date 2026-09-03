import numpy as np

mu_sun = 1.32712440018e11  # km^3/s^2
AU = 1.495978707e8  # km

# orbital periods (sidereal, days) - from JPL
T_earth = 365.256
T_venus = 224.701
T_mars  = 686.980
T_jupiter = 4332.59

def synodic(T1, T2):
    return 1.0/abs(1.0/T1 - 1.0/T2)

print("Synodic periods (days):")
print("Earth-Venus:", synodic(T_earth, T_venus))
print("Earth-Mars:", synodic(T_earth, T_mars))
print("Earth-Jupiter:", synodic(T_earth, T_jupiter))
print()

# Hohmann Earth->Mars quick check, and a Lambert-like worked example using vis-viva
a_earth = 1.000 * AU
a_mars  = 1.524 * AU

def v_circ(a):
    return np.sqrt(mu_sun/a)

v_e = v_circ(a_earth)
v_m = v_circ(a_mars)
a_transfer = (a_earth+a_mars)/2
v_p = np.sqrt(mu_sun*(2/a_earth - 1/a_transfer))  # transfer perihelion speed at Earth's orbit
v_a = np.sqrt(mu_sun*(2/a_mars  - 1/a_transfer))  # transfer aphelion speed at Mars's orbit

dv1 = v_p - v_e
dv2 = v_m - v_a
tof = np.pi*np.sqrt(a_transfer**3/mu_sun)  # seconds, Hohmann half period

print("Earth circular speed (km/s):", v_e)
print("Mars circular speed (km/s):", v_m)
print("Transfer perihelion speed (km/s):", v_p)
print("Transfer aphelion speed (km/s):", v_a)
print("v_inf departure (km/s) [Hohmann tangential case]:", dv1)
print("v_inf arrival (km/s) [Hohmann tangential case]:", dv2)
print("Hohmann time of flight (days):", tof/86400)
