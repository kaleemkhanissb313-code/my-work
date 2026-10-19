import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { NAV, type NavGroup } from '../nav'
import { useSettings } from '@/services/settings'
import { cn } from '@/lib/cn'

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1">
      <div className="grid h-9 w-9 place-items-center rounded-xl text-sm font-black text-white btn-3d">B</div>
      <div className="leading-tight">
        <div className="text-sm font-bold">Basic to Advanced</div>
        <div className="text-[11px] text-muted">All-in-one workspace</div>
      </div>
    </div>
  )
}

function Group({ g, hidden, onNavigate }: { g: NavGroup; hidden: Set<string>; onNavigate: () => void }) {
  const loc = useLocation()
  const children = g.children?.filter((c) => !hidden.has(c.id)) ?? []
  const containsActive = children.some((c) => loc.pathname.startsWith(c.path))
  const [open, setOpen] = useState(containsActive)
  useEffect(() => { if (containsActive) setOpen(true) }, [containsActive])

  if (!g.children) {
    if (hidden.has(g.id)) return null
    return (
      <NavLink to={g.path!} end={g.path === '/'} onClick={onNavigate} className={({ isActive }) => cn('nav-item', isActive && 'active')}>
        <g.icon className={cn('h-4 w-4 shrink-0', g.tone)} aria-hidden />{g.label}
      </NavLink>
    )
  }
  if (!children.length) return null
  return (
    <div>
      <button type="button" className={cn('nav-item w-full', containsActive && 'text-fg')} aria-expanded={open} onClick={() => setOpen(!open)}>
        <g.icon className="h-4 w-4 shrink-0" aria-hidden /><span className="flex-1 text-left">{g.label}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="ml-5 mt-0.5 space-y-0.5 border-l border-line pl-2">
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
  const hidden = new Set(s.hiddenModules)
  const nav = (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      <div className="mb-3 flex items-center justify-between"><Logo />
        <button className="btn btn-ghost h-9 w-9 lg:hidden" aria-label="Close menu" onClick={onClose}><X className="h-4 w-4" /></button>
      </div>
      {NAV.map((g) => <Group key={g.id} g={g} hidden={hidden} onNavigate={onClose} />)}
      <div className="mt-auto px-3 pt-4 text-[11px] text-muted">Data is stored on this device{import.meta.env.VITE_SUPABASE_URL ? ' and syncs when signed in' : ''}.</div>
    </nav>
  )
  return (
    <>
      <aside className="glass sticky top-0 hidden h-screen w-64 shrink-0 border-y-0 border-l-0 lg:block">{nav}</aside>
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
            <motion.aside className="glass absolute inset-y-0 left-0 w-72 max-w-[85vw]" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', stiffness: 400, damping: 40 }}>
              {nav}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
