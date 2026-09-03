import numpy as np
from decimal import Decimal, getcontext

# Independent derivation: solve 5*cos(i)^2 - 1 = 0 for i in [0, 180] deg
# This equation comes from the secular rate of argument of perigee under J2:
#   d(omega)/dt = -1.5 * n * J2 * (Re/p)^2 * (5*cos(i)^2 - 1)  [standard Vallado/Brouwer form, up to constant factors]
# Setting the bracket (5cos^2 i - 1) = 0 gives the "critical inclination".

cos_i = np.sqrt(1.0/5.0)
i_rad = np.arccos(cos_i)
i_deg = np.degrees(i_rad)
print("cos(i) = sqrt(1/5) =", cos_i)
print("i (prograde root)  = %.10f deg" % i_deg)

i_retro = 180.0 - i_deg
print("i (retrograde root)= %.10f deg" % i_retro)

# High precision cross-check with Decimal/mpmath-like approach using numpy's float64 is already ~1e-16 rel precision.
# Verify by squaring back
print("check: 5*cos_i**2 - 1 =", 5*cos_i**2 - 1)

# Also verify via direct root solve of 5cos^2(i)-1=0 numerically (Newton) independent of the closed form,
# to make sure the closed-form arccos(sqrt(1/5)) really is the root.
def f(i_deg_):
    r = np.radians(i_deg_)
    return 5*np.cos(r)**2 - 1

# bisection by hand (no scipy dependency assumed)
lo, hi = 0.0, 90.0
for _ in range(200):
    mid = (lo+hi)/2
    if f(lo)*f(mid) <= 0:
        hi = mid
    else:
        lo = mid
root = (lo+hi)/2
print("bisection root =", root, "deg")

print()
print("Rounded to standard reporting precision: %.4f deg" % i_deg)
print("Commonly quoted rounded value: 63.4349 deg or 63.4 deg")
