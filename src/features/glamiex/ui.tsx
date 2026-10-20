import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowUp, ChevronDown, Download, FileSpreadsheet, Image as ImageIcon, Loader2, Minus, Paperclip, Printer, Search, Trash2, Video, X } from 'lucide-react'
import { db } from '@/lib/db'
import { uid } from '@/lib/id'
import { baseEntity } from '@/services/repo'
import { Badge, Button, IconButton, Input, Modal, Select } from '@/components/ui'
import { toast } from '@/components/feedback'
import { cn } from '@/lib/cn'
import { toCSV } from '@/lib/csv'
import { xlsxBlob, type Cell, type Sheet } from '@/lib/xlsx'
import { downloadBlob, downloadText } from '@/services/backup'
import { printHtml } from '@/lib/markdown'
import { fileSize } from '@/lib/numbers'
import { makeThumbnail, readWithProgress, validateFile, kindOf } from '@/features/media/media'
import { pctChange, pkr, pkrCompact, parseRupees, toRupees } from './money'
import { presetRange, RANGE_PRESETS, zoned, type DateRange, type RangePreset } from './time'
import type { Paisa } from './types'
import type { MediaFile } from '@/types/models'
import { escapeHtml } from '@/lib/html'

/* ---------------- Date range ---------------- */
export interface RangeState { preset: RangePreset; custom: DateRange }
export function useRange(key: string, tz: string, initial: RangePreset = 'thisMonth') {
  const storeKey = `gx-range-${key}`
  const [state, setState] = useState<RangeState>(() => {
    try { const s = sessionStorage.getItem(storeKey); if (s) return JSON.parse(s) as RangeState } catch { /* ignore */ }
    const today = zoned(new Date().toISOString(), tz).date
    return { preset: initial, custom: { from: today, to: today } }
  })
  useEffect(() => { try { sessionStorage.setItem(storeKey, JSON.stringify(state)) } catch { /* ignore */ } }, [state, storeKey])
  const today = zoned(new Date().toISOString(), tz).date
  const range = presetRange(state.preset, today, state.custom)
  return { state, setState, range, today }
}

