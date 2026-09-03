/**
 * Single zustand store. React panels dispatch actions; the Three.js SceneManager reads
 * useStore.getState() inside its own animation loop and never goes through React.
 */
import { create } from 'zustand'
import { period, rescaleToBody } from '../core/elements'
import { parseEpoch } from '../core/time'
import { getBody } from '../data/bodies'
import { DEFAULT_EPOCH, PRESETS, satelliteFromPreset } from '../data/presets'
import { satrecFor, sgp4Period } from '../propagation/sgp4Propagator'
import type { Satellite, Scenario } from '../types'

export type CameraRequestKind = 'body' | 'orbit' | 'reset'

export interface AppState {
  scenario: Scenario
  /** Simulated seconds since the scenario epoch. */
  t: number
  playing: boolean
  selectedId: string | null
  showAxes: boolean
  showLabels: boolean
  cameraRequest: { kind: CameraRequestKind; seq: number } | null

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
}

export function defaultScenario(): Scenario {
  const byId = Object.fromEntries(PRESETS.map((p) => [p.id, p]))
  return {
    bodyId: 'earth',
    epoch: DEFAULT_EPOCH,
    satellites: [satelliteFromPreset(byId.iss), satelliteFromPreset(byId.molniya), satelliteFromPreset(byId.geo)],
    spanSeconds: 86400,
    rate: 60,
  }
}

let cameraSeq = 0

export const useStore = create<AppState>((set) => ({
  scenario: defaultScenario(),
  t: 0,
  playing: true,
  selectedId: null,
  showAxes: true,
  showLabels: true,
  cameraRequest: null,

  loadScenario: (sc) => set({ scenario: sc, t: 0, selectedId: sc.satellites[0]?.id ?? null }),
  setBody: (bodyId) =>
    set((s) => {
      const oldR = getBody(s.scenario.bodyId).radius
      const newR = getBody(bodyId).radius
      const satellites = s.scenario.satellites.map((sat) =>
        sat.kind === 'kepler' ? { ...sat, elements: rescaleToBody(sat.elements, oldR, newR) } : sat,
      )
      return { scenario: { ...s.scenario, bodyId, satellites } }
    }),
  setEpoch: (iso) => {
    parseEpoch(iso)
    set((s) => ({ scenario: { ...s.scenario, epoch: iso }, t: 0 }))
  },
  addSatellite: (sat, select = true) =>
    set((s) => ({
      scenario: { ...s.scenario, satellites: [...s.scenario.satellites, sat] },
      selectedId: select ? sat.id : s.selectedId,
    })),
  updateSatellite: (sat) =>
    set((s) => ({
      scenario: { ...s.scenario, satellites: s.scenario.satellites.map((x) => (x.id === sat.id ? sat : x)) },
    })),
  removeSatellite: (id) =>
    set((s) => ({
      scenario: { ...s.scenario, satellites: s.scenario.satellites.filter((x) => x.id !== id) },
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),
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
}))

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
