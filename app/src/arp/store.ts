/**
 * State of the Routing tab: the instance, the algorithm being edited, and the run. Kept apart
 * from the scene's store; a route reaches the scene through loadRoute, as a mission and its plan.
 * The algorithm and the instance are remembered in this browser, never put in a link: a link
 * that carried code would be a way to run code in someone else's browser.
 */
import { create } from 'zustand'
import { DEFAULT_SOLVER } from '../mission/api'
import { DEFAULT_TRANSFER, type MissionInput, type MissionPlan } from '../mission/types'
import { useStore } from '../store/store'
import { ALGORITHM_EDITOR } from './config'
import { PAPER_PRESETS, parseAlgorithm, PRESETS } from './format'
import { generateInstance, instanceToScenario, parseInstance } from './instance'
import { customAsteroid, emptyPath, nextEntry, parsePath, pathFromEvaluation, pathInstance, pathProblems, pathRequest, pathText, withOrbit, type PathEntry, type PathPlan } from './path'
import type { OrbitalElements } from '../types'
import { AlgorithmRunner } from './runner'
import type { ArpEvaluation, ArpInstance, EvaluationRow, RunEvent, RunRecord, WorkerResult } from './types'

export type RunStatus = 'idle' | 'loading' | 'running' | 'done' | 'error' | 'stopped'
export type PathStatus = 'idle' | 'loading' | 'done' | 'error'
export type PathMode = 'form' | 'text'

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
  path: PathPlan
  pathMode?: PathMode
  pathText?: string
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
    const v: Saved = { source: s.source, presetId: s.presetId, budget: s.budget, seed: s.seed, n: s.n, instanceSeed: s.instanceSeed, instance: s.instance,
                       path: s.path, pathMode: s.pathMode, pathText: s.pathText }
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
  /** the path written by hand, and what flying it gave */
  path: PathPlan
  pathStatus: PathStatus
  pathError: string | null
  pathResult: ArpEvaluation | null
  /** Earth and the path's asteroids in visiting order, the instance the path result refers to */
  pathInstance: ArpInstance | null
  /** the path is edited as rows, or as text in the standard format */
  pathMode: PathMode
  pathText: string

  setN: (n: number) => void
  setInstanceSeed: (seed: number) => void
  generate: () => void
  importInstance: (text: string) => string | null
  showInstance: () => void
  /** The Asteroids tab was opened: put its instance in the scene unless it is there already. */
  enterWorld: () => void
  setSource: (source: string) => void
  choosePreset: (id: string) => void
  setBudget: (budget: number) => void
  setSeed: (seed: number) => void
  run: () => void
  stop: () => void
  showRoute: (order: number[], times: Array<[number, number]> | null, label: string, play?: boolean) => Promise<ArpEvaluation | null>
  record: () => RunRecord | null

  setPath: (path: PathPlan) => void
  addEntry: () => void
  updateEntry: (k: number, partial: Partial<PathEntry>) => void
  /** change an entry's orbit or name; an instance asteroid becomes a body of its own when its orbit changes */
  setEntryOrbit: (k: number, elements: Partial<OrbitalElements>, name?: string) => void
  /** make an entry a body of its own with a fresh orbit to edit */
  makeEntryCustom: (k: number) => void
  removeEntry: (k: number) => void
  moveEntry: (k: number, d: number) => void
  /** fill the path from the last algorithm result */
  pathFromResult: () => void
  importPath: (text: string) => string | null
  setPathMode: (mode: PathMode) => void
  setPathText: (text: string) => void
  /** read the text into the path; a sentence says what is wrong when it cannot be */
  applyPathText: () => string | null
  /** fly the path exactly as written and draw it */
  flyPath: () => Promise<void>
}

const runner = new AlgorithmRunner()
let showSeq = 0
/** Counts runs, so a result that arrives after the next run began is dropped. */
let runSeq = 0
let pathSeq = 0
let startedAt = 0

