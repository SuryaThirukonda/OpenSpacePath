export const TWO_PI = 2 * Math.PI
export const DEG = Math.PI / 180
export const RAD = 180 / Math.PI

/** Scene units per kilometre. 1 scene unit = 1000 km keeps float32 precise to well under a metre out to lunar distance. */
export const SCENE_UNITS_PER_KM = 1 / 1000

/** Wrap an angle to [0, 2pi). */
export function wrapTwoPi(x: number): number {
  const y = x % TWO_PI
  return y < 0 ? y + TWO_PI : y
}

/** Wrap an angle to (-pi, pi]. */
export function wrapPi(x: number): number {
  let y = wrapTwoPi(x)
  if (y > Math.PI) y -= TWO_PI
  return y
}
