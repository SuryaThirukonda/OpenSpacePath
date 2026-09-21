// Run from a folder with astronomy-engine installed: npm install astronomy-engine && node T8_ephemeris_checks.mjs
// Checks for the formula catalog: low-precision Sun and JPL approximate planetary elements vs astronomy-engine.
import * as A from 'astronomy-engine'
const DEG = Math.PI / 180, AU = 149597870.7
const wrap180 = (x) => ((x + 180) % 360 + 360) % 360 - 180
const sep = (a, b) => Math.acos(Math.min(1, (a[0]*b[0] + a[1]*b[1] + a[2]*b[2]) / (Math.hypot(...a) * Math.hypot(...b)))) / DEG

let worstSun = 0, worstR = 0
for (let d = 0; d < 5 * 365; d += 7) {
  const date = new Date(Date.UTC(2026, 0, 1) + d * 86400000)
  const jd = date.getTime() / 86400000 + 2440587.5, n = jd - 2451545.0
  const L = 280.460 + 0.9856474 * n, g = (357.528 + 0.9856003 * n) * DEG
  const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG
  const eps = (23.439 - 0.0000004 * n) * DEG
  const R = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g)
  const u = [Math.cos(lam), Math.cos(eps) * Math.sin(lam), Math.sin(eps) * Math.sin(lam)]   // equator of date
  const eq = A.Equator(A.Body.Sun, A.MakeTime(date), new A.Observer(0, 0, 0), true, true)  // of date, with aberration
  const ra = eq.ra * 15 * DEG, dec = eq.dec * DEG
  const v = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]
  worstSun = Math.max(worstSun, sep(u, v) * 60); worstR = Math.max(worstR, Math.abs(R - eq.dist) * AU)
}
console.log(`low-precision Sun vs astronomy-engine, weekly 2026-2030: worst direction ${worstSun.toFixed(2)} arcmin, worst distance ${worstR.toFixed(0)} km`)

// JPL "Approximate Positions of the Major Planets" (Standish), Table 1, valid 1800-2050: [value at J2000, rate per century]
const EL = {
  EMB:  { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], w: [102.93768193, 0.32327364], O: [0.0, 0.0] },
  Mars: { a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882], I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], w: [-23.94362959, 0.44441088], O: [49.55953891, -0.29257343] },
}
function helio(el, T) {
  const at = (k) => el[k][0] + el[k][1] * T
  const a = at('a'), e = at('e'), I = at('I') * DEG, L = at('L'), wbar = at('w'), O = at('O')
  const w = (wbar - O) * DEG, Om = O * DEG, M = wrap180(L - wbar) * DEG
  let E = M + e * Math.sin(M)
  for (let k = 0; k < 30; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I)
  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp
  const z = (sw * sI) * xp + (cw * sI) * yp
  const ep = 23.43928 * DEG
  return [x, Math.cos(ep) * y - Math.sin(ep) * z, Math.sin(ep) * y + Math.cos(ep) * z]
}
for (const [name, body] of [['EMB', A.Body.EMB], ['Mars', A.Body.Mars]]) {
  let worstAng = 0, worstKm = 0
  for (let d = 0; d < 5 * 365; d += 5) {
    const date = new Date(Date.UTC(2026, 0, 1) + d * 86400000)
    const T = (date.getTime() / 86400000 + 2440587.5 - 2451545.0) / 36525
    const p = helio(EL[name], T), q = A.HelioVector(body, A.MakeTime(date))
    const qv = [q.x, q.y, q.z]
    worstAng = Math.max(worstAng, sep(p, qv) * 60)
    worstKm = Math.max(worstKm, Math.hypot(p[0] - qv[0], p[1] - qv[1], p[2] - qv[2]) * AU)
  }
  console.log(`JPL approximate elements vs astronomy-engine, ${name}, 2026-2030: worst direction ${worstAng.toFixed(2)} arcmin, worst position ${(worstKm / 1e3).toFixed(0)} thousand km`)
}
