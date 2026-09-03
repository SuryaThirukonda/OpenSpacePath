"""
T2_4_time.py -- Time scales for satellite visualization (Rathinam project, Track 2, item T2.4)

Run:  <scratchpad>/venv/Scripts/python.exe notes/T2_4_time.py
Needs: sgp4 (python-sgp4), skyfield, numpy.  The ISS TLE is read from ../iss_tle.txt.
Companion: notes/node/T2_4_time_check.mjs runs the REAL satellite.js library in Node for the same instant
           (third independent GMST) and demonstrates the JavaScript Date pitfalls live.

What it does
  1. Julian date basics (JD, MJD, J2000, Unix epoch) with two independent JD routes.
  2. GMST for 2026-09-01 00:00:00 UTC by five routes:
       A. faithful port of satellite.js gstime() (Vallado IAU-1982 polynomial, UTC fed as UT1)
       B. python-sgp4's own sgp4.propagation.gstime (same lineage, separate code)
       C. Kelso's CelesTrak form: theta_g(0h UT) + omega_e * seconds-of-day
       D. IAU-2006 form: ERA(UT1) + precession polynomial in TT  -> this is what skyfield does (SOFA gmst06)
       E. skyfield Time.gmst (independent library, uses its own IERS UT1/leap tables)
  3. Effect of UT1-UTC, leap seconds, TT, local time, and 1 s of clock error on the ground track.
  4. Worked ISS example: TEME -> ECEF -> (lat, lon, alt) via the satellite.js recipe, compared
     against skyfield's ITRS/WGS84 answer (which adds polar motion + its own UT1).
  5. Known-answer check: Kelso's 1995-10-01 09:00 UTC example (2.524218 rad).
  6. TLE epoch parsing (day-of-year, year pivot) and minutes-since-epoch.
  7. ISS period and ground-track westward shift per orbit (time-convention dependent numbers).

Conventions used throughout
  - Angles in radians internally; degrees only for printing.
  - "GMST" = Greenwich MEAN sidereal time: the angle from the TEME/ECI x-axis (mean equinox of date)
    eastward to the Greenwich meridian, 0..2pi.  ECEF = R3(GMST) * TEME.
  - Earth rotation rate omega_e = 7.2921150e-5 rad/s (IERS Conventions 2010, Table 1.1).
"""
import math, os, datetime as dt
import numpy as np
from sgp4.api import Satrec, jday, WGS72
from sgp4 import propagation as sgp4prop
from sgp4 import ext as sgp4ext
from skyfield.api import load, EarthSatellite, wgs84
from skyfield.framelib import itrs

TWO_PI = 2.0 * math.pi
DEG2RAD = math.pi / 180.0
RAD2DEG = 180.0 / math.pi
ARCSEC2RAD = math.pi / (180.0 * 3600.0)
R_E = 6378.137            # km, WGS-84 equatorial radius
OMEGA_E = 7.2921150e-5    # rad/s, IERS 2010 nominal mean Earth rotation rate
TAI_UTC = 37.0            # s, since 2017-01-01 (IERS Bulletin C / USNO tai-utc.dat)
TT_TAI = 32.184           # s, by definition (IAU 1991)
DUT1_2026_09_01 = 0.0024259 # s, OBSERVED (flag I) in USNO finals.daily for MJD 61284 (fetched 2026-09-01); IERS Bulletin A No.035 had predicted 0.00228 s

HERE = os.path.dirname(os.path.abspath(__file__))
TLE_PATH = os.path.join(HERE, "..", "iss_tle.txt")


def hdr(s):
    print("\n" + "=" * 78 + "\n" + s + "\n" + "=" * 78)


# ----------------------------------------------------------------------------------------
# GMST implementations
# ----------------------------------------------------------------------------------------
def gstime_satellitejs(jdut1: float) -> float:
    """Line-for-line port of satellite.js src/propagation/gstime.ts (Vallado 2004 eq 3-45, IAU 1982).
    Input: Julian date in UT1 (satellite.js/satvis feed it a UTC-derived JD). Output: rad in [0, 2pi)."""
    tut1 = (jdut1 - 2451545.0) / 36525.0
    temp = (-6.2e-6 * tut1 ** 3 + 0.093104 * tut1 ** 2
            + (876600.0 * 3600.0 + 8640184.812866) * tut1 + 67310.54841)   # seconds of time
    temp = (temp * DEG2RAD / 240.0) % TWO_PI      # 360 deg / 86400 s = 1/240 deg per second
    if temp < 0.0:
        temp += TWO_PI
    return temp


