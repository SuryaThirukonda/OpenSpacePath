/**
 * Procedural surfaces for the central bodies: no textures to download, resolution-independent,
 * and the same look on every device. Each body kind gets a GLSL colour function of the unit
 * direction in body-fixed coordinates (z is the pole), injected into three.js's standard
 * material so the scene lights, shading and tone mapping keep working. Rim glows are a
 * separate fresnel shell.
 *
 * The 3-D simplex noise is the public webgl-noise implementation by Ian McEwan (Ashima Arts)
 * and Stefan Gustavson, MIT licensed.
 */
import * as THREE from 'three'
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
  moon: /* glsl */ `
vec3 surfaceColor(vec3 d, out float water, out float cloud) {
  water = 0.0; cloud = 0.0;
  float maria = smoothstep(0.12, 0.3, fbm(d * 1.6 + 5.0));
  float fine = 0.5 + 0.5 * fbm(d * 14.0);
  float rims = pow(1.0 - abs(snoise(d * 24.0)), 6.0);
  vec3 c = mix(vec3(0.62, 0.61, 0.58), vec3(0.28, 0.28, 0.29), maria);
  return c * (0.75 + 0.35 * fine) + 0.12 * rims;
}`,
  mars: /* glsl */ `
vec3 surfaceColor(vec3 d, out float water, out float cloud) {
  water = 0.0; cloud = 0.0;
  float h = fbm(d * 2.4 + 1.0);
  float lat = abs(d.z);
  vec3 c = mix(vec3(0.80, 0.45, 0.25), vec3(0.42, 0.22, 0.13), smoothstep(0.0, 0.35, h));
  c = mix(c, vec3(0.88, 0.62, 0.40), 0.5 * smoothstep(0.2, 0.6, fbm(d * 7.0 + 2.0)));
  float cap = smoothstep(0.86, 0.94, lat + 0.03 * fbm(d * 6.0));
  return mix(c, vec3(0.95, 0.94, 0.92), cap);
}`,
  venus: /* glsl */ `
vec3 surfaceColor(vec3 d, out float water, out float cloud) {
  water = 0.0; cloud = 0.0;
  vec3 q = d + 0.35 * vec3(fbm(d * 2.0), fbm(d * 2.0 + 4.0), fbm(d * 2.0 + 8.0));
  float band = 0.5 + 0.5 * sin(asin(clamp(q.z, -1.0, 1.0)) * 9.0 + 3.0 * fbm(q * 3.0));
  float streak = fbm(vec3(q.x, q.y, q.z * 5.0) * 2.5);
  return mix(vec3(0.93, 0.85, 0.62), vec3(0.78, 0.66, 0.42), 0.6 * band + 0.4 * smoothstep(-0.2, 0.4, streak));
}`,
  gas: /* glsl */ `
vec3 surfaceColor(vec3 d, out float water, out float cloud) {
  water = 0.0; cloud = 0.0;
  float lat = asin(clamp(d.z, -1.0, 1.0));
  float lon = atan(d.y, d.x);
  float t = lat + 0.12 * fbm(d * 3.0) + 0.05 * fbm(d * 8.0);
  float band = sin(t * 11.0) * 0.5 + 0.5;
  float band2 = sin(t * 23.0 + 1.3) * 0.5 + 0.5;
  vec3 c = mix(vec3(0.86, 0.80, 0.68), vec3(0.72, 0.55, 0.38), band);
  c = mix(c, vec3(0.60, 0.36, 0.22), 0.35 * band2 * smoothstep(0.1, 0.5, abs(lat)));
  c = mix(c, vec3(0.93, 0.90, 0.84), 0.25 * smoothstep(0.6, 0.9, fbm(vec3(d.x, d.y, d.z * 6.0) * 4.0)));
  vec2 s = vec2((lon - 0.9) * cos(lat), (lat + 0.38) * 2.2);
  float spot = smoothstep(0.22, 0.10, length(s) + 0.03 * fbm(d * 12.0));
  return mix(c, vec3(0.75, 0.32, 0.20), spot * 0.9);
}`,
  star: /* glsl */ `
vec3 surfaceColor(vec3 d, out float water, out float cloud) {
  water = 0.0; cloud = 0.0;
  float g = fbm(d * 18.0);
  float g2 = fbm(d * 60.0);
  vec3 c = mix(vec3(0.95, 0.55, 0.18), vec3(1.0, 0.86, 0.55), smoothstep(-0.4, 0.3, g));
  return mix(c, vec3(1.0, 0.98, 0.85), 0.5 * smoothstep(0.2, 0.6, g2));
}`,
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
  mat.customProgramCacheKey = () => `orbit-lab-surface-${kind}`
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurfDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfDir = normalize(position);')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSurfDir;\n${NOISE}\n${SURFACES[kind]}`)
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
float limb = pow(max(dot(normal, normalize(vViewPosition)), 0.0), 0.6);
totalEmissiveRadiance = photosphere * (0.55 + 0.6 * limb);`
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
