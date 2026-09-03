/** Scenario <-> URL query string. The whole scenario travels as ?s=<base64url JSON>. */
import type { Satellite, Scenario } from '../types'

export const PARAM = 's'

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
  return toBase64Url(JSON.stringify(sc))
}

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

function validSatellite(s: unknown): s is Satellite {
  if (!s || typeof s !== 'object') return false
  const o = s as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.color !== 'string') return false
  if (o.kind === 'kepler') {
    const el = o.elements as Record<string, unknown> | undefined
    return !!el && ['a', 'e', 'i', 'raan', 'argp', 'M0'].every((k) => isNum(el[k]))
  }
  if (o.kind === 'tle') return typeof o.line1 === 'string' && typeof o.line2 === 'string'
  return false
}

/** Returns null for anything that does not look like a scenario. */
export function decodeScenario(encoded: string): Scenario | null {
  try {
    const o = JSON.parse(fromBase64Url(encoded)) as Record<string, unknown>
    if (typeof o.bodyId !== 'string' || typeof o.epoch !== 'string') return null
    if (Number.isNaN(Date.parse(o.epoch))) return null
    if (!Array.isArray(o.satellites) || !o.satellites.every(validSatellite)) return null
    if (!isNum(o.spanSeconds) || !isNum(o.rate)) return null
    return {
      bodyId: o.bodyId, epoch: o.epoch, satellites: o.satellites as Satellite[],
      spanSeconds: o.spanSeconds, rate: o.rate,
    }
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
