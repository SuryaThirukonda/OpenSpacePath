/**
 * Scenario <-> URL query string. The whole scenario travels as ?s=<base64url JSON> with a schema
 * version `v`. Decoding is defensive: a URL is user-editable, so anything that would throw later
 * (an unknown body, an eccentricity of 1.5, a zero span) is rejected or dropped here, and the app
 * falls back to the default scenario instead of a blank page.
 */
import { validateElements } from '../core/elements'
import { snapRate } from '../core/time'
import { BODY_BY_ID } from '../data/bodies'
import { validateTleLines } from '../propagation/sgp4Propagator'
import { TRANSFER_MODES, type LaunchSpec, type MissionInput, type Stage, type Stop, type TransferMode } from '../mission/types'
import type { KeplerSatellite, OrbitalElements, Satellite, Scenario, TleSatellite } from '../types'

export const PARAM = 's'
/** Bump when the encoded shape changes. Absent means 1. */
export const SCHEMA_VERSION = 2

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeScenario(sc: Scenario): string {
  return toBase64Url(JSON.stringify({ v: SCHEMA_VERSION, ...sc }))
}

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

/** A clean copy of a satellite record, or null if it is malformed or would not propagate. */
function cleanSatellite(s: unknown, bodyRadius: number): Satellite | null {
  if (!s || typeof s !== 'object') return null
  const o = s as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.color !== 'string') return null
  if (o.kind === 'kepler') {
    const el = o.elements as Record<string, unknown> | undefined
    if (!el || !['a', 'e', 'i', 'raan', 'argp', 'M0'].every((k) => isNum(el[k]))) return null
    const elements = { a: el.a as number, e: el.e as number, i: el.i as number, raan: el.raan as number, argp: el.argp as number, M0: el.M0 as number }
    if (!validateElements(elements, bodyRadius).ok) return null
    const sat: KeplerSatellite = { id: o.id, kind: 'kepler', name: o.name, color: o.color, elements }
    if (o.shape === 'asteroid' || o.shape === 'planet') sat.shape = o.shape
    return sat
  }
  if (o.kind === 'tle') {
    if (typeof o.line1 !== 'string' || typeof o.line2 !== 'string') return null
    if (validateTleLines(o.line1, o.line2) !== null) return null
    const sat: TleSatellite = { id: o.id, kind: 'tle', name: o.name, color: o.color, line1: o.line1, line2: o.line2 }
    return sat
  }
  return null
}

function cleanElements(x: unknown, bodyRadius: number): OrbitalElements | null {
  const el = x as Record<string, unknown> | undefined
  if (!el || !['a', 'e', 'i', 'raan', 'argp', 'M0'].every((k) => isNum(el[k]))) return null
  const elements = { a: el.a as number, e: el.e as number, i: el.i as number, raan: el.raan as number, argp: el.argp as number, M0: el.M0 as number }
  return validateElements(elements, bodyRadius).ok ? elements : null
}

function cleanLaunch(x: unknown): LaunchSpec | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const site = o.site as Record<string, unknown> | undefined
  const vehicle = o.vehicle as Record<string, unknown> | undefined
  if (!site || !vehicle) return null
  if (!isNum(site.latitude) || Math.abs(site.latitude) > 90 || !isNum(site.longitude) || Math.abs(site.longitude) > 360) return null
  const stages: Stage[] = []
  for (const raw of Array.isArray(vehicle.stages) ? vehicle.stages : []) {
    const st = raw as Record<string, unknown>
    if (!['dryMass', 'propellantMass', 'ispVacuum', 'thrustVacuum'].every((k) => isNum(st[k]) && (st[k] as number) > 0)) return null
    stages.push({
      name: typeof st.name === 'string' ? st.name : `stage ${stages.length + 1}`,
      dryMass: st.dryMass as number, propellantMass: st.propellantMass as number, ispVacuum: st.ispVacuum as number, thrustVacuum: st.thrustVacuum as number,
      ...(isNum(st.ispSeaLevel) && (st.ispSeaLevel as number) > 0 ? { ispSeaLevel: st.ispSeaLevel as number } : {}),
    })
  }
  if (stages.length < 1 || stages.length > 4) return null
  const parking = isNum(o.parkingAltitude) ? Math.min(2000, Math.max(120, o.parkingAltitude as number)) : 200
  const spec: LaunchSpec = {
    site: { name: typeof site.name === 'string' ? site.name : 'site', latitude: site.latitude, longitude: site.longitude, altitude: isNum(site.altitude) ? site.altitude : 0 },
    vehicle: {
      name: typeof vehicle.name === 'string' ? vehicle.name : 'launcher', stages,
      dragArea: isNum(vehicle.dragArea) && (vehicle.dragArea as number) > 0 ? (vehicle.dragArea as number) : 10,
      dragCoefficient: isNum(vehicle.dragCoefficient) && (vehicle.dragCoefficient as number) > 0 ? (vehicle.dragCoefficient as number) : 0.3,
      maxAcceleration: isNum(vehicle.maxAcceleration) && (vehicle.maxAcceleration as number) > 1 ? Math.min(20, vehicle.maxAcceleration as number) : 5,
    },
    parkingAltitude: parking,
  }
  if (isNum(o.inclination) && (o.inclination as number) >= 0 && (o.inclination as number) <= 180) spec.inclination = o.inclination as number
  if (isNum(o.launchTime)) spec.launchTime = o.launchTime as number
  return spec
}

