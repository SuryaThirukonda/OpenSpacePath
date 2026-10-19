/**
 * The Asteroid Routing Problem (ARP) as the app holds it. Mirrors the Arp* schemas in
 * api/models.py. Bodies are numbered as in Rudich et al. (2024): 0 is Earth, 1..n the asteroids.
 * Times in an instance and a route are days after the instance epoch; elements are km and rad.
 */
import type { TransferMode } from '../mission/types'
import type { OrbitalElements } from '../types'

export interface ArpBody {
  id: string
  name: string
  elements: OrbitalElements
}

export interface ArpInstance {
  /** shown in the panel and written into exported runs, e.g. "8_42" for 8 asteroids, seed 42 */
  name: string
  /** gravitational parameter of the Sun, km^3/s^2 */
  mu: number
  /** ISO date of the mission start */
  epoch: string
  earth: ArpBody
  asteroids: ArpBody[]
  /** longest wait before a transfer, days */
  tauMax: number
  /** longest transfer, days */
  tMax: number
  /** km/s charged per day of mission: 2 km/s per 30 days in the papers */
  timeWeight: number
  /** where the inner optimizer starts, [wait, flight] in days; the papers' code uses [1, 30] */
  innerStart?: [number, number]
  /** SLSQP tolerance of the inner optimizer; the papers' code uses 1e-4 */
  innerTol?: number
  /** where the asteroids came from, in a sentence */
  note?: string
}

/** One call of the black box B(a, a', eta) -> (tau, t, z). */
export interface ArpTransfer {
  origin: number
  target: number
  eta: number
  tau: number
  t: number
  z: number
  dv: number
  dv1: number
  dv2: number
  /** the third burn of a three-burn transfer; 0 with two burns */
  dv3: number
  evals: number
  /** how far the arc ends from the target as a fraction of its distance; -1 if unknown */
  miss: number
  /** how the transfer was flown */
  transfer: TransferMode
  /** number of impulses */
  burns: number
  /** km/s of the two-burn transfer at the same times, when flown with three burns */
  lambertDv?: number | null
  note?: string
}

export interface ArpEvaluation {
  order: number[]
  solver: string
  transfer: TransferMode
  legs: ArpTransfer[]
  cost: number
  dv: number
  time: number
}

export interface SolverInfo {
  id: string
  name: string
  default: boolean
  multiRevolution: boolean
  robust: boolean
  note: string
}

/** What a running algorithm tells the page. */
export type RunEvent =
  | { type: 'transfer'; origin: number; target: number; eta: number; tau: number; t: number; z: number; relaxed: boolean }
  | { type: 'evaluation'; index: number; order: number[]; cost: number; dv: number; time: number; times: Array<[number, number]>; complete: boolean; improved: boolean }
  | { type: 'report'; order: number[]; note: string }

/** One evaluated route, as listed and charted. */
export interface EvaluationRow {
  index: number
  order: number[]
  cost: number
  dv: number
  time: number
  times: Array<[number, number]>
  complete: boolean
  improved: boolean
  /** lowest cost of a complete route up to and including this one; null before the first */
  best: number | null
}

/** What solve() handed back, after the runner checked it. */
export interface WorkerResult {
  ok: boolean
  order: number[] | null
  times: Array<[number, number]> | null
  note: string
  error: string | null
  evaluations: number
  transfers: number
}

/** A finished run, in the format the Routing tab exports and imports. */
export interface RunRecord {
  format: 'arp-run'
  version: 1
  created: string
  instance: ArpInstance
  solver: string
  transfer: TransferMode
  algorithm: { name: string; source: string }
  budget: number
  seed: number
  transfers: number
  evaluations: EvaluationRow[]
  result: ArpEvaluation | null
}
