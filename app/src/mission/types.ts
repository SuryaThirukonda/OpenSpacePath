/**
 * Mission types, a mirror of api/models.py. Units km, km/s, s, kg, N, rad; times are simulated
 * seconds since the scenario epoch, the same clock as the timeline.
 */
import type { OrbitalElements } from '../types'

/** Vectors on the wire are plain triples, km or km/s. */
export type Triple = [number, number, number]

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

/**
 * How every transfer is flown: the two-burn Lambert rendezvous, or the three-burn rendezvous of
 * the derivation sheet (in-plane shaping, plane change at the node, velocity match).
 */
export type TransferMode = 'lambert2' | 'threeburn'
export const DEFAULT_TRANSFER: TransferMode = 'threeburn'
export const TRANSFER_MODES: TransferMode[] = ['lambert2', 'threeburn']
export const transferName = (mode: TransferMode): string => (mode === 'threeburn' ? '3 burns' : '2 burns')

export interface Stop {
  satelliteId: string
  dwellSeconds: number
  tofBounds?: [number, number]
}

export interface Stage {
  name: string
  dryMass: number
  propellantMass: number
  ispVacuum: number
  ispSeaLevel?: number
  /** N */
  thrustVacuum: number
}

export interface LaunchVehicle {
  name: string
  stages: Stage[]
  /** m^2 reference area for drag */
  dragArea: number
  dragCoefficient: number
  /** throttle limit, g */
  maxAcceleration: number
}

export interface LaunchSite {
  name: string
  /** deg, geodetic */
  latitude: number
  /** deg, east */
  longitude: number
  /** km above the ellipsoid */
  altitude: number
}

export interface LaunchSpec {
  site: LaunchSite
  vehicle: LaunchVehicle
  /** km */
  parkingAltitude: number
  /** deg; undefined = the first stop's inclination */
  inclination?: number
  /** s since epoch; undefined = the next window after startT */
  launchTime?: number
}

export type StartOrbit =
  | { kind: 'satellite'; id: string }
  | { kind: 'elements'; elements: OrbitalElements }
  | { kind: 'launch'; launch: LaunchSpec }

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
  r: Triple
  dv: Triple
  magnitude: number
  duration: number
  propellant: number
  label: string
}

export interface Samples {
  t: number[]
  r: Triple[]
  v: Triple[]
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

export interface LaunchEvent {
  t: number
  label: string
}

export interface StageReport {
  name: string
  propellantUsed: number
  propellantLeft: number
  burnTime: number
  ignition: number
  cutoff: number
}

/** km/s. ideal is the integrated thrust acceleration; the losses are what the ideal buys nothing with. */
export interface LaunchBudget {
  ideal: number
  gravityLoss: number
  dragLoss: number
  steeringLoss: number
  circularization: number
  earthRotation: number
  planeCorrection: number
}

export interface BurnInterval {
  t0: number
  t1: number
  label: string
}

/** The integrated ascent from the pad to the parking orbit; the first leg departs from its last sample. */
export interface LaunchReport {
  siteName: string
  vehicleName: string
  liftoffT: number
  mecoT: number
  insertionT: number
  azimuthDeg: number
  inclinationDeg: number
  raanDeg: number
  planeAlignment: number
  parkingAltitude: number
  parkingPeriod: number
  grossLiftoffMass: number
  payloadMass: number
  kickAngleDeg: number
  /** kPa */
  maxQ: number
  /** g */
  maxG: number
  downrangeKm: number
  events: LaunchEvent[]
  stages: StageReport[]
  budget: LaunchBudget
  burnIntervals: BurnInterval[]
  samples: Samples
  warnings: string[]
  feasible: boolean
}

/** The planner's answer, cached in the store and never encoded in the URL. */
export interface MissionPlan {
  legs: Leg[]
  totalDv: number
  totalTime: number
  propellantLeft: number
  feasible: boolean
  launch?: LaunchReport | null
  /** A wait alongside the start body before the first departure (asteroid routes begin with one). */
  prelude?: Ride | null
}

/** Simulated time the tour starts: liftoff when launching, else the mission's startT. */
export function planStart(plan: MissionPlan, startT: number): number {
  return plan.launch ? plan.launch.liftoffT : startT
}
