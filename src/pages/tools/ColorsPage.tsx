import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Copy, Download, Heart, Palette as PaletteIcon, Pencil, Plus, Trash2, X } from 'lucide-react'
import { db } from '@/lib/db'
import { palettesRepo } from '@/services/repo'
import { safeWrite, toast } from '@/components/feedback'
import { Badge, Button, Card, CardTitle, Field, IconButton, Input, PageHeader, Select, Tabs } from '@/components/ui'
import { contrastRatio, fmtHsl, fmtRgb, harmonies, parseColor, readableTextOn, rgbToHex, rgbToHsl, shades, wcagRating } from '@/lib/color'
import { copyText } from '@/features/tools/clipboard'
import { downloadText } from '@/services/backup'
import { cn } from '@/lib/cn'
import type { Palette } from '@/types/models'

const FAVORITES = 'Favorites'

function Swatch({ hex, onPick, size = 'h-12' }: { hex: string; onPick?: (h: string) => void; size?: string }) {
  return (
    <button type="button" title={`${hex} — click to copy`} aria-label={`Color ${hex}. Click to copy${onPick ? ', double-click to select' : ''}`}
      onClick={() => void copyText(hex, hex)} onDoubleClick={() => onPick?.(hex)}
      className={cn('flex min-w-0 flex-1 items-end rounded-xl border border-line p-1 text-[10px] font-mono', size)} style={{ background: hex, color: readableTextOn(parseColor(hex)!) }}>
      {hex}
    </button>
  )
}

function ColorTool({ hex, setHex, onFavorite }: { hex: string; setHex: (h: string) => void; onFavorite: () => void }) {
  const [text, setText] = useState(hex)
  const rgb = parseColor(hex)!
  const err = text && !parseColor(text) ? 'Use #hex, rgb(r, g, b) or hsl(h, s%, l%)' : null
  const formats = [['HEX', hex.toUpperCase()], ['RGB', fmtRgb(rgb)], ['HSL', fmtHsl(rgbToHsl(rgb))]]
  const h = harmonies(hex)!
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardTitle icon={PaletteIcon}>Color picker</CardTitle>
        <div className="flex flex-wrap items-start gap-4">
          <input type="color" aria-label="Pick a color" value={hex} onChange={(e) => { setHex(e.target.value); setText(e.target.value) }} className="h-28 w-28 cursor-pointer rounded-2xl border border-line bg-transparent" />
          <div className="min-w-[12rem] flex-1 space-y-2">
            <Field label="Enter a color" error={err} htmlFor="col-in">
              <Input id="col-in" value={text} onChange={(e) => { setText(e.target.value); const c = parseColor(e.target.value); if (c) setHex(rgbToHex(c)) }} />
            </Field>
            {formats.map(([l, v]) => (
              <div key={l} className="flex items-center gap-2 text-sm"><span className="w-10 text-xs text-muted">{l}</span><code className="flex-1 truncate rounded-lg bg-raised px-2 py-1">{v}</code>
                <IconButton icon={Copy} label={`Copy ${l}`} onClick={() => void copyText(v, l)} /></div>
            ))}
            <Button size="sm" icon={Heart} onClick={onFavorite}>Add to favorites</Button>
          </div>
        </div>
      </Card>
      <Card><CardTitle icon={PaletteIcon}>Shades & harmonies</CardTitle>
        <p className="mb-1 text-xs text-muted">Click a swatch to copy · double-click to select it.</p>
        <div className="mb-3 flex gap-1">{shades(hex).map((s) => <Swatch key={s} hex={s} onPick={(x) => { setHex(x); setText(x) }} />)}</div>
        {(Object.keys(h) as (keyof typeof h)[]).map((k) => (
          <div key={k} className="mb-2"><div className="mb-1 text-xs capitalize text-muted">{k}</div><div className="flex gap-1">{h[k].map((s, i) => <Swatch key={s + i} hex={s} size="h-9" onPick={(x) => { setHex(x); setText(x) }} />)}</div></div>
        ))}
      </Card>
    </div>
  )
}

