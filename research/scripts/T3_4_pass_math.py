"""T3.4: pass-prediction math from scratch (ECEF look angles, elevation mask, footprint),
cross-checked against skyfield. Ground station: College Station TX (TAMU), 30.6187N, -96.3365E, 100 m.
Run: venv/Scripts/python.exe notes/t3_4_pass_math.py
"""
import math, numpy as np, datetime as dt
from sgp4.api import Satrec, jday, WGS72
from skyfield.api import load, wgs84, EarthSatellite

RE = 6378.137; f = 1/298.257223563; e2 = f*(2-f)
lat, lon, h = 30.6187, -96.3365, 0.100  # deg, deg, km

def geodetic_to_ecef(lat_d, lon_d, h_km):
    la, lo = math.radians(lat_d), math.radians(lon_d)
    N = RE/math.sqrt(1-e2*math.sin(la)**2)
    return np.array([(N+h_km)*math.cos(la)*math.cos(lo), (N+h_km)*math.cos(la)*math.sin(lo), (N*(1-e2)+h_km)*math.sin(la)])

def look_angles(sat_ecef, obs_ecef, lat_d, lon_d):
    """ECEF -> SEZ (south, east, zenith) -> az/el/range. Vallado Alg. 27 / satellite.js ecfToLookAngles."""
    la, lo = math.radians(lat_d), math.radians(lon_d)
    rho = sat_ecef - obs_ecef
    S = math.sin(la)*math.cos(lo)*rho[0] + math.sin(la)*math.sin(lo)*rho[1] - math.cos(la)*rho[2]
    E = -math.sin(lo)*rho[0] + math.cos(lo)*rho[1]
    Z = math.cos(la)*math.cos(lo)*rho[0] + math.cos(la)*math.sin(lo)*rho[1] + math.sin(la)*rho[2]
    rng = math.sqrt(S*S+E*E+Z*Z)
    el = math.degrees(math.asin(Z/rng))
    az = math.degrees(math.atan2(E, -S)) % 360.0   # from north, clockwise (E positive)
    return az, el, rng

def gmst_rad(jd_ut1):
    T = (jd_ut1 - 2451545.0)/36525.0
    g = 67310.54841 + (876600*3600 + 8640184.812866)*T + 0.093104*T**2 - 6.2e-6*T**3  # seconds, Vallado 3-47
    return math.radians((g/240.0) % 360.0)

def teme_to_ecef(r_teme, jd):
    th = gmst_rad(jd)
    R = np.array([[math.cos(th), math.sin(th), 0], [-math.sin(th), math.cos(th), 0], [0, 0, 1]])
    return R @ r_teme  # polar motion ignored (sub-arcsecond -> ~10 m)

lines = open("iss_tle.txt").read().strip().splitlines()
l1, l2 = [l for l in lines if l.startswith("1 ")][0], [l for l in lines if l.startswith("2 ")][0]
sat = Satrec.twoline2rv(l1, l2, WGS72)
obs = geodetic_to_ecef(lat, lon, h)

# --- footprint radius from altitude (elevation mask eps) ---
def footprint(alt_km, eps_deg=0.0):
    # central angle lambda: cos(lambda+eps) = (RE/(RE+alt)) cos(eps)   (Curtis/SMAD)
    eps = math.radians(eps_deg)
    lam = math.acos(RE/(RE+alt_km)*math.cos(eps)) - eps
    return math.degrees(lam), RE*lam  # deg, km ground radius
for alt in (420, 550, 800, 20200, 35786):
    for eps in (0, 5, 10):
        lam, rk = footprint(alt, eps)
        print(f"footprint alt={alt:6.0f} km eps={eps:2d}deg: half-angle {lam:6.2f} deg, ground radius {rk:8.1f} km, diameter {2*rk:8.1f} km, area frac {(1-math.cos(math.radians(lam)))/2*100:5.2f}%")
# PREDICT's formula: fk = 12756.33*acos(xkmper/(xkmper+alt))  (diameter in km, xkmper=6378.135)
print("PREDICT fk (diameter) for 420 km:", 12756.33*math.acos(6378.135/(6378.135+420)))

