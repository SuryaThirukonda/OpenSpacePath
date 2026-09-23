import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { useStore } from './store/store'
import { App } from './ui/App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { warmPlanner } from './mission/api'
import { scenarioFromLocation } from './url/urlState'

const fromUrl = scenarioFromLocation(location.search)
if (fromUrl) useStore.getState().loadScenario(fromUrl)
else useStore.getState().select(useStore.getState().scenario.satellites[0]?.id ?? null)
warmPlanner()
// Development only: lets a browser console (or an automated check) drive the store directly.
if (import.meta.env.DEV) (window as unknown as { __orbitLab: typeof useStore }).__orbitLab = useStore
if (fromUrl?.mission?.stops.length) void useStore.getState().requestPlan()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
