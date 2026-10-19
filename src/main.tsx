import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './app/routes'
import { initLock } from './services/security'
import { initAuth } from './services/auth'
import { getSettings } from './services/settings'
import './index.css'

// Apply the saved theme before first paint to avoid a flash.
void getSettings().then((s) => {
  const dark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
})
void initLock()
initAuth()

// Ask the browser to keep IndexedDB data even under storage pressure.
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
