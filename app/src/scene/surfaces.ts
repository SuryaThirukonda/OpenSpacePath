/**
 * Procedural surfaces for the central bodies: no textures to download, resolution-independent,
 * and the same look on every device. Each body kind gets a GLSL colour function of the unit
 * direction in body-fixed coordinates (z is the pole, x the prime meridian), injected into
 * three.js's standard material so the scene lights, shading and tone mapping keep working.
 * The Moon, Mars, Jupiter and the Sun are drawn from the named features in
 * data/surfaceFeatures.ts, placed at their real coordinates and sizes; noise only supplies the
 * texture between and around them. Rim glows are a separate fresnel shell.
 *
 * The 3-D simplex noise is the public webgl-noise implementation by Ian McEwan (Ashima Arts)
 * and Stefan Gustavson, MIT licensed.
 */
import * as THREE from 'three'
import {
  featureDirection, JUPITER_BANDS, JUPITER_FLATTENING, JUPITER_GRS, JUPITER_OVAL_BA, JUPITER_RADIUS_KM, MARS_BRIGHT, MARS_DARK,
  MARS_NORTH_CAP, MARS_RADIUS_KM, MARS_SOUTH_CAP, MARS_VALLES_MARINERIS, MARS_VOLCANOES, MOON_DARK_CRATERS, MOON_MARIA,
  MOON_RADIUS_KM, MOON_RAY_CRATERS, MOON_SPA, SUN_RADIUS_KM, SUN_SPOTS,
} from '../data/surfaceFeatures'
import type { SurfaceKind } from '../types'