def gmst_kelso(jd_ut1: float) -> float:
    """CelesTrak column 'Orbital Coordinate Systems, Part II' (Kelso): GMST at previous 0h UT
    from the IAU-1982 polynomial, then add omega_e * seconds since 0h."""
    jd0 = math.floor(jd_ut1 - 0.5) + 0.5           # JD of the preceding 0h UT (JDs start at noon)
    Tu = (jd0 - 2451545.0) / 36525.0
    theta0_sec = 24110.54841 + 8640184.812866 * Tu + 0.093104 * Tu ** 2 - 6.2e-6 * Tu ** 3
    dtau = (jd_ut1 - jd0) * 86400.0
    return (theta0_sec * TWO_PI / 86400.0 + 7.29211510e-5 * dtau) % TWO_PI


def era_iau2000(jd_ut1: float) -> float:
    """Earth Rotation Angle, IAU 2000 (Capitaine et al.): ERA = 2pi (0.7790572732640 + 1.00273781191135448 Tu)."""
    Tu = jd_ut1 - 2451545.0
    return TWO_PI * ((0.7790572732640 + 1.00273781191135448 * Tu) % 1.0)


def gmst_iau2006(jd_ut1: float, jd_tt: float) -> float:
    """IERS Conventions 2010 eq. 5.32 / SOFA gmst06: GMST = ERA(UT1) + polynomial in TT centuries (arcsec)."""
    t = (jd_tt - 2451545.0) / 36525.0
    poly_arcsec = (0.014506 + 4612.156534 * t + 1.3915817 * t ** 2
                   - 0.00000044 * t ** 3 - 0.000029956 * t ** 4 - 0.0000000368 * t ** 5)
    return (era_iau2000(jd_ut1) + poly_arcsec * ARCSEC2RAD) % TWO_PI


# ----------------------------------------------------------------------------------------
# Frame helpers (ports of satellite.js transforms.ts)
# ----------------------------------------------------------------------------------------
def eci_to_ecf(r, gmst):
    x, y, z = r
    c, s = math.cos(gmst), math.sin(gmst)
    return np.array([x * c + y * s, -x * s + y * c, z])


def eci_to_geodetic(r, gmst):
    """Port of satellite.js eciToGeodetic (Kelso column v02n03 iteration). Returns (lon rad, lat rad, h km)."""
    a, b = 6378.137, 6356.7523142
    x, y, z = r
    R = math.hypot(x, y)
    f = (a - b) / a
    e2 = 2 * f - f * f
    lon = ((math.atan2(y, x) - gmst + math.pi) % TWO_PI + TWO_PI) % TWO_PI - math.pi
    lat = math.atan2(z, R)
    C = 0.0
    for _ in range(20):
        C = 1.0 / math.sqrt(1 - e2 * math.sin(lat) ** 2)
        lat = math.atan2(z + a * C * e2 * math.sin(lat), R)
    h = R / math.cos(lat) - a * C
    return lon, lat, h


def wrap_pi(x):
    return (x + math.pi) % TWO_PI - math.pi


def hms(rad):
    h = rad * RAD2DEG / 15.0
    m = (h % 1) * 60
    s = (m % 1) * 60
    return f"{int(h):02d}h {int(m):02d}m {s:06.3f}s"


