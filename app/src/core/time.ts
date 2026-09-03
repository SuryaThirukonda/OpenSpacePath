/** Time helpers. The app keeps one epoch (UTC instant) and a simulated offset t in seconds. */
import type { TimeState } from '../types'

export function parseEpoch(iso: string): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new RangeError(`bad epoch: ${iso}`)
  return ms
}

export function absoluteDate(epochMs: number, t: number): Date {
  return new Date(epochMs + t * 1000)
}

export function formatUtc(d: Date): string {
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
}

/** Advance simulated time by a real elapsed interval; wraps within the span so playback loops. */
export function advanceTime(s: TimeState, dtRealMs: number): TimeState {
  if (!s.playing) return s
  let t = s.t + (dtRealMs / 1000) * s.rate
  if (s.spanSeconds > 0) {
    if (t > s.spanSeconds) t = t % s.spanSeconds
    if (t < 0) t = s.spanSeconds + (t % s.spanSeconds)
  }
  return { ...s, t }
}

const UNITS: Array<[number, string]> = [
  [86400, 'd'],
  [3600, 'h'],
  [60, 'm'],
  [1, 's'],
]

/** Compact duration such as "1d 02h 05m 07s"; once a unit appears, all smaller units are shown. */
export function formatDuration(seconds: number): string {
  let s = Math.round(Math.abs(seconds))
  const parts: string[] = []
  for (const [size, label] of UNITS) {
    const n = Math.floor(s / size)
    if (n > 0 || parts.length > 0 || label === 's') {
      s -= n * size
      parts.push(`${parts.length ? String(n).padStart(2, '0') : n}${label}`)
    }
  }
  return (seconds < 0 ? '-' : '') + parts.join(' ')
}