const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int k = 0; k < 5; k++) { s += a * snoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`

const lit = (x: number): string => x.toFixed(5)
const vec = (lat: number, lon: number): string => {
  const [x, y, z] = featureDirection(lat, lon)
  return `vec3(${lit(x)}, ${lit(y)}, ${lit(z)})`
}
/** Angular radius in radians of a feature `diameterKm` across on a body of radius `bodyKm`. */
const rad = (diameterKm: number, bodyKm: number): string => lit(diameterKm / 2 / bodyKm)
const rgb = (c: [number, number, number]): string => `vec3(${lit(c[0])}, ${lit(c[1])}, ${lit(c[2])})`

/** Shared helpers for placing named features on the sphere by angular distance. */
const FEATURES = /* glsl */ `
float angleTo(vec3 d, vec3 c) { return acos(clamp(dot(d, c), -1.0, 1.0)); }
// 1 inside an angular disc of radius r (rad) about c, soft over +-soft, its edge pushed by n (rad)
float disc(vec3 d, vec3 c, float r, float soft, float n) {
  return smoothstep(r + soft, r - soft, angleTo(d, c) + n);
}
// streaks radiating from c that fade over reach radians
float rays(vec3 d, vec3 c, float reach, float count, float seed) {
  float a = angleTo(d, c);
  vec3 e = normalize(cross(vec3(0.0, 0.0, 1.0), c) + vec3(1e-4, 0.0, 0.0));
  vec3 nn = cross(c, e);
  float az = atan(dot(d, nn), dot(d, e));
  float streak = pow(0.5 + 0.5 * sin(az * count + seed + 1.7 * sin(az * 3.0 + seed)), 6.0);
  return streak * exp(-a / reach);
}
// angular distance from d to the great-circle arc between unit vectors a and b
float arcDistance(vec3 d, vec3 a, vec3 b) {
  vec3 n = normalize(cross(a, b));
  vec3 p = normalize(d - n * dot(d, n));
  float span = angleTo(a, b);
  if (angleTo(p, a) + angleTo(p, b) <= span + 1e-3) return abs(asin(clamp(dot(d, n), -1.0, 1.0)));
  return min(angleTo(d, a), angleTo(d, b));
}
// distance, in units of the semi-axes a and b (degrees of arc), from an oval centred at (lon0, lat0)
float ovalDistance(float lon, float lat, float lon0, float lat0, float a, float b) {
  float dl = mod(lon - lon0 + 540.0, 360.0) - 180.0;
  return length(vec2(dl * cos(radians(lat0)) / a, (lat - lat0) / b));
}
`

const RAY_REACH: Record<string, [number, number]> = {
  // [how far the rays carry, in radians of arc; number of rays]
  Tycho: [0.26, 11], Copernicus: [0.12, 9], Kepler: [0.08, 8], Aristarchus: [0.07, 7],
  Proclus: [0.06, 6], Anaxagoras: [0.09, 8], 'Giordano Bruno': [0.08, 9], Jackson: [0.13, 9],
}

const MOON = /* glsl */ `
vec3 surfaceColor(vec3 d, out float water, out float cloud) {
  water = 0.0; cloud = 0.0;
  float coarse = fbm(d * 4.0 + 9.0);
  float fine = fbm(d * 22.0);
  float edge = 0.05 * fbm(d * 6.0 + 2.0) + 0.006 * fine;
  // maria: basalt plains at their real positions and sizes
  float mare = 0.0;
${MOON_MARIA.map((m) => `  mare = max(mare, ${lit(m.weight ?? 1)} * disc(d, ${vec(m.lat, m.lon)}, ${rad(m.diameter, MOON_RADIUS_KM)}, 0.03, edge));`).join('\n')}
  float spa = 0.3 * disc(d, ${vec(MOON_SPA.lat, MOON_SPA.lon)}, ${rad(MOON_SPA.diameter, MOON_RADIUS_KM)}, 0.2, edge);
  vec3 highland = vec3(0.58, 0.57, 0.54) * (0.9 + 0.16 * coarse + 0.07 * fine);
  vec3 basalt = vec3(0.21, 0.21, 0.22) * (0.92 + 0.14 * coarse + 0.05 * fine);
  vec3 c = mix(highland, highland * 0.8, spa);
  c = mix(c, basalt, clamp(mare, 0.0, 1.0));
  // the countless small craters, as bright rims; the younger maria carry fewer
  float rims = 0.09 * pow(1.0 - abs(snoise(d * 15.0 + 7.0)), 10.0) + 0.10 * pow(1.0 - abs(snoise(d * 34.0)), 9.0)
    + 0.06 * pow(1.0 - abs(snoise(d * 80.0 + 3.0)), 9.0);
  c += rims * (1.0 - 0.6 * mare);
  // large craters with lava-flooded floors
${MOON_DARK_CRATERS.map((k) => `  c = mix(c, basalt * 0.95, ${lit(k.weight ?? 1)} * disc(d, ${vec(k.lat, k.lon)}, ${rad(k.diameter, MOON_RADIUS_KM)}, 0.004, 0.0));`).join('\n')}
  // young craters: a bright ejecta blanket and a ray system
  float ejecta = 0.0;
${MOON_RAY_CRATERS.map((k, i) => {
    const [reach, count] = RAY_REACH[k.name] ?? [0.08, 8]
    const r = k.diameter / 2 / MOON_RADIUS_KM
    return `  ejecta += ${lit(k.weight ?? 1)} * (0.95 * rays(d, ${vec(k.lat, k.lon)}, ${lit(reach)}, ${lit(count)}, ${lit(1.3 + 2.1 * i)}) + disc(d, ${vec(k.lat, k.lon)}, ${lit(1.8 * r)}, ${lit(1.2 * r)}, 0.0));`
  }).join('\n')}
  c += vec3(0.30, 0.30, 0.29) * min(ejecta, 1.3);
  return c;
}`

const MARS = /* glsl */ `
vec3 surfaceColor(vec3 d, out float water, out float cloud) {
  water = 0.0; cloud = 0.0;
  float coarse = fbm(d * 3.0 + 1.0);
  float fine = fbm(d * 16.0 + 4.0);
  float edge = 0.07 * fbm(d * 5.0 + 6.0) + 0.02 * fine;
  // classical dark regions, where basalt shows through the dust
  float dark = 0.0;
${MARS_DARK.map((m) => `  dark = max(dark, ${lit(m.weight ?? 1)} * disc(d, ${vec(m.lat, m.lon)}, ${rad(m.diameter, MARS_RADIUS_KM)}, 0.06, edge));`).join('\n')}
  // bright dusty plains and frost-prone basins
  float bright = 0.0;
${MARS_BRIGHT.map((m) => `  bright = max(bright, ${lit(m.weight ?? 1)} * disc(d, ${vec(m.lat, m.lon)}, ${rad(m.diameter, MARS_RADIUS_KM)}, 0.12, edge));`).join('\n')}
  vec3 dust = vec3(0.78, 0.47, 0.27) * (0.93 + 0.10 * coarse + 0.05 * fine);
  vec3 basalt = vec3(0.36, 0.23, 0.17) * (0.95 + 0.10 * fine);
  vec3 c = mix(dust, vec3(0.90, 0.66, 0.46), 0.55 * bright);
  c = mix(c, basalt, 0.85 * dark * (1.0 - 0.5 * bright));
  // shield volcanoes, each with its summit caldera
${MARS_VOLCANOES.map((k) => {
    const r = k.diameter / 2 / MARS_RADIUS_KM
    return `  c = mix(c, vec3(0.63, 0.40, 0.26), ${lit(0.55 * (k.weight ?? 1))} * disc(d, ${vec(k.lat, k.lon)}, ${lit(r)}, 0.012, 0.0));
  c = mix(c, vec3(0.47, 0.29, 0.20), ${lit(k.weight ?? 1)} * disc(d, ${vec(k.lat, k.lon)}, ${lit(0.13 * r)}, 0.003, 0.0));`
  }).join('\n')}
  // Valles Marineris: one continuous canyon system, about 200 km wide, along its real course
  float canyon = 10.0;
${MARS_VALLES_MARINERIS.slice(1).map(([la, lo], i) => `  canyon = min(canyon, arcDistance(d, ${vec(MARS_VALLES_MARINERIS[i][0], MARS_VALLES_MARINERIS[i][1])}, ${vec(la, lo)}));`).join('\n')}
  c = mix(c, basalt * 0.8, 0.8 * smoothstep(0.040, 0.018, canyon + 0.25 * edge));
  // residual polar caps; dark dune seas ring the northern one
  float north = disc(d, ${vec(MARS_NORTH_CAP.lat, MARS_NORTH_CAP.lon)}, ${rad(MARS_NORTH_CAP.diameter, MARS_RADIUS_KM)}, 0.02, 0.6 * edge);
  float south = disc(d, ${vec(MARS_SOUTH_CAP.lat, MARS_SOUTH_CAP.lon)}, ${rad(MARS_SOUTH_CAP.diameter, MARS_RADIUS_KM)}, 0.015, 0.4 * edge);
  c = mix(c, basalt, 0.5 * disc(d, vec3(0.0, 0.0, 1.0), ${lit(MARS_NORTH_CAP.diameter / 2 / MARS_RADIUS_KM + 0.12)}, 0.05, edge) * (1.0 - north));
  return mix(c, vec3(0.95, 0.94, 0.92), max(north, south));
}`

const VENUS = /* glsl */ `
vec3 surfaceColor(vec3 d, out float water, out float cloud) {
  water = 0.0; cloud = 0.0;
  // the cloud deck in visible light: almost featureless pale yellow, faint zonal streaks, brighter polar hoods
  vec3 q = vec3(d.x, d.y, d.z * 6.0);
  float streak = fbm(q * 2.2 + 1.0);
  vec3 c = vec3(0.92, 0.87, 0.70) * (0.96 + 0.05 * streak);
  c = mix(c, vec3(0.86, 0.78, 0.58), 0.25 * smoothstep(-0.1, 0.5, fbm(q * 5.0 + 7.0)));
  return mix(c, vec3(0.96, 0.94, 0.86), 0.5 * smoothstep(0.80, 0.95, abs(d.z)));
}`

const DEG_KM_JUPITER = (JUPITER_RADIUS_KM * Math.PI) / 180
const jupiterOval = (o: { lat: number; lon: number; lengthKm: number; heightKm: number }): string =>
  `ovalDistance(lon, lat, ${lit(o.lon)}, ${lit(o.lat)}, ${lit(o.lengthKm / 2 / DEG_KM_JUPITER)}, ${lit(o.heightKm / 2 / DEG_KM_JUPITER)})`

const JUPITER = /* glsl */ `
vec3 surfaceColor(vec3 d, out float water, out float cloud) {
  water = 0.0; cloud = 0.0;
  // d is the direction on the unflattened sphere; the belts are tabulated in planetographic latitude
  float beta = asin(clamp(d.z, -0.9999, 0.9999));
  float lat = degrees(atan(tan(beta) / ${lit(1 - JUPITER_FLATTENING)}));
  float lon = degrees(atan(d.y, d.x));
  // zonal turbulence: noise stretched along longitude ruffles the belt edges by a degree or two
  vec3 zonal = vec3(d.x, d.y, d.z * 7.0);
  float L = lat + 1.3 * fbm(zonal * 5.0) + 0.6 * fbm(zonal * 14.0 + 3.0);
  vec3 c = ${rgb(JUPITER_BANDS[0].color)};
${JUPITER_BANDS.slice(1).map((band, i) => `  c = mix(c, ${rgb(band.color)}, smoothstep(${lit(JUPITER_BANDS[i].north - 0.9)}, ${lit(JUPITER_BANDS[i].north + 0.9)}, L));`).join('\n')}
  // streaks and darker barges drawn out along the winds
  c *= 0.93 + 0.10 * fbm(vec3(d.x, d.y, d.z * 22.0) * 6.0);
  c = mix(c, c * vec3(0.86, 0.80, 0.78), 0.5 * smoothstep(0.2, 0.7, fbm(vec3(d.x, d.y, d.z * 10.0) * 11.0 + 5.0)));
  // the Great Red Spot in its pale hollow, and Oval BA
  float swirl = 0.06 * fbm(d * 24.0);
  float grs = ${jupiterOval(JUPITER_GRS)};
  c = mix(c, vec3(0.90, 0.86, 0.76), 0.6 * smoothstep(1.7, 1.15, grs));
  c = mix(c, vec3(0.78, 0.40, 0.28), 0.92 * smoothstep(1.0, 0.72, grs + swirl));
  c = mix(c, vec3(0.66, 0.30, 0.22), 0.5 * smoothstep(0.45, 0.2, grs + swirl));
  float ba = ${jupiterOval(JUPITER_OVAL_BA)};
  c = mix(c, vec3(0.86, 0.66, 0.52), 0.8 * smoothstep(1.0, 0.7, ba + swirl));
  return c;
}`

const SUN = /* glsl */ `
vec3 surfaceColor(vec3 d, out float water, out float cloud) {
  water = 0.0; cloud = 0.0;
  // granulation (bright cells, dark lanes) under a coarser supergranular mottling
  float cells = 1.0 - pow(1.0 - abs(snoise(d * 90.0)), 3.0);
  vec3 c = vec3(1.0, 0.86, 0.60) * (0.90 + 0.10 * cells + 0.05 * fbm(d * 14.0));
  // sunspots: a dark umbra inside a penumbra, with bright faculae around the group
  float umbra = 0.0, penumbra = 0.0, faculae = 0.0;
  float edge = 0.004 * fbm(d * 60.0);
${SUN_SPOTS.map((k) => {
    const r = k.diameter / 2 / SUN_RADIUS_KM
    return `  umbra = max(umbra, disc(d, ${vec(k.lat, k.lon)}, ${lit(0.45 * r)}, ${lit(0.12 * r)}, edge));
  penumbra = max(penumbra, disc(d, ${vec(k.lat, k.lon)}, ${lit(r)}, ${lit(0.15 * r)}, edge));
  faculae = max(faculae, disc(d, ${vec(k.lat, k.lon)}, ${lit(3.2 * r)}, ${lit(1.5 * r)}, 0.0));`
  }).join('\n')}
  c *= 1.0 + 0.10 * faculae * (0.5 + 0.5 * fbm(d * 40.0));
  c = mix(c, vec3(0.62, 0.42, 0.22), penumbra);
  return mix(c, vec3(0.16, 0.08, 0.04), umbra);
}`

/** Colour of the surface at unit direction d (body-fixed, z = pole). Sets `water` and `cloud` for Earth. */
const SURFACES: Record<SurfaceKind, string> = {
  earth: /* glsl */ `
vec3 surfaceColor(vec3 d, out float water, out float cloud) {
  float h = fbm(d * 2.1 + 3.7) + 0.35 * fbm(d * 6.0 + 1.0);
  float lat = abs(d.z);
  water = smoothstep(0.02, -0.02, h);
  vec3 ocean = mix(vec3(0.05, 0.28, 0.45), vec3(0.02, 0.09, 0.28), smoothstep(-0.02, -0.25, h));
  vec3 land = mix(vec3(0.16, 0.36, 0.13), vec3(0.45, 0.38, 0.24), smoothstep(0.05, 0.35, h));
  float arid = smoothstep(0.0, 0.5, fbm(d * 3.0 + 11.0)) * (1.0 - smoothstep(0.35, 0.75, lat));
  land = mix(land, vec3(0.62, 0.52, 0.32), arid);
  float ice = smoothstep(0.78, 0.9, lat + 0.06 * fbm(d * 5.0));
  vec3 c = mix(land, ocean, water);
  c = mix(c, vec3(0.92, 0.95, 0.97), ice);
  cloud = smoothstep(0.25, 0.6, fbm(d * 3.3 + vec3(0.0, 0.0, 9.0)) + 0.15 * fbm(d * 9.0));
  water *= 1.0 - ice;
  return mix(c, vec3(0.95), cloud * 0.85);
}`,
  moon: MOON,
  mars: MARS,
  venus: VENUS,
  gas: JUPITER,
  star: SUN,
}

/** A standard material whose colour comes from the procedural surface for `kind`. */
export function makeSurfaceMaterial(kind: SurfaceKind, fallback: string): THREE.MeshStandardMaterial {
  const star = kind === 'star'
  const mat = new THREE.MeshStandardMaterial({
    color: star ? 0x000000 : new THREE.Color(fallback),
    roughness: 0.9,
    metalness: 0.0,
    emissive: star ? 0xffffff : 0x000000,
    emissiveIntensity: star ? 1.0 : 0.0,
  })
  mat.customProgramCacheKey = () => `orbit-lab-surface-2-${kind}`
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfDir = normalize(position);')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSurfDir;\n${NOISE}\n${FEATURES}\n${SURFACES[kind]}`)
      .replace(
        '#include <color_fragment>',
        star
          ? '#include <color_fragment>\nfloat surfWater = 0.0; float surfCloud = 0.0;'
          : '#include <color_fragment>\nfloat surfWater, surfCloud;\ndiffuseColor.rgb = surfaceColor(normalize(vSurfDir), surfWater, surfCloud);',
      )
      // open water is glossier than land, so the Sun glints off the oceans
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.35, surfWater * (1.0 - surfCloud));')
      .replace(
        '#include <emissivemap_fragment>',
        star
          ? `#include <emissivemap_fragment>
float surfW, surfC;
vec3 photosphere = surfaceColor(normalize(vSurfDir), surfW, surfC);
// limb darkening, I = 1 - u (1 - mu) with u = 0.6 in visible light; the limb is also redder
float mu = max(dot(normal, normalize(vViewPosition)), 0.0);
totalEmissiveRadiance = 1.2 * photosphere * (1.0 - 0.6 * (1.0 - mu)) * mix(vec3(1.0, 0.72, 0.45), vec3(1.0), smoothstep(0.0, 0.7, mu));`
          : '#include <emissivemap_fragment>',
      )
  }
  return mat
}

/**
 * A fresnel shell for atmosphere or corona glow. `halo` draws the outside of a larger sphere so
 * the glow extends beyond the disc (used for the Sun); otherwise the rim of the disc glows.
 */
export function makeGlow(radius: number, color: string, strength: number, halo = false): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 64, 48)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, uPower: { value: halo ? 2.5 : 3.0 } },
    vertexShader: /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: halo
      ? /* glsl */ `
uniform vec3 uColor; uniform float uStrength; uniform float uPower;
varying vec3 vN; varying vec3 vV;
void main() {
  float f = pow(max(dot(-vN, vV), 0.0), uPower);
  gl_FragColor = vec4(uColor * f * uStrength, f * uStrength);
}`
      : /* glsl */ `
uniform vec3 uColor; uniform float uStrength; uniform float uPower;
varying vec3 vN; varying vec3 vV;
void main() {
  float f = pow(1.0 - max(dot(vN, vV), 0.0), uPower);
  gl_FragColor = vec4(uColor * f * uStrength, f * uStrength);
}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: halo ? THREE.BackSide : THREE.FrontSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = 2
  return mesh
}
