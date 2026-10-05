import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { IconAxes, IconBird, IconChase, IconGlobe, IconLink, IconOrbit, IconReset, IconTag } from './icons'

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
  const [copied, setCopied] = useState(false)
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
    <div ref={ref} className="panel topright toolbar" role="toolbar" aria-label="view">
      <div className="tool-group">
        <button className="tool" onClick={() => requestCamera('body')} title="Frame the central body"><IconGlobe /><span>Frame body</span></button>
        <button className="tool" onClick={() => requestCamera('orbit')} disabled={!hasSelection} title="Frame the selected orbit"><IconOrbit /><span>Frame orbit</span></button>
        <button className="tool" onClick={() => requestCamera('reset')} title="Back to the default view"><IconReset /><span>Reset view</span></button>
      </div>
      <div className="tool-group">
        <button className={showAxes ? 'tool toggle on' : 'tool toggle'} onClick={toggleAxes} aria-pressed={showAxes} title="Inertial axes"><IconAxes /><span>Axes</span></button>
        <button className={showLabels ? 'tool toggle on' : 'tool toggle'} onClick={toggleLabels} aria-pressed={showLabels} title="Satellite and ship labels"><IconTag /><span>Labels</span></button>
      </div>
      {hasPlan && (
        <div className="tool-group">
          <button className={cameraMode === 'chase' ? 'tool toggle on' : 'tool toggle'} aria-pressed={cameraMode === 'chase'} onClick={() => setCameraMode(cameraMode === 'chase' ? 'follow' : 'chase')} title="Third-person view from behind the ship">
            <IconChase /><span>Chase view</span>
          </button>
          <button className={cameraMode === 'birdseye' ? 'tool toggle on' : 'tool toggle'} aria-pressed={cameraMode === 'birdseye'} onClick={() => setCameraMode(cameraMode === 'birdseye' ? 'follow' : 'birdseye')} title="Fixed view straight down on the current route">
            <IconBird /><span>Bird's-eye</span>
          </button>
        </div>
      )}
      <div className="tool-group">
        <button
          className="tool"
          onClick={() => {
            navigator.clipboard?.writeText(location.href).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1400)
            }).catch(() => undefined)
          }}
          title="Copy a shareable link to this scenario"
        >
          <IconLink /><span>{copied ? 'Copied' : 'Copy link'}</span>
        </button>
      </div>
    </div>
  )
}
