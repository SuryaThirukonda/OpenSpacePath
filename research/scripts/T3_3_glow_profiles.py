"""T3.3: compare point-sprite 'glow' alpha profiles used by the viewers, and KeepTrack's point-size law.
pc = distance from sprite centre in units of sprite radius (0 = centre, 1 = edge)."""
import re, numpy as np
src = open('../repos/keeptrack/src/settings/graphics-settings.ts', encoding='utf-8').read()
b1 = float(re.search(r"blurFactor1:\s*'?([\d.]+)", src).group(1)); b2 = float(re.search(r"blurFactor2:\s*'?([\d.]+)", src).group(1))
print(f"KeepTrack blurFactor1={b1} blurFactor2={b2}")
profiles = {
 "StuffInSpace dot (pow(r+0.1,3), r=1-pc)": lambda pc: min((1-pc+0.1)**3, 1.0),
 "ajmas dot2 (2r+0.4, r=0.48-pc)": lambda pc: max(min(2*(0.48-pc)+0.4, 1.0), 0.0),
 f"KeepTrack soft (2r+{b2}, r={b1}-pc)": lambda pc: max(min(2*(b1-pc)+b2, 1.0), 0.0),
 "spacekit star (1-2|pc/2|) == 1-pc": lambda pc: max(1-pc, 0.0),
}
pcs = np.linspace(0, 1, 2001)
print(f"{'profile':48s} " + " ".join(f"pc={p:.2f}" for p in (0,0.25,0.5,0.75,1.0)) + "   half-alpha radius   'hard core' (alpha>0.9) radius")
for name, f in profiles.items():
    vals = np.array([f(p) for p in pcs])
    half = pcs[np.argmax(vals <= 0.5)] if (vals <= 0.5).any() else float('nan')
    core = pcs[np.argmax(vals < 0.9)] if (vals < 0.9).any() else float('nan')
    print(f"{name:48s} " + " ".join(f"{f(p):7.3f}" for p in (0,0.25,0.5,0.75,1.0)) + f"   {half:6.3f}              {core:6.3f}")
print("\nKeepTrack point size: baseSize = (14000/depth_km)^2.1, clamped [minSize 5.5, maxSize 48] px; selected/searched = starSize 16 px")
for d in (2000, 5000, 8000, 14000, 20000, 40000, 100000):
    print(f"  depth {d:6d} km -> {min(max((14000.0/d)**2.1, 5.5), 48.0):6.2f} px")
print("\nStuffInSpace point size: clamp(320000/w, 7.5, 20) px  (w = clip-space w ~ eye depth in km)")
# ajmas TLE epoch
import datetime
yd = 25353.74613807; y = 2000 + int(yd//1000); doy = yd - (yd//1000)*1000
print(f"\najmas bundled TLE epoch {yd} -> {datetime.datetime(y,1,1) + datetime.timedelta(days=doy-1):%Y-%m-%d %H:%M} UTC ; days stale on 2026-09-01: {(datetime.datetime(2026,9,1) - (datetime.datetime(y,1,1) + datetime.timedelta(days=doy-1))).days}")
yd2 = 15133.47436204; y2 = 2000 + int(yd2//1000); doy2 = yd2 - (yd2//1000)*1000
print(f"jeyoder bundled TLE epoch {yd2} -> {datetime.datetime(y2,1,1) + datetime.timedelta(days=doy2-1):%Y-%m-%d} ; years stale: {(datetime.datetime(2026,9,1) - datetime.datetime(y2,1,1)).days/365.25:.1f}")
