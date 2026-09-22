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
import type { KeplerSatellite, Satellite, Scenario, TleSatellite } from '../types'

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
    return { bodyId: o.bodyId, epoch: o.epoch, satellites, spanSeconds: o.spanSeconds, rate: snapRate(o.rate) }
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
