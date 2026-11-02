import { useRef, type ChangeEvent, type CSSProperties, type KeyboardEvent } from 'react'
import { FORMAT_NAME, FORMAT_REFERENCE, FORMAT_VERSION, PAPER_PRESETS, PAPERS, parseAlgorithm } from '../arp/format'
import { AU_KM } from '../arp/instance'
import { DEG, orbitProblems, parsePath, PATH_FORMAT_NAME, PATH_FORMAT_REFERENCE, PATH_FORMAT_VERSION, pathProblems, pathText, type PathEntry } from '../arp/path'
import { useArp } from '../arp/store'
import type { ArpEvaluation, ArpInstance, EvaluationRow } from '../arp/types'
import { LEG_COLORS } from '../data/legColors'
import { DEFAULT_SOLVER } from '../mission/api'
import { DEFAULT_TRANSFER, transferName } from '../mission/types'
import { useStore } from '../store/store'
import { ConvergenceChart } from './ConvergenceChart'
import { IconDown, IconPlus, IconUp, IconX } from './icons'
import { Section } from './Section'
import { SolverSelect } from './SolverSelect'
import { TransferSelect } from './TransferSelect'
import { arrowTabs } from './tabs'
import { useSolvers } from './useSolvers'

const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : fallback)

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const bodyName = (inst: ArpInstance, k: number) => (k === 0 ? inst.earth.name || 'Earth' : inst.asteroids[k - 1]?.name || `Asteroid ${k}`)
const years = (days: number) => (days >= 730 ? `${(days / 365.25).toFixed(2)} y` : `${days.toFixed(0)} d`)

/** A key per path entry that stays with the entry when rows move: its asteroid, made unique if it appears twice. */
function entryKeys(entries: PathEntry[]): string[] {
  const seen = new Map<string, number>()
  return entries.map((e) => {
    const n = seen.get(e.asteroid.id) ?? 0
    seen.set(e.asteroid.id, n + 1)
    return n ? `${e.asteroid.id}#${n}` : e.asteroid.id
  })
}

/**
 * Asteroids tab. The instance and the transfer are shared; below them the tab is split in two:
 * write and fly a path by hand, or run an algorithm in the standard format. The action of the half
 * that is open (Fly or Run) is pinned to the bottom of the panel, so it is never a long scroll away.
 */
export function RoutingPanel() {
  const instance = useArp((s) => s.instance)
  const view = useArp((s) => s.view)
  const status = useArp((s) => s.status)
  const pathStatus = useArp((s) => s.pathStatus)
  const solver = useStore((s) => s.scenario.solver ?? DEFAULT_SOLVER)
  const transfer = useStore((s) => s.scenario.transfer ?? DEFAULT_TRANSFER)
  const solvers = useSolvers()
  const busy = status === 'running' || status === 'loading'
  const flying = pathStatus === 'loading'
  const setView = useArp.getState().setView

  return (
    <div className="form routing">
      <InstanceSection busy={busy || flying} />
      <Section id="asteroids-transfer" title="Transfer" defaultOpen={false} summary={`${transferName(transfer)} · ${solvers.find((x) => x.id === solver)?.name ?? solver}`}>
        <p className="hint">Used for every transfer on this tab: flying your path, and each transfer an algorithm asks for.</p>
        <TransferSelect />
        <SolverSelect />
      </Section>
      <div className="tabs sub-tabs" role="tablist" aria-label="what to do with the instance" onKeyDown={(e) => arrowTabs(e, ['path', 'run'], view, setView)}>
        <button role="tab" id="arp-tab-path" aria-controls="arp-panel" tabIndex={view === 'path' ? 0 : -1} aria-selected={view === 'path'} className={view === 'path' ? 'tab active' : 'tab'} onClick={() => setView('path')}>Plan a path</button>
        <button role="tab" id="arp-tab-run" aria-controls="arp-panel" tabIndex={view === 'run' ? 0 : -1} aria-selected={view === 'run'} className={view === 'run' ? 'tab active' : 'tab'} onClick={() => setView('run')}>Run an algorithm</button>
      </div>
      <div id="arp-panel" role="tabpanel" aria-labelledby={view === 'path' ? 'arp-tab-path' : 'arp-tab-run'} className="form">
        {!instance
          ? <p className="hint">Generate or open an instance above; its asteroids are what a path visits and what an algorithm routes.</p>
          : view === 'path' ? <PathView instance={instance} locked={busy} /> : <RunView instance={instance} />}
      </div>
      {instance && (view === 'path' ? <FlyBar locked={busy} /> : <RunBar />)}
    </div>
  )
}

