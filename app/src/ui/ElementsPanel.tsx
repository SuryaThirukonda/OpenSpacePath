import { RAD, TWO_PI, wrapTwoPi } from '../core/constants'
import { apoapsisAltitude, periapsisAltitude, period } from '../core/elements'
import { elementsToState, norm, trueAnomalyAt } from '../core/kepler'
import { formatDuration } from '../core/time'
import { getBody } from '../data/bodies'
import { satrecFor, satrecToElements, sgp4Epoch, sgp4Period, sgp4StateAt } from '../propagation/sgp4Propagator'
import { epochMs, selectedSatellite, useStore } from '../store/store'
import { AU_KM } from '../arp/instance'
import { isNarrowScreen } from './layout'
import { Panel } from './Panel'

interface Row {
  k: string
  v: string
}

/** A headline number shown above the table. */
interface Tile {
  k: string
  v: string
  unit: string
}

function durationTile(seconds: number): Tile {
  return seconds >= 2 * 86400 ? { k: 'period', v: (seconds / 86400).toFixed(2), unit: 'd' }
    : seconds >= 2 * 3600 ? { k: 'period', v: (seconds / 3600).toFixed(2), unit: 'h' }
    : { k: 'period', v: (seconds / 60).toFixed(1), unit: 'min' }
}

function altitudeTile(km: number): Tile {
  return Math.abs(km) >= 100000 ? { k: 'altitude', v: (km / 1000).toFixed(0), unit: 'Mm' } : { k: 'altitude', v: km.toFixed(km >= 10000 ? 0 : 1), unit: 'km' }
}

export function ElementsPanel() {
  const sat = useStore(selectedSatellite)
  const bodyId = useStore((s) => s.scenario.bodyId)
  const t = useStore((s) => s.t)
  const eMs = useStore(epochMs)
  const world = useStore((s) => s.world)
  if (!sat) {
    return (
      <Panel position="right" title="Elements" defaultOpen={!isNarrowScreen()}>
        <p className="hint empty">{world === 'asteroids'
          ? 'Click an asteroid or Earth in the scene to see its orbit around the Sun and where it is now.'
          : 'Select a satellite in the list on the Satellites tab, or click one in the scene, to see its elements and live state.'}</p>
      </Panel>
    )
  }
  const body = getBody(bodyId)
  const rows: Row[] = []
  const tiles: Tile[] = []
  const deg = (x: number) => `${(wrapTwoPi(x) * RAD).toFixed(3)} deg`

  if (sat.kind === 'kepler' && bodyId === 'sun') {
    // around the Sun: distances in AU and periods in days or years, not altitudes above its surface
    const el = sat.elements
    const st = elementsToState(el, body.mu, t)
    const r = norm(st.r)
    const T = period(el.a, body.mu)
    const au = (km: number) => `${(km / AU_KM).toFixed(4)} AU`
    const days = T / 86400
    tiles.push({ k: 'from Sun', v: (r / AU_KM).toFixed(3), unit: 'AU' }, { k: 'speed', v: norm(st.v).toFixed(2), unit: 'km/s' },
               days >= 730 ? { k: 'period', v: (days / 365.25).toFixed(2), unit: 'y' } : { k: 'period', v: days.toFixed(0), unit: 'd' })
    rows.push(
      { k: 'Model', v: 'two-body Keplerian, heliocentric' },
      { k: 'a', v: au(el.a) },
      { k: 'e', v: el.e.toFixed(5) },
      { k: 'i', v: deg(el.i) },
      { k: 'RAAN', v: deg(el.raan) },
      { k: 'arg. perihelion', v: deg(el.argp) },
      { k: 'true anomaly now', v: deg(trueAnomalyAt(el, body.mu, t)) },
      { k: 'mean anomaly now', v: deg(el.M0 + (TWO_PI / T) * t) },
      { k: 'period', v: `${days.toFixed(1)} d (${(days / 365.25).toFixed(3)} y)` },
      { k: 'perihelion', v: au(el.a * (1 - el.e)) },
      { k: 'aphelion', v: au(el.a * (1 + el.e)) },
      { k: 'distance now', v: au(r) },
      { k: 'speed', v: `${norm(st.v).toFixed(4)} km/s` },
    )
  } else if (sat.kind === 'kepler') {
    const el = sat.elements
    const st = elementsToState(el, body.mu, t)
    const r = norm(st.r)
    const nu = trueAnomalyAt(el, body.mu, t)
    tiles.push(altitudeTile(r - body.radius), { k: 'speed', v: norm(st.v).toFixed(3), unit: 'km/s' }, durationTile(period(el.a, body.mu)))
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
      const T = sgp4Period(rec)
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
        tiles.push(altitudeTile(r - body.radius), { k: 'speed', v: norm(st.v).toFixed(3), unit: 'km/s' }, durationTile(T))
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
    <Panel position="right" title="Elements" defaultOpen={!isNarrowScreen()}>
      <div className="sat-heading">
        <span className="swatch" style={{ background: sat.color, color: sat.color }} />
        <span className="satname">{sat.name}</span>
      </div>
      {tiles.length > 0 && (
        <div className="tiles">
          {tiles.map((x) => (
            <div className="tile" key={x.k}>
              <span className="tile-k">{x.k}</span>
              <span className="tile-v">{x.v}<small>{x.unit}</small></span>
            </div>
          ))}
        </div>
      )}
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
    </Panel>
  )
}
