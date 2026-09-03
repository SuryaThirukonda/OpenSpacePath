import { RAD, TWO_PI, wrapTwoPi } from '../core/constants'
import { apoapsisAltitude, periapsisAltitude, period } from '../core/elements'
import { elementsToState, norm, trueAnomalyAt } from '../core/kepler'
import { formatDuration } from '../core/time'
import { getBody } from '../data/bodies'
import { satrecFor, satrecToElements, sgp4Epoch, sgp4StateAt } from '../propagation/sgp4Propagator'
import { epochMs, selectedSatellite, useStore } from '../store/store'

interface Row {
  k: string
  v: string
}

export function ElementsPanel() {
  const sat = useStore(selectedSatellite)
  const bodyId = useStore((s) => s.scenario.bodyId)
  const t = useStore((s) => s.t)
  const eMs = useStore(epochMs)
  if (!sat) {
    return (
      <div className="panel right">
        <div className="label">Elements</div>
        <p className="hint">Select a satellite to see its elements and live state.</p>
      </div>
    )
  }
  const body = getBody(bodyId)
  const rows: Row[] = []
  const deg = (x: number) => `${(wrapTwoPi(x) * RAD).toFixed(3)} deg`

  if (sat.kind === 'kepler') {
    const el = sat.elements
    const st = elementsToState(el, body.mu, t)
    const r = norm(st.r)
    const nu = trueAnomalyAt(el, body.mu, t)
    rows.push(
      { k: 'Model', v: 'two-body Keplerian' },
      { k: 'a', v: `${el.a.toFixed(1)} km` },
      { k: 'e', v: el.e.toFixed(5) },
      { k: 'i', v: deg(el.i) },
      { k: 'RAAN', v: deg(el.raan) },
      { k: 'arg. periapsis', v: deg(el.argp) },
      { k: 'true anomaly now', v: deg(nu) },
      { k: 'mean anomaly now', v: deg(el.M0 + (TWO_PI / period(el.a, body.mu)) * t) },
      { k: 'period', v: `${formatDuration(period(el.a, body.mu))} (${(period(el.a, body.mu) / 60).toFixed(2)} min)` },
      { k: 'periapsis alt.', v: `${periapsisAltitude(el, body.radius).toFixed(1)} km` },
      { k: 'apoapsis alt.', v: `${apoapsisAltitude(el, body.radius).toFixed(1)} km` },
      { k: '|r|', v: `${r.toFixed(1)} km (alt ${(r - body.radius).toFixed(1)} km)` },
      { k: 'speed', v: `${norm(st.v).toFixed(4)} km/s` },
    )
  } else if (bodyId !== 'earth') {
    rows.push({ k: 'Model', v: 'SGP4 (hidden: Earth only)' })
  } else {
    const rec = satrecFor(sat)
    if (!rec) {
      rows.push({ k: 'Model', v: 'SGP4 (element set could not be initialised)' })
    } else {
      const el = satrecToElements(rec)
      const st = sgp4StateAt(rec, new Date(eMs + t * 1000))
      const T = TWO_PI / (rec.no / 60)
      rows.push(
        { k: 'Model', v: 'SGP4 via satellite.js (TEME frame)' },
        { k: 'catalog no.', v: String(rec.satnum) },
        { k: 'element epoch', v: sgp4Epoch(rec).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' },
        { k: 'a (mean)', v: `${el.a.toFixed(1)} km` },
        { k: 'e', v: el.e.toFixed(7) },
        { k: 'i', v: deg(el.i) },
        { k: 'RAAN', v: deg(el.raan) },
        { k: 'arg. perigee', v: deg(el.argp) },
        { k: 'mean anomaly (epoch)', v: deg(el.M0) },
        { k: 'mean motion', v: `${((rec.no * 1440) / TWO_PI).toFixed(8)} rev/day` },
        { k: 'period', v: `${formatDuration(T)} (${(T / 60).toFixed(2)} min)` },
        { k: 'B*', v: rec.bstar.toExponential(4) + ' /Earth radii' },
      )
      if (st) {
        const r = norm(st.r)
        rows.push(
          { k: '|r|', v: `${r.toFixed(1)} km (alt ${(r - body.radius).toFixed(1)} km)` },
          { k: 'speed', v: `${norm(st.v).toFixed(4)} km/s` },
        )
      } else {
        rows.push({ k: 'state', v: 'propagation failed at this time' })
      }
    }
  }

  return (
    <div className="panel right">
      <div className="label">
        <span className="swatch" style={{ background: sat.color }} /> {sat.name}
      </div>
      <table className="kv">
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td>{r.k}</td>
              <td>{r.v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
