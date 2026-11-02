/** Calls to the Python planner. Same origin in production; Vite proxies /api in development. */
import { getBody } from '../data/bodies'
import type { Scenario } from '../types'
import type { SolverInfo } from '../arp/types'
import { postJson } from './http'
import { DEFAULT_TRANSFER, type MissionInput, type MissionPlan } from './types'

export const DEFAULT_SOLVER = 'izzo2015'

/** What the page shows before the planner has answered, and if it never does: the default alone. */
export const FALLBACK_SOLVERS: SolverInfo[] = [
  { id: 'izzo2015', name: 'Izzo (2015)', default: true, multiRevolution: true, robust: true, note: 'The default. Robust, handles multiple revolutions.' },
]

let solverList: Promise<SolverInfo[]> | null = null

/** The Lambert solvers the planner offers (every one in lamberthub), fetched once. */
export function lambertSolvers(): Promise<SolverInfo[]> {
  solverList ??= fetch('/api/lambert/solvers')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { solvers: SolverInfo[] }) => (Array.isArray(j.solvers) && j.solvers.length > 0 ? j.solvers : FALLBACK_SOLVERS))
    .catch(() => {
      solverList = null // try again next time
      return FALLBACK_SOLVERS
    })
  return solverList
}

function wireSatellite(s: Scenario['satellites'][number]) {
  return s.kind === 'kepler'
    ? { id: s.id, kind: 'kepler', elements: s.elements }
    : { id: s.id, kind: 'tle', line1: s.line1, line2: s.line2 }
}

export function planMission(scenario: Scenario, mission: MissionInput, signal?: AbortSignal): Promise<MissionPlan> {
  const body = getBody(scenario.bodyId)
  return postJson<MissionPlan>('/api/plan', {
    body: { id: body.id, mu: body.mu, radius: body.radius, rotationPeriod: body.rotationPeriod, atmosphere: body.atmosphere !== undefined },
    epoch: scenario.epoch,
    satellites: scenario.satellites.map(wireSatellite),
    mission: { ...mission, solver: scenario.solver ?? DEFAULT_SOLVER, transfer: scenario.transfer ?? DEFAULT_TRANSFER },
  }, signal)
}

/** Wakes the function so the first real plan request does not pay the cold start. */
export function warmPlanner(): void {
  fetch('/api/health').catch(() => undefined)
}
