"""T2.1 -- Parse a NORAD two-line element set (TLE) field by field.

Usage:  python T2_1_parse_tle.py [path/to/tle.txt]
Default input: ../iss_tle.txt (3-line format: name, line 1, line 2).

Column ranges are the 1-indexed ranges from CelesTrak's tle-fmt page
(https://celestrak.org/NORAD/documentation/tle-fmt.php); Python slices
below are 0-indexed [start-1:end].  Unit conversions mirror
python-sgp4 sgp4/io.py (twoline2rv) and satellite.js src/io.ts
(twoline2satrec), which are both transcriptions of Vallado's sgp4io.cpp.
"""
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

MU_EARTH = 398600.4418        # km^3/s^2  (WGS-84 / EGM96 value used in the master doc)
MU_WGS72 = 398600.8           # km^3/s^2  (what SGP4/satellite.js/python-sgp4 use by default)
RE_WGS72 = 6378.135           # km        (SGP4 'earth radii' unit for BSTAR / semi-major axis)
XPDOTP = 1440.0 / (2.0 * math.pi)   # rev/day -> rad/min divisor = 229.1831180523293
MIN_PER_DAY = 1440.0


def checksum(line):
    """CelesTrak/Kelso rule: sum digits, '-' counts 1, everything else 0; mod 10.
    Computed over columns 1-68; column 69 holds the stored checksum."""
    return sum(int(c) if c.isdigit() else (1 if c == '-' else 0) for c in line[:68]) % 10


def implied_decimal_exponent(s):
    """Decode TLE 'modified exponential' fields such as ' 79223-4' -> 0.79223e-4.
    Format: [sign]NNNNN[sign]E  with an implied leading decimal point."""
    s = s.strip()
    mant, exp = s[:-2], s[-2:]
    sign = -1.0 if mant.startswith('-') else 1.0
    mant = mant.lstrip('+-')
    return sign * float('0.' + mant) * 10.0 ** int(exp)


def decode_epoch(yy, ddd):
    year = 2000 + yy if yy < 57 else 1900 + yy   # 57-99 -> 1957-1999, 00-56 -> 2000-2056
    # Day 1.0 == Jan 1 00:00 UTC  (so subtract 1 before adding to Jan 1)
    return year, datetime(year, 1, 1, tzinfo=timezone.utc) + timedelta(days=ddd - 1.0)


