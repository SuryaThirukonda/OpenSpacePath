import { useState } from 'react'
import { absoluteDate, formatDuration, formatUtc } from '../core/time'
import { cloneVehicle, defaultLaunch, grossMass, LAUNCH_SITES, LAUNCH_VEHICLES, vehicleCapacity } from '../data/launch'
import { emptyMission, SHIP_PRESETS, shipCapacity } from '../data/ships'
import type { LaunchReport, LaunchSpec, MissionInput, Ship, Stage, Stop, Strategy } from '../mission/types'
import { planStart } from '../mission/types'
import { epochMs, useStore } from '../store/store'

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
      <div className="label">Start</div>
      <select
        value={mission.start.kind === 'satellite' ? mission.start.id : mission.start.kind === 'launch' ? 'launch' : 'parking'}
        onChange={(e) => update({
          start: e.target.value === 'parking' ? emptyMission(scenario).start
            : e.target.value === 'launch' ? { kind: 'launch', launch: defaultLaunch() }
            : { kind: 'satellite', id: e.target.value },
        })}
      >
        <option value="parking">ISS-class parking orbit</option>
        <option value="launch">launch from the ground</option>
        {scenario.satellites.map((s) => (
          <option key={s.id} value={s.id}>ride with {s.name}</option>
        ))}
      </select>
      {mission.start.kind === 'launch' && (
        <LaunchForm spec={mission.start.launch} payload={mission.ship.dryMass + mission.ship.propellantMass} onChange={(launch) => update({ start: { kind: 'launch', launch } })} />
      )}

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
        {plan && <button onClick={() => { const start = planStart(plan, mission.startT); setSpan(start + plan.totalTime); setT(start); }}>Fit timeline</button>}
        {plan && <button onClick={() => requestCamera('ship')}>Frame tour</button>}
      </div>
      {planStatus === 'loading' && <p className="hint">{mission.start.kind === 'launch' ? 'Finding the launch window, integrating the ascent, then solving' : 'Solving'} Lambert transfers on the server. "Best of all" tries every strategy and takes about 15 s per stop; a single strategy is a few seconds.</p>}
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
          {plan.launch && <LaunchResults report={plan.launch} epoch={epochMs(useStore.getState())} />}
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

