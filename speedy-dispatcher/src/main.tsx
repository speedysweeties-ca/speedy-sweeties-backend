import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ISOLATED_STAGING } from './apiConfig'
import { RoutingPreviewEnhancer } from './RoutingPreviewEnhancerOriginalPins.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {!ISOLATED_STAGING && <RoutingPreviewEnhancer />}
  </StrictMode>,
)

