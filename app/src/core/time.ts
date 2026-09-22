/** Time helpers. The app keeps one epoch (UTC instant) and a simulated offset t in seconds. */

/** Playback rates offered by the timeline and accepted from URLs, simulated seconds per real second. */
export const PLAYBACK_RATES: Array<[number, string]> = [
  [1, '1x (real time)'], [10, '10x'], [60, '60x'], [600, '600x'], [3600, '3600x'], [86400, '1 day/s'],
]

/** Nearest offered playback rate, so a hand-edited URL cannot run time backwards or at an absurd speed. */
export function snapRate(rate: number): number {
  if (!Number.isFinite(rate)) return 60
  let best = PLAYBACK_RATES[0][0]
  for (const [r] of PLAYBACK_RATES) if (Math.abs(r - rate) < Math.abs(best - rate)) best = r
  return best
}
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