/** The inputs the scene needs to draw a route as a tour: Earth's orbit, then each asteroid in turn. */
export function routeMission(inst: ArpInstance, ev: ArpEvaluation): MissionInput {
  return {
    ship: { name: 'Spacecraft', dryMass: 1000, propellantMass: 0, isp: 300, maxThrust: 1000, minBurnSpacing: 0 },
    startT: 0,
    start: { kind: 'satellite', id: inst.earth.id },
    stops: ev.order.map((k, i) => ({ satelliteId: inst.asteroids[k - 1].id, dwellSeconds: Math.round((ev.legs[i + 1]?.tau ?? 0) * DAY) })),
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

/** The algorithm the tab starts with: what was saved, unless the editor is off and that was not one of the papers'. */
function initialAlgorithm(): { presetId: string; source: string } {
  if (ALGORITHM_EDITOR) return { presetId: saved.presetId ?? firstPreset.id, source: saved.source ?? firstPreset.source }
  const allowed = PAPER_PRESETS.find((p) => p.id === saved.presetId) ?? PAPER_PRESETS[0]
  return { presetId: allowed.id, source: allowed.source }
}
const initial = initialAlgorithm()

export const useArp = create<ArpState>((set, get) => ({
  instance: saved.instance ?? null,
  n: saved.n ?? 8,
  instanceSeed: saved.instanceSeed ?? 42,
  presetId: initial.presetId,
  source: initial.source,
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
  path: saved.path && Array.isArray(saved.path.entries) ? saved.path : emptyPath(),
  pathStatus: 'idle',
  pathError: null,
  pathResult: null,
  pathInstance: null,
  pathMode: saved.pathMode === 'text' ? 'text' : 'form',
  pathText: typeof saved.pathText === 'string' ? saved.pathText : '',

  setN: (n) => { set({ n: Math.min(30, Math.max(2, Math.round(n) || 2)) }); save(get()) },
  setInstanceSeed: (instanceSeed) => { set({ instanceSeed: Math.round(instanceSeed) || 0 }); save(get()) },
  generate: () => {
    get().stop()
    runSeq += 1
    const inst = generateInstance(get().n, get().instanceSeed)
    set({ instance: inst, status: 'idle', message: '', error: null, log: [], evaluations: [], transfers: 0, result: null, resultNote: '', shown: null,
          path: emptyPath(), pathStatus: 'idle', pathError: null, pathResult: null, pathInstance: null, pathText: pathText(inst, emptyPath()) })
    save(get())
    ensureScene(inst, true)
  },
  importInstance: (text) => {
    const inst = parseInstance(text)
    if (typeof inst === 'string') return inst
    get().stop()
    runSeq += 1
    set({ instance: inst, n: inst.asteroids.length, status: 'idle', message: '', error: null, log: [], evaluations: [], transfers: 0, result: null, resultNote: '', shown: null,
          path: emptyPath(), pathStatus: 'idle', pathError: null, pathResult: null, pathInstance: null, pathText: pathText(inst, emptyPath()) })
    save(get())
    ensureScene(inst, true)
    return null
  },
  showInstance: () => {
    const inst = get().instance
    if (inst) ensureScene(inst, true)
  },
  enterWorld: () => {
    const inst = get().instance
    if (inst) ensureScene(inst)
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
    const transfer = useStore.getState().scenario.transfer ?? DEFAULT_TRANSFER
    const id = ++runSeq
    startedAt = performance.now()
    set({ status: 'running', message: `Running ${header.name}`, error: null, log: [], evaluations: [], transfers: 0, result: null, resultNote: '', shown: null, elapsedMs: 0 })

    const onEvents = (events: RunEvent[]) => {
      if (id !== runSeq) return
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
      if (id !== runSeq) return
      const elapsedMs = performance.now() - startedAt
      if (!result.ok || !result.order) {
        set({ status: 'error', error: result.error ?? 'the algorithm failed', message: 'The run stopped with an error.', elapsedMs })
        return
      }
      set({ status: 'done', message: 'Finished. Drawing the route.', resultNote: result.note, transfers: Math.max(get().transfers, result.transfers), elapsedMs })
      void get().showRoute(result.order, result.times, `${header.name}: final route`, true).then((ev) => {
        if (id !== runSeq) return
        if (ev) set({ result: ev, message: 'Finished.' })
        else if (get().status === 'done') set({ status: 'error', error: 'the final route could not be drawn', message: 'The run finished but its route could not be evaluated.' })
      })
    }

    runner.start(source, { instance, solver, transfer, budget, seed }, {
      onLoading: () => { if (id === runSeq) set({ status: 'loading', message: 'Loading Python (about 8 MB, once per visit)…' }) },
      onStarted: () => { if (id === runSeq) { startedAt = performance.now(); set({ status: 'running', message: `Running ${header.name}` }) } },
      onEvents,
      onLog: (lines) => { if (id === runSeq) set({ log: [...get().log, ...lines].slice(-400) }) },
      onDone,
      onFailed: (message) => { if (id === runSeq) set({ status: 'error', error: message, message: 'The runner failed.', elapsedMs: performance.now() - startedAt }) },
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
        body: JSON.stringify({ instance: inst, order, solver: main.scenario.solver ?? DEFAULT_SOLVER, transfer: main.scenario.transfer ?? DEFAULT_TRANSFER, ...(times ? { times } : {}) }),
      })
      if (!res.ok) {
        const detail = await res.json().then((j: { detail?: unknown }) => j.detail).catch(() => null)
        throw new Error(typeof detail === 'string' ? detail : `the planner answered HTTP ${res.status}`)
      }
      const { evaluation, plan } = (await res.json()) as { evaluation: ArpEvaluation; plan: MissionPlan }
      if (seq !== showSeq) return evaluation // a newer route is on its way
      if (useStore.getState().world !== 'asteroids') return evaluation // the user has moved to the satellites; nothing to draw into
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
      transfer: useStore.getState().scenario.transfer ?? DEFAULT_TRANSFER,
      algorithm: { name: parseAlgorithm(s.source).name, source: s.source },
      budget: s.budget, seed: s.seed, transfers: s.transfers, evaluations: s.evaluations, result: s.result,
    }
  },

  setPath: (path) => {
    const inst = get().instance
    set({ path, pathStatus: 'idle', pathError: null, ...(inst ? { pathText: pathText(inst, path) } : {}) })
    save(get())
  },
  addEntry: () => {
    const { instance, path } = get()
    if (!instance) return
    get().setPath({ ...path, entries: [...path.entries, nextEntry(instance, path)] })
  },
  setEntryOrbit: (k, elements, name) => {
    const { instance, path } = get()
    if (!path.entries[k]) return
    get().setPath({ ...path, entries: path.entries.map((e, i) => (i === k ? withOrbit(instance, path, k, elements, name) : e)) })
  },
  makeEntryCustom: (k) => {
    const path = get().path
    if (!path.entries[k]) return
    const body = customAsteroid(path, k + 1)
    get().setPath({ ...path, entries: path.entries.map((e, i) => (i === k ? { ...e, asteroid: { ...body, elements: { ...e.asteroid.elements } } } : e)) })
  },
  updateEntry: (k, partial) => {
    const path = get().path
    get().setPath({ ...path, entries: path.entries.map((e, i) => (i === k ? { ...e, ...partial } : e)) })
  },
  removeEntry: (k) => {
    const path = get().path
    get().setPath({ ...path, entries: path.entries.filter((_, i) => i !== k) })
  },
  moveEntry: (k, d) => {
    const path = get().path
    const j = k + d
    if (j < 0 || j >= path.entries.length) return
    const entries = [...path.entries]
    ;[entries[k], entries[j]] = [entries[j], entries[k]]
    get().setPath({ ...path, entries })
  },
  pathFromResult: () => {
    const { instance, result } = get()
    if (instance && result) get().setPath(pathFromEvaluation(instance, result))
  },
  importPath: (text) => {
    const path = parsePath(text, get().instance)
    if (typeof path === 'string') return path
    get().setPath(path)
    return null
  },
  setPathMode: (pathMode) => {
    const { instance, path } = get()
    set({ pathMode, ...(pathMode === 'text' && instance ? { pathText: pathText(instance, path) } : {}) })
    save(get())
  },
  setPathText: (text) => { set({ pathText: text, pathStatus: 'idle', pathError: null }); save(get()) },
  applyPathText: () => {
    const { instance, pathText: text } = get()
    const path = parsePath(text, instance)
    if (typeof path === 'string') return path
    set({ path, pathStatus: 'idle', pathError: null })
    save(get())
    return null
  },

  flyPath: async () => {
    const { instance, pathMode } = get()
    if (!instance) return
    if (pathMode === 'text') {
      const bad = get().applyPathText()
      if (bad) {
        set({ pathStatus: 'error', pathError: bad })
        return
      }
    }
    const path = get().path
    const problems = pathProblems(path)
    if (problems.length) {
      set({ pathStatus: 'error', pathError: problems.join('\n') })
      return
    }
    const main = useStore.getState()
    const seq = ++pathSeq
    set({ pathStatus: 'loading', pathError: null })
    try {
      const res = await fetch('/api/arp/path', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(pathRequest(instance, path, main.scenario.solver ?? DEFAULT_SOLVER, main.scenario.transfer ?? DEFAULT_TRANSFER)),
      })
      if (!res.ok) {
        const detail = await res.json().then((j: { detail?: unknown }) => j.detail).catch(() => null)
        throw new Error(typeof detail === 'string' ? detail : `the planner answered HTTP ${res.status}`)
      }
      const { evaluation, plan } = (await res.json()) as { evaluation: ArpEvaluation; plan: MissionPlan }
      if (seq !== pathSeq) return
      const pinst = pathInstance(instance, path)
      if (useStore.getState().world !== 'asteroids') {
        set({ pathStatus: 'done', pathResult: evaluation, pathInstance: pinst })
        return
      }
      ensureScene(pinst)
      const now = useStore.getState()
      now.loadRoute(routeMission(pinst, evaluation), plan)
      now.setSpan(plan.totalTime)
      now.setT(0)
      now.setPlaying(true)
      now.setRate(2592000)
      set({ pathStatus: 'done', pathResult: evaluation, pathInstance: pinst, shown: { order: evaluation.order, label: 'your path', cost: evaluation.cost } })
    } catch (e) {
      if (seq === pathSeq) set({ pathStatus: 'error', pathError: (e as Error).message })
    }
  },
}))

/** A path result belongs to the transfer mode and solver it was flown with; a change puts it out of date. */
useStore.subscribe((now, before) => {
  if ((now.scenario.transfer !== before.scenario.transfer || now.scenario.solver !== before.scenario.solver) && useArp.getState().pathStatus === 'done') {
    useArp.setState({ pathStatus: 'idle' })
  }
})

/** Load Python while the visitor is still reading the tab. */
export function prepareRunner(): void {
  runner.prepare()
}
