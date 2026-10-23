import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ALL_LEAVES, NAV, type NavGroup } from '../nav'
import { can, useAccess } from '@/services/access'
import { featureForPath } from '@/features/access/features'
import { useSettings } from '@/services/settings'
import { cn } from '@/lib/cn'
import { BrandMark, Wordmark } from '@/components/Logo'

const COLLAPSE_KEY = 'b2a-sidebar-collapsed'
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false } }

function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      {compact ? <BrandMark className="h-8 w-8 text-fg" /> : (
        <div className="min-w-0">
          <Wordmark className="h-8 w-auto text-fg" />
          <div className="mt-0.5 text-[11px] text-muted">Basic to Advanced workspace</div>
        </div>
      )}
    </div>
  )
}

function Group({ g, hidden, onNavigate, compact }: { g: NavGroup; hidden: Set<string>; onNavigate: () => void; compact?: boolean }) {
  const loc = useLocation()
  const children = g.children?.filter((c) => !hidden.has(c.id)) ?? []
  const containsActive = children.some((c) => loc.pathname.startsWith(c.path))
  const [open, setOpen] = useState(containsActive)
  useEffect(() => { if (containsActive) setOpen(true) }, [containsActive])

  if (!g.children) {
    if (hidden.has(g.id)) return null
    return (
      <NavLink to={g.path!} end={g.path === '/'} onClick={onNavigate} title={compact ? g.label : undefined} aria-label={compact ? g.label : undefined}
        className={({ isActive }) => cn('nav-item', compact && 'justify-center px-0', isActive && 'active')}>
        <g.icon className={cn('h-4 w-4 shrink-0', g.tone)} aria-hidden />{!compact && g.label}
      </NavLink>
    )
  }
  if (!children.length) return null
  if (compact) {
    // Icon-only mode: each child gets its own icon button; a thin divider separates groups.
    return (
      <div className="my-1 space-y-0.5 border-t border-line/60 pt-1" role="group" aria-label={g.label}>
        {children.map((c) => (
          <NavLink key={c.id} to={c.path} onClick={onNavigate} title={c.label} aria-label={c.label}
            className={({ isActive }) => cn('nav-item justify-center px-0', isActive && 'active')}>
            <c.icon className="h-4 w-4 shrink-0" aria-hidden />
          </NavLink>
        ))}
      </div>
    )
  }
  return (
    <div>
      <button type="button" className={cn('nav-item w-full', containsActive && 'text-fg')} aria-expanded={open} onClick={() => setOpen(!open)}>
        <g.icon className="h-4 w-4 shrink-0" aria-hidden /><span className="flex-1 text-start">{g.label}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="ms-5 mt-0.5 space-y-0.5 border-s border-line ps-2">
              {children.map((c) => (
                <NavLink key={c.id} to={c.path} onClick={onNavigate} className={({ isActive }) => cn('nav-item py-1.5', isActive && 'active')}>
                  <c.icon className="h-4 w-4 shrink-0" aria-hidden />{c.label}
                </NavLink>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const s = useSettings()
  const access = useAccess()
  // Hidden = turned off in Settings, or not permitted for this account (the database enforces the latter too).
  const hidden = new Set([...s.hiddenModules, ...ALL_LEAVES.filter((l) => !can(featureForPath(l.path), access)).map((l) => l.id), ...NAV.filter((g) => g.path && !can(featureForPath(g.path), access)).map((g) => g.id)])
  const [collapsed, setCollapsed] = useState(readCollapsed)
  // Phone/tablet drawer: Escape closes, the page behind does not scroll, and it closes if the screen becomes wide.
  useEffect(() => {
    if (!mobileOpen) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const wide = window.matchMedia('(min-width: 1024px)')
    const onWide = () => { if (wide.matches) onClose() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', key); wide.addEventListener('change', onWide)
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', key); wide.removeEventListener('change', onWide) }
  }, [mobileOpen, onClose])
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch { /* per-device preference only */ } return !c })

  const nav = (compact: boolean, mobile: boolean) => (
    <nav aria-label="Main" className={cn('flex h-full flex-col gap-1 overflow-y-auto overflow-x-hidden', compact ? 'p-2' : 'p-3')}>
      <div className={cn('mb-3 flex items-center', compact ? 'justify-center' : 'justify-between')}>
        <Logo compact={compact} />
        {mobile && <button autoFocus className="btn btn-ghost h-10 w-10" aria-label="Close menu" onClick={onClose}><X className="h-4 w-4" /></button>}
      </div>
      {NAV.map((g) => <Group key={g.id} g={g} hidden={hidden} onNavigate={onClose} compact={compact} />)}
      {!mobile && (
        <button type="button" onClick={toggle} className={cn('nav-item mt-auto', compact && 'justify-center px-0')}
          aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'} title={compact ? 'Expand sidebar' : 'Collapse sidebar'}>
          {compact ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <><PanelLeftClose className="h-4 w-4" aria-hidden />Collapse</>}
        </button>
      )}
      {!compact && <div className={cn('px-3 pt-2 text-[11px] text-muted', mobile && 'mt-auto')}>Data is stored on this device{import.meta.env.VITE_SUPABASE_URL ? ' and syncs when signed in' : ''}.</div>}
    </nav>
  )
  return (
    <>
      <aside className={cn('glass sticky top-0 hidden h-screen shrink-0 border-y-0 border-s-0 transition-[width] duration-300 ease-out lg:block', collapsed ? 'w-[72px]' : 'w-64')}>
        {nav(collapsed, false)}
      </aside>
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <motion.div className="absolute inset-0 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
            <motion.aside className="glass absolute inset-y-0 start-0 w-72 max-w-[85vw] pb-[env(safe-area-inset-bottom)]" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', stiffness: 400, damping: 40 }}>
              {nav(false, true)}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
