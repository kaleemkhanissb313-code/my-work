import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { Sidebar } from './layout/Sidebar'
import { Topbar } from './layout/Topbar'
import { CommandMenu } from './layout/CommandMenu'
import { LockScreen } from './layout/LockScreen'
import { ConfirmHost, Toaster } from '@/components/feedback'
import { Spinner } from '@/components/ui'
import { useSettings } from '@/services/settings'
import { lockApp, lockState } from '@/services/security'
import { quick } from '@/services/quick'
import { useReminderLoop } from './useReminders'

/** Is the keyboard focus in a text-entry control? Single-key shortcuts must not fire there. */
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

export function AppShell() {
  const s = useSettings()
  const { locked, ready } = lockState.use()
  const [menu, setMenu] = useState(false)
  const [cmd, setCmd] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  useReminderLoop()

  // Theme + reduced motion
  useEffect(() => {
    const apply = () => {
      const dark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.classList.toggle('reduce-motion', s.reduceMotion)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b1020' : '#f4f5fa')
    }
    apply()
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [s.theme, s.reduceMotion])

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd((v) => !v); return }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); void lockApp('shortcut'); return }
      if (typing(e.target)) return
      if (e.altKey && !mod) {
        const k = e.key.toLowerCase()
        if (k === 'n') { e.preventDefault(); void quick.doc(nav) }
        else if (k === 't') { e.preventDefault(); void quick.task(nav) }
        else if (k === 'e') { e.preventDefault(); void quick.event(nav) }
        else if (k === 's') { e.preventDefault(); void quick.timer(nav) }
      } else if (e.key === '/' && !mod) { e.preventDefault(); setCmd(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav])

  // Auto-lock after inactivity (only when a PIN is set and lock is enabled)
  useEffect(() => {
    if (!s.lock.enabled || locked) return
    let last = Date.now()
    const bump = () => { last = Date.now() }
    const evs = ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart'] as const
    evs.forEach((ev) => window.addEventListener(ev, bump, { passive: true }))
    const id = setInterval(() => { if (Date.now() - last > s.lock.autoLockMins * 60_000) void lockApp('inactivity') }, 15_000)
    return () => { evs.forEach((ev) => window.removeEventListener(ev, bump)); clearInterval(id) }
  }, [s.lock.enabled, s.lock.autoLockMins, locked])

  useEffect(() => {
    window.scrollTo(0, 0)
    // Remembered so Settings → Saved views can offer "save the page I was just on".
    if (loc.pathname !== '/settings') try { sessionStorage.setItem('b2a-last-path', loc.pathname + loc.search) } catch { /* storage unavailable */ }
  }, [loc.pathname, loc.search])

  if (!ready) return <Spinner label="Starting" />
  // When locked, nothing behind the lock screen is rendered (so content is not in the DOM).
  if (locked) return <><LockScreen /><Toaster /></>

  return (
    <MotionConfig reducedMotion={s.reduceMotion ? 'always' : 'user'}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-xl focus:bg-surface focus:p-2">Skip to content</a>
      <div className="flex min-h-screen">
        <Sidebar mobileOpen={menu} onClose={() => setMenu(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenu={() => setMenu(true)} onSearch={() => setCmd(true)} />
          <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
            <Suspense fallback={<Spinner />}><Outlet /></Suspense>
          </main>
        </div>
      </div>
      <CommandMenu open={cmd} onClose={() => setCmd(false)} />
      <Toaster />
      <ConfirmHost />
    </MotionConfig>
  )
}
