// T3.3: how expensive is StuffInSpace's worker loop? SGP4 for the bundled 15,151-object TLE.json (2015 epoch) and a 2026 propagation date.
import { readFileSync } from 'node:fs';
import * as satellite from 'satellite.js';
const data = JSON.parse(readFileSync('../repos/stuffinspace/web-root/TLE.json', 'utf8'));
const recs = data.map(d => satellite.twoline2satrec(d.TLE_LINE1, d.TLE_LINE2));
const types = {}; for (const d of data) types[d.OBJECT_TYPE] = (types[d.OBJECT_TYPE]||0)+1;
console.log('objects:', recs.length, 'by type:', JSON.stringify(types));
function run(date, label) {
  let bad = 0, t0 = performance.now();
  for (let k = 0; k < 5; k++) { bad = 0;
    for (const r of recs) { const pv = satellite.propagate(r, date); if (!pv || !pv.position || Number.isNaN(pv.position.x)) bad++; }
  }
  const ms = (performance.now() - t0) / 5;
  console.log(`${label}: ${ms.toFixed(1)} ms per full-catalog SGP4 pass (${(ms*1000/recs.length).toFixed(2)} us/object); failed/NaN: ${bad}`);
}
run(new Date('2015-05-15T00:00:00Z'), 'near epoch (2015-05-15)');
run(new Date('2026-09-01T00:00:00Z'), '11 yr past epoch (2026-09-01)');
// per-orbit line: 256 SGP4 calls for one object (orbit-calculation-worker NUM_SEGS=255)
const iss = recs.find((r,i)=>data[i].OBJECT_NAME==='ISS (ZARYA)');
let t0 = performance.now(); for (let k=0;k<100;k++){ for(let i=0;i<=255;i++){ satellite.sgp4(iss, i*0.36); } }
console.log(`one 256-point orbit line via SGP4: ${((performance.now()-t0)/100).toFixed(3)} ms`);
