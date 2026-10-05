/**
 * State of the Routing tab: the instance, the algorithm being edited, and the run. Kept apart
 * from the scene's store; a route reaches the scene through loadRoute, as a mission and its plan.
 * The algorithm and the instance are remembered in this browser, never put in a link: a link
 * that carried code would be a way to run code in someone else's browser.
 */
import { create } from 'zustand'
import { DEFAULT_SOLVER } from '../mission/api'
import type { MissionInput, MissionPlan } from '../mission/types'
import { useStore } from '../store/store'
import { parseAlgorithm, PRESETS } from './format'
import { generateInstance, instanceToScenario, parseInstance } from './instance'
import { AlgorithmRunner } from './runner'
import type { ArpEvaluation, ArpInstance, EvaluationRow, RunEvent, RunRecord, WorkerResult } from './types'

export type RunStatus = 'idle' | 'loading' | 'running' | 'done' | 'error' | 'stopped'

const DAY = 86400
const KEY = 'orbitlab.routing.v1'

interface Saved {
  source: string
  presetId: string
  budget: number
  seed: number
  n: number
  instanceSeed: number
  instance: ArpInstance | null
}

function load(): Partial<Saved> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Partial<Saved>) : {}
  } catch {
    return {}
  }
}

function save(s: ArpState): void {
  try {
    const v: Saved = { source: s.source, presetId: s.presetId, budget: s.budget, seed: s.seed, n: s.n, instanceSeed: s.instanceSeed, instance: s.instance }
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    // storage may be unavailable (private window); the tab works without it
  }
}

export interface ShownRoute {
  order: number[]
  label: string
  cost: number
}

export interface ArpState {
  instance: ArpInstance | null
  n: number
  instanceSeed: number
  presetId: string
  source: string
  budget: number
  seed: number
  status: RunStatus
  message: string
  error: string | null
  log: string[]
  evaluations: EvaluationRow[]
  transfers: number
  result: ArpEvaluation | null
  resultNote: string
  /** the route the scene is showing */
  shown: ShownRoute | null
  elapsedMs: number

  setN: (n: number) => void
  setInstanceSeed: (seed: number) => void
  generate: () => void
  importInstance: (text: string) => string | null
  showInstance: () => void
  setSource: (source: string) => void
  choosePreset: (id: string) => void
  setBudget: (budget: number) => void
  setSeed: (seed: number) => void
  run: () => void
  stop: () => void
  showRoute: (order: number[], times: Array<[number, number]> | null, label: string, play?: boolean) => Promise<ArpEvaluation | null>
  record: () => RunRecord | null
}

const runner = new AlgorithmRunner()
let showSeq = 0
let startedAt = 0

/** The inputs the scene needs to draw a route as a tour: Earth's orbit, then each asteroid in turn. */
export function routeMission(inst: ArpInstance, ev: ArpEvaluation): MissionInput {
  return {
    ship: { name: 'Spacecraft', dryMass: 1000, propellantMass: 0, isp: 300, maxThrust: 1000, minBurnSpacing: 0 },
    startT: 0,
    start: { kind: 'satellite', id: inst.earth.id },
    stops: ev.order.map((k, i) => ({ satelliteId: inst.asteroids[k - 1].id, dwellSeconds: Math.round((ev.legs[i + 1]?.tau ?? 0) * DAY), strategy: 'lambert2' })),
    departureWindow: 0,
  }
}

/** Put the instance's Sun-centred scene up unless it is already there. */
function ensureScene(inst: ArpInstance, force = false): void {
  const main = useStore.getState()
  const ids = new Set(main.scenario.satellites.map((s) => s.id))
  const present = main.scenario.bodyId === 'sun' && ids.has(inst.earth.id) && inst.asteroids.every((a) => ids.has(a.id))
  if (present && !force) return
  main.loadScenario(instanceToScenario(inst, main.scenario.solver))
  main.select(null)
  main.setPlaying(false)
  main.setCameraMode('free')
  main.requestCamera('all')
}

const saved = load()
const firstPreset = PRESETS[0]

