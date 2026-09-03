import { useStore } from '../store/store'

export function CameraButtons() {
  const requestCamera = useStore((s) => s.requestCamera)
  const showAxes = useStore((s) => s.showAxes)
  const showLabels = useStore((s) => s.showLabels)
  const toggleAxes = useStore((s) => s.toggleAxes)
  const toggleLabels = useStore((s) => s.toggleLabels)
  const hasSelection = useStore((s) => s.selectedId !== null)
  return (
    <div className="panel topright">
      <button onClick={() => requestCamera('body')}>Frame body</button>
      <button onClick={() => requestCamera('orbit')} disabled={!hasSelection}>Frame orbit</button>
      <button onClick={() => requestCamera('reset')}>Reset view</button>
      <button className={showAxes ? 'toggle on' : 'toggle'} onClick={toggleAxes}>Axes</button>
      <button className={showLabels ? 'toggle on' : 'toggle'} onClick={toggleLabels}>Labels</button>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(location.href).catch(() => undefined)
        }}
        title="Copy a shareable link to this scenario"
      >
        Copy link
      </button>
    </div>
  )
}
