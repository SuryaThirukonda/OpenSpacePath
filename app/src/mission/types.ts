/**
 * Mission types, a mirror of api/models.py. Units km, km/s, s, kg, N, rad; times are simulated
 * seconds since the scenario epoch, the same clock as the timeline.
 */
import type { OrbitalElements, Vec3 } from '../types'

export interface Ship {
  name: string
  dryMass: number
  propellantMass: number
  isp: number
  maxThrust: number
  /** km/s relative to the central body along coasts; undefined means no cap. */
  maxSpeed?: number
  minBurnSpacing: number
}

export type Strategy = 'lambert2' | 'phasing3' | 'bielliptic3' | 'waypoint4' | 'best'

export interface Stop {
  satelliteId: string
  dwellSeconds: number
  strategy: Strategy
  tofBounds?: [number, number]
}

export type StartOrbit = { kind: 'satellite'; id: string } | { kind: 'elements'; elements: OrbitalElements }

/** What the user edits; the only mission data the URL carries. */
export interface MissionInput {
  ship: Ship
  startT: number
  start: StartOrbit
  stops: Stop[]
  departureWindow: number
}

export interface Burn {
  t: number
  r: Vec3
  dv: Vec3
  magnitude: number
  duration: number
  propellant: number
  label: string
}

export interface Samples {
  t: number[]
  r: [number, number, number][]
  v: [number, number, number][]
}

export interface Arc {
  t0: number
  t1: number
  samples: Samples
}

export interface Ride {
  t0: number
  t1: number
  satelliteId: string
  samples: Samples
}

export interface Leg {
  toStop: number
  strategy: string
  tof: number
  totalDv: number
  warnings: string[]
  burns: Burn[]
  arcs: Arc[]
  ride: Ride | null
}

/** The planner's answer, cached in the store and never encoded in the URL. */
export interface MissionPlan {
  legs: Leg[]
  totalDv: number
  totalTime: number
  propellantLeft: number
  feasible: boolean
}
