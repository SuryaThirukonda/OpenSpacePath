"""T2.1 companion -- compare the TLE fields of iss_tle.txt against the OMM JSON
record CelesTrak returned for the same element set
(https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON-PRETTY,
fetched 2026-09-01).  Shows (a) OMM key names, (b) where the fixed-width TLE
loses precision relative to OMM, (c) TLE epoch resolution.
Run:  venv/Scripts/python.exe notes/T2_1_omm_compare.py
"""
import json, math, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from T2_1_parse_tle import parse, checksum

OMM = {  # pasted verbatim from the CelesTrak JSON-PRETTY response, 2026-09-01
    "OBJECT_NAME": "ISS (ZARYA)", "OBJECT_ID": "1998-067A",
    "EPOCH": "2026-09-01T11:57:51.489504", "MEAN_MOTION": 15.48958602,
    "ECCENTRICITY": 0.00050553, "INCLINATION": 51.6312, "RA_OF_ASC_NODE": 282.3953,
    "ARG_OF_PERICENTER": 96.474, "MEAN_ANOMALY": 263.6825, "EPHEMERIS_TYPE": 0,
    "CLASSIFICATION_TYPE": "U", "NORAD_CAT_ID": 25544, "ELEMENT_SET_NO": 999,
    "REV_AT_EPOCH": 58358, "BSTAR": 7.9223149e-5, "MEAN_MOTION_DOT": 3.91e-5,
    "MEAN_MOTION_DDOT": 0,
}
here = Path(__file__).resolve().parent
for fname in ('iss_tle.txt', 'notes/iss_tle_celestrak_latest.txt'):
    p = here.parent / fname
    name, l1, l2 = [l.rstrip('\n') for l in p.read_text().splitlines() if l.strip()]
    rows, e = parse(name, l1, l2)
    print('\n== %s' % fname)
    print(l1); print(l2)
    print('checksums: L1 stored %s computed %d, L2 stored %s computed %d' % (l1[68], checksum(l1), l2[68], checksum(l2)))
    omm_epoch = datetime.fromisoformat(OMM['EPOCH']).replace(tzinfo=timezone.utc)
    print('epoch TLE  : %s' % e['epoch'].isoformat())
    print('epoch OMM  : %s   diff = %.6f s' % (omm_epoch.isoformat(), (omm_epoch - e['epoch']).total_seconds()))
    pairs = [('ECCENTRICITY', e['ecc']), ('BSTAR', e['bstar']), ('MEAN_ANOMALY', e['ma']),
             ('MEAN_MOTION', e['n']), ('MEAN_MOTION_DOT', e['ndot2']), ('MEAN_MOTION_DDOT', e['nddot6']),
             ('INCLINATION', e['inc']), ('RA_OF_ASC_NODE', e['raan']), ('ARG_OF_PERICENTER', e['argp'])]
    for k, v in pairs:
        o = OMM[k]
        rel = abs(o - v) / abs(o) if o else 0.0
        print('  %-18s TLE=%-14r OMM=%-14r rel.diff=%.2e' % (k, v, o, rel))

print('\nTLE epoch resolution: 1e-8 day = %.3f ms;  ISS moves %.1f m in that time' % (1e-8 * 86400 * 1e3, 1e-8 * 86400 * 7660))
print('TLE BSTAR mantissa is 5 digits: 79223-4 vs OMM 7.9223149e-5 -> truncation %.2e (rel %.1e)' % (OMM['BSTAR'] - 7.9223e-5, (OMM['BSTAR'] - 7.9223e-5) / OMM['BSTAR']))
print('TLE eccentricity is 7 digits: 0.0005055 vs OMM 0.00050553 -> delta r_p ~ a*de = %.1f m' % (6798.4e3 * 3e-8))
print('Along-track from MEAN_ANOMALY rounding 1e-4 deg: %.1f m' % (math.radians(1e-4) * 6798.4e3))