function GradientTool() {
  const [stops, setStops] = useState(['#8b5cf6', '#3b82f6'])
  const [angle, setAngle] = useState(135)
  const [kind, setKind] = useState<'linear' | 'radial'>('linear')
  const css = kind === 'linear' ? `linear-gradient(${angle}deg, ${stops.join(', ')})` : `radial-gradient(circle, ${stops.join(', ')})`
  return (
    <Card><CardTitle icon={PaletteIcon}>Gradient generator</CardTitle>
      <div className="mb-3 h-40 rounded-2xl border border-line" style={{ background: css }} role="img" aria-label={`Gradient preview: ${css}`} />
      <div className="flex flex-wrap items-end gap-3">
        {stops.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <input type="color" aria-label={`Stop ${i + 1}`} value={s} onChange={(e) => setStops(stops.map((x, j) => (j === i ? e.target.value : x)))} className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-transparent" />
            {stops.length > 2 && <IconButton icon={X} label={`Remove stop ${i + 1}`} onClick={() => setStops(stops.filter((_, j) => j !== i))} />}
          </div>
        ))}
        <Button size="sm" icon={Plus} disabled={stops.length >= 4} onClick={() => setStops([...stops, '#ec4899'])}>Stop</Button>
        <Field label="Type" htmlFor="gk"><Select id="gk" value={kind} onChange={(e) => setKind(e.target.value as 'linear' | 'radial')}><option value="linear">Linear</option><option value="radial">Radial</option></Select></Field>
        {kind === 'linear' && <Field label={`Angle: ${angle}°`} htmlFor="ga"><input id="ga" type="range" min={0} max={360} value={angle} onChange={(e) => setAngle(Number(e.target.value))} className="w-40" /></Field>}
      </div>
      <div className="mt-3 flex items-center gap-2"><code className="flex-1 truncate rounded-lg bg-raised px-2 py-1 text-xs">background: {css};</code><Button size="sm" icon={Copy} onClick={() => void copyText(`background: ${css};`, 'CSS')}>Copy CSS</Button></div>
    </Card>
  )
}

function ContrastTool() {
  const [fg, setFg] = useState('#ffffff')
  const [bg, setBg] = useState('#7c3aed')
  const f = parseColor(fg), b = parseColor(bg)
  const ratio = f && b ? contrastRatio(f, b) : null
  const r = ratio ? wcagRating(ratio) : null
  const Pass = ({ ok, label }: { ok: boolean; label: string }) => <Badge tone={ok ? 'ok' : 'danger'}>{ok ? '✓' : '✗'} {label}</Badge>
  return (
    <Card><CardTitle icon={PaletteIcon}>Contrast checker (WCAG 2)</CardTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {([['Text color', fg, setFg], ['Background', bg, setBg]] as const).map(([l, v, set]) => (
          <Field key={l} label={l} htmlFor={`cc-${l}`} error={v && !parseColor(v) ? 'Invalid color' : null}>
            <div className="flex gap-2"><input type="color" aria-label={`${l} picker`} value={parseColor(v) ? rgbToHex(parseColor(v)!) : '#000000'} onChange={(e) => set(e.target.value)} className="h-10 w-12 rounded-lg border border-line bg-transparent" />
              <Input id={`cc-${l}`} value={v} onChange={(e) => set(e.target.value)} /></div>
          </Field>
        ))}
      </div>
      <div className="mt-3 rounded-2xl border border-line p-4" style={{ background: b ? rgbToHex(b) : undefined, color: f ? rgbToHex(f) : undefined }}>
        <p className="text-2xl font-bold">Large text sample</p><p className="text-sm">Normal body text sample — the quick brown fox jumps over the lazy dog.</p>
      </div>
      {ratio && r && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-2xl font-bold tabular-nums">{ratio.toFixed(2)}:1</span>
        <Pass ok={r.aaNormal} label="AA normal" /><Pass ok={r.aaLarge} label="AA large" /><Pass ok={r.aaaNormal} label="AAA normal" /><Pass ok={r.aaaLarge} label="AAA large" /></div>}
    </Card>
  )
}

