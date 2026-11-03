import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StaffPasswordPage } from './StaffPasswordPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).has("staff-password")
      ? <StaffPasswordPage />
      : <App />}
  </StrictMode>,
)
