"""T3.6 part 2: decode numbers pulled out of eyes.nasa.gov/apps/solar-system/app.js
 - the time-rate ladder (_rates array), - trail lengths vs. orbital periods,
 - parent-switch epochs (ET seconds past J2000) -> calendar dates.
Run: venv/Scripts/python.exe notes/T3_6_eyes_numbers2.py
"""
import math, datetime as dt
DAY=86400.0; YEAR=365.25*DAY
print("=== A. Eyes time-rate ladder (seconds of sim time per real second), from TimeController._rates ===")
rates=[-94608e3,-31536e3,-6048e3,-604800,-86400,-36e3,-3600,-600,-60,-10,-1,0,1,10,60,600,3600,36e3,86400,604800,6048e3,31536e3,94608e3]
def label(r):
    r=abs(r)
    if r==0: return "paused"
    for unit,secs in [("yr",YEAR/365.25*365),("wk",7*DAY),("day",DAY),("hr",3600),("min",60),("s",1)]:
        if r>=secs and abs(r/secs-round(r/secs))<1e-9: return f"{round(r/secs):g} {unit}/s"
    return f"{r:g} s/s"
pos=[r for r in rates if r>0]
print("rungs:",len(rates),"(11 forward, 11 reverse, 1 pause) ; symmetric:",[ -r for r in rates if r<0][::-1]==pos)
for r in pos: print(f"  {r:>12.0f} s/s  = {label(r):>10s}  x{r:.0e}")
print("ratios between successive forward rungs:",[round(pos[i+1]/pos[i],2) for i in range(len(pos)-1)])
print(f"span: {pos[-1]/pos[0]:.2e} (about 8 decades) -> a log 'ladder' UI, arrow-key/step semantics; URL param rate=<int seconds/s>")
print(f"6048e3 s = {6048e3/DAY:.0f} days (10 weeks); 94608e3 s = {94608e3/YEAR*365.25/365:.2f} yr (3 yr of 365 d)")

print("\n=== B. trail:length values (s) vs. a plausible orbital period ===")
trails={"5933":"ISS-class LEO (1 rev)","5573":"LEO ~92.9 min (1 rev)","86151":"GEO (1 sidereal day = 86164 s)","2419200":"28 d (Moon-ish; sidereal 27.32 d)",
        "31536e3":"1 yr (365 d) - inner planets/near-Earth sc","31536e4":"10 yr - Pioneer 10/11","94608e3":"3 yr - New Horizons","94608e4":"30 yr - (Voyager-class)","1e7":"115.7 d"}
for k,v in trails.items():
    x=float(k); print(f"  {k:>8s} s = {x/60:10.1f} min = {x/DAY:9.3f} d = {x/YEAR:7.3f} yr  -> {v}")
# ISS period from the fresh TLE
tle=open(r"C:/Users/thiru/AppData/Local/Temp/claude/C--Users-thiru-tamu2-ecs-research-rathinam/5b6188bd-1182-4842-a6a3-cb49230254ab/scratchpad/iss_tle.txt").read().split("\n")
l2=[l for l in tle if l.startswith("2 ")][0]
n=float(l2[52:63]); P=DAY/n
print(f"  ISS TLE mean motion n={n:.8f} rev/day -> period {P:.1f} s = {P/60:.2f} min ; Eyes sc_iss trail 5573-5933 s = 0.94-1.06 rev (rule: trail = ~one period of the parent-relative orbit)")

print("\n=== C. Parent-switch epochs are ET seconds past J2000 (SPICE convention) ===")
J2000=dt.datetime(2000,1,1,12,0,0)   # TDB; ET-UTC ~ +64 s in 2006 .. +69 s now; ignored here (sub-minute)
def et2date(et): return (J2000+dt.timedelta(seconds=et)).strftime("%Y-%m-%d %H:%M")
nh=[(190972278.33046317,"earth"),(191055829,"sun"),(225619606,"jupiter"),(226100665,"sun"),(490130161,"134340_pluto"),(490167848,"sun"),(598753684,"486958_arrokoth"),(600203601,"sun")]
print("New Horizons parents[] (from app.js):")
prev=None
for et,body in nh:
    extra="" if prev is None else f"  (prev segment {(et-prev)/DAY:8.2f} d)"
    print(f"  ET {et:>16.3f} s -> {et2date(et)} UTC(approx)  parent -> {body:16s}{extra}"); prev=et
print("  check: New Horizons launched 2006-01-19 19:00 UTC; Jupiter closest approach 2007-02-28; Pluto flyby 2015-07-14 11:49 UTC; Arrokoth 2019-01-01 05:33 UTC")
print("  Eyes flips the reference body around each encounter (Earth->Sun->Jupiter->Sun->Pluto->Sun->Arrokoth->Sun): patched-conic 'segments' in the viewer, each with its own dynamo file, e.g. sc_new_horizons/jupiter/orb")
near=(-122129937,-121953528.049046)
print(f"NEAR Shoemaker fixed-orientation coverage: {et2date(near[0])} .. {et2date(near[1])} ({(near[1]-near[0])/DAY:.1f} d) -> negative ET = before J2000 (NEAR launched 1996-02-17)")
lim=(dt.datetime(1949,12,31)-J2000).total_seconds(), (dt.datetime(2049,12,31)-J2000).total_seconds()
print(f"Time limits 1949-12-31..2049-12-31 = ET {lim[0]:.4e} .. {lim[1]:.4e} s (|ET|<1.6e9 -> float64 exact to ~2e-7 s; float32 would be ~128 s!)")
import numpy as np
print(f"  float32 ulp at ET=1.6e9 s: {np.spacing(np.float32(1.6e9)):.0f} s ; float64 ulp: {np.spacing(np.float64(1.6e9)):.1e} s -> keep sim time in doubles, always")