function InstanceSection({ busy }: { busy: boolean }) {
  const instance = useArp((s) => s.instance)
  const n = useArp((s) => s.n)
  const instanceSeed = useArp((s) => s.instanceSeed)
  const instanceSource = useArp((s) => s.instanceSource)
  const generating = useArp((s) => s.generating)
  const actions = useArp.getState()
  const file = useRef<HTMLInputElement>(null)
  return (
    <Section id="asteroids-instance" title="Instance" defaultOpen={!instance} summary={instance ? `${instance.name}, ${instance.asteroids.length} asteroids` : 'none yet'}>
      {instance ? (
        <p className="hint"><b>{instance.name}</b>: Earth and {instance.asteroids.length} asteroids, starting {instance.epoch.slice(0, 10)}. {instance.note}</p>
      ) : (
        <p className="hint">The Asteroid Routing Problem: leave Earth's orbit and visit every asteroid once, as cheaply and quickly as possible. Generate an instance to begin; it replaces the scene with a Sun-centred one.</p>
      )}
      <label className="field"><span>asteroids from</span>
        <select value={instanceSource} onChange={(e) => actions.setInstanceSource(e.target.value as 'catalogue' | 'synthetic')} disabled={busy || generating}>
          <option value="catalogue">the GTOC11 catalogue, the papers' generator (instance n_seed)</option>
          <option value="synthetic">a synthetic main belt from the seed</option>
        </select>
      </label>
      <div className="grid2">
        <label className="field"><span>asteroids</span><input type="number" min={2} max={30} value={n} onChange={(e) => actions.setN(num(e.target.value, n))} /></label>
        <label className="field"><span>instance seed</span><input type="number" value={instanceSeed} onChange={(e) => actions.setInstanceSeed(num(e.target.value, instanceSeed))} /></label>
      </div>
      <div className="row">
        <button className={instance ? '' : 'primary'} onClick={actions.generate} disabled={busy || generating}>{generating ? <><span className="spinner" aria-hidden="true" /> Fetching…</> : instance ? 'Generate again' : 'Generate instance'}</button>
        {instance && <button onClick={actions.showInstance} disabled={busy}>Show in scene</button>}
        <button onClick={() => file.current?.click()} disabled={busy} title="An instance saved from this page, as JSON">Open…</button>
        {instance && <button onClick={() => download(`arp-instance-${instance.name}.json`, JSON.stringify(instance, null, 2), 'application/json')} title="The instance as JSON">Save…</button>}
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => readFile(e, (text) => { const bad = actions.importInstance(text); if (bad) useArp.setState({ error: `Could not open the instance: ${bad}` }) })} />
      </div>
    </Section>
  )
}

function readFile(e: ChangeEvent<HTMLInputElement>, use: (text: string) => void): void {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (file) file.text().then(use, () => useArp.setState({ error: `Could not read ${file.name}` }))
}

/** What stops the path from being flown, whichever way it is written. */
function usePathProblems(instance: ArpInstance): string[] {
  const path = useArp((s) => s.path)
  const pathMode = useArp((s) => s.pathMode)
  const text = useArp((s) => s.pathText)
  if (pathMode === 'text') {
    const parsed = parsePath(text, instance)
    return typeof parsed === 'string' ? [parsed] : pathProblems(parsed)
  }
  return pathProblems(path)
}

