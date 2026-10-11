/**
 * A path written by hand. One entry per asteroid holds the asteroid itself with all of its orbital
 * data, the day the spacecraft must arrive there, and how long it stays. The list is the route a
 * spacecraft follows: with the arrival days and the stays, every departure and flight time is
 * known, so the planner only has to fly it. The elements travel inside each entry so a path
 * stands on its own and the server plans from exactly what is written here.
 */
import { validateElements } from '../core/elements'
import { getBody } from '../data/bodies'
import type { TransferMode } from '../mission/types'
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
const AU_KM = 149597870.7
const DEG = Math.PI / 180

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
- A stop whose name and orbit match an asteroid of the instance is that asteroid; any other orbit is a new body, drawn when the path is flown.
- Lines starting with # are comments. A file in this format, or the JSON the page used to export, can be imported.`

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stop'
const fmt = (x: number, digits: number) => Number(x.toFixed(digits)).toString()

/** The path as text in the standard format, the inverse of parsePathText. */
export function pathText(inst: ArpInstance, path: PathPlan): string {
  const orbit = (el: OrbitalElementsLike) =>
    `a=${fmt(el.a / AU_KM, 8)} e=${fmt(el.e, 8)} i=${fmt(el.i / DEG, 6)} raan=${fmt(el.raan / DEG, 6)} argp=${fmt(el.argp / DEG, 6)} M0=${fmt(el.M0 / DEG, 6)}`
  const lines = [`${PATH_FORMAT_NAME} ${PATH_FORMAT_VERSION}`, `epoch: ${inst.epoch}`, `departure: ${fmt(path.departure, 4)}`]
  if (Math.abs(inst.mu - 132712440041.9) > 1) lines.push(`mu: ${inst.mu}`)
  lines.push(`earth: ${orbit(inst.earth.elements)}`)
  lines.push('# name: orbit (a in AU, angles in degrees), then arrive (day) and stay (days)')
  for (const e of path.entries) lines.push(`${e.asteroid.name || e.asteroid.id}: ${orbit(e.asteroid.elements)} arrive=${fmt(e.arrival, 4)} stay=${fmt(e.delay, 4)}`)
  return lines.join('\n') + '\n'
}

type OrbitalElementsLike = ArpBody['elements']

function readOrbit(fields: Map<string, [number, string]>, where: string): OrbitalElementsLike | string {
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

const sameOrbit = (p: OrbitalElementsLike, q: OrbitalElementsLike) =>
  (['a', 'e', 'i', 'raan', 'argp', 'M0'] as const).every((k) => Math.abs(p[k] - q[k]) <= 1e-6 * Math.max(1, Math.abs(q[k])))

/**
 * A path from the text format. `inst` resolves stops to the instance's asteroids when name and
 * orbit match; a typed orbit that differs is a body of its own. Returns a sentence on failure.
 */
export function parsePathText(text: string, inst?: ArpInstance | null): PathPlan | string {
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
    if (lower === 'epoch' || lower === 'mu' || lower === 'earth') continue // kept with the instance, read by the file importer
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
    const known = inst?.asteroids.find((a) => (a.name || a.id).toLowerCase() === lower && sameOrbit(a.elements, elements))
    const idText = /\bid\s*=\s*([A-Za-z0-9_.-]+)/.exec(value)
    const id = idText ? idText[1] : known ? known.id : slug(key)
    if (ids.has(id)) return `${where} repeats the id "${id}"`
    ids.add(id)
    entries.push({ asteroid: { id, name: key, elements }, arrival: arrive[0], delay: stay[0] })
  }
  const path = { departure, entries }
  const problems = pathProblems(path)
  return problems.length ? problems[0] : path
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

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
    if (!isNum(e.arrival) || !isNum(e.delay) || e.delay < 0) out.push(`${who}: arrival and stay are day numbers, the stay zero or more`)
    else if (e.arrival <= free) out.push(`${who} arrives on day ${e.arrival}, but the spacecraft only leaves the previous body on day ${free}`)
    free = (isNum(e.arrival) ? e.arrival : free) + (isNum(e.delay) && e.delay >= 0 ? e.delay : 0)
  })
  return out
}

/** A new entry: the first asteroid not yet in the path, arriving a year after the spacecraft is free. */
export function nextEntry(inst: ArpInstance, path: PathPlan): PathEntry | null {
  const used = new Set(path.entries.map((e) => e.asteroid.id))
  const asteroid = inst.asteroids.find((a) => !used.has(a.id))
  if (!asteroid) return null
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
  return { ...inst, name: `${inst.name} path`, asteroids: path.entries.map((e) => e.asteroid) }
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

/** A path from a saved file, text or the JSON the page exports, or a sentence saying what is wrong with it. */
export function parsePath(text: string, inst?: ArpInstance | null): PathPlan | string {
  if (!text.trim().startsWith('{')) return parsePathText(text, inst)
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
