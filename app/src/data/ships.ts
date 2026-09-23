/** Spaceship presets for the mission planner. Numbers are illustrative, not any real vehicle. */
import type { MissionInput, Ship } from '../mission/types'
import type { Scenario } from '../types'
import { PRESETS, presetElements } from './presets'
import { getBody } from './bodies'

export interface ShipPreset {
  id: string
  name: string
  description: string
  ship: Ship
}

export const SHIP_PRESETS: ShipPreset[] = [
  {
    id: 'test', name: 'Test ship (20 km/s)', description: 'A generous tank so every tour is feasible while learning: 5 t dry, 500 t propellant, Isp 450 s.',
    ship: { name: 'Test ship', dryMass: 5000, propellantMass: 500000, isp: 450, maxThrust: 2000000, minBurnSpacing: 60 },
  },
  {
    id: 'chem', name: 'Chemical upper stage', description: '5 t dry, 60 t propellant, Isp 350 s, 100 kN: about 9 km/s.',
    ship: { name: 'Chemical stage', dryMass: 5000, propellantMass: 60000, isp: 350, maxThrust: 100000, minBurnSpacing: 60 },
  },
  {
    id: 'kick', name: 'Small kick stage', description: '0.8 t dry, 4 t propellant, Isp 320 s, 20 kN: about 5.6 km/s.',
    ship: { name: 'Kick stage', dryMass: 800, propellantMass: 4000, isp: 320, maxThrust: 20000, minBurnSpacing: 30 },
  },
]

export const DEFAULT_SHIP: Ship = SHIP_PRESETS[0].ship

/** Total delta-v a ship can deliver, km/s (rocket equation). */
export function shipCapacity(ship: Ship): number {
  return 9.80665e-3 * ship.isp * Math.log((ship.dryMass + ship.propellantMass) / ship.dryMass)
}

/** A mission with no stops yet, starting from an ISS-class parking orbit at the scenario's body. */
export function emptyMission(scenario: Scenario): MissionInput {
  const body = getBody(scenario.bodyId)
  const iss = PRESETS.find((p) => p.id === 'iss') ?? PRESETS[0]
  return { ship: { ...DEFAULT_SHIP }, startT: 0, start: { kind: 'elements', elements: presetElements(iss, body) }, stops: [], departureWindow: 0 }
}
