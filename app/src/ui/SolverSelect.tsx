import { DEFAULT_SOLVER } from '../mission/api'
import { useStore } from '../store/store'
import { useSolvers } from './useSolvers'

/**
 * Which lamberthub solver computes every transfer, for the Mission planner and the Routing tab
 * alike. Izzo (2015) unless changed; the note under the menu says what to expect of the choice.
 */
export function SolverSelect() {
  const solver = useStore((s) => s.scenario.solver ?? DEFAULT_SOLVER)
  const setSolver = useStore((s) => s.setSolver)
  const solvers = useSolvers()
  const info = solvers.find((s) => s.id === solver)
  return (
    <div className="solver">
      <label className="field">
        <span>Lambert solver (lamberthub)</span>
        <select value={solver} onChange={(e) => setSolver(e.target.value)}>
          {solvers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}{s.default ? ', default' : ''}{s.robust ? '' : ', not robust'}</option>
          ))}
          {!info && <option value={solver}>{solver}</option>}
        </select>
      </label>
      {info && <p className={info.robust ? 'hint' : 'hint caution'}>{info.note}</p>}
    </div>
  )
}
