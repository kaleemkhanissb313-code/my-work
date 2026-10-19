import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './app/routes'
import { initLock } from './services/security'
import { initAuth } from './services/auth'
import { applyAppearance, getSettings } from './services/settings'
import './index.css'

// Apply the saved theme and accent before first paint to avoid a flash.
void getSettings().then(applyAppearance)
void initLock()
initAuth()

// Ask the browser to keep IndexedDB data even under storage pressure.
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
