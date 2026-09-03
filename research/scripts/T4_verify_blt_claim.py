import math

mu_moon = 4902.800  # km^3/s^2
r_moon = 1737.4     # km

def vis_viva(mu, r, a):
    return math.sqrt(mu*(2.0/r - 1.0/a))

def loi_dv(rp, ra, v_inf):
    """Delta-v to insert from a hyperbolic lunar approach (v_inf at infinity,
    periapsis = rp) directly into an ellipse with periapsis rp, apoapsis ra."""
    a_target = (rp + ra) / 2.0
    v_target_p = vis_viva(mu_moon, rp, a_target)
    v_hyp_p = math.sqrt(v_inf**2 + 2*mu_moon/rp)   # vis-viva, hyperbola, energy = v_inf^2/2
    return v_hyp_p - v_target_p, v_hyp_p, v_target_p

print("=== Sanity check 1: direct insertion into 100 km circular LLO ===")
rp = r_moon + 100.0
for v_inf in [0.6, 0.8, 1.0, 1.2]:
    v_circ = math.sqrt(mu_moon/rp)
    v_hyp_p = math.sqrt(v_inf**2 + 2*mu_moon/rp)
    dv = v_hyp_p - v_circ
    print(f"  v_inf={v_inf:.2f} km/s -> v_hyp_peri={v_hyp_p*1000:.1f} m/s, v_circ={v_circ*1000:.1f} m/s, LOI dv={dv*1000:.1f} m/s")

print()
print("=== Sanity check 2: direct insertion into NRHO-like ellipse ===")
print("   (perilune ~3000 km altitude over pole, apolune ~70000 km, per Wikipedia NRHO envelope)")
rp = r_moon + 3000.0
ra = r_moon + 70000.0
for v_inf in [0.6, 0.8, 1.0, 1.2]:
    dv, v_hyp_p, v_target_p = loi_dv(rp, ra, v_inf)
    print(f"  v_inf={v_inf:.2f} km/s -> v_hyp_peri={v_hyp_p*1000:.1f} m/s, v_NRHO_peri={v_target_p*1000:.1f} m/s, LOI dv={dv*1000:.1f} m/s")

print()
print("=== Sanity check 3: what v_inf would make LOI dv ~ 52-150 m/s for the same NRHO ellipse? ===")
# solve for v_inf such that dv matches target, via simple bisection
def f(v_inf, target_dv_ms):
    dv, _, _ = loi_dv(rp, ra, v_inf)
    return dv*1000 - target_dv_ms

for target in [52, 110, 150]:
    lo, hi = 0.0, 2.0
    for _ in range(60):
        mid = (lo+hi)/2
        if f(mid, target) > 0:
            hi = mid
        else:
            lo = mid
    print(f"  target LOI dv={target} m/s -> requires v_inf approx {mid*1000:.1f} m/s (i.e. essentially near-zero excess velocity, a near-ballistic-capture geometry)")