function PathView({ instance, locked }: { instance: ArpInstance; locked: boolean }) {
  const path = useArp((s) => s.path)
  const pathStatus = useArp((s) => s.pathStatus)
  const pathError = useArp((s) => s.pathError)
  const pathResult = useArp((s) => s.pathResult)
  const pathInst = useArp((s) => s.pathInstance)
  const pathMode = useArp((s) => s.pathMode)
  const pathTextValue = useArp((s) => s.pathText)
  const result = useArp((s) => s.result)
  const actions = useArp.getState()
  const file = useRef<HTMLInputElement>(null)
  const problems = usePathProblems(instance)
  const off = pathStatus === 'loading' || locked
  const textCheck = pathMode === 'text' ? parsePath(pathTextValue, instance) : null
  const keys = entryKeys(path.entries)
  const nameAt = (i: number) => path.entries[i]?.asteroid.name || `asteroid ${i + 1}`

  return (
    <>
      <p className="hint">Each asteroid with its orbit, the day to arrive and how long to stay. From those the planner knows every departure and flight time and flies the path exactly as written.</p>
      {locked && <p className="hint caution">An algorithm is running on this instance; the path can be edited when it ends.</p>}
      <div className="row">
        <div className="seg path-mode" role="radiogroup" aria-label="how to write the path">
          <button role="radio" aria-checked={pathMode === 'form'} className={pathMode === 'form' ? 'on' : ''} onClick={() => actions.setPathMode('form')} disabled={off}>Rows</button>
          <button role="radio" aria-checked={pathMode === 'text'} className={pathMode === 'text' ? 'on' : ''} onClick={() => actions.setPathMode('text')} disabled={off}>Text</button>
        </div>
        <label className="inline-field"><span>leave Earth, day</span>
          <input type="number" min={0} step="any" value={path.departure} disabled={off || pathMode === 'text'} onChange={(e) => actions.setPath({ ...path, departure: num(e.target.value, path.departure) })} />
        </label>
      </div>
      {pathMode === 'text' ? (
        <>
          <textarea
            className="code path-text" value={pathTextValue} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" rows={10}
            aria-label={`path, ${PATH_FORMAT_NAME} ${PATH_FORMAT_VERSION}`} onChange={(e) => actions.setPathText(e.target.value)} readOnly={off}
          />
          {typeof textCheck === 'string'
            ? <p className="format bad">{textCheck}</p>
            : <p className="format ok">Valid {PATH_FORMAT_NAME} {PATH_FORMAT_VERSION}: {textCheck?.entries.length ?? 0} stop{textCheck?.entries.length === 1 ? '' : 's'}{textCheck && textCheck.entries.some((e) => !instance.asteroids.some((a) => a.id === e.asteroid.id)) ? ', some with orbits of their own' : ''}</p>}
          <Section id="path-format" title="Path format" defaultOpen={false}>
            <pre className="reference">{PATH_FORMAT_REFERENCE}</pre>
          </Section>
        </>
      ) : (
        <ol className="stops path-list" aria-label="path">
          {path.entries.map((en, i) => (
            <li key={keys[i]} style={{ '--leg': LEG_COLORS[i % LEG_COLORS.length] } as CSSProperties}>
              <div className="row entry-head">
                <span className="stop-index">{i + 1}</span>
                <select value={en.asteroid.id} disabled={off} aria-label={`asteroid at stop ${i + 1}`} onChange={(e) => { if (e.target.value === '__own') actions.makeEntryCustom(i); else { const a = instance.asteroids.find((x) => x.id === e.target.value); if (a) actions.updateEntry(i, { asteroid: a }) } }}>
                  {instance.asteroids.map((a) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
                  {!instance.asteroids.some((a) => a.id === en.asteroid.id) && <option value={en.asteroid.id}>{en.asteroid.name || en.asteroid.id} (own orbit)</option>}
                  <option value="__own">an orbit of its own…</option>
                </select>
                <button className="icon" onClick={() => actions.moveEntry(i, -1)} aria-label={`move ${nameAt(i)} up`} disabled={i === 0 || off}><IconUp /></button>
                <button className="icon" onClick={() => actions.moveEntry(i, 1)} aria-label={`move ${nameAt(i)} down`} disabled={i === path.entries.length - 1 || off}><IconDown /></button>
                <button className="icon remove" onClick={() => actions.removeEntry(i)} aria-label={`remove ${nameAt(i)}`} disabled={off}><IconX /></button>
              </div>
              <div className="entry-times">
                <label className="inline-field"><span>arrive, day</span><input type="number" min={0} step="any" value={en.arrival} disabled={off} onChange={(e) => actions.updateEntry(i, { arrival: num(e.target.value, en.arrival) })} /></label>
                <label className="inline-field"><span>stay, days</span><input type="number" min={0} step="any" value={en.delay} disabled={off} onChange={(e) => actions.updateEntry(i, { delay: num(e.target.value, en.delay) })} /></label>
              </div>
              <OrbitFields entry={en} own={!instance.asteroids.some((a) => a.id === en.asteroid.id)} disabled={off} onChange={(el, name) => actions.setEntryOrbit(i, el, name)} />
            </li>
          ))}
        </ol>
      )}
      <div className="row">
        {pathMode === 'form' && <button onClick={actions.addEntry} disabled={off} title="The next asteroid of the instance, or a new orbit once they are all in the path"><IconPlus /> Add asteroid</button>}
        {result && <button onClick={actions.pathFromResult} disabled={off} title="Copy the last run's route, with its arrival days and waits, into the path">From last run</button>}
        <button onClick={() => file.current?.click()} disabled={off} title="A path in the text format, or the JSON this page saved before">Open…</button>
        {path.entries.length > 0 && <button onClick={() => download(`arp-path-${instance.name}.txt`, pathText(instance, path), 'text/plain')} title="The path in the text format">Save…</button>}
        <input ref={file} type="file" accept=".txt,.json,text/plain,application/json" hidden onChange={(e) => readFile(e, (text) => { const bad = actions.importPath(text); if (bad) useArp.setState({ pathStatus: 'error', pathError: `Could not open the path: ${bad}` }) })} />
      </div>
      {problems.length > 0 && pathMode === 'form' && <div className="format bad" id="path-problems">{problems.map((m, k) => <p key={k}>{m}</p>)}</div>}
      {pathStatus === 'error' && pathError && <pre className="trace" role="alert">{pathError}</pre>}
      {pathStatus === 'done' && pathResult && pathInst && (
        <Section id="path-result" title="Flown path" summary={`cost ${pathResult.cost.toFixed(1)}`}>
          <RouteSummary instance={pathInst} ev={pathResult} />
        </Section>
      )}
    </>
  )
}

/** The pinned action of the path half: fly it, or say why it cannot be flown yet. */
function FlyBar({ locked }: { locked: boolean }) {
  const instance = useArp((s) => s.instance)
  const pathStatus = useArp((s) => s.pathStatus)
  const transfer = useStore((s) => s.scenario.transfer ?? DEFAULT_TRANSFER)
  const problems = usePathProblems(instance!)
  const flying = pathStatus === 'loading'
  const why = locked ? 'wait for the running algorithm to end' : problems.length === 1 ? problems[0] : problems.length > 1 ? `${problems.length} things to fix above` : ''
  return (
    <div className="action-bar">
      <button className="primary big" onClick={() => void useArp.getState().flyPath()} disabled={flying || locked || problems.length > 0} aria-describedby={why ? 'fly-why' : undefined}>
        {flying ? <><span className="spinner" aria-hidden="true" /> Flying…</> : `Fly path, ${transferName(transfer)}`}
      </button>
      {why && !flying && <span className="hint" id="fly-why">{why}</span>}
    </div>
  )
}

function RunView({ instance }: { instance: ArpInstance }) {
  const presetId = useArp((s) => s.presetId)
  const source = useArp((s) => s.source)
  const budget = useArp((s) => s.budget)
  const seed = useArp((s) => s.seed)
  const status = useArp((s) => s.status)
  const error = useArp((s) => s.error)
  const log = useArp((s) => s.log)
  const evaluations = useArp((s) => s.evaluations)
  const result = useArp((s) => s.result)
  const resultNote = useArp((s) => s.resultNote)
  const shown = useArp((s) => s.shown)
  const actions = useArp.getState()
  const file = useRef<HTMLInputElement>(null)
  const tabFree = useRef(false)
  const header = parseAlgorithm(source)
  const busy = status === 'running' || status === 'loading'
  const complete = evaluations.filter((r) => r.complete).length
  const shownKey = shown?.order.join(' ')

  /** Tab indents instead of leaving the editor; after Escape, the next Tab moves on as usual. */
  const onEditorKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      tabFree.current = true
      return
    }
    if (e.key !== 'Tab') {
      tabFree.current = false
      return
    }
    if (tabFree.current || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    const el = e.currentTarget
    const { selectionStart: a, selectionEnd: b, value } = el
    actions.setSource(`${value.slice(0, a)}    ${value.slice(b)}`)
    requestAnimationFrame(() => el.setSelectionRange(a + 4, a + 4))
  }
  const showRow = (row: EvaluationRow) => void actions.showRoute(row.order, row.times, `evaluation ${row.index}`)

  return (
    <>
      <Section id="algorithm" title="Algorithm" summary={header.name}>
        <label className="field"><span>start from</span>
          <select value={presetId} onChange={(e) => actions.choosePreset(e.target.value)} disabled={busy}>
            {([1, 2] as const).map((paper) => (
              <optgroup key={paper} label={PAPERS[paper]}>
                {PAPER_PRESETS.filter((p) => p.paper === paper).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </optgroup>
            ))}
            {presetId === 'custom' && <option value="custom">your own</option>}
          </select>
        </label>
        <textarea
          className="code" value={source} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" rows={16}
          aria-label="algorithm source, Python" aria-describedby="editor-keys" onChange={(e) => actions.setSource(e.target.value)} onKeyDown={onEditorKey} readOnly={busy}
        />
        <p className="hint" id="editor-keys">Tab indents. Press Escape, then Tab, to leave the editor.</p>
        {header.ok
          ? <p className="format ok">Valid {FORMAT_NAME} {FORMAT_VERSION}: “{header.name}”</p>
          : <div className="format bad">{header.errors.map((m, k) => <p key={k}>{m}</p>)}</div>}
        <div className="grid2">
          <label className="field"><span>budget, route evaluations</span><input type="number" min={1} max={2000} value={budget} onChange={(e) => actions.setBudget(num(e.target.value, budget))} disabled={busy} /></label>
          <label className="field"><span>run seed</span><input type="number" value={seed} onChange={(e) => actions.setSeed(num(e.target.value, seed))} disabled={busy} /></label>
        </div>
        <div className="row">
          <button onClick={() => file.current?.click()} disabled={busy} title="A Python file in the standard format">Open…</button>
          <button onClick={() => download(`${header.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'algorithm'}.py`, source, 'text/x-python')} title="The algorithm as a .py file">Save…</button>
          <input ref={file} type="file" accept=".py,text/x-python,text/plain" hidden onChange={(e) => readFile(e, actions.setSource)} />
        </div>
        <Section id="format-reference" title="Format reference" defaultOpen={false}>
          <pre className="reference">{FORMAT_REFERENCE}</pre>
        </Section>
      </Section>

      {resultNote && status === 'done' && <p className="hint">{resultNote}</p>}
      {error && <pre className="trace" role="alert">{error}</pre>}
      {log.length > 0 && (
        <Section id="run-log" title="Log" count={log.length} defaultOpen={false}>
          <pre className="reference log">{log.join('\n')}</pre>
        </Section>
      )}

      {(result || evaluations.length > 0) && (
        <Section id="run-result" title="Result">
          {result && <RouteSummary instance={instance} ev={result} />}
          {shown && <p className="hint">In the scene: {shown.label}, cost {shown.cost.toFixed(2)}.</p>}
          {complete > 0 && (
            <>
              <div className="subhead">Search, {complete} routes</div>
              <ConvergenceChart rows={evaluations} onPick={showRow} />
              <ol className="evals" aria-label="evaluated routes">
                {evaluations.slice(-150).reverse().map((row) => (
                  <li key={row.index} className={row.improved ? 'improved' : ''}>
                    <button onClick={() => showRow(row)} title="Draw this route" aria-current={row.order.join(' ') === shownKey ? 'true' : undefined}>
                      <span className="eval-index">{row.index}</span>
                      <span className="eval-cost">{row.cost.toFixed(2)}</span>
                      <span className="eval-order">{row.complete ? '' : 'prefix '}{row.order.join(' ')}</span>
                    </button>
                  </li>
                ))}
              </ol>
              {evaluations.length > 150 && <p className="hint">The latest 150 of {evaluations.length} are listed; the chart and the saved run have all of them.</p>}
            </>
          )}
          <div className="row">
            {result && <button onClick={() => void actions.showRoute(result.order, result.legs.map((l) => [l.tau, l.t]), 'final route', true)}>Replay final route</button>}
            <button onClick={() => { const rec = actions.record(); if (rec) download(`arp-run-${rec.instance.name}.json`, JSON.stringify(rec, null, 2), 'application/json') }} title="Everything about this run, as JSON">Save run…</button>
          </div>
        </Section>
      )}
    </>
  )
}

/** The pinned action of the algorithm half: Run and Stop, with what the run is doing. */
function RunBar() {
  const source = useArp((s) => s.source)
  const status = useArp((s) => s.status)
  const message = useArp((s) => s.message)
  const evaluations = useArp((s) => s.evaluations)
  const transfers = useArp((s) => s.transfers)
  const elapsedMs = useArp((s) => s.elapsedMs)
  const actions = useArp.getState()
  const ok = parseAlgorithm(source).ok
  const busy = status === 'running' || status === 'loading'
  const best = evaluations.length ? evaluations[evaluations.length - 1].best : null
  return (
    <div className="action-bar">
      <div className="row">
        <button className="primary big" onClick={actions.run} disabled={busy || !ok}>
          {busy ? <><span className="spinner" aria-hidden="true" /> {status === 'loading' ? 'Loading Python…' : 'Running…'}</> : 'Run'}
        </button>
        {busy && <button onClick={actions.stop}>Stop</button>}
        {!ok && !busy && <span className="hint">The algorithm is not in the standard format.</span>}
      </div>
      {(busy || status !== 'idle') && (
        <p className="hint status" role="status">
          {message}{' '}
          {(busy || evaluations.length > 0 || transfers > 0) && <>{transfers} transfers, {evaluations.length} routes{best !== null ? `, best ${best.toFixed(2)}` : ''}{elapsedMs > 0 ? `, ${(elapsedMs / 1000).toFixed(1)} s` : ''}.</>}
        </p>
      )}
    </div>
  )
}

const ORBIT_FIELDS: Array<[keyof PathEntry['asteroid']['elements'], string, number, number]> = [
  // key, label, scale from the stored unit (km, rad) to the shown one, digits shown
  ['a', 'a, AU', 1 / AU_KM, 6], ['e', 'e', 1, 6], ['i', 'i, deg', 1 / DEG, 4],
  ['raan', 'RAAN Ω, deg', 1 / DEG, 4], ['argp', 'arg. periapsis ω, deg', 1 / DEG, 4], ['M0', 'M0 at the epoch, deg', 1 / DEG, 4],
]

/**
 * An entry's own attributes: its name and the six elements of its orbit, in AU and degrees.
 * The inputs commit on blur or Enter so a number can be typed in full; they remount when the
 * entry becomes another body, through the key on each.
 */
function OrbitFields({ entry, own, disabled, onChange }: { entry: PathEntry; own: boolean; disabled: boolean; onChange: (el: Partial<PathEntry['asteroid']['elements']>, name?: string) => void }) {
  const el = entry.asteroid.elements
  const problems = orbitProblems(el)
  const shown = (v: number, scale: number, digits: number) => Number((v * scale).toFixed(digits)).toString()
  const commit = (key: keyof PathEntry['asteroid']['elements'], scale: number) => (e: { currentTarget: HTMLInputElement }) => {
    const v = Number(e.currentTarget.value)
    if (e.currentTarget.value !== '' && Number.isFinite(v) && Math.abs(v / scale - el[key]) > 1e-12) onChange({ [key]: v / scale })
  }
  const enter = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur() }
  return (
    <details className="orbit">
      <summary>
        <span className="orbit-sum">orbit · a {(el.a / AU_KM).toFixed(3)} AU · e {el.e.toFixed(3)} · i {(el.i / DEG).toFixed(1)}°{own ? ' · its own' : ''}</span>
      </summary>
      <label className="field"><span>name</span>
        <input key={`${entry.asteroid.id}-name`} type="text" defaultValue={entry.asteroid.name} disabled={disabled} onKeyDown={enter}
          onBlur={(e) => { const name = e.currentTarget.value.trim(); if (name && name !== entry.asteroid.name) onChange({}, name) }} />
      </label>
      <div className="grid2">
        {ORBIT_FIELDS.map(([key, label, scale, digits]) => (
          <label key={key} className="field"><span>{label}</span>
            <input key={`${entry.asteroid.id}-${key}-${el[key]}`} type="number" step="any" defaultValue={shown(el[key], scale, digits)} disabled={disabled} onKeyDown={enter} onBlur={commit(key, scale)} />
          </label>
        ))}
      </div>
      {problems.length > 0 && <div className="format bad">{problems.map((m, k) => <p key={k}>{m}</p>)}</div>}
      <p className="hint">Heliocentric elements at the instance epoch; the mean anomaly M0 says where on the orbit the asteroid is then. A change here moves the asteroid in the scene as you make it.</p>
    </details>
  )
}

/** A route: its cost split as the papers define it, and each leg with its burns. */
function RouteSummary({ instance, ev }: { instance: ArpInstance; ev: ArpEvaluation }) {
  const miss = Math.max(...ev.legs.map((l) => l.miss))
  const three = ev.transfer === 'threeburn'
  const lambert = three ? ev.legs.reduce((sum, l) => (l.lambertDv != null ? sum + l.lambertDv : sum), 0) : 0
  const compare = three && ev.legs.every((l) => l.lambertDv != null)
  const burnsOf = (l: ArpEvaluation['legs'][number]) => (l.burns === 3 ? [l.dv1, l.dv2, l.dv3] : l.burns === 2 && three ? [l.dv1, l.dv3] : [l.dv1, l.dv2]).map((b) => b.toFixed(1)).join(' + ')
  const notes = ev.legs.filter((l) => l.note).map((l, k) => `${bodyName(instance, l.origin)} to ${bodyName(instance, l.target)}: ${l.note}${k < ev.legs.length - 1 ? '' : ''}`)
  return (
    <>
      <div className="tiles">
        <div className="tile"><span className="tile-k">cost f</span><span className="tile-v">{ev.cost.toFixed(1)}</span></div>
        <div className="tile"><span className="tile-k">delta-v</span><span className="tile-v">{ev.dv.toFixed(1)}<small>km/s</small></span></div>
        <div className="tile"><span className="tile-k">time</span><span className="tile-v">{ev.time >= 730 ? (ev.time / 365.25).toFixed(2) : ev.time.toFixed(0)}<small>{ev.time >= 730 ? 'y' : 'd'}</small></span></div>
      </div>
      <p className="hint">f = delta-v + {(instance.timeWeight * 30).toFixed(1)} km/s per 30 days. Order: Earth, {ev.order.join(', ')}. {three ? 'Three burns per transfer' : 'Two burns per transfer'}, solver {ev.solver}.{compare ? ` The two-burn Lambert transfers at the same times would total ${lambert.toFixed(1)} km/s.` : ''}</p>
      {miss > 1e-4 && <p className="hint caution">With this solver the transfers miss their targets by up to {(100 * miss).toFixed(2)}% of the distance. Izzo (2015) and Gooding (1990) are exact.</p>}
      {notes.map((n, k) => <p key={k} className="hint caution">{n}</p>)}
      <div className="table-scroll">
      <table className="kv legs-table">
        <thead><tr><th>leg</th><th>wait</th><th>flight</th><th>burns</th><th>delta-v</th>{compare && <th>2-burn</th>}<th>cost</th></tr></thead>
        <tbody>
          {ev.legs.map((l, k) => (
            <tr key={k}>
              <td>{bodyName(instance, l.origin)} to {bodyName(instance, l.target)}</td>
              <td>{years(l.tau)}</td><td>{years(l.t)}</td><td className="burns">{burnsOf(l)}</td><td>{l.dv.toFixed(2)}</td>
              {compare && <td>{(l.lambertDv ?? 0).toFixed(2)}</td>}
              <td>{l.z.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  )
}
