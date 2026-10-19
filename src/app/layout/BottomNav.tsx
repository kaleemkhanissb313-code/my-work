import { NavLink } from 'react-router-dom'
import { CalendarDays, CheckSquare, LayoutDashboard, Menu, Wand2 } from 'lucide-react'
import { openQuickAdd } from '@/features/quickadd/QuickAdd'
import { cn } from '@/lib/cn'

/** Thumb-friendly navigation for phones/tablets (hidden on desktop where the sidebar is visible). */
export function BottomNav({ onMenu }: { onMenu: () => void }) {
  const item = 'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-muted transition-colors'
  return (
    <nav aria-label="Quick navigation" className="glass fixed inset-x-0 bottom-0 z-30 flex items-stretch border-x-0 border-b-0 px-2 lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <NavLink to="/" end className={({ isActive }) => cn(item, isActive && 'text-accent')}><LayoutDashboard className="h-5 w-5" aria-hidden />Home</NavLink>
      <NavLink to="/tasks" className={({ isActive }) => cn(item, isActive && 'text-accent')}><CheckSquare className="h-5 w-5" aria-hidden />Tasks</NavLink>
      <div className="flex flex-1 items-start justify-center">
        <button type="button" onClick={() => openQuickAdd()} aria-label="Smart quick add"
          className="btn btn-3d -mt-5 h-14 w-14 rounded-2xl"><Wand2 className="h-6 w-6" aria-hidden /></button>
      </div>
      <NavLink to="/calendar" className={({ isActive }) => cn(item, isActive && 'text-accent')}><CalendarDays className="h-5 w-5" aria-hidden />Calendar</NavLink>
      <button type="button" onClick={onMenu} className={item} aria-label="Open full menu"><Menu className="h-5 w-5" aria-hidden />Menu</button>
    </nav>
  )
}