# --- brute-force pass search, 10 s step, 5 deg mask, 3 days ---
t0 = dt.datetime(2026, 9, 1, 0, 0, 0, tzinfo=dt.timezone.utc)
step = 10.0; mask = 5.0
passes = []; cur = None; prev_el = -90
N = int(3*86400/step)
for k in range(N+1):
    t = t0 + dt.timedelta(seconds=k*step)
    jd, fr = jday(t.year, t.month, t.day, t.hour, t.minute, t.second + t.microsecond/1e6)
    e, r, v = sat.sgp4(jd, fr)
    if e != 0: continue
    r_ecef = teme_to_ecef(np.array(r), jd+fr)
    az, el, rng = look_angles(r_ecef, obs, lat, lon)
    if el >= mask and cur is None:
        cur = dict(aos=t, az_aos=az, max_el=el, t_max=t, az_max=az, rng_min=rng)
    if cur is not None:
        if el > cur["max_el"]: cur.update(max_el=el, t_max=t, az_max=az)
        cur["rng_min"] = min(cur["rng_min"], rng)
        if el < mask:
            cur.update(los=t, az_los=az); passes.append(cur); cur = None
print(f"\nMy pass table (mask {mask} deg, step {step} s), station {lat},{lon}:")
for p in passes:
    dur = (p["los"]-p["aos"]).total_seconds()/60
    print(f"AOS {p['aos']:%m-%d %H:%M:%S}Z az {p['az_aos']:5.1f} | MAX {p['t_max']:%H:%M:%S} el {p['max_el']:4.1f} az {p['az_max']:5.1f} | LOS {p['los']:%H:%M:%S} az {p['az_los']:5.1f} | {dur:4.1f} min | min range {p['rng_min']:6.0f} km")

# --- skyfield cross-check ---
ts = load.timescale()
sf = EarthSatellite(l1, l2, "ISS", ts)
station = wgs84.latlon(lat, lon, elevation_m=h*1000)
t_a, t_b = ts.from_datetime(t0), ts.from_datetime(t0+dt.timedelta(days=3))
times, events = sf.find_events(station, t_a, t_b, altitude_degrees=mask)
print("\nSkyfield find_events (same mask):")
names = ["AOS", "MAX", "LOS"]
for ti, ev in zip(times, events):
    alt, az, d = (sf - station).at(ti).altaz()
    print(f"{names[ev]} {ti.utc_strftime('%m-%d %H:%M:%S')} el {alt.degrees:5.1f} az {az.degrees:5.1f} range {d.km:6.0f} km")

# --- Doppler at max elevation of first pass: f_r = f_t (1 - rdot/c) ---
p = passes[0]
c = 299792.458
for t in (p["aos"], p["t_max"], p["los"]):
    jd, fr = jday(t.year, t.month, t.day, t.hour, t.minute, t.second)
    e, r, v = sat.sgp4(jd, fr)
    r_ecef = teme_to_ecef(np.array(r), jd+fr)
    th = gmst_rad(jd+fr); w = 7.2921150e-5
    R = np.array([[math.cos(th), math.sin(th), 0], [-math.sin(th), math.cos(th), 0], [0, 0, 1]])
    v_ecef = R @ np.array(v) - np.cross([0,0,w], r_ecef)
    rho = r_ecef - obs; rdot = np.dot(rho, v_ecef)/np.linalg.norm(rho)
    for fMHz in (145.800, 437.800):
        print(f"{t:%H:%M:%S} range-rate {rdot:+7.3f} km/s -> Doppler at {fMHz} MHz: {-rdot/c*fMHz*1e6:+8.0f} Hz")

# --- timing: how expensive is the brute force? ---
import time
tt = time.perf_counter()
for k in range(0, 4*1440):  # 4 days at 60 s like satvis
    t = t0 + dt.timedelta(seconds=k*60)
    jd, fr = jday(t.year, t.month, t.day, t.hour, t.minute, t.second)
    sat.sgp4(jd, fr)
print(f"\n4 days @ 60 s = {4*1440} SGP4 evals in {1000*(time.perf_counter()-tt):.1f} ms (python; satvis quotes ~8 ms in JS)")