function LaunchForm({ spec, payload, onChange }: { spec: LaunchSpec; payload: number; onChange: (spec: LaunchSpec) => void }) {
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : fallback)
  const site = LAUNCH_SITES.find((x) => x.name === spec.site.name)
  const vehicle = LAUNCH_VEHICLES.find((x) => x.name === spec.vehicle.name)
  const setSite = (partial: Partial<LaunchSpec['site']>) => onChange({ ...spec, site: { ...spec.site, ...partial } })
  const setVehicle = (partial: Partial<LaunchSpec['vehicle']>) => onChange({ ...spec, vehicle: { ...spec.vehicle, ...partial } })
  const setStage = (i: number, partial: Partial<Stage>) =>
    setVehicle({ name: 'custom', stages: spec.vehicle.stages.map((st, k) => (k === i ? { ...st, ...partial } : st)) })
  return (
    <div className="launch">
      <div className="grid2">
        <label className="field"><span>site</span>
          <select value={site ? site.name : 'custom'} onChange={(e) => { const x = LAUNCH_SITES.find((y) => y.name === e.target.value); if (x) onChange({ ...spec, site: { ...x } }) }}>
            {LAUNCH_SITES.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
            <option value="custom">custom</option>
          </select>
        </label>
        <label className="field"><span>parking altitude, km</span><input type="number" min={120} max={2000} value={spec.parkingAltitude} onChange={(e) => onChange({ ...spec, parkingAltitude: Math.min(2000, Math.max(120, num(e.target.value, spec.parkingAltitude))) })} /></label>
        <label className="field"><span>latitude, deg</span><input type="number" step="any" min={-90} max={90} value={spec.site.latitude} onChange={(e) => setSite({ name: 'custom', latitude: Math.max(-90, Math.min(90, num(e.target.value, spec.site.latitude))) })} /></label>
        <label className="field"><span>longitude, deg east</span><input type="number" step="any" min={-180} max={180} value={spec.site.longitude} onChange={(e) => setSite({ name: 'custom', longitude: Math.max(-180, Math.min(180, num(e.target.value, spec.site.longitude))) })} /></label>
      </div>
      <p className="hint">Liftoff waits for the next window after the start time, when the pad passes through the first stop's orbit plane; the azimuth then comes from cos i = cos(latitude) sin(azimuth). A site poleward of the target inclination launches due east and the first leg pays the plane change.</p>
      <label className="field"><span>vehicle</span>
        <select value={vehicle ? vehicle.name : 'custom'} onChange={(e) => { const x = LAUNCH_VEHICLES.find((y) => y.name === e.target.value); if (x) onChange({ ...spec, vehicle: cloneVehicle(x) }) }}>
          {LAUNCH_VEHICLES.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
          <option value="custom">custom</option>
        </select>
      </label>
      {spec.vehicle.stages.map((st, i) => (
        <div key={i} className="stage">
          <div className="hint">{st.name}</div>
          <div className="grid2">
            <label className="field"><span>dry mass, kg</span><input type="number" min={1} value={st.dryMass} onChange={(e) => setStage(i, { dryMass: Math.max(1, num(e.target.value, st.dryMass)) })} /></label>
            <label className="field"><span>propellant, kg</span><input type="number" min={1} value={st.propellantMass} onChange={(e) => setStage(i, { propellantMass: Math.max(1, num(e.target.value, st.propellantMass)) })} /></label>
            <label className="field"><span>Isp vacuum, s</span><input type="number" min={1} value={st.ispVacuum} onChange={(e) => setStage(i, { ispVacuum: Math.max(1, num(e.target.value, st.ispVacuum)) })} /></label>
            <label className="field"><span>thrust vacuum, kN</span><input type="number" min={1} value={st.thrustVacuum / 1000} onChange={(e) => setStage(i, { thrustVacuum: Math.max(1, num(e.target.value, st.thrustVacuum / 1000)) * 1000 })} /></label>
          </div>
        </div>
      ))}
      <div className="grid2">
        <label className="field"><span>drag area, m²</span><input type="number" min={0.1} step="any" value={spec.vehicle.dragArea} onChange={(e) => setVehicle({ name: 'custom', dragArea: Math.max(0.1, num(e.target.value, spec.vehicle.dragArea)) })} /></label>
        <label className="field"><span>acceleration limit, g</span><input type="number" min={1.5} max={20} step="any" value={spec.vehicle.maxAcceleration} onChange={(e) => setVehicle({ name: 'custom', maxAcceleration: Math.min(20, Math.max(1.5, num(e.target.value, spec.vehicle.maxAcceleration))) })} /></label>
      </div>
      <p className="hint">
        The ship above is the payload: {(payload / 1000).toFixed(1)} t on a {(grossMass(spec.vehicle, payload) / 1000).toFixed(0)} t vehicle,
        {' '}{vehicleCapacity(spec.vehicle, payload).toFixed(2)} km/s ideal. The planner integrates the ascent with drag, gravity and steering losses,
        stages when a tank empties, cuts off when the apoapsis reaches the parking altitude, coasts up and circularizes; the tour starts from that orbit.
      </p>
    </div>
  )
}

function LaunchResults({ report, epoch }: { report: LaunchReport; epoch: number }) {
  const b = report.budget
  const losses = b.gravityLoss + b.dragLoss + b.steeringLoss
  const when = (t: number) => `t = ${formatDuration(t)} (${formatUtc(absoluteDate(epoch, t))})`
  return (
    <div className="section">
      <div className="label">Launch {report.feasible ? '' : '(does not reach orbit)'}</div>
      <table className="kv"><tbody>
        <tr><td>liftoff</td><td>{report.siteName}, {when(report.liftoffT)}</td></tr>
        <tr><td>azimuth</td><td>{report.azimuthDeg.toFixed(1)}° from north, into {report.inclinationDeg.toFixed(2)}° (plane match {(100 * report.planeAlignment).toFixed(1)}%)</td></tr>
        <tr><td>vehicle</td><td>{report.vehicleName}, {(report.grossLiftoffMass / 1000).toFixed(0)} t at liftoff, {(report.payloadMass / 1000).toFixed(1)} t payload</td></tr>
        <tr><td>ascent</td><td>kick {report.kickAngleDeg.toFixed(1)}°, max-Q {report.maxQ.toFixed(0)} kPa, max {report.maxG.toFixed(1)} g, {report.downrangeKm.toFixed(0)} km downrange</td></tr>
        <tr><td>cutoff</td><td>{when(report.mecoT)}</td></tr>
        <tr><td>parking orbit</td><td>{report.parkingAltitude.toFixed(0)} km circular, period {formatDuration(report.parkingPeriod)}, reached {when(report.insertionT)}</td></tr>
        {report.stages.map((st) => (
          <tr key={st.name}><td>{st.name}</td><td>{(st.propellantUsed / 1000).toFixed(1)} t burned in {formatDuration(st.burnTime)}, {(st.propellantLeft / 1000).toFixed(1)} t left</td></tr>
        ))}
        <tr><td>delta-v delivered</td><td>{(b.ideal + b.circularization).toFixed(2)} km/s (ascent {b.ideal.toFixed(2)} + circularization {b.circularization.toFixed(2)})</td></tr>
        <tr><td>losses</td><td>{losses.toFixed(2)} km/s: gravity {b.gravityLoss.toFixed(2)}, drag {b.dragLoss.toFixed(2)}, steering {b.steeringLoss.toFixed(2)}</td></tr>
        <tr><td>rotation</td><td>{(b.earthRotation * 1000).toFixed(0)} m/s from the spin, {(b.planeCorrection * 1000).toFixed(0)} m/s to steer into the plane</td></tr>
      </tbody></table>
      {report.warnings.map((w, k) => <div key={k} className="error">{w}</div>)}
    </div>
  )
}
