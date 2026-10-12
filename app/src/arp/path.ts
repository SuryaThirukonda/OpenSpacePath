/**
 * The asteroids of the problem and the path through them, as one list. One entry per asteroid
 * holds the asteroid itself with all of its orbital data, the day the spacecraft must arrive
 * there, and how long it stays. The list is the route a spacecraft follows: with the arrival days
 * and the stays, every departure and flight time is known, so the planner only has to fly it.
 * The list is also the instance an algorithm runs on and what the scene shows. The elements
 * travel inside each entry so a path stands on its own.
 */
import { validateElements } from '../core/elements'
import { getBody } from '../data/bodies'
import type { TransferMode } from '../mission/types'
import type { OrbitalElements } from '../types'
import { AU_KM, seededRandom } from './instance'
import type { ArpBody, ArpEvaluation, ArpInstance } from './types'

export interface PathEntry {
  /** the asteroid with all of its attributes: id, name, elements (km, rad) */
  asteroid: ArpBody
  /** days after the mission start at which the spacecraft must be at the asteroid */
  arrival: number
  /** days spent at the asteroid before leaving it */
  delay: number
}

export interface PathPlan {
  /** days after the mission start at which the spacecraft leaves Earth's orbit */
  departure: number
  entries: PathEntry[]
}

/** The saved form of a path, so one can be kept and opened again. */
export interface PathFile {
  format: 'arp-path'
  version: 1
  epoch: string
  mu: number
  earth: ArpBody
  departure: number
  entries: PathEntry[]
}

export const emptyPath = (): PathPlan => ({ departure: 0, entries: [] })

export const PATH_FORMAT_NAME = 'ARP-PATH'
export const PATH_FORMAT_VERSION = 1
export const DEG = Math.PI / 180

/** What the Path text box accepts, shown beside it. */
export const PATH_FORMAT_REFERENCE = `A path is text in this shape; one line per stop, in visiting order.

    ARP-PATH 1
    epoch: 2121-01-01T00:00:00Z
    departure: 0
    Asteroid 1: a=3.2654 e=0.1823 i=6.72 raan=147.75 argp=296.07 M0=283.61 arrive=365 stay=30
    Asteroid 2: a=2.9651 e=0.0272 i=1.00 raan=111.98 argp=278.47 M0=228.47 arrive=760 stay=30

- The first line is "ARP-PATH 1". "epoch:" is the mission start (ISO date); "departure:" the day the spacecraft leaves Earth's orbit.
- A stop is "name: key=value ...". The orbit: a in AU (or "a=4.9e8km"), e, and the angles i, raan, argp, M0 in degrees (or "i=0.12rad"), M0 at the epoch.
  Then arrive (the day the spacecraft must be there) and stay (days spent there before leaving). The keys may come in any order.
- Optional: "mu:" in km^3/s^2 (the Sun when absent); "earth:" with the same orbit keys (JPL's Earth when absent); "id=" on a stop.
- These stops are the asteroids of the problem: the scene shows them, an algorithm visits them, Fly path flies them in this order.
- Lines starting with # are comments. A file in this format, an instance JSON or a saved run can be opened.`

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stop'
const fmt = (x: number, digits: number) => Number(x.toFixed(digits)).toString()

/** The path as text in the standard format, the inverse of parsePathText. */
export function pathText(inst: ArpInstance, path: PathPlan): string {
  const orbit = (el: OrbitalElements) =>
    `a=${fmt(el.a / AU_KM, 8)} e=${fmt(el.e, 8)} i=${fmt(el.i / DEG, 6)} raan=${fmt(el.raan / DEG, 6)} argp=${fmt(el.argp / DEG, 6)} M0=${fmt(el.M0 / DEG, 6)}`
  const lines = [`${PATH_FORMAT_NAME} ${PATH_FORMAT_VERSION}`, `epoch: ${inst.epoch}`, `departure: ${fmt(path.departure, 4)}`]
  if (Math.abs(inst.mu - 132712440041.9) > 1) lines.push(`mu: ${inst.mu}`)
  lines.push(`earth: ${orbit(inst.earth.elements)}`)
  lines.push('# name: orbit (a in AU, angles in degrees), then arrive (day) and stay (days)')
  for (const e of path.entries) lines.push(`${e.asteroid.name || e.asteroid.id}: ${orbit(e.asteroid.elements)} arrive=${fmt(e.arrival, 4)} stay=${fmt(e.delay, 4)}`)
  return lines.join('\n') + '\n'
}

