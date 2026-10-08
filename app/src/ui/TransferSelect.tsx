import { DEFAULT_TRANSFER, type TransferMode } from '../mission/types'
import { useStore } from '../store/store'

const MODES: Array<[TransferMode, string, string]> = [
  ['threeburn', '3 burns', "The derivation sheet's rendezvous: burn 1 shapes the approach in the departure plane, burn 2 at the node line reshapes and tilts the orbit in one impulse, burn 3 matches the target's velocity. The default."],
  ['lambert2', '2 burns', 'The Lambert rendezvous: one burn onto the arc that meets the target where it will be, one to match its velocity. The transfer the asteroid routing papers define.'],
]

/** How many burns each transfer uses, for the Mission planner and the Routing tab alike. */
export function TransferSelect() {
  const transfer = useStore((s) => s.scenario.transfer ?? DEFAULT_TRANSFER)
  const setTransfer = useStore((s) => s.setTransfer)
  return (
    <div className="transfer">
      <div className="seg" role="radiogroup" aria-label="burns per transfer">
        {MODES.map(([id, label]) => (
          <button key={id} role="radio" aria-checked={transfer === id} className={transfer === id ? 'on' : ''} onClick={() => setTransfer(id)}>{label}</button>
        ))}
      </div>
      <p className="hint">{MODES.find(([id]) => id === transfer)?.[2]}</p>
    </div>
  )
}
