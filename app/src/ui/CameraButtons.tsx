import { useEffect, useRef } from 'react'
import { useStore } from '../store/store'

export function CameraButtons() {
  const requestCamera = useStore((s) => s.requestCamera)
  const showAxes = useStore((s) => s.showAxes)
  const showLabels = useStore((s) => s.showLabels)
  const toggleAxes = useStore((s) => s.toggleAxes)
  const toggleLabels = useStore((s) => s.toggleLabels)
  const hasSelection = useStore((s) => s.selectedId !== null)
  const hasPlan = useStore((s) => s.plan !== null)
  const cameraMode = useStore((s) => s.cameraMode)
  const setCameraMode = useStore((s) => s.setCameraMode)
  const ref = useRef<HTMLDivElement>(null)

  // On narrow screens this row sits above the timeline and the Elements sheet stacks on top of it,
  // so its height (one row or several, depending on wrapping) has to be measured.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const publish = () =>
      document.documentElement.style.setProperty('--buttons-h', `${Math.round(el.getBoundingClientRect().height)}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="panel topright">
      <button onClick={() => requestCamera('body')}>Frame body</button>
      <button onClick={() => requestCamera('orbit')} disabled={!hasSelection}>Frame orbit</button>
      <button onClick={() => requestCamera('reset')}>Reset view</button>
      <button className={showAxes ? 'toggle on' : 'toggle'} onClick={toggleAxes}>Axes</button>
      <button className={showLabels ? 'toggle on' : 'toggle'} onClick={toggleLabels}>Labels</button>
      {hasPlan && (
        <button className={cameraMode === 'chase' ? 'toggle on' : 'toggle'} onClick={() => setCameraMode(cameraMode === 'chase' ? 'follow' : 'chase')} title="Third-person view from behind the ship">
          Chase view
        </button>
      )}
      {hasPlan && (
        <button className={cameraMode === 'birdseye' ? 'toggle on' : 'toggle'} onClick={() => setCameraMode(cameraMode === 'birdseye' ? 'follow' : 'birdseye')} title="Fixed view straight down on the current route">
          Bird's-eye
        </button>
      )}
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