function readOrbit(fields: Map<string, [number, string]>, where: string): OrbitalElements | string {
  const need = ['a', 'e', 'i', 'raan', 'argp', 'm0']
  const missing = need.filter((k) => !fields.has(k))
  if (missing.length) return `${where} is missing ${missing.map((k) => (k === 'm0' ? 'M0' : k)).join(', ')}`
  const angle = (k: string) => { const [v, u] = fields.get(k)!; return u === 'rad' ? v : v * DEG }
  const [a, au] = fields.get('a')!
  const elements = { a: au === 'km' ? a : a * AU_KM, e: fields.get('e')![0], i: angle('i'), raan: angle('raan'), argp: angle('argp'), M0: angle('m0') }
  const check = validateElements(elements, getBody('sun').radius)
  return check.ok ? elements : `${where}: ${check.problems.join('; ')}`
}

function readFields(text: string): Map<string, [number, string]> | string {
  const out = new Map<string, [number, string]>()
  // key=number, optionally followed by a unit that is not itself the next key
  const re = /([A-Za-z][A-Za-z0-9]*)\s*=\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(?:\s*(au|km|deg|rad|days?|d)\b(?!\s*=))?/gi
  let rest = text
  for (const m of text.matchAll(re)) {
    out.set(m[1].toLowerCase(), [Number(m[2]), (m[3] ?? '').toLowerCase()])
    rest = rest.replace(m[0], ' ')
  }
  if (rest.trim() && !/^[\s,;]*$/.test(rest)) return `cannot read "${rest.trim().slice(0, 30)}"`
  return out
}