def parse(name, l1, l2):
    assert l1[0] == '1' and l2[0] == '2', 'line numbers'
    assert l1[2:7] == l2[2:7], 'catalog numbers on both lines must agree'
    rows = []  # (line, cols, raw, field, parsed, units/notes)

    def add(line, cols, raw, field, parsed, note):
        rows.append((line, cols, raw, field, parsed, note))

    add(0, '01-24', name.strip(), 'Satellite name', name.strip(), '24-char, 3LE only')

    # ---------------- line 1 ----------------
    add(1, '01', l1[0], 'Line number', 1, '')
    add(1, '03-07', l1[2:7], 'NORAD catalog number', l1[2:7], 'Alpha-5 letter allowed in col 3 for >99999')
    add(1, '08', l1[7], 'Classification', l1[7], 'U=unclassified (all public data)')
    add(1, '10-11', l1[9:11], 'Intl designator: launch year', l1[9:11], 'last 2 digits')
    add(1, '12-14', l1[11:14], 'Intl designator: launch number', l1[11:14], 'launch # of that year')
    add(1, '15-17', l1[14:17], 'Intl designator: piece', l1[14:17].strip(), 'A = primary payload')
    yy = int(l1[18:20]); ddd = float(l1[20:32])
    year, epoch_dt = decode_epoch(yy, ddd)
    add(1, '19-20', l1[18:20], 'Epoch year', year, 'pivot at 57')
    add(1, '21-32', l1[20:32], 'Epoch day-of-year (fractional)', ddd, 'UTC; day 1.0 = Jan 1 00:00')
    add(1, '(19-32)', l1[18:32], 'Epoch decoded', epoch_dt.strftime('%Y-%m-%d %H:%M:%S.%f UTC'), 'YYDDD.DDDDDDDD')
    ndot2 = float(l1[33:43])
    add(1, '34-43', l1[33:43], 'ndot/2 (first derivative of mean motion / 2)', ndot2, 'rev/day^2 (ndot = %.3e rev/day^2)' % (2 * ndot2))
    nddot6 = implied_decimal_exponent(l1[44:52])
    add(1, '45-52', l1[44:52], 'nddot/6 (second derivative / 6)', nddot6, 'rev/day^3, implied decimal + exponent')
    bstar = implied_decimal_exponent(l1[53:61])
    add(1, '54-61', l1[53:61], 'BSTAR drag term', bstar, '1/earth-radii (B* = rho0*Cd*A/(2m))')
    add(1, '63', l1[62], 'Ephemeris type', int(l1[62]), '0 = SGP4/SDP4 for all public sets')
    add(1, '65-68', l1[64:68], 'Element set number', int(l1[64:68]), 'increments per new set (wraps at 9999)')
    add(1, '69', l1[68], 'Checksum (stored)', int(l1[68]), 'computed = %d -> %s' % (checksum(l1), 'OK' if checksum(l1) == int(l1[68]) else 'BAD'))

    # ---------------- line 2 ----------------
    add(2, '01', l2[0], 'Line number', 2, '')
    add(2, '03-07', l2[2:7], 'NORAD catalog number', l2[2:7], 'must equal line 1')
    inc = float(l2[8:16]);   add(2, '09-16', l2[8:16], 'Inclination', inc, 'deg, 0..180')
    raan = float(l2[17:25]); add(2, '18-25', l2[17:25], 'RAAN', raan, 'deg, 0..360, TEME equinox')
    ecc = float('0.' + l2[26:33]); add(2, '27-33', l2[26:33], 'Eccentricity', ecc, 'implied leading decimal point')
    argp = float(l2[34:42]); add(2, '35-42', l2[34:42], 'Argument of perigee', argp, 'deg')
    ma = float(l2[43:51]);   add(2, '44-51', l2[43:51], 'Mean anomaly', ma, 'deg')
    n_revday = float(l2[52:63]); add(2, '53-63', l2[52:63], 'Mean motion', n_revday, 'rev/day (Kozai mean motion)')
    add(2, '64-68', l2[63:68], 'Revolution number at epoch', int(l2[63:68]), 'counts ascending-node crossings since launch')
    add(2, '69', l2[68], 'Checksum (stored)', int(l2[68]), 'computed = %d -> %s' % (checksum(l2), 'OK' if checksum(l2) == int(l2[68]) else 'BAD'))
    return rows, dict(year=year, epoch=epoch_dt, ndot2=ndot2, nddot6=nddot6, bstar=bstar,
                      inc=inc, raan=raan, ecc=ecc, argp=argp, ma=ma, n=n_revday)


