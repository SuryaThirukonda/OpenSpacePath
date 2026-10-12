import { useRef, type ChangeEvent, type CSSProperties, type KeyboardEvent } from 'react'
import { ALGORITHM_EDITOR } from '../arp/config'
import { FORMAT_NAME, FORMAT_REFERENCE, FORMAT_VERSION, PAPER_PRESETS, PAPERS, parseAlgorithm, PRESETS } from '../arp/format'
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
  const path = useArp((s) => s.path)
  const pathStatus = useArp((s) => s.pathStatus)
  const pathError = useArp((s) => s.pathError)
  const pathResult = useArp((s) => s.pathResult)
  const pathInst = useArp((s) => s.pathInstance)
  const pathMode = useArp((s) => s.pathMode)
  const pathTextValue = useArp((s) => s.pathText)
  const actions = useArp.getState()
  const solver = useStore((s) => s.scenario.solver ?? DEFAULT_SOLVER)
  const transfer = useStore((s) => s.scenario.transfer ?? DEFAULT_TRANSFER)
  const solvers = useSolvers()
  const sourceFile = useRef<HTMLInputElement>(null)
  const pathFileInput = useRef<HTMLInputElement>(null)
  const textCheck = pathMode === 'text' && instance ? parsePath(pathTextValue) : null
  const problems = instance ? (pathMode === 'text' ? (typeof textCheck === 'string' ? [textCheck] : []) : pathProblems(path)) : []
  const flying = pathStatus === 'loading'
  const stops = pathMode === 'text' && textCheck && typeof textCheck !== 'string' ? textCheck.entries.length : path.entries.length

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
      <Section title="Asteroids and path" summary={stops ? `${stops} asteroid${stops === 1 ? '' : 's'}${instance ? `, ${instance.name}` : ''}${pathResult && pathStatus === 'done' ? `, delta-v ${pathResult.dv.toFixed(1)} km/s` : ''}` : 'none yet'}>
        <p className="hint">One list is the whole problem: each asteroid with its orbit, the day to arrive there and how long to stay. The scene shows exactly these asteroids, an algorithm visits them, and Fly path flies them in this order with the transfer chosen below. Generate writes a random set from a seed; then edit any of it, as rows or as text.</p>
        <div className="grid2">
          <label className="field"><span>asteroids</span><input type="number" min={2} max={30} value={n} onChange={(e) => actions.setN(num(e.target.value, n))} disabled={flying} /></label>
          <label className="field"><span>seed</span><input type="number" value={instanceSeed} onChange={(e) => actions.setInstanceSeed(num(e.target.value, instanceSeed))} disabled={flying} /></label>
        </div>
        <div className="row">
          <button className={instance ? '' : 'primary'} onClick={actions.generate} disabled={busy || flying} title="Write a random set of asteroids into the list, a year of flight to each and a month at each">{instance ? 'Generate again' : 'Generate'}</button>
          {instance && <button onClick={actions.showInstance} disabled={busy || flying}>Show in scene</button>}
          <button onClick={() => pathFileInput.current?.click()} disabled={busy || flying} title="A path file (text or JSON), an instance JSON, or a saved run">Open file</button>
          {instance && path.entries.length > 0 && <button onClick={() => download(`arp-path-${instance.name}.txt`, pathText(instance, path), 'text/plain')}>Save file</button>}
          <input ref={pathFileInput} type="file" accept=".txt,.json,text/plain,application/json" hidden onChange={(e) => readFile(e, (text) => { const bad = actions.openFile(text); if (bad) useArp.setState({ pathStatus: 'error', pathError: `Could not open the file: ${bad}` }) })} />
        </div>
        {instance ? (
          <>
            <div className="seg path-mode" role="radiogroup" aria-label="how to write the path">
              <button role="radio" aria-checked={pathMode === 'form'} className={pathMode === 'form' ? 'on' : ''} onClick={() => actions.setPathMode('form')} disabled={flying}>Rows</button>
              <button role="radio" aria-checked={pathMode === 'text'} className={pathMode === 'text' ? 'on' : ''} onClick={() => actions.setPathMode('text')} disabled={flying}>Text</button>
            </div>
            {pathMode === 'text' ? (
              <>
                <textarea
                  className="code path-text" value={pathTextValue} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" rows={12}
                  aria-label={`path, ${PATH_FORMAT_NAME} ${PATH_FORMAT_VERSION}`} onChange={(e) => actions.setPathText(e.target.value)} readOnly={flying}
                />
                {typeof textCheck === 'string'
                  ? <p className="format bad">{textCheck}</p>
                  : <p className="format ok">Valid {PATH_FORMAT_NAME} {PATH_FORMAT_VERSION}: {textCheck?.entries.length ?? 0} asteroid{textCheck?.entries.length === 1 ? '' : 's'}</p>}
                <Section title="Path format" defaultOpen={false}>
                  <pre className="reference">{PATH_FORMAT_REFERENCE}</pre>
                </Section>
              </>
            ) : (
              <>
            <label className="field"><span>leave Earth on day</span><input type="number" min={0} step="any" value={path.departure} disabled={flying} onChange={(e) => actions.setPath({ ...path, departure: num(e.target.value, path.departure) })} /></label>
            <ol className="stops path-list">
              {path.entries.map((en, i) => (
                <li key={en.asteroid.id} style={{ '--leg': LEG_COLORS[i % LEG_COLORS.length] } as CSSProperties}>
                  <div className="row">
                    <span className="stop-index">{i + 1}</span>
                    <input className="name" type="text" defaultValue={en.asteroid.name} disabled={flying} aria-label={`name of asteroid ${i + 1}`}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      onBlur={(e) => { const name = e.currentTarget.value.trim(); if (name && name !== en.asteroid.name) actions.setEntryOrbit(i, {}, name) }} />
                    <button className="icon" onClick={() => actions.moveEntry(i, -1)} aria-label="move up" disabled={i === 0 || flying}><IconUp /></button>
                    <button className="icon" onClick={() => actions.moveEntry(i, 1)} aria-label="move down" disabled={i === path.entries.length - 1 || flying}><IconDown /></button>
                    <button className="icon remove" onClick={() => actions.removeEntry(i)} aria-label="remove" disabled={flying}><IconX /></button>
                  </div>
                  <div className="grid2">
                    <label className="field"><span>arrive on day</span><input type="number" min={0} step="any" value={en.arrival} disabled={flying} onChange={(e) => actions.updateEntry(i, { arrival: num(e.target.value, en.arrival) })} /></label>
                    <label className="field"><span>stay, days</span><input type="number" min={0} step="any" value={en.delay} disabled={flying} onChange={(e) => actions.updateEntry(i, { delay: num(e.target.value, en.delay) })} /></label>
                  </div>
                  <OrbitFields entry={en} disabled={flying} onChange={(el) => actions.setEntryOrbit(i, el)} />
                </li>
              ))}
            </ol>
              </>
            )}
            <div className="row">
              {pathMode === 'form' && <button onClick={actions.addEntry} disabled={flying} title="A new asteroid with a random orbit, arriving a year after the spacecraft is free"><IconPlus /> Add asteroid</button>}
              {result && <button onClick={actions.pathFromResult} disabled={flying} title="Reorder the list to the last run's route, with its arrival days and waits">From last run</button>}
            </div>
            {pathMode === 'form' && problems.length > 0 && path.entries.length > 0 && <div className="format bad">{problems.map((m, k) => <p key={k}>{m}</p>)}</div>}
            <div className="plan-bar">
              <button className="primary big" onClick={() => void actions.flyPath()} disabled={flying || busy || problems.length > 0}>
                {flying ? <><span className="spinner" aria-hidden="true" /> Flying…</> : `Fly path, ${transferName(transfer)}`}
              </button>
            </div>
            {pathStatus === 'error' && pathError && <pre className="trace" role="alert">{pathError}</pre>}
            {pathStatus === 'done' && pathResult && pathInst && <RouteSummary instance={pathInst} ev={pathResult} />}
          </>
        ) : (
          <p className="hint">Press Generate, or open a file, to begin; the scene becomes a Sun-centred one with these asteroids.</p>
        )}
      </Section>

      <Section title="Transfer" defaultOpen={false} summary={`${transferName(transfer)} · ${solvers.find((s) => s.id === solver)?.name ?? solver}`}>
        <TransferSelect />
        <SolverSelect />
      </Section>

      <Section title="Algorithm" summary={header.name}>
        {ALGORITHM_EDITOR ? (
          <>
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
          </>
        ) : (
          <>
            <label className="field"><span>algorithm</span>
              <select value={presetId} onChange={(e) => actions.choosePreset(e.target.value)} disabled={busy}>
                {([1, 2] as const).map((paper) => (
                  <optgroup key={paper} label={PAPERS[paper]}>
                    {PAPER_PRESETS.filter((p) => p.paper === paper).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <p className="hint">{header.fields.description}{header.fields.source ? ` From ${header.fields.source}.` : ''}</p>
          </>
        )}
        <div className="grid2">
          <label className="field"><span>budget, route evaluations</span><input type="number" min={1} max={2000} value={budget} onChange={(e) => actions.setBudget(num(e.target.value, budget))} disabled={busy} /></label>
          <label className="field"><span>random seed</span><input type="number" value={seed} onChange={(e) => actions.setSeed(num(e.target.value, seed))} disabled={busy} /></label>
        </div>
        {ALGORITHM_EDITOR && (
          <>
            <div className="row">
              <button onClick={() => sourceFile.current?.click()} disabled={busy}>Open .py</button>
              <button onClick={() => download(`${header.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'algorithm'}.py`, source, 'text/x-python')}>Save .py</button>
              <input ref={sourceFile} type="file" accept=".py,text/x-python,text/plain" hidden onChange={(e) => readFile(e, actions.setSource)} />
            </div>
            <Section title="Format reference" defaultOpen={false}>
              <pre className="reference">{FORMAT_REFERENCE}</pre>
            </Section>
          </>
        )}
      </Section>

      <div className="plan-bar">
        <button className="primary big" onClick={actions.run} disabled={!instance || instance.asteroids.length === 0 || busy || flying || !header.ok}>
          {busy ? <><span className="spinner" aria-hidden="true" /> {status === 'loading' ? 'Loading Python…' : 'Running…'}</> : 'Run'}
        </button>
        {busy && <button onClick={actions.stop}>Stop</button>}
        {(!instance || instance.asteroids.length === 0) && <span className="hint">Add asteroids to the list first.</span>}
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

const ORBIT_FIELDS: Array<[keyof PathEntry['asteroid']['elements'], string, number, number]> = [
  // key, label, scale from the stored unit (km, rad) to the shown one, digits shown
  ['a', 'a, AU', 1 / AU_KM, 6], ['e', 'e', 1, 6], ['i', 'i, deg', 1 / DEG, 4],
  ['raan', 'RAAN Ω, deg', 1 / DEG, 4], ['argp', 'arg. periapsis ω, deg', 1 / DEG, 4], ['M0', 'M0 at the epoch, deg', 1 / DEG, 4],
]

/**
 * An entry's orbit: its six elements, in AU and degrees. The inputs commit on blur or Enter so a
 * number can be typed in full; the key on each remounts it when the value changes elsewhere.
 */
function OrbitFields({ entry, disabled, onChange }: { entry: PathEntry; disabled: boolean; onChange: (el: Partial<PathEntry['asteroid']['elements']>) => void }) {
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
        <span className="orbit-sum">orbit · a {(el.a / AU_KM).toFixed(3)} AU · e {el.e.toFixed(3)} · i {(el.i / DEG).toFixed(1)}°</span>
      </summary>
      <div className="grid2">
        {ORBIT_FIELDS.map(([key, label, scale, digits]) => (
          <label key={key} className="field"><span>{label}</span>
            <input key={`${entry.asteroid.id}-${key}-${el[key]}`} type="number" step="any" defaultValue={shown(el[key], scale, digits)} disabled={disabled} onKeyDown={enter} onBlur={commit(key, scale)} />
          </label>
        ))}
      </div>
      {problems.length > 0 && <div className="format bad">{problems.map((m, k) => <p key={k}>{m}</p>)}</div>}
      <p className="hint">Heliocentric elements at the instance epoch; the mean anomaly M0 says where on the orbit the asteroid is then.</p>
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
    </>
  )
}
