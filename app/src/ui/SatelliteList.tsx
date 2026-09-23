import { isRenderable, useStore } from '../store/store'

export function SatelliteList() {
  const sats = useStore((s) => s.scenario.satellites)
  const bodyId = useStore((s) => s.scenario.bodyId)
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const remove = useStore((s) => s.removeSatellite)
  const requestCamera = useStore((s) => s.requestCamera)
  // Select the stored array itself (or undefined): a selector that builds a new array each call
  // would make React re-render forever, since it never sees the same snapshot twice.
  const stops = useStore((s) => s.scenario.mission?.stops)
  const stopIndex = (id: string) => (stops ?? []).map((st, i) => (st.satelliteId === id ? i + 1 : 0)).filter(Boolean)
  return (
    <div className="section">
      <div className="label">Satellites ({sats.length})</div>
      {sats.length === 0 && <p className="hint">No satellites yet. Add one below.</p>}
      <ul className="satlist">
        {sats.map((s) => (
          <li
            key={s.id}
            className={s.id === selectedId ? 'selected' : ''}
            onClick={() => select(s.id === selectedId ? null : s.id)}
            onDoubleClick={() => {
              select(s.id)
              requestCamera('orbit')
            }}
            title="Click to select, double-click to frame"
          >
            <span className="swatch" style={{ background: s.color }} />
            <span className="satname">{s.name}</span>
            {stopIndex(s.id).length > 0 && <span className="badge" title="stop in the mission tour">stop {stopIndex(s.id).join(', ')}</span>}
            <span className="kind">{s.kind === 'tle' ? 'SGP4' : 'Kepler'}{!isRenderable(s, bodyId) ? ' (hidden)' : ''}</span>
            <button
              className="icon"
              onClick={(e) => {
                e.stopPropagation()
                remove(s.id)
              }}
              aria-label={`remove ${s.name}`}
            >
              x
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
