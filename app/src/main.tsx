import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { useStore } from './store/store'
import { App } from './ui/App'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { scenarioFromLocation } from './url/urlState'

const fromUrl = scenarioFromLocation(location.search)
if (fromUrl) useStore.getState().loadScenario(fromUrl)
else useStore.getState().select(useStore.getState().scenario.satellites[0]?.id ?? null)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
