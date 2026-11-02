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
import { planStart, type MissionInput, type MissionPlan, type TransferMode } from '../mission/types'
import type { Satellite, Scenario } from '../types'

export type CameraRequestKind = 'body' | 'orbit' | 'reset' | 'ship' | 'all'

/** free: the user steers. follow: the camera travels with the ship. chase: third person behind it. birdseye: fixed, above the current route. */
export type CameraMode = 'free' | 'follow' | 'chase' | 'birdseye'

export type PlanStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * The scene shows one of two worlds: the satellites around a body (the Satellites and Mission
 * tabs) or the asteroids around the Sun (the Asteroids tab). Each keeps its own scenario, plan
 * and clock; switching tabs switches worlds and the other one waits in `stashed`.
 */
export type World = 'satellites' | 'asteroids'

/** The left panel's tabs. Satellites and Mission show the satellites world, Asteroids the asteroids world. */
export type LeftTab = 'satellites' | 'mission' | 'asteroids'

export interface WorldStash {
  scenario: Scenario
  t: number
  playing: boolean
  selectedId: string | null
  plan: MissionPlan | null
  planStatus: PlanStatus
  planError: string | null
  selectedLeg: number | null
  cameraMode: CameraMode
}

export interface AppState {
  scenario: Scenario
  world: World
  stashed: Partial<Record<World, WorldStash>>
  /** Which left tab is open; kept here so collapsing the panel or reloading cannot lose it. */
  leftTab: LeftTab
  /** Simulated seconds since the scenario epoch. */
  t: number
  playing: boolean
  selectedId: string | null
  showAxes: boolean
  showLabels: boolean
  /** keepMode: the request comes with a world switch and must not cancel the camera mode the world comes back with */
  cameraRequest: { kind: CameraRequestKind; seq: number; keepMode?: boolean } | null

  /** The planner's last answer for scenario.mission, or null when inputs changed since. */
  plan: MissionPlan | null
  planStatus: PlanStatus
  planError: string | null
  /** a plan was shown and an edit has put it out of date */
  planStale: boolean
  cameraMode: CameraMode
  showRemaining: boolean
  showBurnLabels: boolean
  selectedLeg: number | null

