import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { useStore } from './store/store'
import { App } from './ui/App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { warmPlanner } from './mission/api'
import { useArp } from './arp/store'
import { openTab } from './ui/tabs'
import { linkFromLocation } from './url/urlState'
import { initTheme } from './ui/theme'

initTheme()

const link = linkFromLocation(location.search)
if (link?.world === 'asteroids') {
  // a link made on the Asteroids tab opens there, with its bodies as the instance
  openTab('asteroids')
  useStore.getState().loadScenario(link.scenario)                 // the link's bodies, solver and transfer
  useArp.getState().adoptShared(link.scenario, link.instance)     // and the same bodies as the instance
} else if (link) {
  useStore.getState().loadScenario(link.scenario)
} else {
  useStore.getState().select(useStore.getState().scenario.satellites[0]?.id ?? null)
}
warmPlanner()
// Development only: lets a browser console (or an automated check) drive the stores directly.
if (import.meta.env.DEV) Object.assign(window as object, { __orbitLab: useStore, __orbitLabArp: useArp })
if (link?.world === 'satellites' && link.scenario.mission?.stops.length) void useStore.getState().requestPlan()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
