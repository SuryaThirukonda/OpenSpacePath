import { BODIES } from '../data/bodies'
import { useStore } from '../store/store'

export function BodySelector() {
  const bodyId = useStore((s) => s.scenario.bodyId)
  const setBody = useStore((s) => s.setBody)
  const requestCamera = useStore((s) => s.requestCamera)
  const hasTle = useStore((s) => s.scenario.satellites.some((x) => x.kind === 'tle'))
  return (
    <div className="section">
      <label className="label" htmlFor="body">Central body</label>
      <select
        id="body"
        value={bodyId}
        onChange={(e) => {
          setBody(e.target.value)
          requestCamera('body')
        }}
      >
        {BODIES.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
      {hasTle && bodyId !== 'earth' && (
        <p className="hint">TLE satellites are hidden: SGP4 is an Earth-only model.</p>
      )}
    </div>
  )
}