  loadScenario: (sc: Scenario) => void
  /** Show the other world: the current one is stashed, the other restored (or started empty). */
  switchWorld: (world: World) => void
  /** Open a left tab, switching worlds when the tab belongs to the other one. */
  setLeftTab: (tab: LeftTab) => void
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
  /** The Lambert solver for every transfer; changing it drops the current plan. */
  setSolver: (solver: string) => void
  /** Two or three burns per transfer; changing it drops the current plan. */
  setTransfer: (transfer: TransferMode) => void
  /** Show a route computed elsewhere (the Routing tab): its mission inputs and its plan together. */
  loadRoute: (mission: MissionInput, plan: MissionPlan) => void
  requestPlan: () => Promise<void>
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
let planAbort: AbortController | null = null

/**
 * Store fields that reset whenever the scenario's physics changes under a plan. Any request in
 * flight is for the old inputs, so it is cancelled and its answer will be ignored.
 */
function invalidPlan() {
  planSeq++
  planAbort?.abort()
  planAbort = null
  const stale = useStore.getState().plan !== null || useStore.getState().planStale
  return { plan: null, planStatus: 'idle' as PlanStatus, planError: null, selectedLeg: null, planStale: stale }
}

/** The asteroid world before anything is generated: the Sun alone, at the papers' epoch. */
function emptyAsteroidScenario(shared: { solver?: string; transfer?: Scenario['transfer'] }): Scenario {
  return { bodyId: 'sun', epoch: '2121-01-01T00:00:00Z', satellites: [], spanSeconds: 8 * 365.25 * 86400, rate: 2592000, ...shared }
}

export const useStore = create<AppState>((set) => ({
  scenario: defaultScenario(),
  world: 'satellites',
  stashed: {},
  leftTab: 'satellites',
  t: 0,
  playing: true,
  selectedId: null,
  showAxes: true,
  showLabels: true,
  cameraRequest: null,
  plan: null,
  planStatus: 'idle',
  planError: null,
  planStale: false,
  cameraMode: 'follow',
  showRemaining: true,
  showBurnLabels: true,
  selectedLeg: null,

  loadScenario: (sc) => set({ scenario: sc, t: 0, selectedId: sc.satellites[0]?.id ?? null, plan: null, planStatus: 'idle', planError: null, planStale: false }),
  switchWorld: (world) =>
    set((s) => {
      if (s.world === world) return {}
      // a planner request still in flight belongs to the world being left: it is cancelled, and the
      // world is stashed as if it had never been asked, so its Plan button works on return
      const loading = s.planStatus === 'loading'
      invalidPlan()
      const stash: WorldStash = { scenario: s.scenario, t: s.t, playing: s.playing, selectedId: s.selectedId, plan: s.plan,
                                  planStatus: loading ? 'idle' : s.planStatus, planError: s.planError, selectedLeg: s.selectedLeg, cameraMode: s.cameraMode }
      const kept = s.stashed[world]
      // the transfer and solver choices are the user's, not a world's: they travel across, and a
      // plan made with other choices is out of date
      const shared = { solver: s.scenario.solver, transfer: s.scenario.transfer }
      const stale = kept !== undefined && (kept.scenario.solver !== shared.solver || kept.scenario.transfer !== shared.transfer)
      const next: WorldStash = kept
        ? { ...kept, scenario: { ...kept.scenario, ...shared }, ...(stale ? { plan: null, planStatus: 'idle', planError: null, selectedLeg: null } : {}) }
        : { scenario: world === 'asteroids' ? emptyAsteroidScenario(shared) : { ...defaultScenario(), ...shared }, t: 0, playing: false, selectedId: null,
            plan: null, planStatus: 'idle', planError: null, selectedLeg: null, cameraMode: 'free' }
      if (!next.plan && (next.cameraMode === 'chase' || next.cameraMode === 'birdseye')) next.cameraMode = 'free'
      return { ...next, planStale: false, world, stashed: { ...s.stashed, [s.world]: stash }, cameraRequest: { kind: world === 'asteroids' ? 'all' : 'reset', seq: ++cameraSeq, keepMode: true } }
    }),
  setLeftTab: (tab) => {
    useStore.getState().switchWorld(tab === 'asteroids' ? 'asteroids' : 'satellites')
    set({ leftTab: tab })
  },
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
      return { scenario: { ...s.scenario, bodyId, satellites }, ...invalidPlan() }
    }),
  setEpoch: (iso) => {
    parseEpoch(iso)
    set((s) => ({ scenario: { ...s.scenario, epoch: iso }, t: 0, ...invalidPlan() }))
  },
  addSatellite: (sat, select = true) =>
    set((s) => ({
      scenario: { ...s.scenario, satellites: [...s.scenario.satellites, sat] },
      selectedId: select ? sat.id : s.selectedId,
    })),
  updateSatellite: (sat) =>
    set((s) => ({
      scenario: { ...s.scenario, satellites: s.scenario.satellites.map((x) => (x.id === sat.id ? sat : x)) },
      ...invalidPlan(),
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
        ...invalidPlan(),
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

  setMission: (mission) => set((s) => ({ scenario: { ...s.scenario, mission: mission ?? undefined }, ...invalidPlan() })),
  setSolver: (solver) => set((s) => ({ scenario: { ...s.scenario, solver }, ...invalidPlan() })),
  setTransfer: (transfer) => set((s) => ({ scenario: { ...s.scenario, transfer }, ...invalidPlan() })),
  loadRoute: (mission, plan) => {
    invalidPlan() // a planner request still in flight must not overwrite this
    set((s) => ({ scenario: { ...s.scenario, mission }, plan, planStatus: 'ready', planError: null, selectedLeg: null, planStale: false }))
  },
  requestPlan: async () => {
    const s = useStore.getState()
    const mission = s.scenario.mission
    if (!mission || mission.stops.length === 0) {
      set({ plan: null, planStatus: 'idle', planError: null })
      return
    }
    invalidPlan() // a request already in flight is for older inputs
    const seq = planSeq
    const abort = new AbortController()
    planAbort = abort
    set({ planStatus: 'loading', planError: null })
    try {
      const plan = await planMission(s.scenario, mission, abort.signal)
      if (seq !== planSeq) return // a newer request, or an edit, superseded this one
      // a timeline shorter than the tour would wrap the clock, and the ship, back to the start mid-flight
      const end = planStart(plan, mission.startT) + plan.totalTime
      set((st) => ({ plan, planStatus: 'ready', planError: null, selectedLeg: null, planStale: false,
                     scenario: st.scenario.spanSeconds < end ? { ...st.scenario, spanSeconds: end } : st.scenario }))
    } catch (e) {
      if (seq !== planSeq) return
      set({ plan: null, planStatus: 'error', planError: (e as Error).message })
    }
  },
  setCameraMode: (cameraMode) => set({ cameraMode }),
  toggleRemaining: () => set((s) => ({ showRemaining: !s.showRemaining })),
  toggleBurnLabels: () => set((s) => ({ showBurnLabels: !s.showBurnLabels })),
  selectLeg: (leg) => set({ selectedLeg: leg }),
}))

/** How many satellites and stops the satellites world holds, whichever world is shown. */
export function satellitesWorldCounts(s: AppState): { satellites: number; stops: number } {
  const sc = s.world === 'satellites' ? s.scenario : s.stashed.satellites?.scenario
  return { satellites: sc?.satellites.length ?? 0, stops: sc?.mission?.stops.length ?? 0 }
}

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
