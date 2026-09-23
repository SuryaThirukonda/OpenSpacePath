/** Calls to the Python planner. Same origin in production; Vite proxies /api in development. */
import { getBody } from '../data/bodies'
import type { Scenario } from '../types'
import type { MissionInput, MissionPlan } from './types'

export class PlanError extends Error {}

function wireSatellite(s: Scenario['satellites'][number]) {
  return s.kind === 'kepler'
    ? { id: s.id, kind: 'kepler', elements: s.elements }
    : { id: s.id, kind: 'tle', line1: s.line1, line2: s.line2 }
}

export async function planMission(scenario: Scenario, mission: MissionInput, signal?: AbortSignal): Promise<MissionPlan> {
  const body = getBody(scenario.bodyId)
  const res = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      body: { id: body.id, mu: body.mu, radius: body.radius },
      epoch: scenario.epoch,
      satellites: scenario.satellites.map(wireSatellite),
      mission,
    }),
  })
  if (!res.ok) {
    const detail = await res.json().then((j: { detail?: unknown }) => j.detail).catch(() => null)
    throw new PlanError(typeof detail === 'string' ? detail : `planner returned HTTP ${res.status}`)
  }
  return (await res.json()) as MissionPlan
}

/** Wakes the function so the first real plan request does not pay the cold start. */
export function warmPlanner(): void {
  fetch('/api/health').catch(() => undefined)
}
