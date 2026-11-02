/**
 * State of the Routing tab: the instance, the algorithm being edited, and the run. Kept apart
 * from the scene's store; a route reaches the scene through loadRoute, as a mission and its plan.
 * The algorithm and the instance are remembered in this browser, never put in a link: a link
 * that carried code would be a way to run code in someone else's browser.
 */
import { create } from 'zustand'
import { DEFAULT_SOLVER } from '../mission/api'
import { postJson } from '../mission/http'
import { DEFAULT_TRANSFER, type MissionInput, type MissionPlan } from '../mission/types'
import { useStore } from '../store/store'
import { parseAlgorithm, PRESETS } from './format'
import { fetchPaperInstance, generateInstance, instanceToScenario, parseInstance } from './instance'
import { customAsteroid, defaultSchedule, emptyPath, nextEntry, parsePath, pathFromEvaluation, pathInstance, pathProblems, pathRequest, pathText, syncInstance, withOrbit, type PathEntry, type PathPlan } from './path'
import type { OrbitalElements, Scenario } from '../types'
import type { InstanceMeta } from '../url/urlState'
import { AlgorithmRunner } from './runner'
import type { ArpEvaluation, ArpInstance, EvaluationRow, RunEvent, RunRecord, WorkerResult } from './types'

export type RunStatus = 'idle' | 'loading' | 'running' | 'done' | 'error' | 'stopped'
export type PathStatus = 'idle' | 'loading' | 'done' | 'error'
export type PathMode = 'form' | 'text'
/** The Asteroids tab's two halves: write and fly a path, or run an algorithm. */
export type ArpView = 'path' | 'run'
/** Where Generate takes its asteroids from: the papers' GTOC11 catalogue, or a synthetic belt. */
export type InstanceSource = 'catalogue' | 'synthetic'

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
  instanceSource?: InstanceSource
  view?: ArpView
}

function load(): Partial<Saved> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Partial<Saved>) : {}
  } catch {
    return {}
  }
}

/** A saved instance only if it still reads as one; storage is editable and older builds wrote other shapes. */
function savedInstance(x: unknown): ArpInstance | null {
  if (!x || typeof x !== 'object') return null
  const inst = parseInstance(JSON.stringify(x))
  return typeof inst === 'string' ? null : inst
}

/** A saved path, keeping only the entries that are whole: an asteroid with six numeric elements, an arrival and a stay. */
function savedPath(x: unknown): PathPlan {
  if (!x || typeof x !== 'object') return emptyPath()
  const o = x as { departure?: unknown; entries?: unknown }
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const entries = (Array.isArray(o.entries) ? o.entries : []).filter((e: unknown): e is PathEntry => {
    const p = e as Partial<PathEntry> | null
    const el = p?.asteroid?.elements as Record<string, unknown> | undefined
    return !!p && typeof p.asteroid?.id === 'string' && typeof p.asteroid?.name === 'string' && !!el
      && ['a', 'e', 'i', 'raan', 'argp', 'M0'].every((k) => num(el[k])) && num(p.arrival) && num(p.delay)
  })
  return { departure: num(o.departure) && o.departure >= 0 ? o.departure : 0, entries }
}