export function RangeBar({ state, setState, range, extra }: { state: RangeState; setState: (s: RangeState) => void; range: DateRange; extra?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-xs text-muted">Period
        <Select aria-label="Date range" className="mt-1 w-auto min-w-[9rem]" value={state.preset} onChange={(e) => setState({ ...state, preset: e.target.value as RangePreset })}>
          {RANGE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </Select>
      </label>
      {state.preset === 'custom' && <>
        <label className="flex flex-col text-xs text-muted">From<Input type="date" className="mt-1 w-auto" value={state.custom.from} max={state.custom.to} onChange={(e) => setState({ ...state, custom: { ...state.custom, from: e.target.value } })} /></label>
        <label className="flex flex-col text-xs text-muted">To<Input type="date" className="mt-1 w-auto" value={state.custom.to} min={state.custom.from} onChange={(e) => setState({ ...state, custom: { ...state.custom, to: e.target.value } })} /></label>
      </>}
      <span className="mb-2.5 text-xs text-muted">{state.preset === 'all' ? 'All records' : `${range.from} → ${range.to}`}</span>
      {extra && <div className="ml-auto flex flex-wrap gap-2">{extra}</div>}
    </div>
  )
}

/* ---------------- KPI card ---------------- */
export function Delta({ cur, prev, invert, money }: { cur: number; prev: number; invert?: boolean; money?: boolean }) {
  const pct = pctChange(cur, prev)
  if (pct === 0 || (pct == null && cur === 0)) return <span className="inline-flex items-center gap-0.5 text-xs text-muted"><Minus className="h-3 w-3" aria-hidden />0%</span>
  const up = pct == null ? cur > 0 : pct > 0
  const good = invert ? !up : up
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', good ? 'text-ok' : 'text-danger')} title={`Previous period: ${money ? pkr(prev) : prev}`}>
      {up ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
      {pct == null ? 'new' : `${Math.abs(pct) >= 1000 ? '999+' : Math.abs(pct).toFixed(1)}%`}
      <span className="sr-only">{up ? 'increase' : 'decrease'} versus previous period</span>
    </span>
  )
}

export function KpiCard({ label, value, prev, kind = 'money', to, tone, sub, invert, delay = 0 }: {
  label: string; value: number | string | null; prev?: number | null; kind?: 'money' | 'count' | 'pct' | 'text'; to?: string; tone?: 'ok' | 'danger' | 'warn' | 'auto'
  sub?: ReactNode; invert?: boolean; delay?: number
}) {
  const num = typeof value === 'number' ? value : null
  const shown = value == null ? '—' : num == null ? String(value) : kind === 'money' ? pkrCompact(num) : kind === 'pct' ? `${(num * 100).toFixed(1)}%` : kind === 'count' ? num.toLocaleString('en-PK') : String(num)
  const t = tone === 'auto' ? (num == null ? undefined : num > 0 ? 'ok' : num < 0 ? 'danger' : undefined) : tone
  const body = (
    <div className="card gx-kpi gx-rise card-hover flex h-full flex-col gap-1 p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn('gx-kpi-value text-xl font-bold tabular-nums sm:text-2xl', t === 'ok' && 'text-ok', t === 'danger' && 'text-danger', t === 'warn' && 'text-warn')}
        title={kind === 'money' && num != null ? pkr(num) : undefined}>{shown}</div>
      <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-muted">
        {prev != null && num != null && kind !== 'text' && <Delta cur={num} prev={prev} invert={invert} money={kind === 'money'} />}
        {sub}
      </div>
    </div>
  )
  return to ? <Link to={to} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label={`${label}: ${kind === 'money' && num != null ? pkr(num) : shown}. Open details`}>{body}</Link> : body
}

/* ---------------- Money input ---------------- */
export function MoneyInput({ id, value, onChange, placeholder = '0', allowNegative, prefix = 'Rs', ...rest }: {
  id?: string; prefix?: string; value: Paisa | null; onChange: (v: Paisa | null) => void; placeholder?: string; allowNegative?: boolean; 'aria-invalid'?: boolean; disabled?: boolean
}) {
  const [text, setText] = useState(value == null ? '' : String(toRupees(value)))
  const last = useRef(value)
  useEffect(() => { if (value !== last.current) { last.current = value; setText(value == null ? '' : String(toRupees(value))) } }, [value])
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{prefix}</span>
      <Input id={id} inputMode="decimal" autoComplete="off" className={cn(prefix.length > 2 ? "pl-12" : "pl-9", "text-right tabular-nums")} placeholder={placeholder} value={text} {...rest}
        onChange={(e) => {
          const t = e.target.value.replace(allowNegative ? /[^\d.,-]/g : /[^\d.,]/g, '')
          setText(t)
          const v = t.trim() === '' ? null : parseRupees(t)
          last.current = v
          onChange(v)
        }} />
    </div>
  )
}

