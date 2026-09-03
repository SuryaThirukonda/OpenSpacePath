import { useEffect } from 'react'
import { useStore } from '../store/store'
import { scenarioToSearch } from '../url/urlState'
import { BodySelector } from './BodySelector'
import { CameraButtons } from './CameraButtons'
import { ElementsPanel } from './ElementsPanel'
import { SatelliteForm } from './SatelliteForm'
import { SatelliteList } from './SatelliteList'
import { TimelinePanel } from './TimelinePanel'
import { Panel } from './Panel'
import { Viewport } from './Viewport'

/** Keep the URL in sync with the scenario (debounced), and bind the space bar to play/pause. */
function useUrlSync() {
  useEffect(() => {
    let timer: number | undefined
    let last = useStore.getState().scenario
    const unsub = useStore.subscribe((s) => {
      if (s.scenario === last) return
      last = s.scenario
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        history.replaceState(null, '', scenarioToSearch(s.scenario))
      }, 300)
    })
    return () => {
      unsub()
      window.clearTimeout(timer)
    }
  }, [])
}

function useKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Space') {
        e.preventDefault()
        useStore.getState().togglePlaying()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function App() {
  useUrlSync()
  useKeys()
  return (
    <div className="app">
      <Viewport />
      <Panel position="left" title="Orbit Lab">
        <div className="hint">Keplerian orbits around any body, SGP4 for Earth. Drag to orbit, wheel to zoom, right-drag to pan.</div>
        <BodySelector />
        <SatelliteList />
        <SatelliteForm />
      </Panel>
      <ElementsPanel />
      <CameraButtons />
      <TimelinePanel />
    </div>
  )
}
