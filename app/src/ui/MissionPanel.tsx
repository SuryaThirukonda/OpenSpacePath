import { useState } from 'react'
import { formatDuration } from '../core/time'
import { emptyMission, SHIP_PRESETS, shipCapacity } from '../data/ships'
import type { MissionInput, Ship, Stop, Strategy } from '../mission/types'
import { useStore } from '../store/store'

const STRATEGIES: Array<[Strategy, string]> = [
  ['best', 'best of all'], ['lambert2', '2-burn Lambert'], ['phasing3', '3-burn phasing'], ['bielliptic3', '3-burn bi-elliptic'], ['waypoint4', '4-burn waypoints'],
]

/** Mission tab: start orbit, ship, ordered stops, plan request, results and view toggles. */
export function MissionPanel() {
  const scenario = useStore((s) => s.scenario)
  const plan = useStore((s) => s.plan)
  const planStatus = useStore((s) => s.planStatus)
  const planError = useStore((s) => s.planError)
  const followShip = useStore((s) => s.followShip)
  const showRemaining = useStore((s) => s.showRemaining)
  const showBurnLabels = useStore((s) => s.showBurnLabels)
  const selectedLeg = useStore((s) => s.selectedLeg)
  const { setMission, requestPlan, toggleFollowShip, toggleRemaining, toggleBurnLabels, selectLeg, requestCamera, setSpan, setT } = useStore.getState()
  const mission: MissionInput = scenario.mission ?? emptyMission(scenario)
  const [addId, setAddId] = useState(scenario.satellites[0]?.id ?? '')

  const update = (partial: Partial<MissionInput>) => setMission({ ...mission, ...partial })
  const updateShip = (partial: Partial<Ship>) => update({ ship: { ...mission.ship, ...partial } })
  const updateStop = (i: number, partial: Partial<Stop>) => update({ stops: mission.stops.map((s, k) => (k === i ? { ...s, ...partial } : s)) })
  const moveStop = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= mission.stops.length) return
    const stops = [...mission.stops]
    ;[stops[i], stops[j]] = [stops[j], stops[i]]
    update({ stops })
  }
  const nameOf = (id: string) => scenario.satellites.find((s) => s.id === id)?.name ?? id
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : fallback)

  return (
    <div className="form mission">
      <div className="label">Start orbit</div>
      <select
        value={mission.start.kind === 'satellite' ? mission.start.id : 'parking'}
        onChange={(e) => update({ start: e.target.value === 'parking' ? emptyMission(scenario).start : { kind: 'satellite', id: e.target.value } })}
      >
        <option value="parking">ISS-class parking orbit</option>
        {scenario.satellites.map((s) => (
          <option key={s.id} value={s.id}>ride with {s.name}</option>
        ))}
      </select>

      <div className="label">Ship</div>
      <select
        value={SHIP_PRESETS.find((p) => p.ship.name === mission.ship.name)?.id ?? 'custom'}
        onChange={(e) => {
          const p = SHIP_PRESETS.find((x) => x.id === e.target.value)
          if (p) update({ ship: { ...p.ship } })
        }}
      >
        {SHIP_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
        <option value="custom">custom</option>
      </select>
      <div className="grid2">
        <label className="field"><span>dry mass, kg</span><input type="number" min={1} value={mission.ship.dryMass} onChange={(e) => updateShip({ name: 'custom', dryMass: num(e.target.value, mission.ship.dryMass) })} /></label>
        <label className="field"><span>propellant, kg</span><input type="number" min={0} value={mission.ship.propellantMass} onChange={(e) => updateShip({ name: 'custom', propellantMass: num(e.target.value, mission.ship.propellantMass) })} /></label>
        <label className="field"><span>Isp, s</span><input type="number" min={1} value={mission.ship.isp} onChange={(e) => updateShip({ name: 'custom', isp: num(e.target.value, mission.ship.isp) })} /></label>
        <label className="field"><span>max thrust, N</span><input type="number" min={1} value={mission.ship.maxThrust} onChange={(e) => updateShip({ name: 'custom', maxThrust: num(e.target.value, mission.ship.maxThrust) })} /></label>
        <label className="field"><span>max speed, km/s (blank = none)</span><input type="number" min={0} step="any" value={mission.ship.maxSpeed ?? ''} onChange={(e) => updateShip({ name: 'custom', maxSpeed: e.target.value === '' ? undefined : num(e.target.value, 0) || undefined })} /></label>
        <label className="field"><span>min burn spacing, s</span><input type="number" min={0} value={mission.ship.minBurnSpacing} onChange={(e) => updateShip({ minBurnSpacing: num(e.target.value, mission.ship.minBurnSpacing) })} /></label>
      </div>
      <p className="hint">Capacity {shipCapacity(mission.ship).toFixed(2)} km/s of delta-v from the rocket equation. Burns are impulsive in the path; the duration shown is what full thrust would take.</p>

      <div className="label">Stops, in order</div>
      {mission.stops.length === 0 && <p className="hint">No stops yet. Add satellites below; the ship visits them in this order and waits the dwell time at each.</p>}
      <ol className="stops">
        {mission.stops.map((st, i) => (
          <li key={i} className={selectedLeg === i ? 'selected' : ''}>
            <div className="row">
              <span className="stop-index">{i + 1}</span>
              <select value={st.satelliteId} onChange={(e) => updateStop(i, { satelliteId: e.target.value })}>
                {scenario.satellites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button className="icon" onClick={() => moveStop(i, -1)} aria-label="move up" disabled={i === 0}>↑</button>
              <button className="icon" onClick={() => moveStop(i, 1)} aria-label="move down" disabled={i === mission.stops.length - 1}>↓</button>
              <button className="icon" onClick={() => update({ stops: mission.stops.filter((_, k) => k !== i) })} aria-label="remove stop">x</button>
            </div>
            <div className="grid2">
              <label className="field"><span>dwell, minutes</span><input type="number" min={0} value={st.dwellSeconds / 60} onChange={(e) => updateStop(i, { dwellSeconds: Math.max(0, num(e.target.value, st.dwellSeconds / 60)) * 60 })} /></label>
              <label className="field"><span>strategy</span>
                <select value={st.strategy} onChange={(e) => updateStop(i, { strategy: e.target.value as Strategy })}>
                  {STRATEGIES.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </label>
            </div>
          </li>
        ))}
      </ol>
      <div className="row">
        <select value={addId} onChange={(e) => setAddId(e.target.value)}>
          {scenario.satellites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button disabled={!addId} onClick={() => update({ stops: [...mission.stops, { satelliteId: addId, dwellSeconds: 1800, strategy: 'best' }] })}>Add stop</button>
      </div>
      <div className="grid2">
        <label className="field"><span>start at t, minutes</span><input type="number" value={mission.startT / 60} onChange={(e) => update({ startT: num(e.target.value, mission.startT / 60) * 60 })} /></label>
        <label className="field"><span>departure window, hours</span><input type="number" min={0} step="any" value={mission.departureWindow / 3600} onChange={(e) => update({ departureWindow: Math.max(0, num(e.target.value, 0)) * 3600 })} /></label>
      </div>

      <div className="row">
        <button className="primary" disabled={mission.stops.length === 0 || planStatus === 'loading'} onClick={() => void requestPlan()}>
          {planStatus === 'loading' ? 'Planning…' : 'Plan'}
        </button>
        {plan && <button onClick={() => { const end = mission.startT + plan.totalTime; setSpan(end); setT(mission.startT); }}>Fit timeline</button>}
        {plan && <button onClick={() => requestCamera('ship')}>Frame tour</button>}
      </div>
      {planStatus === 'error' && <p className="error">{planError}</p>}
      {planStatus === 'idle' && scenario.mission && scenario.mission.stops.length > 0 && !plan && <p className="hint">Inputs changed. Press Plan to recompute.</p>}

      {plan && (
        <div className="section">
          <div className="label">Plan {plan.feasible ? '' : '(not feasible with this ship)'}</div>
          <table className="kv"><tbody>
            <tr><td>total delta-v</td><td>{plan.totalDv.toFixed(3)} km/s</td></tr>
            <tr><td>total time</td><td>{formatDuration(plan.totalTime)}</td></tr>
            <tr><td>propellant left</td><td>{plan.propellantLeft.toFixed(0)} kg</td></tr>
          </tbody></table>
          <ol className="legs">
            {plan.legs.map((l) => (
              <li key={l.toStop} className={selectedLeg === l.toStop ? 'selected' : ''} onClick={() => { selectLeg(selectedLeg === l.toStop ? null : l.toStop); requestCamera('ship') }}>
                <div><b>Leg {l.toStop + 1}</b> to {nameOf(mission.stops[l.toStop]?.satelliteId ?? '')} · {l.strategy} · {l.burns.length} burns</div>
                <div className="hint">TOF {formatDuration(l.tof)} · {l.totalDv.toFixed(3)} km/s · depart at t = {formatDuration(l.burns[0]?.t ?? 0)}</div>
                {l.warnings.map((w, k) => <div key={k} className="error">{w}</div>)}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="section row">
        <button className={followShip ? 'toggle on' : 'toggle'} onClick={toggleFollowShip}>Follow ship</button>
        <button className={showRemaining ? 'toggle on' : 'toggle'} onClick={toggleRemaining}>Remaining path</button>
        <button className={showBurnLabels ? 'toggle on' : 'toggle'} onClick={toggleBurnLabels}>Burn labels</button>
      </div>
    </div>
  )
}