/** A path from the text format, or a sentence saying what is wrong with it. */
export function parsePathText(text: string): PathPlan | string {
  const lines = text.split(/\r?\n/)
  const first = lines.find((l) => l.trim().length > 0)?.trim() ?? ''
  const head = new RegExp(`^${PATH_FORMAT_NAME}\\s+(\\d+)$`).exec(first)
  if (!head) return `the first line must be "${PATH_FORMAT_NAME} ${PATH_FORMAT_VERSION}"`
  if (Number(head[1]) !== PATH_FORMAT_VERSION) return `this is path format version ${head[1]}; the page reads version ${PATH_FORMAT_VERSION}`
  let departure = 0
  const entries: PathEntry[] = []
  const ids = new Set<string>()
  let n = 0
  for (const raw of lines.slice(lines.indexOf(lines.find((l) => l.trim() === first)!) + 1)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const colon = line.indexOf(':')
    if (colon < 0) return `line "${line.slice(0, 40)}" needs a name followed by a colon`
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    const lower = key.toLowerCase()
    if (lower === 'epoch' || lower === 'mu' || lower === 'earth') continue // the base of the instance, read by headerOf
    if (lower === 'departure') {
      const d = Number(value.replace(/\s*(d|days?)$/i, ''))
      if (!Number.isFinite(d) || d < 0) return `departure must be a day number, zero or more, not "${value}"`
      departure = d
      continue
    }
    n += 1
    const where = `stop ${n} (${key})`
    const fields = readFields(value.replace(/\bid\s*=\s*[A-Za-z0-9_.-]+/, ' '))
    if (typeof fields === 'string') return `${where}: ${fields}`
    const elements = readOrbit(fields, where)
    if (typeof elements === 'string') return elements
    const arrive = fields.get('arrive') ?? fields.get('arrival')
    const stay = fields.get('stay') ?? fields.get('delay') ?? [0, '']
    if (!arrive) return `${where} needs arrive=<day>`
    if (!Number.isFinite(arrive[0]) || !Number.isFinite(stay[0]) || stay[0] < 0) return `${where}: arrive and stay are day numbers, the stay zero or more`
    const idText = /\bid\s*=\s*([A-Za-z0-9_.-]+)/.exec(value)
    if (idText && ids.has(idText[1])) return `${where} repeats the id "${idText[1]}"`
    let id = idText ? idText[1] : slug(key)
    for (let n = 2; ids.has(id); n++) id = `${slug(key)}-${n}`
    ids.add(id)
    entries.push({ asteroid: { id, name: key, elements }, arrival: arrive[0], delay: stay[0] })
  }
  const path = { departure, entries }
  const problems = pathProblems(path)
  return problems.length ? problems[0] : path
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** What is wrong with an entry's orbit, in sentences; none means it can be flown. */
export function orbitProblems(el: OrbitalElements): string[] {
  return validateElements(el, getBody('sun').radius).problems
}

/** A random main-belt orbit (the generator's distribution) for the k-th asteroid of a path, seeded. */
export function randomAsteroid(path: PathPlan, seed: number, k = path.entries.length + 1): ArpBody {
  const rnd = seededRandom(seed * 7919 + 1000 * k + 7)
  const ids = new Set(path.entries.map((e) => e.asteroid.id))
  let id = `asteroid-${k}`
  for (let n = k; ids.has(id); n++) id = `asteroid-${n + 1}`
  return {
    id, name: `Asteroid ${id.slice(9)}`,
    elements: { a: (2.1 + 1.2 * rnd()) * AU_KM, e: 0.02 + 0.23 * rnd(), i: 14 * rnd() * DEG, raan: 2 * Math.PI * rnd(), argp: 2 * Math.PI * rnd(), M0: 2 * Math.PI * rnd() },
  }
}

/** A path through these asteroids in order: a year of flight to each, a month at each. */
export function defaultSchedule(asteroids: ArpBody[], departure = 0): PathPlan {
  return { departure, entries: asteroids.map((asteroid, k) => ({ asteroid, arrival: departure + 365 * (k + 1) + 30 * k, delay: 30 })) }
}

/** An entry with its orbit, or its name, changed. */
export function withOrbit(path: PathPlan, k: number, elements: Partial<OrbitalElements>, name?: string): PathEntry {
  const entry = path.entries[k]
  return { ...entry, asteroid: { ...entry.asteroid, name: name ?? entry.asteroid.name, elements: { ...entry.asteroid.elements, ...elements } } }
}

/** The instance with the path's asteroids: the list is what the scene shows and what an algorithm visits. */
export function syncInstance(inst: ArpInstance, path: PathPlan): ArpInstance {
  return { ...inst, asteroids: path.entries.map((e) => e.asteroid) }
}

/** Sentences saying what stops the path from being flown; none means it can be. */
export function pathProblems(path: PathPlan): string[] {
  const out: string[] = []
  if (!isNum(path.departure) || path.departure < 0) out.push('the departure from Earth is a day number, zero or more')
  if (path.entries.length === 0) out.push('add at least one asteroid')
  const seen = new Set<string>()
  let free = path.departure
  path.entries.forEach((e, k) => {
    const who = `${k + 1}. ${e.asteroid.name || e.asteroid.id}`
    if (seen.has(e.asteroid.id)) out.push(`${who} is visited twice; the problem visits each asteroid once`)
    seen.add(e.asteroid.id)
    for (const p of orbitProblems(e.asteroid.elements)) out.push(`${who}: ${p}`)
    if (!isNum(e.arrival) || !isNum(e.delay) || e.delay < 0) out.push(`${who}: arrival and stay are day numbers, the stay zero or more`)
    else if (e.arrival <= free) out.push(`${who} arrives on day ${e.arrival}, but the spacecraft only leaves the previous body on day ${free}`)
    free = (isNum(e.arrival) ? e.arrival : free) + (isNum(e.delay) && e.delay >= 0 ? e.delay : 0)
  })
  return out
}

/** A new entry with a random orbit, arriving a year after the spacecraft is free. */
export function nextEntry(path: PathPlan, seed: number): PathEntry {
  const asteroid = randomAsteroid(path, seed)
  const last = path.entries[path.entries.length - 1]
  const free = last ? last.arrival + last.delay : path.departure
  return { asteroid, arrival: Math.round(free + 365), delay: 30 }
}

/** The request body of POST /api/arp/path: the path as written, plus how to fly it. */
export function pathRequest(inst: ArpInstance, path: PathPlan, solver: string, transfer: TransferMode) {
  return { name: `${inst.name} path`, mu: inst.mu, epoch: inst.epoch, earth: inst.earth, departure: path.departure, entries: path.entries, solver, transfer, timeWeight: inst.timeWeight }
}

/** The path seen as an instance, Earth and its asteroids in visiting order, so a result can be named and drawn. */
export function pathInstance(inst: ArpInstance, path: PathPlan): ArpInstance {
  return syncInstance(inst, path)
}

/** A path from a route an algorithm found: the arrival day and the wait at each asteroid become its entries. */
export function pathFromEvaluation(inst: ArpInstance, ev: ArpEvaluation): PathPlan {
  const entries: PathEntry[] = []
  let day = 0
  ev.legs.forEach((leg, k) => {
    day += leg.tau + leg.t
    const next = ev.legs[k + 1]
    entries.push({ asteroid: inst.asteroids[leg.target - 1], arrival: round(day), delay: round(next ? next.tau : 0) })
  })
  return { departure: round(ev.legs[0]?.tau ?? 0), entries }
}

const round = (d: number) => Math.round(d * 100) / 100

export function pathFile(inst: ArpInstance, path: PathPlan): PathFile {
  return { format: 'arp-path', version: 1, epoch: inst.epoch, mu: inst.mu, earth: inst.earth, departure: path.departure, entries: path.entries }
}

function cleanBody(x: unknown, k: number): ArpBody | string {
  const o = x as Record<string, unknown> | undefined
  const el = o?.elements as Record<string, unknown> | undefined
  if (!o || !el || !['a', 'e', 'i', 'raan', 'argp', 'M0'].every((key) => isNum(el[key]))) return `entry ${k + 1} needs an asteroid with elements {a, e, i, raan, argp, M0}`
  const elements = { a: el.a as number, e: el.e as number, i: el.i as number, raan: el.raan as number, argp: el.argp as number, M0: el.M0 as number }
  const check = validateElements(elements, getBody('sun').radius)
  if (!check.ok) return `entry ${k + 1}: ${check.problems.join('; ')}`
  return { id: typeof o.id === 'string' && o.id ? o.id : `asteroid-${k + 1}`, name: typeof o.name === 'string' ? o.name : `Asteroid ${k + 1}`, elements }
}

/** The epoch, mu and Earth a path file names, when it names them (text header lines or JSON fields). */
export function headerOf(text: string): { epoch?: string; mu?: number; earth?: ArpBody } {
  const out: { epoch?: string; mu?: number; earth?: ArpBody } = {}
  if (text.trim().startsWith('{')) {
    try {
      const o = JSON.parse(text) as Record<string, unknown>
      if (typeof o.epoch === 'string' && !Number.isNaN(Date.parse(o.epoch))) out.epoch = o.epoch
      if (isNum(o.mu) && o.mu > 0) out.mu = o.mu
      const earth = cleanBody(o.earth, -1)
      if (typeof earth !== 'string') out.earth = { ...earth, id: 'earth', name: 'Earth' }
    } catch {
      // not JSON: nothing to read
    }
    return out
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    if (key === 'epoch' && !Number.isNaN(Date.parse(value))) out.epoch = value
    else if (key === 'mu' && isNum(Number(value)) && Number(value) > 0) out.mu = Number(value)
    else if (key === 'earth') {
      const fields = readFields(value)
      const el = typeof fields === 'string' ? fields : readOrbit(fields, 'earth')
      if (typeof el !== 'string') out.earth = { id: 'earth', name: 'Earth', elements: el }
    }
  }
  return out
}

/** A path from a saved file, text or the JSON the page exports, or a sentence saying what is wrong with it. */
export function parsePath(text: string): PathPlan | string {
  if (!text.trim().startsWith('{')) return parsePathText(text)
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return 'that is not JSON'
  }
  const o = raw as Record<string, unknown> | null
  if (!o || typeof o !== 'object' || o.format !== 'arp-path') return 'a path file has "format": "arp-path"'
  if (!Array.isArray(o.entries) || o.entries.length === 0 || o.entries.length > 40) return 'a path has 1 to 40 entries'
  const entries: PathEntry[] = []
  for (let k = 0; k < o.entries.length; k++) {
    const e = o.entries[k] as Record<string, unknown>
    const asteroid = cleanBody(e?.asteroid, k)
    if (typeof asteroid === 'string') return asteroid
    if (!isNum(e.arrival) || !isNum(e.delay)) return `entry ${k + 1} needs "arrival" and "delay" in days`
    entries.push({ asteroid, arrival: e.arrival, delay: e.delay })
  }
  const path = { departure: isNum(o.departure) ? o.departure : 0, entries }
  const problems = pathProblems(path)
  return problems.length ? problems[0] : path
}
