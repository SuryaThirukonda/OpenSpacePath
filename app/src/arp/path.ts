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

/** A path from a saved file, or a sentence saying what is wrong with it. */
export function parsePath(text: string): PathPlan | string {
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