def main():
    here = Path(__file__).resolve().parent
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else here.parent / 'iss_tle.txt'
    lines = [l.rstrip('\n') for l in path.read_text().splitlines() if l.strip()]
    name, l1, l2 = (lines if len(lines) == 3 else ['(no name)'] + lines)
    rows, e = parse(name, l1, l2)

    print('TLE source:', path)
    print(name); print(l1); print(l2); print()
    print('%-2s %-8s %-14s %-46s %-32s %s' % ('L', 'cols', 'raw', 'field', 'parsed', 'units / notes'))
    print('-' * 130)
    for line, cols, raw, field, parsed, note in rows:
        print('%-2s %-8s %-14s %-46s %-32s %s' % (line, cols, repr(raw), field, parsed, note))

    # ---------------- derived quantities ----------------
    n = e['n']
    period_min = MIN_PER_DAY / n
    n_rad_s = n * 2 * math.pi / 86400.0
    a_kep = (MU_EARTH / n_rad_s ** 2) ** (1.0 / 3.0)   # naive Kepler-III from Kozai mean motion
    rp = a_kep * (1 - e['ecc']); ra = a_kep * (1 + e['ecc'])
    print()
    print('Derived (naive, two-body):')
    print('  period      = 1440 / %.8f            = %.4f min  (%.2f s; expect ~92.9 min)' % (n, period_min, period_min * 60))
    print('  n           = %.8f rev/day * 2pi/86400 = %.9f rad/s' % (n, n_rad_s))
    print('  a (Kepler)  = (mu/n^2)^(1/3)              = %.3f km  (mu=%.4f)' % (a_kep, MU_EARTH))
    print('  perigee/apogee altitude (sphere R=%.3f) = %.1f / %.1f km' % (RE_WGS72, rp - RE_WGS72, ra - RE_WGS72))
    print('  BSTAR       = %.5e 1/ER;  ndot/2 = %.2e rev/day^2;  nddot/6 = %.1e rev/day^3' % (e['bstar'], e['ndot2'], e['nddot6']))
    print('  ndot/2 as a per-day period drift: dP/dt ~ -P * ndot/n = %.4f s/day' % (-period_min * 60 * (2 * e['ndot2']) / n))

    print()
    print('Unit conversions applied by satellite.js twoline2satrec / python-sgp4 twoline2rv:')
    print('  xpdotp = 1440/(2pi) = %.13f' % XPDOTP)
    print('  no      = %.8f rev/day / xpdotp          = %.10f rad/min' % (n, n / XPDOTP))
    print('  ndot    = %.8f      / (xpdotp*1440)     = %.6e rad/min^2  (parsed ndot/2 value, unused by SGP4)' % (e['ndot2'], e['ndot2'] / (XPDOTP * 1440)))
    print('  nddot   = %.1e      / (xpdotp*1440^2)   = %.6e rad/min^3  (unused by SGP4)' % (e['nddot6'], e['nddot6'] / (XPDOTP * 1440 * 1440)))
    print('  bstar   = %.5e (kept as-is, 1/ER)' % e['bstar'])
    print('  angles  * pi/180 -> radians;  epoch -> jdsatepoch (JD) and sgp4 epoch = JD - 2433281.5 days since 1949-12-31 00:00')
    print('  OMM path (python-sgp4 omm.py): MEAN_MOTION/720*pi, MEAN_MOTION_DOT/(1036800/pi), MEAN_MOTION_DDOT/(2985984000/(2pi)) -- same numbers')

    # ---------------- cross-check with python-sgp4 ----------------
    try:
        from sgp4.api import Satrec
        from sgp4.model import Satrec as PySatrec   # pure-Python twin exposes no_unkozai
        s = Satrec.twoline2rv(l1, l2)
        ps = PySatrec.twoline2rv(l1, l2)
        print()
        print('python-sgp4 %s cross-check (WGS72 constants):' % __import__('sgp4').__version__)
        print('  satrec.epochyr=%d epochdays=%.8f jdsatepoch=%.1f + %.8f' % (s.epochyr, s.epochdays, s.jdsatepoch, s.jdsatepochF))
        no_unkozai = getattr(s, 'no_unkozai', None) or ps.no_unkozai   # C++ Satrec hides it
        print('  satrec.no_kozai=%.10f rad/min  no_unkozai=%.10f rad/min' % (s.no_kozai, no_unkozai))
        print('  satrec.ndot=%.6e nddot=%.6e bstar=%.6e' % (s.ndot, s.nddot, s.bstar))
        print('  satrec.inclo=%.6f nodeo=%.6f ecco=%.7f argpo=%.6f mo=%.6f (rad)' % (s.inclo, s.nodeo, s.ecco, s.argpo, s.mo))
        print('  satrec.a (SGP4 un-Kozai semi-major axis) = %.6f ER = %.3f km;  alta=%.1f km altp=%.1f km' % (s.a, s.a * RE_WGS72, s.alta * RE_WGS72, s.altp * RE_WGS72))
        print('  elnum=%d revnum=%d classification=%s intldesg=%s ephtype=%s' % (s.elnum, s.revnum, s.classification, s.intldesg, s.ephtype))
        err, r, v = s.sgp4(s.jdsatepoch, s.jdsatepochF)
        rn = math.sqrt(sum(x * x for x in r)); vn = math.sqrt(sum(x * x for x in v))
        print('  sgp4 at epoch: err=%d  r_TEME=(%.3f, %.3f, %.3f) km |r|=%.3f km  |v|=%.4f km/s' % (err, r[0], r[1], r[2], rn, vn))
        P_unkozai = 2 * math.pi / no_unkozai
        print('  period from no_unkozai = %.4f min (vs %.4f min from TLE Kozai mean motion)' % (P_unkozai, period_min))
    except Exception as ex:  # pragma: no cover
        print('python-sgp4 cross-check skipped:', ex)


if __name__ == '__main__':
    main()
