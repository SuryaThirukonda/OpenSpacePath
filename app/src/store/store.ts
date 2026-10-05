/**
 * Single zustand store. React panels dispatch actions; the Three.js SceneManager reads
 * useStore.getState() inside its own animation loop and never goes through React.
 */
import { create } from 'zustand'
import { altitudeFactor, period, rescaleToBody } from '../core/elements'
import { parseEpoch } from '../core/time'
import { getBody } from '../data/bodies'
import { DEFAULT_EPOCH, PRESETS, satelliteFromPreset } from '../data/presets'
import { emptyMission } from '../data/ships'
import { satrecFor, sgp4Period } from '../propagation/sgp4Propagator'
import { planMission } from '../mission/api'
import type { MissionInput, MissionPlan } from '../mission/types'
import type { Satellite, Scenario } from '../types'

export type CameraRequestKind = 'body' | 'orbit' | 'reset' | 'ship'

/** free: the user steers. follow: the camera travels with the ship. chase: third person behind it. birdseye: fixed, above the current route. */
export type CameraMode = 'free' | 'follow' | 'chase' | 'birdseye'

export type PlanStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface AppState {
  scenario: Scenario
  /** Simulated seconds since the scenario epoch. */
  t: number
  playing: boolean
  selectedId: string | null
  showAxes: boolean
  showLabels: boolean
  cameraRequest: { kind: CameraRequestKind; seq: number } | null

  /** The planner's last answer for scenario.mission, or null when inputs changed since. */
  plan: MissionPlan | null
  planStatus: PlanStatus
  planError: string | null
  cameraMode: CameraMode
  showRemaining: boolean
  showBurnLabels: boolean
  selectedLeg: number | null

  loadScenario: (sc: Scenario) => void
  setBody: (bodyId: string) => void
  setEpoch: (iso: string) => void
  addSatellite: (s: Satellite, select?: boolean) => void
  updateSatellite: (s: Satellite) => void
  removeSatellite: (id: string) => void
  select: (id: string | null) => void
  setT: (t: number) => void
  setPlaying: (p: boolean) => void
  togglePlaying: () => void
  setRate: (rate: number) => void
  setSpan: (seconds: number) => void
  requestCamera: (kind: CameraRequestKind) => void
  toggleAxes: () => void
  toggleLabels: () => void

  setMission: (mission: MissionInput | null) => void
  requestPlan: () => Promise<void>
  clearPlan: () => void
  setCameraMode: (mode: CameraMode) => void
  toggleRemaining: () => void
  toggleBurnLabels: () => void
  selectLeg: (leg: number | null) => void
}

export function defaultScenario(): Scenario {
  const byId = Object.fromEntries(PRESETS.map((p) => [p.id, p]))
  const earth = getBody('earth')
  return {
    bodyId: 'earth',
    epoch: DEFAULT_EPOCH,
    satellites: [
      satelliteFromPreset(byId.iss, earth), satelliteFromPreset(byId.molniya, earth), satelliteFromPreset(byId.sync, earth),
    ],
    spanSeconds: 86400,
    rate: 60,
  }
}

let cameraSeq = 0
let planSeq = 0