/* ---------------- Responsive data table ---------------- */
export interface Col<T> { key: string; label: string; render: (r: T) => ReactNode; sort?: (r: T) => string | number; align?: 'right'; className?: string; text?: (r: T) => string }
export function DataTable<T>({ rows, cols, rowKey, onRowClick, card, empty = 'No records yet.', pageSize = 50, searchable = true, toolbar, initialSort }: {
  rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; card?: (r: T) => ReactNode; empty?: ReactNode; pageSize?: number
  searchable?: boolean; toolbar?: ReactNode; initialSort?: { key: string; dir: 1 | -1 }
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState(initialSort ?? null)
  const [limit, setLimit] = useState(pageSize)
  const list = useMemo(() => {
    let out = rows
    if (q) {
      const t = q.toLowerCase()
      out = out.filter((r) => cols.some((c) => (c.text?.(r) ?? (c.sort ? String(c.sort(r)) : '')).toLowerCase().includes(t)))
    }
    if (sort) {
      const c = cols.find((x) => x.key === sort.key)
      if (c?.sort) out = [...out].sort((a, b) => { const x = c.sort!(a), y = c.sort!(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir })
    }
    return out
  }, [rows, q, sort, cols])
  const shown = list.slice(0, limit)
  return (
    <div>
      {(searchable || toolbar) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {searchable && <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input aria-label="Filter rows" placeholder="Filter…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>}
          {toolbar}
          <span className="ml-auto text-xs text-muted">{list.length} record{list.length === 1 ? '' : 's'}</span>
        </div>
      )}
      {!list.length ? <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">{rows.length ? 'No records match this filter.' : empty}</div> : <>
        {/* Cards on phones */}
        {card && <ul className="space-y-2 md:hidden">{shown.map((r) => (
          <li key={rowKey(r)}>{onRowClick ? <button type="button" className="card block w-full p-3 text-left active:scale-[0.99]" onClick={() => onRowClick(r)}>{card(r)}</button> : <div className="card p-3">{card(r)}</div>}</li>
        ))}</ul>}
        {/* Table on tablets / laptops */}
        <div className={cn('card overflow-auto p-0', card && 'hidden md:block')} style={{ maxHeight: '70vh' }}>
          <table className="gx-table w-full text-sm">
            <thead><tr>{cols.map((c) => (
              <th key={c.key} scope="col" className={cn('whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-muted', c.align === 'right' && 'text-right', c.className)}
                aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                {c.sort ? <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setSort(sort?.key === c.key ? (sort.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })}>
                  {c.label}{sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                </button> : c.label}
              </th>
            ))}</tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={rowKey(r)} className={cn('border-t border-line/60', onRowClick && 'cursor-pointer hover:bg-raised/60')} onClick={onRowClick ? () => onRowClick(r) : undefined}
                tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r) } : undefined}>
                {cols.map((c) => <td key={c.key} className={cn('px-3 py-2', c.align === 'right' && 'gx-num', c.className)}>{c.render(r)}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
        {list.length > limit && <div className="mt-3 text-center"><Button onClick={() => setLimit(limit + pageSize)}>Show more ({list.length - limit} more)</Button></div>}
      </>}
    </div>
  )
}

/* ---------------- Status badge ---------------- */
export function PayBadge({ s }: { s: string }) {
  const tone = s === 'paid' || s === 'completed' ? 'ok' : s === 'partial' || s === 'pending' ? 'warn' : s === 'unpaid' || s === 'overdue' ? 'danger' : 'muted'
  return <Badge tone={tone}>{s}</Badge>
}
export const Money = ({ v, sign, tone }: { v: Paisa; sign?: boolean; tone?: boolean }) =>
  <span className={cn('tabular-nums', tone && v > 0 && 'text-ok', tone && v < 0 && 'text-danger')}>{pkr(v, { sign })}</span>

/* ---------------- Collapsible section (mobile-friendly) ---------------- */
export function Section({ title, icon: Icon, children, actions, defaultOpen = true, className }: { title: string; icon?: typeof Search; children: ReactNode; actions?: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={cn('card p-4', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold" aria-expanded={open} onClick={() => setOpen(!open)}>
          {Icon && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-raised text-accent"><Icon className="h-4 w-4" aria-hidden /></span>}
          <span className="truncate">{title}</span>
          <ChevronDown className={cn('ml-1 h-4 w-4 shrink-0 text-muted transition-transform', !open && '-rotate-90')} aria-hidden />
        </button>
        {actions}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </section>
  )
}

/* ---------------- Exports ---------------- */
export function exportFiles(name: string, period: string, sheets: Sheet[]) {
  const meta: Cell[][] = [['GLAMIEX report', name], ['Period', period], ['Currency', 'PKR'], ['Generated', new Date().toLocaleString()]]
  return {
    csv: () => downloadText(toCSV([...meta, [], ...sheets[0].rows]), `${name.toLowerCase().replace(/\W+/g, '-')}.csv`, 'text/csv;charset=utf-8'),
    xlsx: () => downloadBlob(xlsxBlob([{ name: 'Info', rows: meta }, ...sheets]), `${name.toLowerCase().replace(/\W+/g, '-')}.xlsx`),
    print: () => {
      const tables = sheets.map((s) => `<h2>${escapeHtml(s.name)}</h2><table><thead><tr>${(s.rows[0] ?? []).map((h) => `<th>${escapeHtml(String(h ?? ''))}</th>`).join('')}</tr></thead><tbody>${s.rows.slice(1).map((r) => `<tr>${r.map((c) => `<td${typeof c === 'number' ? ' style="text-align:right"' : ''}>${escapeHtml(typeof c === 'number' ? c.toLocaleString('en-PK') : String(c ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('')
      printHtml(`GLAMIEX — ${name}`, `<p>Period: ${escapeHtml(period)} · Currency: PKR · Generated ${escapeHtml(new Date().toLocaleString())}</p>${tables}`)
    },
  }
}
export function ExportButtons({ name, period, sheets, size = 'sm' }: { name: string; period: string; sheets: () => Sheet[]; size?: 'sm' | 'md' }) {
  const run = (k: 'csv' | 'xlsx' | 'print') => { try { exportFiles(name, period, sheets())[k]() } catch (e) { toast(`Export failed: ${(e as Error).message}`, 'error') } }
  return <div className="flex flex-wrap gap-2">
    <Button size={size} icon={Download} onClick={() => run('csv')}>CSV</Button>
    <Button size={size} icon={FileSpreadsheet} onClick={() => run('xlsx')}>Excel</Button>
    <Button size={size} icon={Printer} onClick={() => run('print')}>PDF / Print</Button>
  </div>
}
/** Paisa → rupees as a plain number for spreadsheets (exact to 2 decimals). */
export const rs = (p: Paisa) => Math.round(p) / 100

/* ---------------- Attachments (stored in the private local media store) ---------------- */
const MAX_BY_KIND = { image: 15 * 1024 * 1024, video: 100 * 1024 * 1024, any: 25 * 1024 * 1024 }
export function AttachmentField({ ids, onChange, accept = 'any', label, tag }: { ids: string[]; onChange: (ids: string[]) => void; accept?: 'image' | 'video' | 'any'; label: string; tag: string }) {
  const files = useLiveQuery(async (): Promise<MediaFile[]> => (ids.length ? (await db.media.bulkGet(ids)).filter((x): x is MediaFile => !!x && !x.deletedAt) : []), [ids.join(',')])
  const [progress, setProgress] = useState<{ name: string; pct: number }[]>([])
  const [preview, setPreview] = useState<{ url: string; mime: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const acceptAttr = accept === 'image' ? 'image/png,image/jpeg,image/webp,image/gif,image/avif' : accept === 'video' ? 'video/mp4,video/webm,video/ogg,video/quicktime' : 'image/*,application/pdf,video/mp4,video/webm,text/csv,.xlsx,.docx'

  const upload = async (list: FileList) => {
    const added: string[] = []
    for (const f of Array.from(list)) {
      const v = validateFile(f)
      if ('error' in v) { toast(`${f.name}: ${v.error}`, 'error'); continue }
      const k = kindOf(v.mime)
      if (accept === 'image' && k !== 'image') { toast(`${f.name}: please choose an image`, 'error'); continue }
      if (accept === 'video' && k !== 'video') { toast(`${f.name}: please choose a video`, 'error'); continue }
      if (v.mime === 'image/svg+xml') { toast(`${f.name}: SVG is not accepted for financial records`, 'error'); continue }
      const max = MAX_BY_KIND[accept]
      if (f.size > max) { toast(`${f.name} is ${fileSize(f.size)}; the limit is ${fileSize(max)}`, 'error'); continue }
      setProgress((p) => [...p, { name: f.name, pct: 0 }])
      try {
        const blob = await readWithProgress(f, v.mime, (pct) => setProgress((p) => p.map((x) => (x.name === f.name ? { ...x, pct } : x))))
        const thumb = k === 'image' ? await makeThumbnail(blob) : null
        const id = uid()
        await db.media.add({ ...baseEntity(), id, name: f.name, mime: v.mime, size: f.size, blob, thumbnail: thumb, description: `GLAMIEX ${tag}`, tags: ['glamiex', tag] })
        added.push(id)
      } catch (e) { toast(`${f.name}: ${(e as Error).message}`, 'error') }
      finally { setProgress((p) => p.filter((x) => x.name !== f.name)) }
    }
    if (added.length) { onChange([...ids, ...added]); toast(`${added.length} file${added.length > 1 ? 's' : ''} attached`) }
    if (inputRef.current) inputRef.current.value = ''
  }
  const open = (id: string) => { const f = files?.find((x) => x?.id === id); if (f) setPreview({ url: URL.createObjectURL(f.blob), mime: f.mime }) }

  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex flex-wrap gap-2">
        {files?.filter(Boolean).map((f) => (
          <div key={f!.id} className="group relative h-20 w-20 overflow-hidden rounded-xl border border-line bg-raised">
            <button type="button" className="h-full w-full" onClick={() => open(f!.id)} aria-label={`Preview ${f!.name}`}>
              {f!.thumbnail ? <img loading="lazy" decoding="async" src={f!.thumbnail} alt={f!.name} className="h-full w-full object-cover" /> : (
                <span className="flex h-full flex-col items-center justify-center gap-1 p-1 text-[10px] text-muted">
                  {f!.mime.startsWith('video/') ? <Video className="h-5 w-5" aria-hidden /> : <Paperclip className="h-5 w-5" aria-hidden />}<span className="line-clamp-2 break-all">{f!.name}</span>
                </span>
              )}
            </button>
            <button type="button" aria-label={`Remove ${f!.name}`} onClick={() => onChange(ids.filter((x) => x !== f!.id))}
              className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-surface/90 text-muted shadow hover:text-danger"><X className="h-4 w-4" /></button>
          </div>
        ))}
        {progress.map((p) => (
          <div key={p.name} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-[10px] text-muted" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />{Math.round(p.pct * 100)}%
          </div>
        ))}
        <button type="button" onClick={() => inputRef.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-xs text-muted hover:border-accent hover:text-fg">
          {accept === 'video' ? <Video className="h-5 w-5" aria-hidden /> : <ImageIcon className="h-5 w-5" aria-hidden />}Add
        </button>
        <input ref={inputRef} type="file" hidden multiple accept={acceptAttr} onChange={(e) => e.target.files && void upload(e.target.files)} />
      </div>
      <p className="mt-1 text-[11px] text-muted">Stored privately on this device{accept === 'video' ? ' · max 100 MB' : accept === 'image' ? ' · max 15 MB' : ' · max 25 MB'}. Removing detaches the file from this record.</p>
      <Modal open={!!preview} onClose={() => { if (preview) URL.revokeObjectURL(preview.url); setPreview(null) }} title="Attachment" wide>
        {preview && <AttachmentPreview url={preview.url} mime={preview.mime} />}
      </Modal>
    </div>
  )
}
function AttachmentPreview({ url, mime }: { url: string; mime: string }) {
  if (mime.startsWith('image/')) return <img decoding="async" src={url} alt="Attachment preview" className="mx-auto max-h-[70vh] w-auto rounded-xl object-contain" />
  if (mime.startsWith('video/')) return <video src={url} controls className="max-h-[70vh] w-full rounded-xl" />
  if (mime === 'application/pdf') return <iframe src={url} title="PDF preview" className="h-[70vh] w-full rounded-xl" />
  return <a className="text-accent underline" href={url} download>Download file</a>
}

/** Remove attachment ids from the media store (soft delete to Trash). */
export async function trashAttachments(ids: string[]) {
  for (const id of ids) await db.media.update(id, { deletedAt: Date.now() })
}

export function ConfirmText({ open, title, body, label, danger, onClose, onConfirm, needReason }: {
  open: boolean; title: string; body: ReactNode; label: string; danger?: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<void> | void; needReason?: boolean
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<>
      <Button onClick={onClose}>Back</Button>
      <Button variant={danger ? 'danger' : 'primary'} loading={busy} disabled={needReason && !reason.trim()} onClick={async () => {
        setBusy(true)
        try { await onConfirm(reason.trim()); onClose() } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
      }}>{label}</Button>
    </>}>
      <div className="text-sm text-muted">{body}</div>
      {needReason && <label className="mt-3 block text-sm">Reason (kept in the audit trail)<Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></label>}
    </Modal>
  )
}

export { IconButton, Trash2 }
