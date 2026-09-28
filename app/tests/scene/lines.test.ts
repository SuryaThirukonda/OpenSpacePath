import { describe, expect, it } from 'vitest'
import { segmentCounts } from '../../src/scene/lines'

describe('flown and remaining segment counts', () => {
  it('covers every segment exactly once, meeting at the last flown sample', () => {
    const n = 10
    for (let k = 0; k <= n + 2; k++) {
      const { flown, remaining } = segmentCounts(n, k)
      // flown draws segments 1..flown, remaining draws segments n-1 down to n-remaining
      const first = n - remaining
      expect(first).toBe(Math.max(Math.min(k, n), 1))
      expect(flown).toBe(Math.max(Math.min(k, n) - 1, 0))
      expect(flown + remaining).toBe(n - 1)
    }
  })
  it('draws nothing for a degenerate line', () => {
    expect(segmentCounts(1, 1)).toEqual({ flown: 0, remaining: 0 })
    expect(segmentCounts(0, 0)).toEqual({ flown: 0, remaining: 0 })
  })
})
