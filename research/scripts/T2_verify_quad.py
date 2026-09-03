import math, os
import numpy as np
from sgp4.api import Satrec, jday, WGS72

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MU_WGS72 = 398600.8

def read_tle(path):
    lines = [l.rstrip("\n") for l in open(path) if l.strip()]
    return lines[-2], lines[-1]

def tle_epoch_jd(l1):
    yy = int(l1[18:20]); doy = float(l1[20:32])
    year = 2000 + yy if yy < 57 else 1900 + yy
    jd, fr = jday(year, 1, 1, 0, 0, 0.0)
    return jd + fr + doy - 1.0

def ric_frame(r, v):
    R = r / np.linalg.norm(r); C = np.cross(r, v); C /= np.linalg.norm(C); I = np.cross(C, R)
    return np.vstack([R, I, C])

l1, l2 = read_tle(os.path.join(ROOT, "iss_tle.txt"))
pub = Satrec.twoline2rv(l1, l2, WGS72); jd_pub = tle_epoch_jd(l1)
sup_path = os.path.join(ROOT, "celestrak_iss_sup_now.txt")
lines = [l.rstrip("\n") for l in open(sup_path) if l.strip()]
segs = [(lines[k + 1], lines[k + 2]) for k in range(0, len(lines) - 2, 3) if lines[k + 1].startswith("1 ")]
ages, errs = [], []
for s1, s2 in segs:
    ss = Satrec.twoline2rv(s1, s2, WGS72); jd_s = tle_epoch_jd(s1)
    for dt_h in np.arange(0, 6.0, 0.5):
        jd = jd_s + dt_h / 24.0
        e1, rp, vp = pub.sgp4(math.floor(jd), jd - math.floor(jd))
        e2, rs, vs = ss.sgp4(math.floor(jd), jd - math.floor(jd))
        if e1 or e2: continue
        rp, vp, rs, vs = map(np.array, (rp, vp, rs, vs))
        d = ric_frame(rs, vs) @ (rp - rs)
        ages.append(jd - jd_pub); errs.append(np.linalg.norm(d))
ages = np.array(ages); errs = np.array(errs)

for lim in (3,7,14):
    m = (ages > 0) & (ages < lim)
    q = np.polyfit(ages[m], errs[m], 2)
    lin = np.polyfit(ages[m], errs[m], 1)
    # R^2 for each
    def r2(coefs, x, y):
        p = np.poly1d(coefs)
        ss_res = np.sum((y - p(x))**2); ss_tot = np.sum((y - y.mean())**2)
        return 1 - ss_res/ss_tot
    print(f"0-{lim}d quad fit: {q[0]:.3f} t^2 + {q[1]:.3f} t + {q[2]:.3f}   R2={r2(q,ages[m],errs[m]):.4f}   (N={m.sum()})")
    print(f"0-{lim}d lin  fit: {lin[0]:.3f} t + {lin[1]:.3f}                R2={r2(lin,ages[m],errs[m]):.4f}")

# Also check the negative-age (pre-epoch) side, and full range
m = ages > 0
q = np.polyfit(ages[m], errs[m], 2)
print(f"Full positive-age quad fit (0-{ages[m].max():.1f}d): {q[0]:.3f} t^2 + {q[1]:.3f} t + {q[2]:.3f}")