# ----------------------------------------------------------------------------------------
def main():
    hdr("1. Julian date basics")
    jd_i, fr = jday(2026, 9, 1, 0, 0, 0)               # python-sgp4 (Vallado's jday, split for precision)
    jd_utc = jd_i + fr
    jd_ext = sgp4ext.jday(2026, 9, 1, 0, 0, 0)           # single-float variant
    unix = dt.datetime(2026, 9, 1, tzinfo=dt.timezone.utc).timestamp()
    jd_unix = 2440587.5 + unix / 86400.0                 # independent route: JD(Unix epoch)=2440587.5
    print(f"JD(2026-09-01 00:00:00 UTC) via sgp4.jday      = {jd_i} + {fr} = {jd_utc:.6f}")
    print(f"JD via sgp4.ext.jday (single float)            = {jd_ext:.6f}")
    print(f"JD via Unix seconds/86400 + 2440587.5          = {jd_unix:.6f}   (diff {abs(jd_unix-jd_utc)*86400:.3e} s)")
    print(f"MJD = JD - 2400000.5                           = {jd_utc - 2400000.5:.5f}   (IERS Bulletin A lists this day as MJD 61284)")
    print(f"J2000.0 = JD 2451545.0 = 2000-01-01 12:00 TT;  days since J2000 = {jd_utc-2451545.0:.5f};  Julian centuries T = {(jd_utc-2451545.0)/36525:.9f}")
    print(f"Sanity: JD(2000-01-01 12:00) = {sgp4ext.jday(2000,1,1,12,0,0)}  JD(1970-01-01 00:00) = {sgp4ext.jday(1970,1,1,0,0,0)}")

    hdr("2. Time-scale ladder at 2026-09-01 00:00:00 UTC")
    dut1 = DUT1_2026_09_01
    jd_ut1 = jd_utc + dut1 / 86400.0
    jd_tai = jd_utc + TAI_UTC / 86400.0
    jd_tt = jd_tai + TT_TAI / 86400.0
    print(f"UTC : JD {jd_utc:.9f}   (civil time; TLE epochs and JS Date live here)")
    print(f"UT1 : JD {jd_ut1:.9f}   = UTC + DUT1, DUT1 = {dut1:+.5f} s (IERS Bulletin A prediction)")
    print(f"TAI : JD {jd_tai:.9f}   = UTC + {TAI_UTC:.0f} s (37 leap-second offset since 2017-01-01; Cesium JulianDate stores THIS)")
    print(f"TT  : JD {jd_tt:.9f}   = TAI + 32.184 s = UTC + {TAI_UTC+TT_TAI:.3f} s (ephemerides, JPL/Horizons, skyfield internals)")
    print(f"Delta T = TT - UT1 = {TAI_UTC + TT_TAI - dut1:.5f} s")

    hdr("3. GMST for 2026-09-01 00:00:00 UTC -- five routes")
    gA = gstime_satellitejs(jd_utc)      # what satvis actually computes (UTC in place of UT1)
    gA1 = gstime_satellitejs(jd_ut1)     # same formula with true UT1
    gB = sgp4prop.gstime(jd_utc)
    gC = gmst_kelso(jd_utc)
    gD = gmst_iau2006(jd_ut1, jd_tt)
    ts = load.timescale()                # skyfield builtin IERS tables
    t = ts.utc(2026, 9, 1, 0, 0, 0)
    gE = (t.gmst * 15.0 * DEG2RAD) % TWO_PI
    t_ut1 = ts.ut1_jd(jd_ut1)            # skyfield Time built from the UT1 we trust (Bulletin A / finals.daily)
    gE2 = (t_ut1.gmst * 15.0 * DEG2RAD) % TWO_PI
    print(f"skyfield internals: t.dut1 = {t.dut1:+.6f} s   t.delta_t = {t.delta_t:.5f} s   t.tai = {t.tai:.9f}   t.tt = {t.tt:.9f}")
    print(f"  (skyfield's BUILTIN table vs this week's Bulletin A DUT1 {dut1:+.5f} s: difference {abs(t.dut1-dut1)*1e3:.1f} ms"
          f" -> {abs(t.dut1-dut1)*R_E*OMEGA_E*1000:.1f} m at the equator; builtin IERS predictions go stale)")
    rows = [("A satellite.js gstime port, UTC as UT1", gA),
            ("A2 same formula, with true UT1", gA1),
            ("B python-sgp4 sgp4.propagation.gstime", gB),
            ("C Kelso 0h-polynomial + omega_e*dtau", gC),
            ("D IAU-2006 ERA(UT1)+precession(TT)", gD),
            ("E skyfield Time.gmst, ts.utc (builtin DUT1)", gE),
            ("E2 skyfield Time.gmst, ts.ut1_jd (Bulletin A DUT1)", gE2)]
    for name, g in rows:
        print(f"  {name:42s} = {g:.9f} rad = {g*RAD2DEG:12.7f} deg = {hms(g)}")
    print("  differences vs route A, in arcsec and in metres at the equator (R_E * dtheta):")
    for name, g in rows[1:]:
        d = wrap_pi(g - gA)
        print(f"    {name:42s} {d/ARCSEC2RAD:+9.4f} arcsec   {d*R_E*1000:+9.3f} m")
    print(f"  GMST - ERA = precession-in-RA accumulated since J2000 = {wrap_pi(gD-era_iau2000(jd_ut1))/ARCSEC2RAD:.3f} arcsec "
          f"({wrap_pi(gD-era_iau2000(jd_ut1))*RAD2DEG:.4f} deg)  -- why ERA alone is NOT GMST")
    print("  NOTE: Node run of the real satellite.js 7.1.0 (notes/node/T2_4_time_check.mjs) gave 5.937141842 rad = 340.1731699 deg")

    hdr("4. What one second of time error does to a ground track")
    sidereal_day = TWO_PI / OMEGA_E
    v_eq = R_E * OMEGA_E
    mm = int((sidereal_day - 82800) // 60)
    print(f"omega_e = {OMEGA_E:.7e} rad/s -> sidereal day = 2pi/omega_e = {sidereal_day:.4f} s = 23h {mm}m {sidereal_day-82800-60*mm:.4f}s")
    print(f"Earth rotation = 360 deg / {sidereal_day:.1f} s = {360/sidereal_day:.7f} deg/s = {360/sidereal_day*3600:.4f} arcsec/s")
    print(f"Equatorial surface speed = R_E * omega_e = {v_eq:.5f} km/s  -> 1 s of GMST/clock error shifts the ground track {v_eq*1000:.1f} m at the equator")
    for lat in (0.0, 30.6, 51.6, 60.0):
        print(f"   at latitude {lat:4.1f} deg: {v_eq*math.cos(lat*DEG2RAD)*1000:7.1f} m per second of error (x cos(lat))")
    print("Ground-track error from using the WRONG time scale for GMST (error = offset * 0.4651 km at the equator):")
    cases = [("ignore UT1-UTC today (DUT1 = +0.00243 s, finals.daily MJD 61284)", dut1),
             ("ignore UT1-UTC, worst allowed (0.9 s)", 0.9),
             ("use TAI instead of UTC (37 s, e.g. raw Cesium JulianDate.dayNumber/secondsOfDay)", TAI_UTC),
             ("use TT instead of UTC (69.184 s)", TAI_UTC + TT_TAI),
             ("use local time CDT (UTC-5 h) instead of UTC", 5 * 3600.0),
             ("use local time CST (UTC-6 h) instead of UTC", 6 * 3600.0),
             ("JS Date millisecond rounding (0.0005 s)", 0.0005)]
    for name, secs in cases:
        print(f"   {name:75s} {secs:10.5f} s -> {v_eq*secs:12.4f} km = {360/sidereal_day*secs:10.5f} deg of longitude")
    print("Contrast: the SAME 1 s error applied to the propagation epoch moves a LEO satellite ALONG-TRACK by v ~ 7.66 km/s * 1 s = 7.7 km,")
    print("          so a clock error hurts ~16x more through SGP4's tsince than through GMST.")

    hdr("5. Worked ISS example: TEME -> ECEF -> lat/lon/alt, satellite.js recipe vs skyfield ITRS")
    with open(TLE_PATH) as f:
        lines = [l.strip() for l in f if l.strip()]
    name, l1, l2 = lines[0], lines[1], lines[2]
    sat = Satrec.twoline2rv(l1, l2, WGS72)
    epoch_jd = sat.jdsatepoch + sat.jdsatepochF
    epoch_dt = dt.datetime(2000, 1, 1, 12, tzinfo=dt.timezone.utc) + dt.timedelta(days=epoch_jd - 2451545.0)
    tle_epoch_field = l1[18:32]
    yy, doy = int(tle_epoch_field[:2]), float(tle_epoch_field[2:])
    year = yy + 2000 if yy < 57 else yy + 1900
    epoch_from_field = dt.datetime(year, 1, 1, tzinfo=dt.timezone.utc) + dt.timedelta(days=doy - 1.0)
    print(f"TLE line-1 epoch field '{tle_epoch_field}' -> year {year}, day-of-year {doy:.8f} (day 1 = Jan 1 00:00 UTC; year pivot 57)")
    print(f"   -> {epoch_from_field.isoformat()}  (hand parse)   vs sgp4 jdsatepoch+F = {epoch_jd:.8f} -> {epoch_dt.isoformat()}")
    tsince_min = (jd_utc - epoch_jd) * 1440.0
    print(f"tsince at 2026-09-01 00:00 UTC = (JD_now - JD_epoch)*1440 = {tsince_min:.4f} min  (SGP4's only time input; negative = before epoch, fine)")
    e, r_teme, v_teme = sat.sgp4(jd_i, fr)
    e2, r2, v2 = sat.sgp4_tsince(tsince_min)
    print(f"sgp4(jd,fr) error code {e}; r_TEME = {np.round(r_teme,3)} km  |r| = {np.linalg.norm(r_teme):.3f} km  |v| = {np.linalg.norm(v_teme):.4f} km/s")
    print(f"sgp4_tsince(min) gives identical result: max |dr| = {np.max(np.abs(np.array(r_teme)-np.array(r2)))*1e6:.3f} mm")
    print("   (Node satellite.js propagate at same instant: TEME x=3771.519123 y=2039.961187 z=5261.582187 km)")
    r_ecf_utc = eci_to_ecf(r_teme, gA)
    r_ecf_ut1 = eci_to_ecf(r_teme, gA1)
    lon, lat, h = eci_to_geodetic(r_teme, gA)
    print(f"satellite.js recipe (gstime(UTC) + eciToEcf/eciToGeodetic): ECEF = {np.round(r_ecf_utc,3)} km")
    print(f"   lat = {lat*RAD2DEG:.5f} deg  lon = {lon*RAD2DEG:.5f} deg  alt = {h:.3f} km   (Node satellite.js: 50.99871, 48.23516, 422.229)")
    print(f"   using true UT1 instead of UTC in gstime moves the ECEF point by {np.linalg.norm(r_ecf_ut1-r_ecf_utc)*1000:.3f} m")
    sky_sat = EarthSatellite(l1, l2, name, ts)
    geoc = sky_sat.at(t)
    r_itrs = geoc.frame_xyz(itrs).km
    sp = wgs84.geographic_position_of(geoc)
    print(f"skyfield (TEME -> ITRS with GMST82(UT1) + polar motion, WGS84 geodetic): ITRS = {np.round(r_itrs,3)} km")
    print(f"   lat = {sp.latitude.degrees:.5f} deg  lon = {sp.longitude.degrees:.5f} deg  alt = {sp.elevation.km:.3f} km")
    dpos = np.linalg.norm(r_itrs - r_ecf_utc) * 1000
    dlon_m = wrap_pi((sp.longitude.degrees - lon*RAD2DEG)*DEG2RAD) * R_E * math.cos(lat) * 1000
    print(f"   |ITRS - satellite.js ECEF| = {dpos:.3f} m ;  longitude difference = {(sp.longitude.degrees - lon*RAD2DEG)*3600:.4f} arcsec = {dlon_m:.3f} m on the ground")
    print(f"   => the satellite.js shortcut (no polar motion, UTC for UT1) is within tens of metres of an IERS-grade conversion: invisible at globe scale.")
    speed = np.linalg.norm(v_teme)
    print(f"1 s error in the epoch handed to SGP4 moves the ISS {speed:.3f} km along-track; 1 s error only in GMST moves the sub-point {v_eq*math.cos(lat)*1000:.1f} m east-west at lat {lat*RAD2DEG:.1f}")

    hdr("6. Known-answer check: Kelso, CelesTrak v02n02, 1995-10-01 09:00:00 UTC (JD 2449991.875)")
    g = gstime_satellitejs(2449991.875)
    print(f"gstime(2449991.875) = {g:.6f} rad = {g*RAD2DEG:.3f} deg ;  Kelso quotes 2.524218 rad = 144.627 deg  -> diff {abs(g-2.524218)*1e6:.1f} microrad")
    t95 = ts.utc(1995, 10, 1, 9)
    print(f"Kelso-form route: {gmst_kelso(2449991.875):.6f} rad ; skyfield ts.utc: {(t95.gmst*15*DEG2RAD):.6f} rad "
          f"(differs because skyfield uses the real 1995 DUT1 = {t95.dut1:+.4f} s -> {wrap_pi(t95.gmst*15*DEG2RAD-g)/ARCSEC2RAD:+.2f} arcsec; Kelso used UTC as UT1)")
    print(f"skyfield with UTC forced as UT1 (ts.ut1_jd(2449991.875)): {(ts.ut1_jd(2449991.875).gmst*15*DEG2RAD):.6f} rad")

    hdr("7. ISS orbit numbers that depend on time conventions")
    n_rev_day = float(l2[52:63])
    period_min = 1440.0 / n_rev_day
    a_km = np.linalg.norm(r_teme)   # near-circular: use |r| as a
    J2 = 1.08262668e-3
    raan_dot_deg_day = -1.5 * J2 * (R_E / a_km) ** 2 * math.cos(sat.inclo) * (n_rev_day * 360.0)   # J2 nodal regression, circular
    shift = (360.9856 - raan_dot_deg_day) * period_min / 1440.0
    print(f"mean motion {n_rev_day} rev/day -> period 1440/n = {period_min:.3f} min  (SOLAR minutes; TLE mean motion is per 86400 s day)")
    print(f"Earth turns {360.9856*period_min/1440:.3f} deg (sidereal rate 360.9856 deg/day) per orbit;  J2 nodal regression ~ {raan_dot_deg_day:.2f} deg/day (westward)")
    print(f"-> successive ground tracks shift ~{shift:.2f} deg WEST per orbit (crude 360/16 = 22.5 deg is what the master doc quotes)")


if __name__ == "__main__":
    main()
