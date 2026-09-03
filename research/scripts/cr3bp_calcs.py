import numpy as np
from scipy.optimize import brentq

# Earth-Moon CR3BP mass ratio
M_earth = 5.97219e24
M_moon = 7.34767e22
mu = M_moon / (M_earth + M_moon)
print(f"mu (Earth-Moon mass ratio) = {mu:.6f}")

R = 384400.0  # km, mean Earth-Moon distance

# Collinear Lagrange point equations (nondimensional x on Earth-Moon line, Earth at -mu, Moon at 1-mu)
def dOmega_dx_L1(x):
    return x - (1-mu)*(x+mu)/abs(x+mu)**3 - mu*(x-1+mu)/abs(x-1+mu)**3

# L1: between Earth and Moon
f1 = lambda x: x - (1-mu)/(x+mu)**2*np.sign(x+mu)*1 + 0  # will just use known collinear eq forms below

# Standard collinear equations (x measured from barycenter, Earth at -mu, Moon at 1-mu, distances positive)
def eqL1(x):
    r1 = x + mu       # signed dist from Earth (x> -mu)
    r2 = x - (1-mu)    # signed dist from Moon
    return x - (1-mu)*(x+mu)/abs(r1)**3 - mu*(x-1+mu)/abs(r2)**3

def eqL2(x):
    r1 = x + mu
    r2 = x - (1-mu)
    return x - (1-mu)*(x+mu)/abs(r1)**3 - mu*(x-1+mu)/abs(r2)**3

def eqL3(x):
    r1 = x + mu
    r2 = x - (1-mu)
    return x - (1-mu)*(x+mu)/abs(r1)**3 - mu*(x-1+mu)/abs(r2)**3

# solve numerically in respective brackets
xL1 = brentq(eqL1, 1-mu-0.5, 1-mu-1e-6)
xL2 = brentq(eqL2, 1-mu+1e-6, 1-mu+0.5)
xL3 = brentq(eqL3, -1.5, -1+mu-1e-6)

print(f"xL1 (nondim) = {xL1:.6f}  -> distance from Moon = {(1-mu-xL1)*R:.1f} km")
print(f"xL2 (nondim) = {xL2:.6f}  -> distance from Moon = {(xL2-(1-mu))*R:.1f} km")
print(f"xL3 (nondim) = {xL3:.6f}  -> distance from Earth = {abs(xL3+mu)*R:.1f} km (approx, opposite side)")

# quick approximation formula r_H ~ R*(mu/3)^(1/3)
r_hill_approx = R*(mu/3)**(1/3)
print(f"Hill-sphere approx L1/L2 distance from Moon ~ {r_hill_approx:.1f} km")

# Jacobi constant formula (just print, no eval needed)
print("\nJacobi constant: C = 2*Omega(x,y,z) - (xdot^2+ydot^2+zdot^2)")
print("Omega(x,y,z) = 0.5*(x^2+y^2) + (1-mu)/r1 + mu/r2 + 0.5*mu*(1-mu)")