function save(s: ArpState): void {
  try {
    const v: Saved = { source: s.source, presetId: s.presetId, budget: s.budget, seed: s.seed, n: s.n, instanceSeed: s.instanceSeed, instance: s.instance,
                       path: s.path, pathMode: s.pathMode, pathText: s.pathText, instanceSource: s.instanceSource, view: s.view }
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
  instanceSource: InstanceSource
  /** a catalogue instance is being fetched */
  generating: boolean
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
  view: ArpView

  setView: (view: ArpView) => void

  setN: (n: number) => void
  setInstanceSeed: (seed: number) => void
  setInstanceSource: (source: InstanceSource) => void
  generate: () => void
  importInstance: (text: string) => string | null
  showInstance: () => void
  /** The Asteroids tab was opened: put its instance in the scene unless it is there already. */
  enterWorld: () => void
  /** A shared link opened the asteroid world: take its bodies as the instance unless they are the current one's. */
  adoptShared: (scenario: Scenario, meta?: InstanceMeta) => void
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
/** Counts requests that draw into the scene (routes of a run, a flown path): only the newest may draw. */
let sceneSeq = 0
/** Counts runs, so a result that arrives after the next run began is dropped. */
let runSeq = 0
/** Counts instance changes, so a catalogue answer that arrives after an import or another Generate is dropped. */
let generateSeq = 0

/** Take an instance as the current one: every asteroid into the path with the default schedule, results cleared, scene rebuilt. */
function adopt(inst: ArpInstance, n?: number): void {
  const s = useArp.getState()
  s.stop()
  runSeq += 1
  const path = defaultSchedule(inst.asteroids)   // every asteroid, with its orbit, in the path to tweak
  sceneSeq++                                      // routes still being drawn belong to the old instance
  useArp.setState({ instance: inst, ...(n ? { n } : {}), status: 'idle', message: '', error: null, log: [], evaluations: [], transfers: 0, result: null, resultNote: '', shown: null,
                    path, pathStatus: 'idle', pathError: null, pathResult: null, pathInstance: null, pathText: pathText(inst, path) })
  save(useArp.getState())
  ensureScene(inst, true)
}
let textTimer: number | undefined
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

/**
 * Put the instance's Sun-centred scene up unless it is already there. Only while the asteroids
 * world is shown: an answer that arrives after the user went back to the satellites must not
 * replace their scene; the Asteroids tab rebuilds it when it is opened again.
 */
function ensureScene(inst: ArpInstance, force = false): void {
  const main = useStore.getState()
  if (main.world !== 'asteroids') return
  const ids = new Set(main.scenario.satellites.map((s) => s.id))
  const present = main.scenario.bodyId === 'sun' && ids.has(inst.earth.id) && inst.asteroids.every((a) => ids.has(a.id))
  if (present && !force) return
  main.loadScenario(instanceToScenario(inst, main.scenario.solver, main.scenario.transfer))
  main.select(null)
  main.setPlaying(false)
  main.setCameraMode('free')
  main.requestCamera('all')
}

const saved = load()
const firstPreset = PRESETS[0]

/** The algorithm the tab starts with: what was being edited last time, else the first paper's first. */
const initial = { presetId: saved.presetId ?? firstPreset.id, source: saved.source ?? firstPreset.source }

export const useArp = create<ArpState>((set, get) => ({
  instance: savedInstance(saved.instance),
  n: saved.n ?? 8,
  instanceSeed: saved.instanceSeed ?? 42,
  instanceSource: saved.instanceSource === 'synthetic' ? 'synthetic' : 'catalogue',
  generating: false,
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
  path: savedPath(saved.path),
  pathStatus: 'idle',
  pathError: null,
  pathResult: null,
  pathInstance: null,
  pathMode: saved.pathMode === 'text' ? 'text' : 'form',
  pathText: typeof saved.pathText === 'string' ? saved.pathText : '',
  view: saved.view === 'run' ? 'run' : 'path',

  setView: (view) => { set({ view }); save(get()) },

  setN: (n) => { set({ n: Math.min(30, Math.max(2, Math.round(n) || 2)) }); save(get()) },
  setInstanceSeed: (instanceSeed) => { set({ instanceSeed: Math.round(instanceSeed) || 0 }); save(get()) },
  setInstanceSource: (instanceSource) => { set({ instanceSource }); save(get()) },
  generate: () => {
    const { n, instanceSeed, instanceSource } = get()
    if (instanceSource === 'synthetic') {
      generateSeq++
      set({ generating: false })
      adopt(generateInstance(n, instanceSeed))
      return
    }
    const seq = ++generateSeq
    set({ generating: true, error: null })
    fetchPaperInstance(n, instanceSeed).then(
      (inst) => { if (seq === generateSeq) { set({ generating: false }); adopt(inst) } },
      (e: Error) => { if (seq === generateSeq) set({ generating: false, status: 'error', error: `Could not fetch instance ${n}_${instanceSeed}: ${e.message}` }) },
    )
  },
  importInstance: (text) => {
    const inst = parseInstance(text)
    if (typeof inst === 'string') return inst
    generateSeq++   // a catalogue fetch still in flight must not replace what was just opened
    set({ generating: false })
    adopt(inst, inst.asteroids.length)
    return null
  },
  showInstance: () => {
    const inst = get().instance
    if (inst) ensureScene(inst, true)
  },
  enterWorld: () => {
    const inst = get().instance
    if (inst) ensureScene(inst)
    runner.prepare()   // load Python while the tab is being read, so Run starts at once
  },
  adoptShared: (scenario, meta) => {
    const sats = scenario.satellites.filter((s) => s.kind === 'kepler')
    const earthSat = sats.find((s) => s.shape === 'planet')
    const rocks = sats.filter((s) => s !== earthSat)
    if (!earthSat || earthSat.kind !== 'kepler' || rocks.length === 0) return
    const current = get().instance
    const same = current && current.earth.id === earthSat.id && current.asteroids.length === rocks.length
      && rocks.every((r, k) => r.kind === 'kepler' && current.asteroids[k].id === r.id && JSON.stringify(current.asteroids[k].elements) === JSON.stringify(r.elements))
    if (same) return   // the link shows what this browser already holds; keep its path and results
    const text = JSON.stringify({
      ...(meta ?? {}), epoch: scenario.epoch,
      earth: { id: earthSat.id, name: earthSat.name, elements: earthSat.elements },
      asteroids: rocks.map((r) => ({ id: r.id, name: r.name, elements: r.kind === 'kepler' ? r.elements : null })),
      note: meta?.note ?? 'Opened from a shared link.',
    })
    const inst = parseInstance(text)
    if (typeof inst === 'string') return
    generateSeq++
    set({ generating: false })
    adopt(inst, inst.asteroids.length)
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
        else if (get().status === 'done') set({ status: 'error', error: get().error ?? 'the final route could not be drawn', message: 'The run finished but its route could not be evaluated.' })
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
    const seq = ++sceneSeq
    const main = useStore.getState()
    try {
      const { evaluation, plan } = await postJson<{ evaluation: ArpEvaluation; plan: MissionPlan }>('/api/arp/plan',
        { instance: inst, order, solver: main.scenario.solver ?? DEFAULT_SOLVER, transfer: main.scenario.transfer ?? DEFAULT_TRANSFER, ...(times ? { times } : {}) })
      if (seq !== sceneSeq) return evaluation // a newer route, or a flown path, is on its way
      if (useStore.getState().world !== 'asteroids') return evaluation // the user has moved to the satellites; nothing to draw into
      ensureScene(inst)
      const now = useStore.getState()
      now.loadRoute(routeMission(inst, evaluation), plan)
      now.setSpan(plan.totalTime)
      now.setT(play ? 0 : evaluation.time * DAY)
      now.setPlaying(play)
      if (play) now.setRate(2592000)
      set({ shown: { order, label, cost: evaluation.cost }, error: null })
      return evaluation
    } catch (e) {
      if (seq === sceneSeq) set({ error: (e as Error).message })
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
    // a running algorithm draws its routes against the instance it was given; edits wait until it ends
    if (get().status === 'running' || get().status === 'loading') return
    const base = get().instance
    // the instance's asteroids follow the path's entries, and so does the scene, as the edit is made
    const synced = base ? syncInstance(base, path) : null
    const inst = synced ? synced.instance : null
    set({ path, pathStatus: 'idle', pathError: null, ...(inst ? { instance: inst, pathText: pathText(inst, path) } : {}) })
    if (synced && synced.changed.length) {
      const main = useStore.getState()
      if (main.world === 'asteroids') {
        for (const a of synced.changed) {
          const sat = main.scenario.satellites.find((s) => s.id === a.id)
          if (sat && sat.kind === 'kepler') main.updateSatellite({ ...sat, name: a.name, elements: { ...a.elements } })
        }
      }
    }
    save(get())
  },
  addEntry: () => {
    const { instance, path } = get()
    if (!instance) return
    get().setPath({ ...path, entries: [...path.entries, nextEntry(instance, path)] })
  },
  setEntryOrbit: (k, elements, name) => {
    const path = get().path
    if (!path.entries[k]) return
    get().setPath({ ...path, entries: path.entries.map((e, i) => (i === k ? withOrbit(path, k, elements, name) : e)) })
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
    if (instance && result) {
      get().setPath(pathFromEvaluation(instance, result))
      get().setView('path')
    }
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
  setPathText: (text) => {
    set({ pathText: text, pathStatus: 'idle', pathError: null })
    save(get())
    // the text is live too: once it parses, the rows, the instance and the scene follow it
    window.clearTimeout(textTimer)
    textTimer = window.setTimeout(() => {
      if (get().pathText === text && typeof parsePath(text, get().instance) !== 'string') get().applyPathText()
    }, 400)
  },
  applyPathText: () => {
    const { instance, pathText: text } = get()
    const path = parsePath(text, instance)
    if (typeof path === 'string') return path
    const keep = text
    get().setPath(path)          // through setPath, so the instance and the scene follow the text
    set({ pathText: keep })      // but the text stays as typed, not re-serialised under the cursor
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
    const seq = ++sceneSeq
    set({ pathStatus: 'loading', pathError: null })
    try {
      const { evaluation, plan } = await postJson<{ evaluation: ArpEvaluation; plan: MissionPlan }>('/api/arp/path',
        pathRequest(instance, path, main.scenario.solver ?? DEFAULT_SOLVER, main.scenario.transfer ?? DEFAULT_TRANSFER))
      if (seq !== sceneSeq) {
        set({ pathStatus: 'idle' })
        return
      }
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
      if (seq === sceneSeq) set({ pathStatus: 'error', pathError: (e as Error).message })
      else set({ pathStatus: 'idle' })
    }
  },
}))

/** A path result belongs to the transfer mode and solver it was flown with; a change puts it out of date. */
useStore.subscribe((now, before) => {
  if ((now.scenario.transfer !== before.scenario.transfer || now.scenario.solver !== before.scenario.solver) && useArp.getState().pathStatus === 'done') {
    useArp.setState({ pathStatus: 'idle' })
  }
})

/** The instance's settings a share link carries; its bodies travel as the scene's satellites. */
export function instanceMeta(): InstanceMeta | undefined {
  const inst = useArp.getState().instance
  if (!inst) return undefined
  const { name, mu, tauMax, tMax, timeWeight, innerStart, innerTol, note } = inst
  return { name, mu, tauMax, tMax, timeWeight, ...(innerStart ? { innerStart } : {}), ...(innerTol ? { innerTol } : {}), ...(note ? { note } : {}) }
}
