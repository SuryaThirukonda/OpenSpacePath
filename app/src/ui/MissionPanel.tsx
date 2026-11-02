import { useState, type CSSProperties } from 'react'
import { absoluteDate, formatDuration, formatUtc } from '../core/time'
import { cloneVehicle, defaultLaunch, grossMass, LAUNCH_SITES, LAUNCH_VEHICLES, vehicleCapacity } from '../data/launch'
import { LEG_COLORS } from '../data/legColors'
import { emptyMission, SHIP_PRESETS, shipCapacity } from '../data/ships'
import type { LaunchReport, LaunchSpec, MissionInput, Ship, Stage, Stop } from '../mission/types'
import { DEFAULT_SOLVER } from '../mission/api'
import { DEFAULT_TRANSFER, planStart, transferName } from '../mission/types'
import { epochMs, useStore } from '../store/store'
import { IconDown, IconPlus, IconUp, IconX } from './icons'
import { Section } from './Section'
import { SolverSelect } from './SolverSelect'
import { TransferSelect } from './TransferSelect'
import { useSolvers } from './useSolvers'

/** Mission tab: start orbit, ship, ordered stops, plan request and results. The camera is in the toolbar's View menu. */
export function MissionPanel() {
  const scenario = useStore((s) => s.scenario)
  const plan = useStore((s) => s.plan)
  const planStatus = useStore((s) => s.planStatus)
  const planError = useStore((s) => s.planError)
  const planStale = useStore((s) => s.planStale)
  const selectedLeg = useStore((s) => s.selectedLeg)
  const { setMission, requestPlan, selectLeg, requestCamera, setSpan, setT } = useStore.getState()
  const mission: MissionInput = scenario.mission ?? emptyMission(scenario)
  const [chosenId, setAddId] = useState(scenario.satellites[0]?.id ?? '')
  // the satellite picked earlier may have been removed since: fall back to the first one there is
  const addId = scenario.satellites.some((s) => s.id === chosenId) ? chosenId : (scenario.satellites[0]?.id ?? '')
  const solvers = useSolvers()
  const solverId = scenario.solver ?? DEFAULT_SOLVER
  const transfer = scenario.transfer ?? DEFAULT_TRANSFER

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

  const startSummary = mission.start.kind === 'launch' ? `launch from ${mission.start.launch.site.name}`
    : mission.start.kind === 'satellite' ? `ride with ${nameOf(mission.start.id)}` : 'ISS-class parking orbit'
  const dv = shipCapacity(mission.ship)

  return (
    <div className="form mission">
      <Section title="Start" summary={startSummary}>
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
      </Section>

      <Section title="Ship" defaultOpen={false} summary={`${mission.ship.name} · ${dv.toFixed(1)} km/s`}>
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
        <p className="hint">Capacity {dv.toFixed(2)} km/s of delta-v from the rocket equation. Burns are impulsive in the path; the duration shown is what full thrust would take.</p>
      </Section>

      <Section title="Stops" count={mission.stops.length}>
        {mission.stops.length === 0 && (scenario.satellites.length === 0
          ? <p className="hint">There are no satellites to visit. Add some on the Satellites tab first.</p>
          : <p className="hint">No stops yet. Add satellites below; the ship visits them in this order and waits the dwell time at each.</p>)}
        <ol className="stops">
          {mission.stops.map((st, i) => (
            <li key={i} className={selectedLeg === i ? 'selected' : ''} style={{ '--leg': LEG_COLORS[i % LEG_COLORS.length] } as CSSProperties}>
              <div className="row">
                <span className="stop-index">{i + 1}</span>
                <select value={st.satelliteId} aria-label={`satellite at stop ${i + 1}`} onChange={(e) => updateStop(i, { satelliteId: e.target.value })}>
                  {scenario.satellites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button className="icon" onClick={() => moveStop(i, -1)} aria-label={`move stop ${i + 1}, ${nameOf(st.satelliteId)}, up`} disabled={i === 0}><IconUp /></button>
                <button className="icon" onClick={() => moveStop(i, 1)} aria-label={`move stop ${i + 1}, ${nameOf(st.satelliteId)}, down`} disabled={i === mission.stops.length - 1}><IconDown /></button>
                <button className="icon remove" onClick={() => update({ stops: mission.stops.filter((_, k) => k !== i) })} aria-label={`remove stop ${i + 1}, ${nameOf(st.satelliteId)}`}><IconX /></button>
              </div>
              <label className="field"><span>dwell, minutes</span><input type="number" min={0} value={st.dwellSeconds / 60} onChange={(e) => updateStop(i, { dwellSeconds: Math.max(0, num(e.target.value, st.dwellSeconds / 60)) * 60 })} /></label>
            </li>
          ))}
        </ol>
        <div className="row add-stop">
          <select value={addId} onChange={(e) => setAddId(e.target.value)} aria-label="satellite to add as a stop">
            {scenario.satellites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button disabled={!addId} onClick={() => update({ stops: [...mission.stops, { satelliteId: addId, dwellSeconds: 1800 }] })}><IconPlus /> Add stop</button>
        </div>
        <div className="grid2">
          <label className="field"><span>start at t, minutes</span><input type="number" value={mission.startT / 60} onChange={(e) => update({ startT: num(e.target.value, mission.startT / 60) * 60 })} /></label>
          <label className="field"><span>departure window, hours</span><input type="number" min={0} step="any" value={mission.departureWindow / 3600} onChange={(e) => update({ departureWindow: Math.max(0, num(e.target.value, 0)) * 3600 })} /></label>
        </div>
      </Section>

      <Section id="mission-transfer" title="Transfer" defaultOpen={false} summary={`${transferName(transfer)} · ${solvers.find((s) => s.id === solverId)?.name ?? solverId}`}>
        <p className="hint">Used for every leg of this tour.</p>
        <TransferSelect />
        <SolverSelect />
      </Section>

      <div className="plan-bar">
        <button className="primary big" disabled={mission.stops.length === 0 || planStatus === 'loading'} onClick={() => void requestPlan()}>
          {planStatus === 'loading' ? <><span className="spinner" aria-hidden="true" /> Planning…</> : 'Plan'}
        </button>
        {plan && <button onClick={() => { const start = planStart(plan, mission.startT); setSpan(start + plan.totalTime); setT(start); }}>Fit timeline</button>}
        {plan && <button onClick={() => requestCamera('ship')}>Frame tour</button>}
      </div>
      {planStatus === 'loading' && <p className="hint">{mission.start.kind === 'launch' ? 'Finding the launch window, integrating the ascent, then solving' : 'Solving'} the transfers on the server: a two-burn leg takes a few seconds, a three-burn leg scans arrival times and takes longer.</p>}
      {planStatus === 'error' && <p className="error">{planError}</p>}
      {planStatus === 'idle' && planStale && mission.stops.length > 0 && !plan && <p className="hint">Inputs changed since the last plan. Press Plan to recompute.</p>}

      {plan && (
        <Section title={plan.feasible ? 'Plan' : 'Plan (not feasible with this ship)'}>
          <div className="tiles">
            <div className="tile"><span className="tile-k">delta-v</span><span className="tile-v">{plan.totalDv.toFixed(2)}<small>km/s</small></span></div>
            <div className="tile"><span className="tile-k">time</span><span className="tile-v">{plan.totalTime >= 172800 ? (plan.totalTime / 86400).toFixed(1) : (plan.totalTime / 3600).toFixed(1)}<small>{plan.totalTime >= 172800 ? 'd' : 'h'}</small></span></div>
            {plan.propellantLeft < 0
              ? <div className="tile"><span className="tile-k">fuel</span><span className="tile-v"><small>not modelled</small></span></div>
              : <div className={plan.feasible ? 'tile' : 'tile bad'}><span className="tile-k">fuel left</span><span className="tile-v">{plan.propellantLeft >= 10000 ? (plan.propellantLeft / 1000).toFixed(1) : plan.propellantLeft.toFixed(0)}<small>{plan.propellantLeft >= 10000 ? 't' : 'kg'}</small></span></div>}
          </div>
          {plan.launch && <LaunchResults report={plan.launch} epoch={epochMs(useStore.getState())} />}
          <ol className="legs">
            {plan.legs.map((l) => (
              <li
                key={l.toStop}
                className={selectedLeg === l.toStop ? 'selected' : ''}
                style={{ '--leg': LEG_COLORS[l.toStop % LEG_COLORS.length] } as CSSProperties}
                onClick={() => { selectLeg(selectedLeg === l.toStop ? null : l.toStop); requestCamera('ship') }}
              >
                <div className="leg-head"><b>Leg {l.toStop + 1}</b><span className="leg-to">to {nameOf(mission.stops[l.toStop]?.satelliteId ?? '')}</span><span className="leg-dv">{l.totalDv.toFixed(3)} km/s</span></div>
                <div className="hint">{l.strategy === 'threeburn' ? 'three-burn' : 'Lambert'} · {l.burns.length} burns · TOF {formatDuration(l.tof)} · departs t = {formatDuration(l.arcs[0]?.t0 ?? l.burns[0]?.t ?? 0)}</div>
                {l.warnings.map((w, k) => <div key={k} className="error">{w}</div>)}
              </li>
            ))}
          </ol>
        </Section>
      )}

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
        The ship below is the payload: {(payload / 1000).toFixed(1)} t on a {(grossMass(spec.vehicle, payload) / 1000).toFixed(0)} t vehicle,
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
    <div className="subblock">
      <div className="subhead">Launch {report.feasible ? '' : '(does not reach orbit)'}</div>
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
