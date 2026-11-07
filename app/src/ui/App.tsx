import { useEffect, useState } from 'react'
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
import { HelpDialog } from './HelpDialog'
import { IconAsteroid, IconLogo, IconPanels, IconRoute, IconSatellite, IconX } from './icons'
import { useKeys } from './keys'
import { isNarrowScreen } from './layout'
import { restoreSideWidth } from './sideWidth'
import { Panel } from './Panel'
import { instanceMeta } from '../arp/store'
import { RoutingPanel } from './RoutingPanel'
import { Viewport } from './Viewport'

/** Keep the URL in sync with the scenario (debounced). */
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

const HINT_KEY = 'orbit-lab.hint-seen'

/**
 * A one-line pointer to the controls on a first visit. It goes away at the first touch of the scene
 * (by then the reader has found out) or with its close button, and stays away on this browser.
 */
function FirstHint() {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) !== '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    if (!show) return
    const vp = document.querySelector('.viewport')
    const dismiss = () => {
      setShow(false)
      try { localStorage.setItem(HINT_KEY, '1') } catch { /* private mode: it shows again next visit */ }
    }
    vp?.addEventListener('pointerdown', dismiss, { once: true })
    return () => vp?.removeEventListener('pointerdown', dismiss)
  }, [show])
  if (!show) return null
  const close = () => {
    setShow(false)
    try { localStorage.setItem(HINT_KEY, '1') } catch { /* private mode */ }
  }
  return (
    <div className="first-hint" role="note">
      <span>Drag to turn the view, wheel to zoom, click a satellite to select it. <kbd>?</kbd> lists every control.</span>
      <button className="icon" aria-label="dismiss the hint" onClick={close}><IconX /></button>
    </div>
  )
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
          <IconSatellite /><span className="tab-label">Satellites</span><span className="pill">{sats}</span>
        </button>
        <button role="tab" id="tab-mission" aria-controls="left-tabpanel" tabIndex={tab === 'mission' ? 0 : -1} aria-selected={tab === 'mission'} className={tab === 'mission' ? 'tab active' : 'tab'} onClick={() => setTab('mission')}>
          <IconRoute /><span className="tab-label">Mission</span>{stops > 0 && <span className="pill">{stops}</span>}
        </button>
        <button role="tab" id="tab-asteroids" aria-controls="left-tabpanel" tabIndex={tab === 'asteroids' ? 0 : -1} aria-selected={tab === 'asteroids'} className={tab === 'asteroids' ? 'tab active' : 'tab'} onClick={() => setTab('asteroids')}>
          <IconAsteroid /><span className="tab-label">Asteroids</span>
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
          <p className="hint tip">Drag to turn the view, wheel to zoom, right-drag to pan; click a satellite to select it. Press <kbd>?</kbd> for every control.</p>
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
  const panelsHidden = useStore((s) => s.panelsHidden)
  const togglePanels = useStore((s) => s.togglePanels)
  return (
    <div className={panelsHidden ? 'app panels-hidden' : 'app'}>
      <Viewport />
      <Panel position="left" title="Orbit Lab" icon={<IconLogo />} defaultOpen={!isNarrowScreen()}>
        <LeftTabs />
      </Panel>
      <ElementsPanel />
      <CameraButtons />
      <TimelinePanel />
      <FirstHint />
      {panelsHidden && (
        <button className="show-panels" onClick={togglePanels} title="Bring the panels back (P)"><IconPanels /> Show panels</button>
      )}
      <HelpDialog />
    </div>
  )
}
