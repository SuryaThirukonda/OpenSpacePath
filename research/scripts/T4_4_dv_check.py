"""
T4.4 cross-checks: vis-viva / Hohmann delta-v numbers for the delta-v map,
plus synodic periods for Earth-Mars, Earth-Venus, Earth-Jupiter.

All values computed from first principles (vis-viva eq: v = sqrt(mu*(2/r - 1/a)))
using standard gravitational parameters and mean orbital radii. No library used,
so every number here traces to a formula, not a table lookup.
"""
import math

MU_EARTH = 398600.4418      # km^3/s^2
MU_SUN = 1.32712440018e11   # km^3/s^2
R_EARTH = 6378.137           # km, equatorial radius

def vis_viva(mu, r, a):
    return math.sqrt(mu * (2.0 / r - 1.0 / a))

print("=== 1) LEO -> GTO (perigee burn) ===")
r_leo = R_EARTH + 300.0          # 300 km circular LEO parking orbit
r_gto_apogee = R_EARTH + 35786.0  # GEO altitude as GTO apogee
v_leo_circ = vis_viva(MU_EARTH, r_leo, r_leo)
a_gto = (r_leo + r_gto_apogee) / 2.0
v_gto_perigee = vis_viva(MU_EARTH, r_leo, a_gto)
dv_leo_gto = v_gto_perigee - v_leo_circ
print(f"  LEO circular v (300km alt)      = {v_leo_circ:.3f} km/s")
print(f"  GTO perigee v (apogee=GEO alt)  = {v_gto_perigee:.3f} km/s")
print(f"  dv(LEO->GTO)                    = {dv_leo_gto:.3f} km/s")

print("\n=== 2) GTO -> GEO (apogee circularization) ===")
v_gto_apogee = vis_viva(MU_EARTH, r_gto_apogee, a_gto)
v_geo_circ = vis_viva(MU_EARTH, r_gto_apogee, r_gto_apogee)
dv_gto_geo = v_geo_circ - v_gto_apogee
print(f"  GTO apogee v                    = {v_gto_apogee:.3f} km/s")
print(f"  GEO circular v                  = {v_geo_circ:.3f} km/s")
print(f"  dv(GTO->GEO)                    = {dv_gto_geo:.3f} km/s")
print(f"  TOTAL dv(LEO->GEO, coplanar, no plane change) = {dv_leo_gto+dv_gto_geo:.3f} km/s")
print("  (equatorial LEO, zero inclination assumed; a real GTO->GEO burn from")
print("   a 28.5deg-inclination Cape Canaveral LEO must also remove ~24deg of")
print("   inclination, adding ~1.5 km/s -> published 'LEO(28.5)->GEO' ~3.9-4.2 km/s)")

print("\n=== 3) LEO -> Earth escape (C3 = 0, i.e. v_inf = 0) ===")
v_esc_leo = vis_viva(MU_EARTH, r_leo, float('inf'))
dv_esc = v_esc_leo - v_leo_circ
print(f"  Escape speed at 300km            = {v_esc_leo:.3f} km/s")
print(f"  dv(LEO->escape, C3=0)            = {dv_esc:.3f} km/s")

print("\n=== 4) LEO -> TLI (perigee burn onto free-return-like translunar ellipse) ===")
r_moon = 384400.0  # km, mean Earth-Moon distance
a_tli = (r_leo + r_moon) / 2.0
v_tli_perigee = vis_viva(MU_EARTH, r_leo, a_tli)
dv_tli = v_tli_perigee - v_leo_circ
print(f"  TLI perigee v (apogee=Moon dist) = {v_tli_perigee:.3f} km/s")
print(f"  dv(LEO->TLI)                     = {dv_tli:.3f} km/s")

print("\n=== 5) Earth->Mars heliocentric Hohmann transfer (patched-conic outer leg) ===")
AU = 1.495978707e8  # km
r_earth_helio = 1.000 * AU
r_mars_helio = 1.524 * AU
v_earth_circ = vis_viva(MU_SUN, r_earth_helio, r_earth_helio)
v_mars_circ = vis_viva(MU_SUN, r_mars_helio, r_mars_helio)
a_transfer = (r_earth_helio + r_mars_helio) / 2.0
v_dep_transfer = vis_viva(MU_SUN, r_earth_helio, a_transfer)   # transfer orbit speed at perihelion (Earth)
v_arr_transfer = vis_viva(MU_SUN, r_mars_helio, a_transfer)    # transfer orbit speed at aphelion (Mars)
v_inf_dep = v_dep_transfer - v_earth_circ   # hyperbolic excess speed needed leaving Earth's SOI
v_inf_arr = v_mars_circ - v_arr_transfer    # excess speed relative to Mars on arrival
print(f"  Earth heliocentric circular v    = {v_earth_circ:.3f} km/s")
print(f"  Mars heliocentric circular v     = {v_mars_circ:.3f} km/s")
print(f"  Transfer orbit v at perihelion   = {v_dep_transfer:.3f} km/s")
print(f"  Transfer orbit v at aphelion     = {v_arr_transfer:.3f} km/s")
print(f"  v_infinity at Earth departure    = {v_inf_dep:.3f} km/s  (C3 = {v_inf_dep**2:.2f} km^2/s^2)")
print(f"  v_infinity at Mars arrival       = {v_inf_arr:.3f} km/s")
# Transfer time = half the transfer ellipse period
period_transfer = 2*math.pi*math.sqrt(a_transfer**3 / MU_SUN)
tof_days = (period_transfer/2.0)/86400.0
print(f"  Time of flight (half period)     = {tof_days:.1f} days ({tof_days/30.44:.2f} months)")

