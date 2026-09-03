import { describe, expect, it } from 'vitest'
import { absoluteDate, advanceTime, formatDuration, parseEpoch } from '../../src/core/time'

describe('time', () => {
  it('parses and offsets an epoch', () => {
    const ms = parseEpoch('2026-09-01T12:00:00Z')
    expect(absoluteDate(ms, 3600).toISOString()).toBe('2026-09-01T13:00:00.000Z')
  })
  it('advances with rate and wraps inside the span', () => {
    const s = { epochMs: 0, t: 0, playing: true, rate: 60, spanSeconds: 100 }
    const a = advanceTime(s, 1000)
    expect(a.t).toBe(60)
    const b = advanceTime(a, 1000)
    expect(b.t).toBe(20)
    expect(advanceTime({ ...s, playing: false }, 1000).t).toBe(0)
  })
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(3661)).toBe('1h 01m 01s')
    expect(formatDuration(90000)).toBe('1d 01h 00m 00s')
  })
})
