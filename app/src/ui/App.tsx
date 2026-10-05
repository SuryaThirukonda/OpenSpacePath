import { useEffect, useState } from 'react'
import { useStore } from '../store/store'
import { scenarioToSearch } from '../url/urlState'
import { BodySelector } from './BodySelector'
import { CameraButtons } from './CameraButtons'
import { ElementsPanel } from './ElementsPanel'
import { SatelliteForm } from './SatelliteForm'
import { MissionPanel } from './MissionPanel'
import { SatelliteList } from './SatelliteList'
import { TimelinePanel } from './TimelinePanel'
import { IconLogo, IconRoute, IconSatellite } from './icons'
import { isNarrowScreen } from './layout'
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

function LeftTabs() {
  const [tab, setTab] = useState<'satellites' | 'mission'>('satellites')
  const sats = useStore((s) => s.scenario.satellites.length)
  const stops = useStore((s) => s.scenario.mission?.stops.length ?? 0)
  return (
    <>
      <div className="tabs main-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'satellites'} className={tab === 'satellites' ? 'tab active' : 'tab'} onClick={() => setTab('satellites')}>
          <IconSatellite /> Satellites <span className="pill">{sats}</span>
        </button>
        <button role="tab" aria-selected={tab === 'mission'} className={tab === 'mission' ? 'tab active' : 'tab'} onClick={() => setTab('mission')}>
          <IconRoute /> Mission {stops > 0 && <span className="pill">{stops}</span>}
        </button>
      </div>
      {tab === 'satellites' ? (
        <>
          <BodySelector />
          <SatelliteList />
          <SatelliteForm />
          <p className="hint tip">Drag to orbit the view, wheel to zoom, right-drag to pan. Space plays and pauses.</p>
        </>
      ) : (
        <MissionPanel />
      )}
    </>
  )
}

export function App() {
  useUrlSync()
  useKeys()
  return (
    <div className="app">
      <Viewport />
      <div className="vignette" aria-hidden="true" />
      <Panel position="left" title="Orbit Lab" icon={<IconLogo />} defaultOpen={!isNarrowScreen()}>
        <LeftTabs />
      </Panel>
      <ElementsPanel />
      <CameraButtons />
      <TimelinePanel />
    </div>
  )
}