/** Mission inputs from a URL, or undefined when absent or malformed (the scenario survives either way). */
function cleanMission(x: unknown, satellites: Satellite[], bodyRadius: number): MissionInput | undefined {
  if (!x || typeof x !== 'object') return undefined
  const m = x as Record<string, unknown>
  const ship = m.ship as Record<string, unknown> | undefined
  if (!ship || !['dryMass', 'propellantMass', 'isp', 'maxThrust', 'minBurnSpacing'].every((k) => isNum(ship[k]))) return undefined
  if (!((ship.dryMass as number) > 0) || !((ship.isp as number) > 0) || !((ship.maxThrust as number) > 0)) return undefined
  const ids = new Set(satellites.map((s) => s.id))
  const start = m.start as Record<string, unknown> | undefined
  let cleanStart: MissionInput['start'] | null = null
  if (start?.kind === 'satellite' && typeof start.id === 'string' && ids.has(start.id)) cleanStart = { kind: 'satellite', id: start.id }
  if (start?.kind === 'elements') {
    const el = cleanElements(start.elements, bodyRadius)
    if (el) cleanStart = { kind: 'elements', elements: el }
  }
  if (start?.kind === 'launch') {
    const launch = cleanLaunch(start.launch)
    if (launch) cleanStart = { kind: 'launch', launch }
  }
  if (!cleanStart) return undefined
  const stops: Stop[] = []
  for (const raw of Array.isArray(m.stops) ? m.stops : []) {
    const st = raw as Record<string, unknown>
    if (typeof st.satelliteId !== 'string' || !ids.has(st.satelliteId)) continue
    const dwell = isNum(st.dwellSeconds) && (st.dwellSeconds as number) >= 0 ? (st.dwellSeconds as number) : 0
    const stop: Stop = { satelliteId: st.satelliteId, dwellSeconds: dwell }
    const tb = st.tofBounds as unknown[] | undefined
    if (Array.isArray(tb) && tb.length === 2 && isNum(tb[0]) && isNum(tb[1]) && (tb[0] as number) > 0 && (tb[1] as number) > (tb[0] as number)) stop.tofBounds = [tb[0] as number, tb[1] as number]
    stops.push(stop)
  }
  return {
    ship: {
      name: typeof ship.name === 'string' ? ship.name : 'Ship',
      dryMass: ship.dryMass as number, propellantMass: Math.max(0, ship.propellantMass as number), isp: ship.isp as number,
      maxThrust: ship.maxThrust as number, minBurnSpacing: Math.max(0, ship.minBurnSpacing as number),
      ...(isNum(ship.maxSpeed) && (ship.maxSpeed as number) > 0 ? { maxSpeed: ship.maxSpeed as number } : {}),
    },
    startT: isNum(m.startT) ? (m.startT as number) : 0,
    start: cleanStart,
    stops,
    departureWindow: isNum(m.departureWindow) && (m.departureWindow as number) >= 0 ? (m.departureWindow as number) : 0,
  }
}

/** Returns null for anything that does not look like a scenario. Malformed satellites are dropped, not fatal. */
export function decodeScenario(encoded: string): Scenario | null {
  try {
    const o = JSON.parse(fromBase64Url(encoded)) as Record<string, unknown>
    const v = o.v === undefined ? 1 : o.v
    if (v !== 1 && v !== 2) return null
    if (typeof o.bodyId !== 'string' || !(o.bodyId in BODY_BY_ID)) return null
    if (typeof o.epoch !== 'string' || Number.isNaN(Date.parse(o.epoch))) return null
    if (!Array.isArray(o.satellites)) return null
    if (!isNum(o.spanSeconds) || o.spanSeconds <= 0 || !isNum(o.rate)) return null
    const radius = BODY_BY_ID[o.bodyId].radius
    const satellites = o.satellites.map((s) => cleanSatellite(s, radius)).filter((s): s is Satellite => s !== null)
    const scenario: Scenario = { bodyId: o.bodyId, epoch: o.epoch, satellites, spanSeconds: o.spanSeconds, rate: snapRate(o.rate) }
    const mission = cleanMission(o.mission, satellites, radius)
    if (mission) scenario.mission = mission
    if (typeof o.solver === 'string' && /^[a-z0-9]{3,24}$/.test(o.solver)) scenario.solver = o.solver
    if (TRANSFER_MODES.includes(o.transfer as TransferMode)) scenario.transfer = o.transfer as TransferMode
    return scenario
  } catch {
    return null
  }
}

export function scenarioFromLocation(search: string): Scenario | null {
  const v = new URLSearchParams(search).get(PARAM)
  return v ? decodeScenario(v) : null
}

export function scenarioToSearch(sc: Scenario): string {
  const q = new URLSearchParams()
  q.set(PARAM, encodeScenario(sc))
  return '?' + q.toString()
}
