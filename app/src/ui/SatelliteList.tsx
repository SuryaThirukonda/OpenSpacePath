import { formatDuration } from '../core/time'
import { isRenderable, satellitePeriod, useStore } from '../store/store'
import { IconX } from './icons'
import { Section } from './Section'

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
    <Section title="Satellites" count={sats.length}>
      {sats.length === 0 && <p className="hint">No satellites yet. Add one below.</p>}
      <ul className="satlist">
        {sats.map((s) => {
          const T = isRenderable(s, bodyId) ? satellitePeriod(s, bodyId) : null
          return (
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
              <span className="swatch" style={{ background: s.color, color: s.color }} />
              <span className="sat-main">
                <span className="satname">{s.name}</span>
                <span className="sat-meta">
                  {s.kind === 'tle' ? 'SGP4' : 'Kepler'}
                  {T ? ` · ${formatDuration(T)}` : ''}
                  {!isRenderable(s, bodyId) ? ' · hidden' : ''}
                </span>
              </span>
              {stopIndex(s.id).length > 0 && <span className="badge" title="stop in the mission tour">stop {stopIndex(s.id).join(', ')}</span>}
              <button
                className="icon remove"
                onClick={(e) => {
                  e.stopPropagation()
                  remove(s.id)
                }}
                aria-label={`remove ${s.name}`}
              >
                <IconX />
              </button>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