export const useArp = create<ArpState>((set, get) => ({
  instance: saved.instance ?? null,
  n: saved.n ?? 8,
  instanceSeed: saved.instanceSeed ?? 42,
  presetId: saved.presetId ?? firstPreset.id,
  source: saved.source ?? firstPreset.source,
  budget: saved.budget ?? 40,
  seed: saved.seed ?? 1,
  status: 'idle',
  message: '',
  error: null,
  log: [],
  evaluations: [],
  transfers: 0,
  result: null,
  resultNote: '',
  shown: null,
  elapsedMs: 0,

  setN: (n) => { set({ n: Math.min(30, Math.max(2, Math.round(n) || 2)) }); save(get()) },
  setInstanceSeed: (instanceSeed) => { set({ instanceSeed: Math.round(instanceSeed) || 0 }); save(get()) },
  generate: () => {
    get().stop()
    const inst = generateInstance(get().n, get().instanceSeed)
    set({ instance: inst, status: 'idle', message: '', error: null, log: [], evaluations: [], transfers: 0, result: null, resultNote: '', shown: null })
    save(get())
    ensureScene(inst, true)
  },
  importInstance: (text) => {
    const inst = parseInstance(text)
    if (typeof inst === 'string') return inst
    get().stop()
    set({ instance: inst, n: inst.asteroids.length, status: 'idle', message: '', error: null, log: [], evaluations: [], transfers: 0, result: null, resultNote: '', shown: null })
    save(get())
    ensureScene(inst, true)
    return null
  },
  showInstance: () => {
    const inst = get().instance
    if (inst) ensureScene(inst, true)
  },
  setSource: (source) => { set({ source, presetId: PRESETS.find((p) => p.source === source)?.id ?? 'custom' }); save(get()) },
  choosePreset: (id) => {
    const p = PRESETS.find((x) => x.id === id)
    if (p) set({ presetId: id, source: p.source })
    save(get())
  },
  setBudget: (budget) => { set({ budget: Math.min(2000, Math.max(1, Math.round(budget) || 1)) }); save(get()) },
  setSeed: (seed) => { set({ seed: Math.round(seed) || 0 }); save(get()) },

  run: () => {
    const { instance, source, budget, seed } = get()
    if (!instance) return
    const header = parseAlgorithm(source)
    if (!header.ok) {
      set({ status: 'error', error: header.errors.join('\n'), message: 'The algorithm is not in the standard format.' })
      return
    }
    ensureScene(instance)
    const solver = useStore.getState().scenario.solver ?? DEFAULT_SOLVER
    startedAt = performance.now()
    set({ status: 'running', message: `Running ${header.name}`, error: null, log: [], evaluations: [], transfers: 0, result: null, resultNote: '', shown: null, elapsedMs: 0 })

    const onEvents = (events: RunEvent[]) => {
      const rows = [...get().evaluations]
      let transfers = get().transfers
      let best = rows.length ? rows[rows.length - 1].best : null
      let show: { order: number[]; times: Array<[number, number]> | null; label: string } | null = null
      for (const ev of events) {
        if (ev.type === 'transfer') transfers += 1
        else if (ev.type === 'evaluation') {
          if (ev.complete && (best === null || ev.cost < best)) best = ev.cost
          rows.push({ index: ev.index, order: ev.order, cost: ev.cost, dv: ev.dv, time: ev.time, times: ev.times, complete: ev.complete, improved: ev.improved, best })
          if (ev.improved) show = { order: ev.order, times: ev.times, label: `best so far, evaluation ${ev.index}` }
        } else if (ev.type === 'report') {
          if (!show || !show.label.startsWith('best')) show = { order: ev.order, times: null, label: ev.note || `route of ${ev.order.length}` }
        }
      }
      set({ evaluations: rows, transfers, elapsedMs: performance.now() - startedAt })
      if (show) void get().showRoute(show.order, show.times, show.label)
    }

    const onDone = (result: WorkerResult) => {
      const elapsedMs = performance.now() - startedAt
      if (!result.ok || !result.order) {
        set({ status: 'error', error: result.error ?? 'the algorithm failed', message: 'The run stopped with an error.', elapsedMs })
        return
      }
      set({ status: 'done', message: 'Finished. Drawing the route.', resultNote: result.note, transfers: Math.max(get().transfers, result.transfers), elapsedMs })
      void get().showRoute(result.order, result.times, `${header.name}: final route`, true).then((ev) => {
        if (ev) set({ result: ev, message: 'Finished.' })
        else if (get().status === 'done') set({ status: 'error', error: 'the final route could not be drawn', message: 'The run finished but its route could not be evaluated.' })
      })
    }

    runner.start(source, { instance, solver, budget, seed }, {
      onLoading: () => set({ status: 'loading', message: 'Loading Python (about 8 MB, once per visit)…' }),
      onStarted: () => { startedAt = performance.now(); set({ status: 'running', message: `Running ${header.name}` }) },
      onEvents,
      onLog: (lines) => set({ log: [...get().log, ...lines].slice(-400) }),
      onDone,
      onFailed: (message) => set({ status: 'error', error: message, message: 'The runner failed.', elapsedMs: performance.now() - startedAt }),
    })
  },

  stop: () => {
    if (!runner.running) return
    runner.stop()
    set({ status: 'stopped', message: 'Stopped. The routes evaluated so far are kept.', elapsedMs: performance.now() - startedAt })
  },

  showRoute: async (order, times, label, play = false) => {
    const inst = get().instance
    if (!inst || order.length === 0) return null
    const seq = ++showSeq
    const main = useStore.getState()
    try {
      const res = await fetch('/api/arp/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instance: inst, order, solver: main.scenario.solver ?? DEFAULT_SOLVER, ...(times ? { times } : {}) }),
      })
      if (!res.ok) {
        const detail = await res.json().then((j: { detail?: unknown }) => j.detail).catch(() => null)
        throw new Error(typeof detail === 'string' ? detail : `the planner answered HTTP ${res.status}`)
      }
      const { evaluation, plan } = (await res.json()) as { evaluation: ArpEvaluation; plan: MissionPlan }
      if (seq !== showSeq) return evaluation // a newer route is on its way
      ensureScene(inst)
      const now = useStore.getState()
      now.loadRoute(routeMission(inst, evaluation), plan)
      now.setSpan(plan.totalTime)
      now.setT(play ? 0 : evaluation.time * DAY)
      now.setPlaying(play)
      if (play) now.setRate(2592000)
      set({ shown: { order, label, cost: evaluation.cost } })
      return evaluation
    } catch (e) {
      if (seq === showSeq) set({ error: (e as Error).message })
      return null
    }
  },

  record: () => {
    const s = get()
    if (!s.instance) return null
    return {
      format: 'arp-run', version: 1, created: new Date().toISOString(), instance: s.instance,
      solver: useStore.getState().scenario.solver ?? DEFAULT_SOLVER,
      algorithm: { name: parseAlgorithm(s.source).name, source: s.source },
      budget: s.budget, seed: s.seed, transfers: s.transfers, evaluations: s.evaluations, result: s.result,
    }
  },
}))

/** Load Python while the visitor is still reading the tab. */
export function prepareRunner(): void {
  runner.prepare()
}
