import { useRef, type ChangeEvent, type KeyboardEvent } from 'react'
import { FORMAT_NAME, FORMAT_REFERENCE, FORMAT_VERSION, parseAlgorithm, PRESETS } from '../arp/format'
import { useArp } from '../arp/store'
import type { ArpEvaluation, ArpInstance, EvaluationRow } from '../arp/types'
import { DEFAULT_SOLVER } from '../mission/api'
import { useStore } from '../store/store'
import { ConvergenceChart } from './ConvergenceChart'
import { Section } from './Section'
import { SolverSelect } from './SolverSelect'
import { useSolvers } from './useSolvers'

const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : fallback)

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const bodyName = (inst: ArpInstance, k: number) => (k === 0 ? inst.earth.name || 'Earth' : inst.asteroids[k - 1]?.name || `Asteroid ${k}`)
const years = (days: number) => (days >= 730 ? `${(days / 365.25).toFixed(2)} y` : `${days.toFixed(0)} d`)

/**
 * Routing tab: write an algorithm for the Asteroid Routing Problem in the standard format, run
 * it on an instance, and watch what it does. The algorithm runs in this browser; each transfer
 * it asks about is computed by the planner with the chosen Lambert solver.
 */
export function RoutingPanel() {
  const instance = useArp((s) => s.instance)
  const n = useArp((s) => s.n)
  const instanceSeed = useArp((s) => s.instanceSeed)
  const presetId = useArp((s) => s.presetId)
  const source = useArp((s) => s.source)
  const budget = useArp((s) => s.budget)
  const seed = useArp((s) => s.seed)
  const status = useArp((s) => s.status)
  const message = useArp((s) => s.message)
  const error = useArp((s) => s.error)
  const log = useArp((s) => s.log)
  const evaluations = useArp((s) => s.evaluations)
  const transfers = useArp((s) => s.transfers)
  const result = useArp((s) => s.result)
  const resultNote = useArp((s) => s.resultNote)
  const shown = useArp((s) => s.shown)
  const elapsedMs = useArp((s) => s.elapsedMs)
  const actions = useArp.getState()
  const solver = useStore((s) => s.scenario.solver ?? DEFAULT_SOLVER)
  const solvers = useSolvers()
  const instanceFile = useRef<HTMLInputElement>(null)
  const sourceFile = useRef<HTMLInputElement>(null)

  const header = parseAlgorithm(source)
  const busy = status === 'running' || status === 'loading'
  const best = evaluations.length ? evaluations[evaluations.length - 1].best : null
  const complete = evaluations.filter((r) => r.complete).length
  const shownKey = shown?.order.join(' ')

  const readFile = (e: ChangeEvent<HTMLInputElement>, use: (text: string) => void) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void file.text().then(use)
  }
  /** Tab indents instead of leaving the editor; Escape first, then Tab, moves on. */
  const onEditorKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    const el = e.currentTarget
    const { selectionStart: a, selectionEnd: b, value } = el
    actions.setSource(`${value.slice(0, a)}    ${value.slice(b)}`)
    requestAnimationFrame(() => el.setSelectionRange(a + 4, a + 4))
  }
  const showRow = (row: EvaluationRow) => void actions.showRoute(row.order, row.times, `evaluation ${row.index}`)

  return (
    <div className="form routing">
      <Section title="Instance" summary={instance ? `${instance.asteroids.length} asteroids, ${instance.name}` : 'none yet'}>
        {instance ? (
          <p className="hint"><b>{instance.name}</b>: Earth and {instance.asteroids.length} asteroids, starting {instance.epoch.slice(0, 10)}. {instance.note}</p>
        ) : (
          <p className="hint">The Asteroid Routing Problem: leave Earth's orbit and visit every asteroid once, as cheaply and quickly as possible. Generate an instance to begin; it replaces the current scene with a Sun-centred one.</p>
        )}
        <div className="grid2">
          <label className="field"><span>asteroids</span><input type="number" min={2} max={30} value={n} onChange={(e) => actions.setN(num(e.target.value, n))} /></label>
          <label className="field"><span>seed</span><input type="number" value={instanceSeed} onChange={(e) => actions.setInstanceSeed(num(e.target.value, instanceSeed))} /></label>
        </div>
        <div className="row">
          <button className={instance ? '' : 'primary'} onClick={actions.generate} disabled={busy}>{instance ? 'Generate again' : 'Generate instance'}</button>
          {instance && <button onClick={actions.showInstance} disabled={busy}>Show in scene</button>}
          <button onClick={() => instanceFile.current?.click()} disabled={busy}>Import</button>
          {instance && <button onClick={() => download(`arp-instance-${instance.name}.json`, JSON.stringify(instance, null, 2), 'application/json')}>Export</button>}
          <input ref={instanceFile} type="file" accept=".json,application/json" hidden onChange={(e) => readFile(e, (text) => { const bad = actions.importInstance(text); if (bad) useArp.setState({ error: `Import failed: ${bad}` }) })} />
        </div>
      </Section>

      <Section title="Lambert solver" defaultOpen={false} summary={solvers.find((s) => s.id === solver)?.name ?? solver}>
        <SolverSelect />
      </Section>

      <Section title="Algorithm" summary={header.name}>
        <label className="field"><span>start from</span>
          <select value={presetId} onChange={(e) => actions.choosePreset(e.target.value)} disabled={busy}>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            {presetId === 'custom' && <option value="custom">your own</option>}
          </select>
        </label>
        <textarea
          className="code" value={source} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" rows={16}
          aria-label="algorithm source, Python" onChange={(e) => actions.setSource(e.target.value)} onKeyDown={onEditorKey} readOnly={busy}
        />
        {header.ok
          ? <p className="format ok">Valid {FORMAT_NAME} {FORMAT_VERSION}: “{header.name}”</p>
          : <div className="format bad">{header.errors.map((m, k) => <p key={k}>{m}</p>)}</div>}
        <div className="grid2">
          <label className="field"><span>budget, route evaluations</span><input type="number" min={1} max={2000} value={budget} onChange={(e) => actions.setBudget(num(e.target.value, budget))} disabled={busy} /></label>
          <label className="field"><span>random seed</span><input type="number" value={seed} onChange={(e) => actions.setSeed(num(e.target.value, seed))} disabled={busy} /></label>
        </div>
        <div className="row">
          <button onClick={() => sourceFile.current?.click()} disabled={busy}>Open .py</button>
          <button onClick={() => download(`${header.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'algorithm'}.py`, source, 'text/x-python')}>Save .py</button>
          <input ref={sourceFile} type="file" accept=".py,text/x-python,text/plain" hidden onChange={(e) => readFile(e, actions.setSource)} />
        </div>
        <Section title="Format reference" defaultOpen={false}>
          <pre className="reference">{FORMAT_REFERENCE}</pre>
        </Section>
      </Section>

      <div className="plan-bar">
        <button className="primary big" onClick={actions.run} disabled={!instance || busy || !header.ok}>
          {busy ? <><span className="spinner" aria-hidden="true" /> {status === 'loading' ? 'Loading Python…' : 'Running…'}</> : 'Run'}
        </button>
        {busy && <button onClick={actions.stop}>Stop</button>}
        {!instance && <span className="hint">Generate an instance first.</span>}
      </div>
      {(busy || status !== 'idle') && (
        <p className="hint status" role="status">
          {message}{' '}
          {(busy || evaluations.length > 0 || transfers > 0) && <>{transfers} transfers asked, {evaluations.length} routes evaluated{best !== null ? `, best ${best.toFixed(2)}` : ''}{elapsedMs > 0 ? `, ${(elapsedMs / 1000).toFixed(1)} s` : ''}.</>}
        </p>
      )}
      {resultNote && status === 'done' && <p className="hint">{resultNote}</p>}
      {error && <pre className="trace" role="alert">{error}</pre>}
      {log.length > 0 && (
        <Section title="Log" count={log.length} defaultOpen={false}>
          <pre className="reference log">{log.join('\n')}</pre>
        </Section>
      )}

      {instance && (result || evaluations.length > 0) && (
        <Section title="Result">
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
              {evaluations.length > 150 && <p className="hint">The latest 150 of {evaluations.length} are listed; the chart and the exported run have all of them.</p>}
            </>
          )}
          <div className="row">
            {result && <button onClick={() => void actions.showRoute(result.order, result.legs.map((l) => [l.tau, l.t]), 'final route', true)}>Replay final route</button>}
            <button onClick={() => { const rec = actions.record(); if (rec) download(`arp-run-${rec.instance.name}.json`, JSON.stringify(rec, null, 2), 'application/json') }}>Export run</button>
          </div>
        </Section>
      )}
    </div>
  )
}

