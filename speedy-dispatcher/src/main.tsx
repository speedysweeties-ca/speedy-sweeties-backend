import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RoutingPreviewEnhancer } from './RoutingPreviewEnhancer.tsx'
import { installDriverMarkerPinFix } from './driverMarkerPinFix.ts'

installDriverMarkerPinFix()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <RoutingPreviewEnhancer />
  </StrictMode>,
)
