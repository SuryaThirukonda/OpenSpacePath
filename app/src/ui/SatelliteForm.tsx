import { useEffect, useState } from 'react'
import { DEG, RAD, wrapTwoPi } from '../core/constants'
import { apoapsisAltitude, periapsisAltitude, period, shapeFromAltitudes, validateElements } from '../core/elements'
import { trueToMean, meanToTrue } from '../core/kepler'
import { getBody } from '../data/bodies'
import { ISS_TLE, newId, PRESETS, presetElements, satelliteFromPreset, type Preset } from '../data/presets'
import { parseTle } from '../propagation/sgp4Propagator'
import { selectedSatellite, useStore } from '../store/store'
import type { KeplerSatellite, OrbitalElements } from '../types'
import { Section } from './Section'

type Mode = 'preset' | 'elements' | 'tle'

const COLORS = ['#7cf5ff', '#ff8a5c', '#f9a8d4', '#ffd166', '#b8f28b', '#c4b5fd', '#ffffff']

interface ElementFields {
  name: string
  hp: string
  ha: string
  i: string
  raan: string
  argp: string
  nu: string
  color: string
}

function fieldsFromSatellite(s: KeplerSatellite, bodyRadius: number): ElementFields {
  const el = s.elements
  return {
    name: s.name,
    hp: periapsisAltitude(el, bodyRadius).toFixed(1),
    ha: apoapsisAltitude(el, bodyRadius).toFixed(1),
    i: (el.i * RAD).toFixed(2),
    raan: (el.raan * RAD).toFixed(2),
    argp: (el.argp * RAD).toFixed(2),
    nu: (wrapTwoPi(meanToTrue(el.M0, el.e)) * RAD).toFixed(2),
    color: s.color,
  }
}

function derivedHint(f: ElementFields, R: number): string {
  const hp = Number(f.hp), ha = Number(f.ha)
  if (!(hp > 0) || !(ha > 0)) return ''
  const { a, e } = shapeFromAltitudes(hp, ha, R)
  return `a = ${a.toFixed(1)} km, e = ${e.toFixed(4)}.`
}

function presetHint(p: Preset | undefined, body: ReturnType<typeof getBody>): string {
  if (!p) return ''
  const el = presetElements(p, body)
  const T = period(el.a, body.mu) / 60
  return `${p.description}. At ${body.name}: a = ${el.a.toFixed(0)} km, e = ${el.e.toFixed(3)}, period ${T >= 120 ? (T / 60).toFixed(2) + ' h' : T.toFixed(1) + ' min'}.`
}

const EMPTY: ElementFields = { name: 'New satellite', hp: '500', ha: '500', i: '45', raan: '0', argp: '0', nu: '0', color: COLORS[0] }

