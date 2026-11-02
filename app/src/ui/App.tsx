import { useEffect } from 'react'
import { satellitesWorldCounts, useStore, type LeftTab } from '../store/store'
import { arrowTabs, openTab } from './tabs'
import { scenarioToSearch } from '../url/urlState'
import { BodySelector } from './BodySelector'
import { CameraButtons } from './CameraButtons'
import { ElementsPanel } from './ElementsPanel'
import { SatelliteForm } from './SatelliteForm'
import { MissionPanel } from './MissionPanel'
import { SatelliteList } from './SatelliteList'
import { TimelinePanel } from './TimelinePanel'
import { IconAsteroid, IconLogo, IconRoute, IconSatellite } from './icons'
import { isNarrowScreen } from './layout'
import { restoreSideWidth } from './sideWidth'
import { Panel } from './Panel'
import { instanceMeta } from '../arp/store'
import { RoutingPanel } from './RoutingPanel'
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
        // the asteroid world's tour is rebuilt from the instance, so a link carries the bodies and the instance's settings only
        const now = useStore.getState()
        const sc = now.world === 'asteroids' ? { ...now.scenario, mission: undefined } : now.scenario
        history.replaceState(null, '', scenarioToSearch(sc, now.world, now.world === 'asteroids' ? instanceMeta() : undefined))
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
      if (e.code !== 'Space' || e.defaultPrevented || e.repeat) return
      // Space belongs to whatever has focus (a button, a field, the chart); it plays and pauses only
      // when focus is on the page itself or the scene
      const el = e.target as HTMLElement | null
      const free = !el || el === document.body || el.tagName === 'CANVAS' || el.classList.contains('viewport')
      if (free) {
        e.preventDefault()
        useStore.getState().togglePlaying()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function LeftTabs() {
  const tab = useStore((s) => s.leftTab)
  const sats = useStore((s) => satellitesWorldCounts(s).satellites)
  const stops = useStore((s) => satellitesWorldCounts(s).stops)
  const setTab = openTab
  const order: LeftTab[] = ['satellites', 'mission', 'asteroids']
  return (
    <>
      <div className="tabs main-tabs" role="tablist" aria-label="what the panel shows" onKeyDown={(e) => arrowTabs(e, order, tab, setTab)}>
        <button role="tab" id="tab-satellites" aria-controls="left-tabpanel" tabIndex={tab === 'satellites' ? 0 : -1} aria-selected={tab === 'satellites'} className={tab === 'satellites' ? 'tab active' : 'tab'} onClick={() => setTab('satellites')}>
          <IconSatellite /> Satellites <span className="pill">{sats}</span>
        </button>
        <button role="tab" id="tab-mission" aria-controls="left-tabpanel" tabIndex={tab === 'mission' ? 0 : -1} aria-selected={tab === 'mission'} className={tab === 'mission' ? 'tab active' : 'tab'} onClick={() => setTab('mission')}>
          <IconRoute /> Mission {stops > 0 && <span className="pill">{stops}</span>}
        </button>
        <button role="tab" id="tab-asteroids" aria-controls="left-tabpanel" tabIndex={tab === 'asteroids' ? 0 : -1} aria-selected={tab === 'asteroids'} className={tab === 'asteroids' ? 'tab active' : 'tab'} onClick={() => setTab('asteroids')}>
          <IconAsteroid /> Asteroids
        </button>
      </div>
      <div id="left-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="tabpanel">
      {tab === 'asteroids' ? (
        <RoutingPanel />
      ) : tab === 'satellites' ? (
        <>
          <BodySelector />
          <SatelliteList />
          <SatelliteForm />
          <p className="hint tip">Drag to orbit the view, wheel to zoom, right-drag to pan. Space plays and pauses.</p>
        </>
      ) : (
        <MissionPanel />
      )}
      </div>
    </>
  )
}

export function App() {
  useUrlSync()
  useKeys()
  useEffect(() => restoreSideWidth(), [])
  return (
    <div className="app">
      <Viewport />
      <Panel position="left" title="Orbit Lab" icon={<IconLogo />} defaultOpen={!isNarrowScreen()}>
        <LeftTabs />
      </Panel>
      <ElementsPanel />
      <CameraButtons />
      <TimelinePanel />
    </div>
  )
}