print("\n  -- Now patch v_inf_dep into Earth's SOI (LEO departure burn, Oberth) --")
v_hyp_leo = math.sqrt(v_inf_dep**2 + 2*MU_EARTH/r_leo)  # hyperbolic speed at LEO radius
dv_leo_mars_inject = v_hyp_leo - v_leo_circ
print(f"  Hyperbolic v at r_leo             = {v_hyp_leo:.3f} km/s")
print(f"  dv(LEO->Mars transfer injection)  = {dv_leo_mars_inject:.3f} km/s")

print("\n  -- Patch v_inf_arr into Mars SOI (capture burn to low Mars orbit) --")
MU_MARS = 42828.37  # km^3/s^2
r_mars_radius = 3389.5  # km
r_lmo = r_mars_radius + 300.0  # 300 km low Mars orbit
v_hyp_lmo = math.sqrt(v_inf_arr**2 + 2*MU_MARS/r_lmo)
v_lmo_circ = vis_viva(MU_MARS, r_lmo, r_lmo)
dv_mars_capture = v_hyp_lmo - v_lmo_circ
print(f"  Hyperbolic arrival v at LMO radius = {v_hyp_lmo:.3f} km/s")
print(f"  LMO circular v                     = {v_lmo_circ:.3f} km/s")
print(f"  dv(Mars transfer -> low Mars orbit, propulsive capture) = {dv_mars_capture:.3f} km/s")
print("  (aerocapture/aerobraking can replace most of this propulsive dv using")
print("   Mars's thin atmosphere; real missions e.g. MAVEN used aerobraking to")
print("   circularize after propulsive capture into a high elliptical orbit)")

print("\n=== 6) Earth->Venus heliocentric Hohmann transfer (inner leg) ===")
r_venus_helio = 0.723 * AU
v_venus_circ = vis_viva(MU_SUN, r_venus_helio, r_venus_helio)
a_transfer_v = (r_earth_helio + r_venus_helio) / 2.0
v_dep_transfer_v = vis_viva(MU_SUN, r_earth_helio, a_transfer_v)  # at Earth (aphelion of transfer)
v_arr_transfer_v = vis_viva(MU_SUN, r_venus_helio, a_transfer_v)  # at Venus (perihelion of transfer)
v_inf_dep_v = v_earth_circ - v_dep_transfer_v   # Earth departure must slow down (retrograde-ish relative burn)
v_inf_arr_v = v_arr_transfer_v - v_venus_circ
period_transfer_v = 2*math.pi*math.sqrt(a_transfer_v**3/MU_SUN)
tof_days_v = (period_transfer_v/2.0)/86400.0
v_hyp_leo_v = math.sqrt(v_inf_dep_v**2 + 2*MU_EARTH/r_leo)
dv_leo_venus_inject = v_hyp_leo_v - v_leo_circ
print(f"  Venus heliocentric circular v    = {v_venus_circ:.3f} km/s")
print(f"  Transfer v at Earth (aphelion)   = {v_dep_transfer_v:.3f} km/s")
print(f"  Transfer v at Venus (perihelion) = {v_arr_transfer_v:.3f} km/s")
print(f"  v_infinity at Earth departure    = {v_inf_dep_v:.3f} km/s (C3 = {v_inf_dep_v**2:.2f} km^2/s^2)")
print(f"  v_infinity at Venus arrival      = {v_inf_arr_v:.3f} km/s")
print(f"  Time of flight (half period)     = {tof_days_v:.1f} days")
print(f"  dv(LEO->Venus transfer injection)= {dv_leo_venus_inject:.3f} km/s")

print("\n=== 7) Synodic periods (Earth vs Mars, Venus, Jupiter) ===")
# T_syn = 1 / |1/T_earth - 1/T_other|,  T from Kepler III: T = 2*pi*sqrt(a^3/mu_sun)
T_earth = 2*math.pi*math.sqrt(r_earth_helio**3/MU_SUN)/86400.0  # days
def synodic(a_other_AU, name):
    r_other = a_other_AU*AU
    T_other = 2*math.pi*math.sqrt(r_other**3/MU_SUN)/86400.0
    T_syn = 1.0/abs(1.0/T_earth - 1.0/T_other)
    print(f"  {name:8s}: a={a_other_AU:.3f} AU, T_orbit={T_other:.1f} d, T_synodic={T_syn:.1f} d ({T_syn/365.25:.2f} yr)")
    return T_syn

print(f"  Earth orbital period = {T_earth:.2f} days")
synodic(1.524, "Mars")
synodic(0.723, "Venus")
synodic(5.203, "Jupiter")
