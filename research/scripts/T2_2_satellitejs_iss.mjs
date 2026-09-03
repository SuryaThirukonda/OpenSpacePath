// T2_2: propagate ISS TLE with satellite.js at 2026-09-01 12:00:00 UTC; print TEME + ECEF + geodetic
import * as satellite from 'satellite.js';
import { readFileSync } from 'node:fs';
const lines = readFileSync(process.argv[2] ?? '../iss_tle.txt','utf8').trim().split(/\r?\n/);
const [l1,l2] = lines.length===3 ? [lines[1],lines[2]] : [lines[0],lines[1]];
const rec = satellite.twoline2satrec(l1,l2);
const date = new Date(Date.UTC(2026,8,1,12,0,0,0));
const jd = satellite.jday(date);
const tsince = (jd - rec.jdsatepoch)*1440;
const pv = satellite.propagate(rec, date);
const gmst = satellite.gstime(date);
const ecf = satellite.eciToEcf(pv.position, gmst);
const vecf = satellite.eciToEcf(pv.velocity, gmst); // NOTE: rotation only, not true ECEF velocity (omits omega x r)
const gd = satellite.eciToGeodetic(pv.position, gmst);
const out = {
  version: JSON.parse(readFileSync(new URL('./node_modules/satellite.js/package.json', import.meta.url))).version,
  satnum: rec.satnum, method: rec.method, error: rec.error,
  jdsatepoch: rec.jdsatepoch, jd, tsince_min: tsince, gmst_rad: gmst,
  no_kozai_radpermin: rec.nokozai, no_unkozai_radpermin: rec.no, bstar: rec.bstar,
  teme_r_km: pv.position, teme_v_kms: pv.velocity,
  ecf_r_km: ecf, ecf_v_rotated_only: vecf,
  geodetic: { lat_deg: satellite.degreesLat(gd.latitude), lon_deg: satellite.degreesLong(gd.longitude), alt_km: gd.height },
  meanElements: pv.meanElements,
};
console.log(JSON.stringify(out, null, 2));
