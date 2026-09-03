"""T3.3 design numbers for a 'stylized instrument' satellite viewer.
Formulas shown inline; all units SI/km as labelled."""
import math
mu = 398600.4418  # km^3/s^2 (WGS-84 GM)
R = 6378.137      # km
# --- 1. Pixel scale vs camera distance (perspective, vertical FOV) -----------
def km_per_px(dist_km, fov_deg=45.0, h_px=1080):
    return 2*dist_km*math.tan(math.radians(fov_deg/2))/h_px
print("[1] km per pixel = 2*d*tan(fov/2)/H, fov=45 deg, H=1080 px")
for d in (8400, 10000, 20000, 42664, 100000):
    print(f"    camera dist {d:6d} km -> {km_per_px(d):7.2f} km/px")
# --- 2. Does 500 ms propagation + linear extrapolation show on screen? ------
v_iss = math.sqrt(mu/(R+420))
for dist in (8400, 20000):
    kpp = km_per_px(dist)
    print(f"[2] ISS v={v_iss:.3f} km/s: per 16.7 ms frame moves {v_iss/60*1000:.0f} m = {v_iss/60/kpp:.3f} px at d={dist} km;"
          f" 0.5 s extrapolation error 1.08 m = {1.08e-3/kpp:.2e} px (invisible)")
# --- 3. Orbit polyline: chord (sagitta) error for N equal-angle segments ----
def sagitta(r, N): return r*(1-math.cos(math.pi/N))
for N in (64, 128, 255, 512):
    s = sagitta(R+420, N)
    print(f"[3] circle r={R+420:.0f} km, N={N:3d} segs -> sagitta {s:7.3f} km = {s/km_per_px(10000):.2f} px at d=10000 km")
# equal-TIME sampling on GTO perigee (Stuff in Space 'ugly perigee' TODO): 13.1 deg step from earlier notes
rp = R+250; step = math.radians(13.14)
print(f"[3] GTO perigee r={rp:.0f} km, 13.14 deg step (equal-time, 255 segs) -> sagitta {rp*(1-math.cos(step/2)):.1f} km = {rp*(1-math.cos(step/2))/km_per_px(10000):.1f} px -> visible kink; sample by true anomaly instead")
# --- 4. Label density rule ---------------------------------------------------
W,H = 1920,1080; label_w, label_h = 90, 16   # px, 12px font, ~10 chars
cap = (W*H)/((label_w+12)*(label_h+6))       # non-overlapping upper bound with 12/6 px gutters
print(f"[4] label box {label_w}x{label_h} px + gutters -> hard cap {cap:.0f} labels on {W}x{H}; usable (<=15% coverage) ~{0.15*cap:.0f}; practical rule: <=40 labels, min separation 24 px, priority by (selected, searched, brightness)")
# --- 5. Alpha vs additive blending: sprites needed to saturate a channel -----
for a in (0.85, 0.5, 0.2):
    n_alpha = math.log(0.01)/math.log(1-a)      # normal blend: 1-(1-a)^n >= 0.99
    n_add = 1/a                                 # additive: n*a >= 1 (clips)
    print(f"[5] sprite alpha {a}: normal blending reaches 99% after {n_alpha:.1f} overlaps; additive clips to white after {n_add:.1f} overlaps")
# --- 6. Point-sprite fill cost -----------------------------------------------
for n,size in ((15151,20),(15151,7.5),(45000,7.5)):
    frag = n*size*size
    print(f"[6] {n} points at {size} px -> {frag/1e6:.1f} Mfragments/frame, {frag*60/1e9:.2f} Gfrag/s (fine for any GPU; bottleneck is CPU SGP4 + upload)")
# --- 7. Worker cadence budget ------------------------------------------------
us_per_obj = 1.64   # from T3_3_sgp4_bench near epoch
for n in (15151, 30000, 45000):
    ms = n*us_per_obj/1000
    print(f"[7] {n} objects SGP4 = {ms:.0f} ms/pass at {us_per_obj} us/obj -> every 500 ms uses {ms/500*100:.0f}% of one worker core; per-frame (16.7 ms) would need {math.ceil(ms/16.7)} cores")