function Palettes({ current }: { current: string }) {
  const palettes = useLiveQuery(() => db.palettes.filter((p) => !p.deletedAt).toArray(), [])
  const [name, setName] = useState('')
  const sorted = useMemo(() => palettes?.slice().sort((a, b) => (a.name === FAVORITES ? -1 : b.name === FAVORITES ? 1 : b.updatedAt - a.updatedAt)), [palettes])
  const exportCss = (p: Palette) => {
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    downloadText(`:root {\n${p.colors.map((c, i) => `  --${slug}-${i + 1}: ${c};`).join('\n')}\n}\n`, `${slug}.css`, 'text/css')
  }
  return (
    <Card className="lg:col-span-2"><CardTitle icon={PaletteIcon}>Saved palettes</CardTitle>
      <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { void safeWrite(() => palettesRepo.create({ name: name.trim(), colors: [current] }), 'Palette created'); setName('') } }}>
        <Input aria-label="New palette name" placeholder="New palette name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 sm:max-w-xs" />
        <Button type="submit" icon={Plus} disabled={!name.trim()}>Create with current color</Button>
      </form>
      {!sorted?.length ? <p className="text-sm text-muted">No palettes yet. Favorites you add appear here too.</p> : (
        <ul className="space-y-3">{sorted.map((p) => (
          <li key={p.id} className="rounded-2xl border border-line p-3">
            <div className="mb-2 flex flex-wrap items-center gap-1">
              <span className="mr-auto font-medium">{p.name === FAVORITES ? '♥ ' : ''}{p.name} <span className="text-xs text-muted">({p.colors.length})</span></span>
              <Button size="sm" icon={Plus} disabled={p.colors.includes(current)} onClick={() => void safeWrite(() => palettesRepo.update(p.id, { colors: [...p.colors, current] }))}>Add {current}</Button>
              <IconButton icon={Pencil} label={`Rename ${p.name}`} onClick={() => { const n = prompt('Palette name', p.name)?.trim(); if (n) void safeWrite(() => palettesRepo.update(p.id, { name: n })) }} />
              <IconButton icon={Download} label={`Export ${p.name} as CSS variables`} onClick={() => exportCss(p)} />
              <IconButton icon={Copy} label={`Copy ${p.name} as JSON`} onClick={() => void copyText(JSON.stringify(p.colors), 'Palette JSON')} />
              <IconButton icon={Trash2} label={`Delete ${p.name}`} onClick={async () => { await safeWrite(() => palettesRepo.trash(p.id)); toast('Palette moved to trash', 'success', { label: 'Undo', run: () => void palettesRepo.restore(p.id) }) }} />
            </div>
            <div className="flex flex-wrap gap-1">{p.colors.map((c) => (
              <div key={c} className="relative h-12 w-20"><Swatch hex={c} />
                <button type="button" aria-label={`Remove ${c} from ${p.name}`} onClick={() => void safeWrite(() => palettesRepo.update(p.id, { colors: p.colors.filter((x) => x !== c) }))}
                  className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-surface text-muted shadow hover:text-danger"><X className="h-3 w-3" /></button>
              </div>
            ))}</div>
          </li>
        ))}</ul>
      )}
    </Card>
  )
}

export function ColorsPage() {
  const [tab, setTab] = useState<'picker' | 'gradient' | 'contrast'>('picker')
  const [hex, setHex] = useState('#8b5cf6')
  const addFavorite = async () => {
    const fav = (await db.palettes.toArray()).find((p) => p.name === FAVORITES && !p.deletedAt)
    if (fav?.colors.includes(hex)) return toast('Already in favorites', 'info')
    await safeWrite(async () => { if (fav) await palettesRepo.update(fav.id, { colors: [...fav.colors, hex] }); else await palettesRepo.create({ name: FAVORITES, colors: [hex] }) }, 'Added to favorites')
  }
  return (
    <div>
      <PageHeader title="Colors" description="Pick, convert, generate gradients, check contrast and save palettes." icon={PaletteIcon} />
      <Tabs label="Color tools" value={tab} onChange={setTab} tabs={[{ id: 'picker', label: 'Picker & conversion' }, { id: 'gradient', label: 'Gradients' }, { id: 'contrast', label: 'Contrast' }]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">{tab === 'picker' ? <ColorTool hex={hex} setHex={setHex} onFavorite={() => void addFavorite()} /> : tab === 'gradient' ? <GradientTool /> : <ContrastTool />}</div>
        <Palettes current={hex} />
      </div>
    </div>
  )
}
