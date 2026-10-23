import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

const phoneQuery = '(max-width: 639px)'
function useIsPhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(phoneQuery).matches)
  useEffect(() => {
    const m = window.matchMedia(phoneQuery)
    const h = () => setPhone(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  return phone
}

/**
 * Header menu button. Phones: a bottom sheet (portal, full width, backdrop, big touch targets) — never off-screen.
 * Tablet/desktop: a dropdown anchored to the button and clamped inside the viewport.
 */
export function HeaderPopover({ label, icon: Icon, title, children, buttonClass, badge, width = 320 }: {
  label: string; icon: LucideIcon; title: string; children: (close: () => void) => ReactNode; buttonClass?: string; badge?: number; width?: number
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const phone = useIsPhone()
  const close = () => setOpen(false)

  // Position the desktop dropdown under the button, kept 8px inside the viewport.
  useEffect(() => {
    if (!open || phone) return
    const place = () => {
      const r = btn.current?.getBoundingClientRect()
      if (!r) return
      const w = Math.min(width, window.innerWidth - 16)
      setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, phone, width])

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { const t = e.target as Node; if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', key)
    // Phones: stop the page behind the sheet from scrolling.
    const prev = document.body.style.overflow
    if (phone) document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('a, button:not([data-close])')?.focus({ preventScroll: true }))
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); document.body.style.overflow = prev }
  }, [open, phone])

  return (
    <>
      <button ref={btn} type="button" aria-label={badge ? `${label} (${badge})` : label} title={label} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen((v) => !v)} className={cn('btn btn-ghost relative h-10 w-10 shrink-0 rounded-xl sm:h-9 sm:w-9', buttonClass)}>
        <Icon className="h-[18px] w-[18px] sm:h-4 sm:w-4" aria-hidden />
        {!!badge && <span className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{badge > 9 ? '9+' : badge}</span>}
      </button>
      {open && createPortal(
        phone ? (
          <div className="fixed inset-0 z-[60]">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" aria-hidden />
            <div ref={panel} role="dialog" aria-modal="true" aria-label={title}
              className="glass absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-3xl pb-[env(safe-area-inset-bottom)] shadow-2xl">
              <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line" aria-hidden />
              <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-2">
                <h2 className="text-base font-semibold">{title}</h2>
                <button type="button" data-close className="btn btn-ghost h-10 w-10 rounded-xl" aria-label="Close" onClick={close}><X className="h-5 w-5" aria-hidden /></button>
              </div>
              <div className="overflow-y-auto overscroll-contain px-2 pb-3">{children(close)}</div>
            </div>
          </div>
        ) : (
          <div ref={panel} role="dialog" aria-label={title} className="glass fixed z-[60] max-h-[min(80vh,560px)] overflow-y-auto rounded-2xl p-2 shadow-2xl"
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: Math.min(width, window.innerWidth - 16), visibility: pos ? 'visible' : 'hidden' }}>
            {children(close)}
          </div>
        ),
        document.body,
      )}
    </>
  )
}

export const PopoverItem = ({ icon: Icon, children, onClick, kbd, hint }: { icon: LucideIcon; children: ReactNode; onClick: () => void; kbd?: string; hint?: string }) => (
  <button type="button" onClick={onClick} className="flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-[15px] hover:bg-raised focus-visible:bg-raised sm:min-h-[40px] sm:text-sm">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-raised text-accent"><Icon className="h-4 w-4" aria-hidden /></span>
    <span className="min-w-0 flex-1"><span className="block truncate">{children}</span>{hint && <span className="block truncate text-xs text-muted">{hint}</span>}</span>
    {kbd && <span className="kbd hidden sm:inline-flex">{kbd}</span>}
  </button>
)

export const PopoverHeading = ({ children }: { children: ReactNode }) => <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</div>
