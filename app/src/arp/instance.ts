/**
 * ARP instances: generating them, checking imported ones, and turning one into a scene.
 *
 * The papers draw their asteroids from the 83,453 of the GTOC11 competition. That catalogue is
 * not bundled here, so the generator makes main-belt-like orbits from a seed instead: the same
 * seed always gives the same instance, but its costs are not comparable with the papers' tables.
 * A real instance can be imported as JSON in the same shape.
 */
import { apiError, plannerFetch } from '../mission/http'
import { validateElements } from '../core/elements'
import { getBody } from '../data/bodies'
import type { KeplerSatellite, OrbitalElements, Scenario } from '../types'
import type { ArpBody, ArpInstance } from './types'

export const AU_KM = 149597870.7
/** The mission start used by the papers. */
export const ARP_EPOCH = '2121-01-01T00:00:00Z'
export const TIME_WEIGHT = 2 / 30
const DEG = Math.PI / 180
const TWO_PI = 2 * Math.PI

/** A small seeded generator (mulberry32): the same seed gives the same sequence on every machine. */
export function seededRandom(seed: number): () => number {
  let a = (seed | 0) + 0x6d2b79f5
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Earth's heliocentric orbit at a date, ecliptic of J2000: JPL's approximate elements for the
 * Earth-Moon barycentre (Standish, "Approximate Positions of the Planets", valid 1800-2050 and
 * extrapolated a little here). The inclination is under a hundredth of a degree and taken as zero.
 */
export function earthElements(epochMs: number): OrbitalElements {
  const T = (epochMs / 86400000 + 2440587.5 - 2451545.0) / 36525
  const peri = 102.93768193 + 0.32327364 * T
  const L = 100.46457166 + 35999.37244981 * T
  const M = ((((L - peri) % 360) + 360) % 360) * DEG
  return { a: (1.00000261 + 0.00000562 * T) * AU_KM, e: 0.01671123 - 0.00004392 * T, i: 0, raan: 0, argp: (((peri % 360) + 360) % 360) * DEG, M0: M }
}

/** n main-belt-like asteroids: 2.1 to 3.3 AU, eccentricity up to 0.25, inclination up to 14 degrees. */
export function generateInstance(n: number, seed: number, epoch = ARP_EPOCH): ArpInstance {
  const rnd = seededRandom(seed * 7919 + n)
  const asteroids: ArpBody[] = []
  for (let k = 1; k <= n; k++) {
    asteroids.push({
      id: `ast-${n}-${seed}-${k}`,
      name: `Asteroid ${k}`,
      elements: {
        a: (2.1 + 1.2 * rnd()) * AU_KM, e: 0.02 + 0.23 * rnd(), i: 14 * rnd() * DEG,
        raan: TWO_PI * rnd(), argp: TWO_PI * rnd(), M0: TWO_PI * rnd(),
      },
    })
  }
  return {
    name: `synthetic ${n}_${seed}`, mu: getBody('sun').mu, epoch,
    earth: { id: `earth-${n}-${seed}`, name: 'Earth', elements: earthElements(Date.parse(epoch)) },
    asteroids, tauMax: 730, tMax: 730, timeWeight: TIME_WEIGHT,
    note: 'Synthetic main-belt-like orbits from a seed, not the GTOC11 catalogue the papers sample.',
  }
}

const ASTEROID_COLORS = ['#ff8a5c', '#f9a8d4', '#ffd166', '#b8f28b', '#c4b5fd', '#7cf5ff', '#fca5a5', '#a7f3d0', '#fdba74', '#93c5fd']

/** The instance as a Sun-centred scene: Earth and every asteroid on its orbit. */
export function instanceToScenario(inst: ArpInstance, solver?: string, transfer?: Scenario['transfer']): Scenario {
  const earth: KeplerSatellite = { id: inst.earth.id, kind: 'kepler', name: inst.earth.name || 'Earth', color: '#6fb8ff', elements: inst.earth.elements, shape: 'planet' }
  const asteroids: KeplerSatellite[] = inst.asteroids.map((a, k) => ({
    id: a.id, kind: 'kepler', name: a.name || `Asteroid ${k + 1}`, color: ASTEROID_COLORS[k % ASTEROID_COLORS.length], elements: a.elements, shape: 'asteroid',
  }))
  return { bodyId: 'sun', epoch: inst.epoch, satellites: [earth, ...asteroids], spanSeconds: 8 * 365.25 * 86400, rate: 2592000,
           ...(solver ? { solver } : {}), ...(transfer ? { transfer } : {}) }
}

function cleanBody(x: unknown, fallbackId: string, sunRadius: number): ArpBody | string {
  if (!x || typeof x !== 'object') return 'a body is missing'
  const o = x as Record<string, unknown>
  const el = o.elements as Record<string, unknown> | undefined
  if (!el || !['a', 'e', 'i', 'raan', 'argp', 'M0'].every((k) => typeof el[k] === 'number' && Number.isFinite(el[k]))) {
    return 'every body needs elements {a, e, i, raan, argp, M0} as numbers (km and radians)'
  }
  const elements = { a: el.a as number, e: el.e as number, i: el.i as number, raan: el.raan as number, argp: el.argp as number, M0: el.M0 as number }
  const check = validateElements(elements, sunRadius)
  if (!check.ok) return `orbit of ${typeof o.name === 'string' ? o.name : fallbackId} is not usable: ${check.problems.join('; ')}`
  return { id: typeof o.id === 'string' && o.id ? o.id : fallbackId, name: typeof o.name === 'string' ? o.name : fallbackId, elements }
}

/** An instance from imported JSON, or a sentence saying what is wrong with it. */
export function parseInstance(text: string): ArpInstance | string {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return 'that is not JSON'
  }
  if (!raw || typeof raw !== 'object') return 'an instance is a JSON object'
  const o = raw as Record<string, unknown>
  const src = (o.format === 'arp-run' && o.instance && typeof o.instance === 'object' ? o.instance : o) as Record<string, unknown>
  if (typeof src.epoch !== 'string' || Number.isNaN(Date.parse(src.epoch))) return 'the instance needs an "epoch" date'
  if (!Array.isArray(src.asteroids) || src.asteroids.length < 1 || src.asteroids.length > 40) return 'the instance needs 1 to 40 "asteroids"'
  const sun = getBody('sun')
  const earth = src.earth ? cleanBody(src.earth, 'earth', sun.radius) : { id: 'earth', name: 'Earth', elements: earthElements(Date.parse(src.epoch)) }
  if (typeof earth === 'string') return earth
  const asteroids: ArpBody[] = []
  for (let k = 0; k < src.asteroids.length; k++) {
    const b = cleanBody(src.asteroids[k], `asteroid-${k + 1}`, sun.radius)
    if (typeof b === 'string') return b
    asteroids.push(b)
  }
  const ids = new Set([earth.id, ...asteroids.map((a) => a.id)])
  if (ids.size !== asteroids.length + 1) return 'two bodies share an id'
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d)
  return {
    name: typeof src.name === 'string' ? src.name : `${asteroids.length}_imported`, mu: num(src.mu, sun.mu), epoch: src.epoch, earth, asteroids,
    tauMax: num(src.tauMax, 730), tMax: num(src.tMax, 730), timeWeight: typeof src.timeWeight === 'number' && src.timeWeight >= 0 ? src.timeWeight : TIME_WEIGHT,
    ...(Array.isArray(src.innerStart) && src.innerStart.length === 2 && src.innerStart.every((v: unknown) => typeof v === 'number') ? { innerStart: [src.innerStart[0], src.innerStart[1]] as [number, number] } : {}),
    ...(typeof src.innerTol === 'number' && src.innerTol > 0 ? { innerTol: src.innerTol } : {}),
    note: typeof src.note === 'string' ? src.note : 'Imported instance.',
  }
}

/**
 * Instance n_seed as the papers draw it: n asteroids of the GTOC11 catalogue picked by their own
 * generator. The catalogue lives with the planner, which answers with the instance.
 */
export async function fetchPaperInstance(n: number, seed: number): Promise<ArpInstance> {
  const res = await plannerFetch(`/api/arp/instance?n=${encodeURIComponent(n)}&seed=${encodeURIComponent(seed)}`)
  if (!res.ok) throw new Error(await apiError(res))
  const inst = parseInstance(await res.text())
  if (typeof inst === 'string') throw new Error(inst)
  return inst
}
