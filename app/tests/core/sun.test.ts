import { describe, expect, it } from 'vitest'
import { sunDirectionEci } from '../../src/core/sun'

const dec = (v: { z: number }) => (Math.asin(v.z) * 180) / Math.PI
const ra = (v: { x: number; y: number }) => ((Math.atan2(v.y, v.x) * 180) / Math.PI + 360) % 360

describe('the Sun from Earth', () => {
  it('sits on the vernal equinox at the March equinox and 23.4 degrees north at the June solstice', () => {
    const equinox = sunDirectionEci(new Date('2026-03-20T14:46:00Z'))
    expect(Math.abs(dec(equinox))).toBeLessThan(0.05)
    expect(Math.min(ra(equinox), 360 - ra(equinox))).toBeLessThan(0.1)
    const solstice = sunDirectionEci(new Date('2026-06-21T08:24:00Z'))
    expect(dec(solstice)).toBeCloseTo(23.43, 1)
    expect(ra(solstice)).toBeCloseTo(90, 0)
  })

  it('matches the Astronomical Almanac example (1992 October 13, 0h TT): RA 198.38, Dec -7.785 degrees', () => {
    // Meeus, Astronomical Algorithms, example 25.a gives apparent RA 13h13m31.4s (198.38 deg), Dec -7 deg 47' 01" (-7.784 deg)
    const v = sunDirectionEci(new Date('1992-10-13T00:00:00Z'))
    expect(ra(v)).toBeCloseTo(198.38, 1)
    expect(dec(v)).toBeCloseTo(-7.784, 1)
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 12)
  })
})