/** The final route: its cost split as the papers define it, and each leg. */
function RouteSummary({ instance, ev }: { instance: ArpInstance; ev: ArpEvaluation }) {
  const miss = Math.max(...ev.legs.map((l) => l.miss))
  return (
    <>
      <div className="tiles">
        <div className="tile"><span className="tile-k">cost f</span><span className="tile-v">{ev.cost.toFixed(1)}</span></div>
        <div className="tile"><span className="tile-k">delta-v</span><span className="tile-v">{ev.dv.toFixed(1)}<small>km/s</small></span></div>
        <div className="tile"><span className="tile-k">time</span><span className="tile-v">{ev.time >= 730 ? (ev.time / 365.25).toFixed(2) : ev.time.toFixed(0)}<small>{ev.time >= 730 ? 'y' : 'd'}</small></span></div>
      </div>
      <p className="hint">f = delta-v + {(instance.timeWeight * 30).toFixed(1)} km/s per 30 days. Order: Earth, {ev.order.join(', ')}. Solver: {ev.solver}.</p>
      {miss > 1e-4 && <p className="hint caution">With this solver the transfers miss their targets by up to {(100 * miss).toFixed(2)}% of the distance. Izzo (2015) and Gooding (1990) are exact.</p>}
      <table className="kv legs-table">
        <thead><tr><th>leg</th><th>wait</th><th>flight</th><th>delta-v</th><th>cost</th></tr></thead>
        <tbody>
          {ev.legs.map((l, k) => (
            <tr key={k}>
              <td>{bodyName(instance, l.origin)} to {bodyName(instance, l.target)}</td>
              <td>{years(l.tau)}</td><td>{years(l.t)}</td><td>{l.dv.toFixed(2)}</td><td>{l.z.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
