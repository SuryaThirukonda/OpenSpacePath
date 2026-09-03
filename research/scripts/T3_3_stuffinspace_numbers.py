"""T3.3 worked numbers for the StuffInSpace teardown (jeyoder/StuffInSpace, web-root/scripts)."""
import numpy as np, json
mu = 398600.4418  # km^3/s^2 (WGS-84 value used by SGP4 wgs72 is 398600.8; check both)
# 1) sat-cruncher.js: semiMajorAxis = (8681663.653 / meanMotion_revday)^(2/3). Derive the constant.
for name, m in [("wgs84", 398600.4418), ("wgs72", 398600.8)]:
    K = np.sqrt(m) * 86400 / (2*np.pi)   # a^(3/2) = sqrt(mu)/n  with n in rad/s ; n = 2*pi*N/86400
    print(f"[1] constant sqrt(mu)*86400/(2pi) with {name}: {K:.3f}  (code uses 8681663.653)")
N_iss = 15.5
a = (8681663.653 / N_iss) ** (2/3)
print(f"    ISS-like n={N_iss} rev/day -> a = {a:.1f} km, alt(circular) = {a-6371:.1f} km, period = {1440/N_iss:.2f} min")
# 2) Dead reckoning: main thread does pos += vel*dt between worker updates every 500 ms.
for alt in (420, 20200, 35786):
    r = 6371 + alt; v = np.sqrt(mu / r); acc = v*v / r
    for dt in (0.5, 1.0):
        err = 0.5 * acc * dt**2 * 1000  # m
        print(f"[2] alt={alt:5d} km v={v:.3f} km/s a_c={acc*1000:.3f} m/s^2 dt={dt}s -> linear-extrapolation error = {err:.2f} m")
# 3) Position buffer re-upload per frame (gl.STREAM_DRAW) for the bundled catalog.
n = 15151
print(f"[3] {n} objects: pos buffer = {n*3*4/1024:.1f} KB/frame; at 60 fps = {n*3*4*60/1e6:.1f} MB/s; color buf (RGBA f32) = {n*4*4/1024:.1f} KB")
# 4) dot-vertex.glsl: gl_PointSize = clamp(320000/w, 7.5, 20) with w = clip-space w ~ eye-space depth (km).
for d in (6400+2000, 10000, 20000, 42664, 100000, 200000):
    ps = min(max(320000.0/d, 7.5), 20.0)
    print(f"[4] eye depth {d:6d} km -> point size {ps:.1f} px (clamped 7.5..20)")
# 5) dot-fragment.glsl alpha profile: r = 1-|pc| ; alpha = min((r+0.1)^3, 1)
for pc in (0.0, 0.25, 0.5, 0.75, 0.9, 1.0):
    r = 1 - pc; alpha = min((r+0.1)**3, 1.0)
    print(f"[5] sprite radius fraction {pc:.2f} -> alpha {alpha:.3f}")
# 6) Camera zoom mapping: dist = zoom^3*(200000-6400)+6400
for z in (0, 0.25, 0.5, 0.75, 1.0):
    print(f"[6] zoomLevel {z:.2f} -> camera distance {z**3*(200000-6400)+6400:.0f} km")
# 7) Equal-TIME orbit sampling (orbit-calculation-worker: period/NUM_SEGS, NUM_SEGS=255) vs equal true anomaly.
def kepler_E(M, e):
    E = M if e < 0.8 else np.pi
    for _ in range(50):
        E = E - (E - e*np.sin(E) - M)/(1 - e*np.cos(E))
    return E
def max_step_deg(e, segs=255):
    M = np.linspace(0, 2*np.pi, segs+1)
    E = np.array([kepler_E(m, e) for m in M])
    th = 2*np.arctan2(np.sqrt(1+e)*np.sin(E/2), np.sqrt(1-e)*np.cos(E/2))
    th = np.unwrap(th)
    d = np.degrees(np.diff(th))
    return d.max(), d.min()
for name, e in [("ISS", 0.0005), ("GPS", 0.01), ("GTO", 0.73), ("Molniya", 0.74)]:
    mx, mn = max_step_deg(e)
    print(f"[7] {name:8s} e={e}: 255 equal-time segments -> max true-anomaly step {mx:.2f} deg (at perigee), min {mn:.3f} deg (apogee); ratio {(1+e)**2/(1-e)**2:.1f}x  (uniform would be {360/255:.2f} deg)")
# 8) Wall-clock day-per-ms constant check
print(f"[8] 1/86400000 = {1/86400000:.6e} (code uses 1.15741e-8)")
# 9) Catalog size then vs now
print(f"[9] bundled TLE.json (epoch ~2015 day 133) has {n} objects; CelesTrak full catalog 2026 is ~3x larger (see T3.3 notes)")
