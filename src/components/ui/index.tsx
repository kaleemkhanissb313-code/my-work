import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/* ---------------- Button ---------------- */
type Variant = 'primary' | 'soft' | 'ghost' | 'danger'
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'sm' | 'md' | 'lg'
  icon?: LucideIcon
  loading?: boolean
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'soft', size = 'md', icon: Icon, loading, className, children, disabled, type = 'button', ...rest }, ref,
) {
  const v = { primary: 'btn-3d', soft: 'btn-soft', ghost: 'btn-ghost', danger: 'btn-danger' }[variant]
  const s = { sm: 'h-8 gap-1.5 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-[15px]' }[size]
  return (
    <button ref={ref} type={type} className={cn('btn', v, s, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
      {children}
    </button>
  )
})

export function IconButton({ icon: Icon, label, className, active, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={active}
      className={cn('btn btn-ghost h-9 w-9 shrink-0 rounded-xl', active && 'bg-accent/10 text-accent', className)} {...rest}>
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  )
}

/* ---------------- Card ---------------- */
export function Card({ className, children, hover, ...rest }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return <div className={cn('card p-4', hover && 'card-hover', className)} {...rest}>{children}</div>
}
export function CardTitle({ icon: Icon, children, action, tone }: { icon?: LucideIcon; children: ReactNode; action?: ReactNode; tone?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        {Icon && <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-raised', tone ?? 'text-accent')}><Icon className="h-4 w-4" aria-hidden /></span>}
        <span className="truncate">{children}</span>
      </h2>
      {action}
    </div>
  )
}

/* ---------------- Form fields ---------------- */
export function Field({ label, error, hint, children, htmlFor, className }: { label: string; error?: string | null; hint?: string; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-danger" role="alert">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn('input', className)} {...p} />
})
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn('input min-h-[90px] resize-y', className)} {...p} />
})
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('input pe-8', className)} {...p}>{children}</select>
}
export function Checkbox({ label, checked, onChange, className }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className={cn('inline-flex cursor-pointer items-center gap-2 text-sm', className)}>
      <input id={id} type="checkbox" className="h-4 w-4 rounded accent-[rgb(var(--accent))]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div><div className="text-sm font-medium">{label}</div>{description && <div className="text-xs text-muted">{description}</div>}</div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full border border-line transition-colors', checked ? 'bg-accent' : 'bg-raised')}>
        <span className={cn('absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px] rtl:-translate-x-[22px]' : 'translate-x-0.5 rtl:-translate-x-0.5')} />
      </button>
    </div>
  )
}

/* ---------------- Misc display ---------------- */
export function Badge({ children, tone = 'muted', className }: { children: ReactNode; tone?: 'muted' | 'accent' | 'ok' | 'warn' | 'danger' | 'home' | 'work' | 'life' | 'secure'; className?: string }) {
  const t = {
    muted: 'border-line text-muted', accent: 'border-accent/40 text-accent bg-accent/10', ok: 'border-ok/40 text-ok bg-ok/10',
    warn: 'border-warn/40 text-warn bg-warn/10', danger: 'border-danger/40 text-danger bg-danger/10', home: 'border-home/40 text-home bg-home/10',
    work: 'border-work/40 text-work bg-work/10', life: 'border-life/40 text-life bg-life/10', secure: 'border-secure/40 text-secure bg-secure/10',
  }[tone]
  return <span className={cn('chip', t, className)}>{children}</span>
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="progress-track" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="progress-bar" style={{ width: `${v}%` }} />
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-raised text-accent shadow-inner"><Icon className="h-7 w-7" aria-hidden /></div>
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <div role="status" className="flex items-center gap-2 p-6 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{label}…</div>
}

export function PageHeader({ title, description, icon: Icon, actions, tone }: { title: string; description?: string; icon?: LucideIcon; actions?: ReactNode; tone?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 sm:mb-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {Icon && <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 sm:h-11 sm:w-11', tone ?? 'text-accent')}><Icon className="h-5 w-5" aria-hidden /></div>}
        <div className="min-w-0">
          <h1 className="leading-tight">{title}</h1>
          {description && <p className="mt-0.5 max-w-prose text-sm text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ---------------- Tabs ---------------- */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; icon?: LucideIcon }[]; value: T; onChange: (v: T) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const list = useRef<HTMLDivElement>(null)
  // Keep the selected tab visible in the horizontally scrolling bar (phones), without scrolling the page.
  useEffect(() => {
    const el = refs.current[tabs.findIndex((t) => t.id === value)], box = list.current
    if (!el || !box || box.scrollWidth <= box.clientWidth) return
    const l = el.offsetLeft, r = l + el.offsetWidth // the list is position:relative, so offsets are measured from it
    if (l < box.scrollLeft || r > box.scrollLeft + box.clientWidth) box.scrollTo({ left: Math.max(0, l - (box.clientWidth - el.offsetWidth) / 2) })
  }, [value, tabs])
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const n = (i + d + tabs.length) % tabs.length
    onChange(tabs[n].id)
    refs.current[n]?.focus()
  }
  return (
    <div ref={list} role="tablist" aria-label={label} className="relative mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface/60 p-1">
      {tabs.map((t, i) => (
        <button key={t.id} ref={(el) => { refs.current[i] = el }} role="tab" type="button" aria-selected={value === t.id} tabIndex={value === t.id ? 0 : -1}
          onKeyDown={(e) => onKey(e, i)} onClick={() => onChange(t.id)}
          className={cn('flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-sm transition', value === t.id ? 'bg-raised text-fg shadow' : 'text-muted hover:text-fg')}>
          {t.icon && <t.icon className="h-4 w-4" aria-hidden />}{t.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const t = setTimeout(() => {
      const first = ref.current?.querySelector<HTMLElement>('input,textarea,select,button:not([data-close])')
      ;(first ?? ref.current)?.focus()
    }, 30)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey, true); prev?.focus?.() }
  }, [open, onClose])
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
          <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
            initial={{ y: 24, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className={cn('glass flex max-h-[92vh] w-full flex-col rounded-t-3xl sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
            <div className="flex items-center justify-between border-b border-line/70 px-5 py-3">
              <h2 id={titleId} className="font-semibold">{title}</h2>
              <IconButton icon={X} label="Close" onClick={onClose} data-close />
            </div>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line/70 px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/* ---------------- Tag input ---------------- */
export function TagInput({ value, onChange, placeholder = 'Add tag…' }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const add = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/^#/, '').slice(0, 32)
    if (t && !value.includes(t)) onChange([...value, t])
  }
  return (
    <div className="input flex flex-wrap items-center gap-1.5 py-1.5">
      {value.map((t) => (
        <span key={t} className="chip border-accent/40 bg-accent/10 text-accent">#{t}
          <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input className="min-w-[80px] flex-1 bg-transparent text-sm outline-none" placeholder={placeholder} aria-label="Add tag"
        onKeyDown={(e) => {
          const el = e.currentTarget
          if ((e.key === 'Enter' || e.key === ',') && el.value) { e.preventDefault(); add(el.value); el.value = '' }
          else if (e.key === 'Backspace' && !el.value && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={(e) => { if (e.currentTarget.value) { add(e.currentTarget.value); e.currentTarget.value = '' } }} />
    </div>
  )
}
