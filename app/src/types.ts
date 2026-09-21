/**
 * Shared data types. Units everywhere in core/, propagation/ and data/:
 * kilometres, seconds, radians. Degrees exist only at the UI boundary.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface StateVector {
  /** Position, km, in the body-centred inertial frame (x toward the reference direction, z along the pole). */
  r: Vec3
  /** Velocity, km/s, same frame. */
  v: Vec3
}

export interface CentralBody {
  id: string
  name: string
  /** Gravitational parameter, km^3/s^2. */
  mu: number
  /** Equatorial radius, km. */
  radius: number
  /** Sidereal rotation period, seconds (negative for retrograde rotation). */
  rotationPeriod: number
  /** Base colour for the stylised sphere. */
  color: string
  /** Colour of the lat/lon wireframe. */
  gridColor: string
  /** Suggested camera distance when framing the body, km. */
  frameDistance: number
  /**
   * Multiplier applied to preset and carried-over altitudes. Planets and moons use 1, so a
   * 400 km orbit stays a 400 km orbit. The Sun uses its radius ratio to Earth, so orbits keep
   * Earth-like proportions instead of hugging a surface a hundred times larger.
   */
  altitudeScale?: number
}

/** Classical orbital elements at the scenario epoch. */
export interface OrbitalElements {
  /** Semi-major axis, km. Must be > 0 (elliptic orbits only in v1). */
  a: number
  /** Eccentricity, 0 <= e < 1. */
  e: number
  /** Inclination, rad. */
  i: number
  /** Right ascension of the ascending node, rad. */
  raan: number
  /** Argument of periapsis, rad. */
  argp: number
  /** Mean anomaly at the scenario epoch, rad. */
  M0: number
}

export interface KeplerSatellite {
  id: string
  kind: 'kepler'
  name: string
  color: string
  elements: OrbitalElements
}

export interface TleSatellite {
  id: string
  kind: 'tle'
  name: string
  color: string
  line1: string
  line2: string
}

export type Satellite = KeplerSatellite | TleSatellite

/** Everything needed to reproduce a view; this is what the URL encodes. */
export interface Scenario {
  bodyId: string
  /** ISO 8601 UTC instant that t = 0 refers to. */
  epoch: string
  satellites: Satellite[]
  /** Length of the scrub range, seconds. */
  spanSeconds: number
  /** Playback rate, simulated seconds per real second. */
  rate: number
}

export interface TimeState {
  /** Scenario epoch as a Unix time in milliseconds. */
  epochMs: number
  /** Simulated seconds since epoch. */
  t: number
  playing: boolean
  /** Simulated seconds per real second. */
  rate: number
  spanSeconds: number
}