export const useStore = create<AppState>((set) => ({
  scenario: defaultScenario(),
  t: 0,
  playing: true,
  selectedId: null,
  showAxes: true,
  showLabels: true,
  cameraRequest: null,
  plan: null,
  planStatus: 'idle',
  planError: null,
  cameraMode: 'follow',
  showRemaining: true,
  showBurnLabels: true,
  selectedLeg: null,

  loadScenario: (sc) => set({ scenario: sc, t: 0, selectedId: sc.satellites[0]?.id ?? null, plan: null, planStatus: 'idle', planError: null }),
  setBody: (bodyId) =>
    set((s) => {
      const oldBody = getBody(s.scenario.bodyId)
      const newBody = getBody(bodyId)
      const factor = altitudeFactor(oldBody, newBody)
      const satellites = s.scenario.satellites.map((sat) =>
        sat.kind === 'kepler'
          ? { ...sat, elements: rescaleToBody(sat.elements, oldBody.radius, newBody.radius, factor) }
          : sat,
      )
      return { scenario: { ...s.scenario, bodyId, satellites }, ...invalidPlan }
    }),
  setEpoch: (iso) => {
    parseEpoch(iso)
    set((s) => ({ scenario: { ...s.scenario, epoch: iso }, t: 0, ...invalidPlan }))
  },
  addSatellite: (sat, select = true) =>
    set((s) => ({
      scenario: { ...s.scenario, satellites: [...s.scenario.satellites, sat] },
      selectedId: select ? sat.id : s.selectedId,
    })),
  updateSatellite: (sat) =>
    set((s) => ({
      scenario: { ...s.scenario, satellites: s.scenario.satellites.map((x) => (x.id === sat.id ? sat : x)) },
      ...invalidPlan,
    })),
  removeSatellite: (id) =>
    set((s) => {
      const satellites = s.scenario.satellites.filter((x) => x.id !== id)
      let mission = s.scenario.mission
      if (mission) {
        const stops = mission.stops.filter((st) => st.satelliteId !== id)
        const start = mission.start.kind === 'satellite' && mission.start.id === id
          ? emptyMission({ ...s.scenario, satellites }).start
          : mission.start
        mission = { ...mission, stops, start }
      }
      return {
        scenario: { ...s.scenario, satellites, mission },
        selectedId: s.selectedId === id ? null : s.selectedId,
        ...invalidPlan,
      }
    }),
  select: (id) => set({ selectedId: id }),
  setT: (t) => set({ t }),
  setPlaying: (playing) => set({ playing }),
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setRate: (rate) => set((s) => ({ scenario: { ...s.scenario, rate } })),
  setSpan: (spanSeconds) =>
    set((s) => ({ scenario: { ...s.scenario, spanSeconds }, t: Math.min(s.t, spanSeconds) })),
  requestCamera: (kind) => set({ cameraRequest: { kind, seq: ++cameraSeq } }),
  toggleAxes: () => set((s) => ({ showAxes: !s.showAxes })),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),

  setMission: (mission) => set((s) => ({ scenario: { ...s.scenario, mission: mission ?? undefined }, ...invalidPlan })),
  requestPlan: async () => {
    const s = useStore.getState()
    const mission = s.scenario.mission
    if (!mission || mission.stops.length === 0) {
      set({ plan: null, planStatus: 'idle', planError: null })
      return
    }
    const seq = ++planSeq
    set({ planStatus: 'loading', planError: null })
    try {
      const plan = await planMission(s.scenario, mission)
      if (seq !== planSeq) return // a newer request superseded this one
      set({ plan, planStatus: 'ready', planError: null, selectedLeg: null })
    } catch (e) {
      if (seq !== planSeq) return
      set({ plan: null, planStatus: 'error', planError: (e as Error).message })
    }
  },
  clearPlan: () => set({ ...invalidPlan }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  toggleRemaining: () => set((s) => ({ showRemaining: !s.showRemaining })),
  toggleBurnLabels: () => set((s) => ({ showBurnLabels: !s.showBurnLabels })),
  selectLeg: (leg) => set({ selectedLeg: leg }),
}))

/** Store fields that reset whenever the scenario's physics changes under a plan. */
const invalidPlan = { plan: null, planStatus: 'idle' as PlanStatus, planError: null, selectedLeg: null }

/** Orbital period of a satellite in seconds, or null if it cannot be propagated. */
export function satellitePeriod(sat: Satellite, bodyId: string): number | null {
  if (sat.kind === 'kepler') return period(sat.elements.a, getBody(bodyId).mu)
  const rec = satrecFor(sat)
  return rec ? sgp4Period(rec) : null
}

/** TLE satellites only make sense around Earth (SGP4 is an Earth model). */
export function isRenderable(sat: Satellite, bodyId: string): boolean {
  return sat.kind === 'kepler' || bodyId === 'earth'
}

export function selectedSatellite(s: AppState): Satellite | null {
  return s.scenario.satellites.find((x) => x.id === s.selectedId) ?? null
}

export function epochMs(s: AppState): number {
  return parseEpoch(s.scenario.epoch)
}
