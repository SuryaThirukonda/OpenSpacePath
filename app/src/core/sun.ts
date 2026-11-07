/**
 * Where the Sun is, seen from Earth: the unit vector in the Earth-centred inertial frame (x toward
 * the vernal equinox, z the north pole), from the Astronomical Almanac's low-precision formulas
 * (also Vallado, Algorithm 29). Good to about 0.01 degrees from 1950 to 2050, and a fair
 * approximation well beyond: plenty for lighting the globe so day and night fall where they do.
 */
import type { Vec3 } from '../types'

const DEG = Math.PI / 180

/** Unit vector from Earth's centre toward the Sun at `date`. */
export function sunDirectionEci(date: Date): Vec3 {
  const jd = date.getTime() / 86400000 + 2440587.5
  const T = (jd - 2451545.0) / 36525
  const meanLongitude = 280.46 + 36000.771 * T
  const meanAnomaly = (357.5291092 + 35999.05034 * T) * DEG
  const lambda = (meanLongitude + 1.914666471 * Math.sin(meanAnomaly) + 0.019994643 * Math.sin(2 * meanAnomaly)) * DEG
  const obliquity = (23.439291 - 0.0130042 * T) * DEG
  return {
    x: Math.cos(lambda),
    y: Math.cos(obliquity) * Math.sin(lambda),
    z: Math.sin(obliquity) * Math.sin(lambda),
  }
}
