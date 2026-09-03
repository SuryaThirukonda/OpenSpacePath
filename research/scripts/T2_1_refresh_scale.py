"""T2.1 companion -- order-of-magnitude numbers for 'how stale can a TLE be
before the globe view lies?'.

1. Globe-scale pixel size: how many km is one screen pixel when the whole
   Earth fills ~N pixels?  Anything smaller than that is invisible.
2. Drag-driven along-track drift of the ISS if its decay rate were ignored
   (uses ndot/2 from the TLE as a Taylor coefficient: dM = (ndot/2) t^2 rev).
   SGP4 models drag through BSTAR, so this is NOT the SGP4 error; it is the
   size of the effect SGP4 is fighting, i.e. the scale of what goes wrong when
   the real atmosphere differs from the fitted one.
3. Ground-track shift per orbit (Earth rotation during one ISS period).
"""
import math

RE = 6378.137           # km
ISS_A = 6795.0          # km  (from T2_1_parse_tle.py: SGP4 un-Kozai a)
ISS_N = 15.48958602     # rev/day
ISS_NDOT2 = 0.00003910  # rev/day^2 (TLE field = ndot/2)
OMEGA_E = 360.0 / 86164.0905   # deg/s, sidereal rotation

print('1) Globe-scale pixel size')
for px in (600, 800, 1200):
    print('   Earth (%.0f km) across %d px -> %.1f km/px' % (2 * RE, px, 2 * RE / px))

print('\n2) ISS along-track drift if decay (ndot) were ignored: dM = (ndot/2)*t^2 rev')
circ = 2 * math.pi * ISS_A
for days in (0.5, 1, 2, 3, 7, 14):
    dM_rev = ISS_NDOT2 * days ** 2
    print('   t=%4.1f d: dM = %.2e rev = %.3f deg = %7.1f km along-track' % (days, dM_rev, dM_rev * 360, dM_rev * circ))

print('\n3) Ground-track westward shift per orbit (Earth rotation during one period)')
P = 1440.0 / ISS_N
print('   period P = %.3f min; shift = %.3f deg/s * %.1f s = %.2f deg (master doc anchor ~22.5 deg)' % (P, OMEGA_E, P * 60, OMEGA_E * P * 60))
# Add nodal regression (J2) to be precise: dOmega/dt ~ -1.5 n J2 (RE/a)^2 cos i / (1-e^2)^2
J2 = 1.08262668e-3; inc = math.radians(51.6312); e = 0.00050553
n_rad_s = ISS_N * 2 * math.pi / 86400
dOmega = -1.5 * n_rad_s * J2 * (RE / ISS_A) ** 2 * math.cos(inc) / (1 - e * e) ** 2
print('   J2 nodal regression = %.3f deg/day (westward); per orbit %.3f deg -> net shift %.2f deg/orbit' % (
    math.degrees(dOmega) * 86400, math.degrees(dOmega) * P * 60, OMEGA_E * P * 60 - math.degrees(dOmega) * P * 60))

print('\n4) 2-hour CelesTrak update cadence in ISS orbits: %.2f orbits per update window' % (120.0 / P))
