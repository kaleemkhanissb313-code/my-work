import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './app/routes'
import { initLock } from './services/security'
import { initAuth } from './services/auth'
import { initAccess } from './services/access'
import { startAutoSync } from './services/autoSync'
import { applyAppearance, getSettings } from './services/settings'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/plus-jakarta-sans/wght.css'
import './index.css'

// Apply the saved theme and accent before first paint to avoid a flash.
void getSettings().then(applyAppearance)
void initLock()
initAuth()
initAccess()
startAutoSync()

// Ask the browser to keep IndexedDB data even under storage pressure.
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