export function SatelliteForm() {
  const bodyId = useStore((s) => s.scenario.bodyId)
  const selected = useStore(selectedSatellite)
  const addSatellite = useStore((s) => s.addSatellite)
  const updateSatellite = useStore((s) => s.updateSatellite)
  const requestCamera = useStore((s) => s.requestCamera)
  const [mode, setMode] = useState<Mode>('preset')
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const [f, setF] = useState<ElementFields>(EMPTY)
  const [tleText, setTleText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const body = getBody(bodyId)
  useEffect(() => {
    if (selected?.kind === 'kepler') {
      setF(fieldsFromSatellite(selected, body.radius))
      setMode('elements')
    }
  }, [selected, body.radius])

  const presets = PRESETS

  function parseElements(): OrbitalElements | null {
    const num = (s: string) => Number(s.trim())
    const hp = num(f.hp), ha = num(f.ha)
    if (!(hp > 0) || !(ha > 0)) {
      setError('altitudes must be positive (km above the surface)')
      return null
    }
    const { a, e } = shapeFromAltitudes(hp, ha, body.radius)
    const el: OrbitalElements = {
      a, e,
      i: num(f.i) * DEG, raan: num(f.raan) * DEG, argp: num(f.argp) * DEG,
      M0: Number.isFinite(e) && e < 1 ? trueToMean(num(f.nu) * DEG, e) : NaN,
    }
    const v = validateElements(el, body.radius)
    if (!v.ok) {
      setError(v.problems.join('; '))
      return null
    }
    setError(null)
    return el
  }

  function submitElements(asNew: boolean) {
    const el = parseElements()
    if (!el) return
    if (!asNew && selected?.kind === 'kepler') {
      updateSatellite({ ...selected, name: f.name || selected.name, color: f.color, elements: el })
    } else {
      addSatellite({ id: newId('sat'), kind: 'kepler', name: f.name || 'Satellite', color: f.color, elements: el })
    }
  }

  function submitPreset() {
    const p = PRESETS.find((x) => x.id === presetId)
    if (!p) return
    addSatellite(satelliteFromPreset(p, body))
    setError(null)
  }

  function submitTle() {
    const lines = tleText.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim().length > 0)
    let name = 'TLE satellite'
    let l1: string | undefined
    let l2: string | undefined
    if (lines.length >= 3) [name, l1, l2] = [lines[0].trim(), lines[1], lines[2]]
    else if (lines.length === 2) [l1, l2] = lines
    if (!l1 || !l2) {
      setError('paste a name line (optional) followed by the two element lines')
      return
    }
    const res = parseTle(l1, l2)
    if (!res.ok) {
      setError(res.error ?? 'invalid TLE')
      return
    }
    setError(null)
    addSatellite({ id: newId('tle'), kind: 'tle', name, color: f.color, line1: l1, line2: l2 })
    if (bodyId !== 'earth') setError('TLE added, but it only renders with Earth at the centre')
  }

  const field = (key: keyof ElementFields, label: string, step = 'any') => (
    <label className="field">
      <span>{label}</span>
      <input type="number" step={step} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </label>
  )

  return (
    <Section title={selected?.kind === 'kepler' ? 'Edit or add satellite' : 'Add satellite'}>
      <div className="tabs">
        {(['preset', 'elements', 'tle'] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? 'tab active' : 'tab'} onClick={() => setMode(m)}>
            {m === 'preset' ? 'Preset' : m === 'elements' ? 'Elements' : 'TLE'}
          </button>
        ))}
      </div>

      {mode === 'preset' && (
        <div className="form">
          <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="hint">{presetHint(presets.find((p) => p.id === presetId), body)}</p>
          <div className="row">
            <button className="primary" onClick={submitPreset}>Add preset</button>
            <button onClick={() => { submitPreset(); requestCamera('orbit') }}>Add and frame</button>
          </div>
        </div>
      )}

      {mode === 'elements' && (
        <div className="form">
          <label className="field">
            <span>Name</span>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </label>
          <div className="grid2">
            {field('hp', 'periapsis altitude, km')}
            {field('ha', 'apoapsis altitude, km')}
            {field('i', 'i, deg')}
            {field('raan', 'RAAN, deg')}
            {field('argp', 'arg. periapsis, deg')}
            {field('nu', 'true anomaly at epoch, deg')}
          </div>
          <div className="row">
            <span className="hint">colour</span>
            {COLORS.map((c) => (
              <button
                key={c}
                className={'swatch-btn' + (f.color === c ? ' on' : '')}
                style={{ background: c }}
                onClick={() => setF({ ...f, color: c })}
                aria-label={c}
              />
            ))}
          </div>
          <div className="row">
            {selected?.kind === 'kepler' && (
              <button className="primary" onClick={() => submitElements(false)}>Update {selected.name}</button>
            )}
            <button className={selected?.kind === 'kepler' ? '' : 'primary'} onClick={() => submitElements(true)}>Add as new</button>
            <button onClick={() => setF(EMPTY)}>Clear</button>
          </div>
          <p className="hint">{derivedHint(f, body.radius)} Angles in degrees. Body: {body.name}, radius {body.radius.toFixed(0)} km, mu {body.mu.toPrecision(7)} km^3/s^2. Orbits keep their shape when you switch bodies: altitudes scale with the body's radius.</p>
        </div>
      )}

      {mode === 'tle' && (
        <div className="form">
          <textarea
            rows={4}
            spellCheck={false}
            placeholder={'ISS (ZARYA)\n1 25544U 98067A   26244.49851260 ...\n2 25544  51.6312 282.3953 ...'}
            value={tleText}
            onChange={(e) => setTleText(e.target.value)}
          />
          <div className="row">
            <button className="primary" onClick={submitTle}>Add TLE</button>
            <button
              onClick={() => {
                setTleText(`${ISS_TLE.name}\n${ISS_TLE.line1}\n${ISS_TLE.line2}`)
              }}
            >
              Paste bundled ISS
            </button>
          </div>
          <p className="hint">Propagated with SGP4 (satellite.js). Fresh element sets: celestrak.org/NORAD/elements (fetch at most every 2 hours).</p>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </Section>
  )
}
