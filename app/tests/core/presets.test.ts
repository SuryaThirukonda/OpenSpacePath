import { describe, expect, it } from 'vitest'
import { DEG } from '../../src/core/constants'
import { trueAnomalyAt } from '../../src/core/kepler'
import { BODY_BY_ID } from '../../src/data/bodies'
import { PRESETS, presetElements } from '../../src/data/presets'

describe('preset orbits', () => {
  it('put each satellite at its true anomaly at the epoch, stored as the mean anomaly', () => {
    const earth = BODY_BY_ID.earth
    for (const p of PRESETS) {
      if (p.synchronous) continue
      const el = presetElements(p, earth)
      const nu = trueAnomalyAt(el, earth.mu, 0)
      const want = ((p.nu0 * DEG) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
      const got = ((nu % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      expect(Math.min(Math.abs(got - want), 2 * Math.PI - Math.abs(got - want))).toBeLessThan(1e-9)
    }
  })
})
