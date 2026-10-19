import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Ban } from 'lucide-react'
import { db } from '@/lib/db'
import { parseColor, rgbToHex } from '@/lib/color'
import { cn } from '@/lib/cn'

export const BASE_SWATCHES = [
  '#000000', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#ffffff',
  '#b91c1c', '#ef4444', '#fca5a5', '#fee2e2', '#c2410c', '#f97316', '#fdba74', '#ffedd5',
  '#a16207', '#eab308', '#fde047', '#fef9c3', '#047857', '#10b981', '#6ee7b7', '#d1fae5',
  '#0e7490', '#06b6d4', '#67e8f9', '#cffafe', '#1d4ed8', '#3b82f6', '#93c5fd', '#dbeafe',
  '#6d28d9', '#8b5cf6', '#c4b5fd', '#ede9fe', '#be185d', '#ec4899', '#f9a8d4', '#fce7f3',
]
const RECENT_KEY = 'colors.recent'

/** Remember a color in the persisted "recent colors" list (max 16). */
export async function pushRecentColor(hex: string) {
  const cur = ((await db.kv.get(RECENT_KEY))?.value as string[]) ?? []
  await db.kv.put({ key: RECENT_KEY, value: [hex, ...cur.filter((c) => c !== hex)].slice(0, 16) })
}
export function useRecentColors(): string[] {
  return (useLiveQuery(() => db.kv.get(RECENT_KEY), [])?.value as string[] | undefined) ?? []
}
export function useFavoriteColors(): string[] {
  return useLiveQuery(async () => (await db.palettes.toArray()).find((p) => p.name === 'Favorites' && !p.deletedAt)?.colors ?? [], []) ?? []
}

/** Popover color picker. `value` null = no color. Calls onChange(null) for "None". */
export function ColorPicker({ value, onChange, label, icon, allowNone = true }: { value: string | null | undefined; onChange: (hex: string | null) => void; label: string; icon?: React.ReactNode; allowNone?: boolean }) {
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState(value ?? '#000000')
  const ref = useRef<HTMLDivElement>(null)
  const recent = useRecentColors()
  const favs = useFavoriteColors()
  useEffect(() => {
    if (!open) return
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('pointerdown', h); document.removeEventListener('keydown', k) }
  }, [open])
  const pick = (c: string | null) => { onChange(c); if (c) void pushRecentColor(c); setOpen(false) }
  const Swatch = ({ c }: { c: string }) => (
    <button type="button" onClick={() => pick(c)} aria-label={`Color ${c}`} title={c}
      className={cn('h-7 w-7 rounded-md border border-line shadow-sm transition hover:scale-110 focus-visible:scale-110', value === c && 'ring-2 ring-accent ring-offset-1')} style={{ background: c }} />
  )
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open}
        className="btn btn-ghost h-9 min-w-9 flex-col gap-0 rounded-xl px-1.5">
        {icon}<span className="h-1 w-5 rounded-full border border-line" style={{ background: value ?? 'transparent' }} aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label={label} className="glass absolute left-0 z-50 mt-1 w-[248px] rounded-2xl p-3 max-sm:fixed max-sm:inset-x-3 max-sm:bottom-20 max-sm:left-3 max-sm:w-auto">
          <div className="grid grid-cols-8 gap-1.5">{BASE_SWATCHES.map((c) => <Swatch key={c} c={c} />)}</div>
          {recent.length > 0 && <><div className="mb-1 mt-3 text-[11px] text-muted">Recent</div><div className="grid grid-cols-8 gap-1.5">{recent.slice(0, 8).map((c) => <Swatch key={c} c={c} />)}</div></>}
          {favs.length > 0 && <><div className="mb-1 mt-3 text-[11px] text-muted">Favorites</div><div className="grid grid-cols-8 gap-1.5">{favs.slice(0, 16).map((c) => <Swatch key={c} c={c} />)}</div></>}
          <div className="mt-3 flex items-center gap-2">
            <input type="color" aria-label="Custom color" value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#000000'} onChange={(e) => setHex(e.target.value)} className="h-9 w-10 cursor-pointer rounded-lg border border-line bg-transparent" />
            <input aria-label="HEX, RGB or HSL" className="input h-9 flex-1 px-2 font-mono text-xs" value={hex} onChange={(e) => setHex(e.target.value)} />
            <button type="button" className="btn btn-soft h-9 px-2 text-xs" onClick={() => { const c = parseColor(hex); if (c) pick(rgbToHex(c)) }}>Apply</button>
          </div>
          {allowNone && <button type="button" onClick={() => pick(null)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-muted hover:bg-raised"><Ban className="h-3.5 w-3.5" aria-hidden />No color</button>}
        </div>
      )}
    </div>
  )
}
