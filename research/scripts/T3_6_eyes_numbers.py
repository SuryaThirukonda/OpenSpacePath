"""T3.6 NASA Eyes teardown: numbers behind scale handling, time rates, and float precision.
Run: venv/Scripts/python.exe notes/T3_6_eyes_numbers.py
"""
import math
import numpy as np

AU = 149_597_870.7          # km (IAU 2012)
R_EARTH = 6378.1366         # km equatorial (IAU)
R_SUN = 695_700.0           # km
MU_SUN = 1.32712440018e11   # km^3/s^2
MU_EARTH = 398600.4418
DAY = 86400.0
YEAR = 365.25*DAY

print("=== 1. Why 'true scale' reads as empty blackness ===")
bodies = {"Mercury":0.387,"Venus":0.723,"Earth":1.0,"Mars":1.524,"Jupiter":5.203,"Saturn":9.537,"Uranus":19.19,"Neptune":30.07}
px_view = 1000.0  # px across the viewport for Neptune's orbit diameter
km_per_px = 2*bodies["Neptune"]*AU/px_view
print(f"viewport {px_view:.0f}px spanning Neptune's orbit diameter: {km_per_px:,.0f} km/px")
print(f"  Earth diameter = {2*R_EARTH/km_per_px:.2e} px ; Sun diameter = {2*R_SUN/km_per_px:.3f} px")
print(f"  Earth-Moon distance (384400 km) = {384400/km_per_px:.3f} px ; GEO radius 42164 km = {42164/km_per_px:.4f} px")
km_per_px_mars = 2*bodies["Mars"]*AU/px_view
print(f"viewport spanning Mars orbit: {km_per_px_mars:,.0f} km/px ; Earth diameter {2*R_EARTH/km_per_px_mars:.3f} px")
print("-> every viewer (Eyes, spacekit, Celestia) draws bodies as min-pixel-size sprites/labels; Eyes config carries per-entity"
      " 'extentsRadius'/'occlusionRadius' and 'scale' fields for exactly this.")

print("\n=== 2. Log-scale distance mapping (Phase B1 toggle) ===")
# r_vis = r0 * log(1 + r/r0)  (compresses ratios; keeps order; smooth at 0)
r0 = 0.05*AU
def logmap(r): return r0*math.log1p(r/r0)
for name,a in bodies.items():
    r=a*AU
    print(f"  {name:8s} true {a:6.2f} AU -> logmap {logmap(r)/AU:6.3f} AU  (compression {r/logmap(r):5.1f}x)")
print(f"  Neptune/Mercury radius ratio: true {30.07/0.387:.1f}x, log-mapped {logmap(30.07*AU)/logmap(0.387*AU):.1f}x")
print("  pitfall: a log map is NOT a similarity transform -> Lambert arcs must be sampled in true km and each sample mapped;"
      " never map the endpoints and draw a straight/keplerian arc in mapped space.")

print("\n=== 3. float32 precision at solar-system distances (why heliocentric Three.js scenes jitter) ===")
for name,a in [("LEO (7000 km from Earth)",7000/AU),("Earth",1.0),("Mars",1.524),("Jupiter",5.203),("Neptune",30.07)]:
    r=a*AU
    ulp=np.spacing(np.float32(r))
    print(f"  {name:26s} r={r:.3e} km  float32 ulp = {ulp:8.2f} km   float64 ulp = {np.spacing(np.float64(r)):.2e} km")
print("  rule: float32 has 24 significant bits -> relative step 2^-23 = %.2e ; at 1 AU that is ~%.1f km, bigger than the ISS (~0.1 km)."
      % (2**-23, AU*2**-23))
print("  fix used by Cesium (RTC/'relative to center' + high/low double emulation) and by Eyes/Pioneer (camera-relative/floating origin,"
      " positions kept in JS doubles, only camera-relative offsets uploaded as float32).")

print("\n=== 4. Time-rate ladder: how long a Mars transfer takes to watch ===")
r1,r2 = 1.0*AU, 1.524*AU
a_t=(r1+r2)/2
tof=math.pi*math.sqrt(a_t**3/MU_SUN)
syn=1/abs(1/YEAR-1/(2*math.pi*math.sqrt((1.524*AU)**3/MU_SUN)))
print(f"  Hohmann Earth->Mars ToF = {tof/DAY:.1f} d = {tof/DAY/30.4375:.2f} months ; Earth-Mars synodic period = {syn/DAY:.1f} d")
for label,rate in [("1 s/s (real time)",1),("1 min/s",60),("1 hr/s",3600),("1 day/s",DAY),("1 week/s",7*DAY),("1 month/s",30.4375*DAY),("1 yr/s",YEAR)]:
    print(f"  at {label:18s}: Mars transfer plays in {tof/rate:10.1f} s ; 1949-2049 (100 yr) plays in {100*YEAR/rate:12.0f} s ; ISS orbit (92.9 min) in {92.9*60/rate:9.3f} s")
print("  design rule: a rate ladder must span ~1e0..1e7 (real time to years/sec) -> use a log/rung slider (Eyes 'rate' param; satvis ClockDeck rungs), not a linear one.")

print("\n=== 5. Sampling density for a trajectory arc / trail ===")
# Eyes trail length 31536e4 s = 10 yr for planets/spacecraft (from app.js config)
print(f"  Eyes trail:length 31536e4 s = {31536e4/YEAR:.2f} yr ; 8.64e4 s = 1 day")
# how many samples to draw a 259-day arc with <1 px sag at 1000 px view of Mars orbit
n_pts=[64,128,256,512]
for n in n_pts:
    dtheta=math.pi/n   # half-ellipse transfer spans ~180 deg
    sag=a_t*(1-math.cos(dtheta/2))
    print(f"  {n:4d} segments over 180 deg transfer: chord sag = {sag:,.0f} km = {sag/km_per_px_mars:.2f} px (Mars-orbit view)")
print("  -> 256 samples of a Lambert arc is visually exact at solar-system zoom; resample adaptively when zoomed near a planet.")

print("\n=== 6. Interplanetary 'orb' points: what a Kepler-element sample buys ===")
# Eyes Dynamo 'orb' point type = orbital elements valid over an interval, propagated analytically in-browser.
# Cost per frame for N objects: one Kepler solve each (~5 Newton iterations) -> trivial for 30k asteroids.
N=30000; iters=6; flops=N*iters*20
print(f"  {N} asteroids x {iters} Newton iterations x ~20 flops = {flops/1e6:.1f} MFLOP/frame -> ~{flops/1e6*60:.0f} MFLOP/s at 60 fps (JS does ~1e3 MFLOP/s): fine on the main thread")
print("  -> 'elements + epoch' is a 7-number record per object: this is why Eyes on Asteroids can ship 30k+ orbits as a small download.")
