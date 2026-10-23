import { useMemo, useRef, useState } from 'react'
import { BarChart3, Image as ImageIcon, Plus, Trash2 } from 'lucide-react'
import { Button, Field, Input, Modal, Select } from '@/components/ui'
import { DataChart } from '@/features/charts/DataChart'
import { chartToSvg, downloadChartPng, downloadChartSvg, slug } from '@/features/charts/exportChart'
import { resolveChartTheme } from '@/features/charts/theme'
import { AttachmentField } from '@/features/glamiex/ui'
import { colLetter, type Value } from '@/features/sheets/formula'
import { COL_TYPES, RULE_OPS, PROFIT_LOSS_RULES } from '@/features/sheets/format'
import type { ColType, CondRule, SheetCol, TotalFn } from '@/features/sheets/types'
import type { ChartType } from '@/types/models'
import { uid } from '@/lib/id'
import { toast } from '@/components/feedback'

/* ---------- Column settings ---------- */
export function ColumnModal({ col, index, total, onSave, onClose, businessLinks = true }: { col: SheetCol; index: number; total: TotalFn; businessLinks?: boolean; onSave: (c: SheetCol, total: TotalFn) => void; onClose: () => void }) {
  const [name, setName] = useState(col.name)
  const [type, setType] = useState<ColType>(col.type)
  const [width, setWidth] = useState(String(col.width))
  const [tot, setTot] = useState<TotalFn>(total)
  return (
    <Modal open onClose={onClose} title={`Column ${colLetter(index)} settings`} footer={<><Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!name.trim()} onClick={() => { onSave({ ...col, name: name.trim(), type, width: Math.max(60, Math.min(600, Number(width) || col.width)) }, tot); onClose() }}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Column name" htmlFor="cm-name"><Input id="cm-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Data type" htmlFor="cm-type" hint="Controls validation, number format and links"><Select id="cm-type" value={type} onChange={(e) => setType(e.target.value as ColType)}>{COL_TYPES.filter((t) => businessLinks || !['product', 'customer', 'order'].includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
        <Field label="Width (px)" htmlFor="cm-w"><Input id="cm-w" inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Total row" htmlFor="cm-t"><Select id="cm-t" value={tot} onChange={(e) => setTot(e.target.value as TotalFn)}>{(['none', 'sum', 'avg', 'min', 'max', 'count'] as TotalFn[]).map((t) => <option key={t} value={t}>{t === 'none' ? 'No total' : t.toUpperCase()}</option>)}</Select></Field>
      </div>
    </Modal>
  )
}

/* ---------- Conditional formatting ---------- */
export function RulesModal({ rules, columns, onSave, onClose }: { rules: CondRule[]; columns: SheetCol[]; onSave: (r: CondRule[]) => void; onClose: () => void }) {
  const [list, setList] = useState<CondRule[]>(rules)
  const upd = (id: string, patch: Partial<CondRule>) => setList(list.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  return (
    <Modal open onClose={onClose} wide title="Conditional formatting" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { onSave(list); onClose() }}>Save rules</Button></>}>
      <p className="mb-3 text-sm text-muted">The first matching rule colors the cell. Each rule also shows a short label or icon, so meaning never depends on color alone.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" icon={Plus} onClick={() => setList([...list, { id: uid(), colId: null, op: 'gt', value: '0', color: '#047857', bg: '#d1fae5', label: '✓' }])}>Add rule</Button>
        <Button size="sm" onClick={() => setList([...list, ...PROFIT_LOSS_RULES(null, uid)])}>Profit green / loss red</Button>
      </div>
      {!list.length ? <p className="text-sm text-muted">No rules yet.</p> : (
        <ul className="space-y-2">{list.map((r) => {
          const op = RULE_OPS.find((o) => o.id === r.op)!
          return (
            <li key={r.id} className="grid gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_1fr_90px_auto_auto_80px_auto] sm:items-center">
              <Select aria-label="Column" value={r.colId ?? ''} onChange={(e) => upd(r.id, { colId: e.target.value || null })}><option value="">All columns</option>{columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Select aria-label="Condition" value={r.op} onChange={(e) => upd(r.id, { op: e.target.value as CondRule['op'] })}>{RULE_OPS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>
              <Input aria-label="Value" disabled={!op.needsValue} value={r.value} onChange={(e) => upd(r.id, { value: e.target.value })} />
              <label className="flex items-center gap-1 text-xs">Text<input type="color" aria-label="Text color" value={r.color || '#000000'} onChange={(e) => upd(r.id, { color: e.target.value })} className="h-8 w-9 rounded border border-line" /></label>
              <label className="flex items-center gap-1 text-xs">Fill<input type="color" aria-label="Fill color" value={r.bg || '#ffffff'} onChange={(e) => upd(r.id, { bg: e.target.value })} className="h-8 w-9 rounded border border-line" /></label>
              <Input aria-label="Label or icon" placeholder="Label" value={r.label} onChange={(e) => upd(r.id, { label: e.target.value.slice(0, 12) })} />
              <button type="button" aria-label="Delete rule" className="btn btn-ghost h-9 w-9" onClick={() => setList(list.filter((x) => x.id !== r.id))}><Trash2 className="h-4 w-4" /></button>
            </li>
          )
        })}</ul>
      )}
    </Modal>
  )
}

/* ---------- Chart from selection ---------- */
const CHARTS: { id: ChartType | 'ranked'; label: string }[] = [{ id: 'bar', label: 'Bar' }, { id: 'line', label: 'Line' }, { id: 'area', label: 'Area' }, { id: 'pie', label: 'Pie' }, { id: 'donut', label: 'Donut' }, { id: 'ranked', label: 'Ranked bars (performance)' }]
export function ChartModal({ columns, values, rowIdx, left, right, onClose, title }: { columns: SheetCol[]; values: Value[][]; rowIdx: number[]; left: number; right: number; onClose: () => void; title: string }) {
  const [type, setType] = useState<ChartType | 'ranked'>('bar')
  const [name, setName] = useState(title)
  const ref = useRef<HTMLDivElement>(null)
  const labelCol = left, valueCols = Array.from({ length: Math.max(0, right - left) }, (_, i) => left + 1 + i)
  const { data, keys } = useMemo(() => {
    const vc = valueCols.length ? valueCols : [left]
    const keys = vc.map((c) => columns[c].name || colLetter(c))
    let data = rowIdx.map((r) => Object.fromEntries([['label', valueCols.length ? String(values[r][labelCol] ?? '') : `Row ${r + 1}`], ...vc.map((c, i) => [keys[i], typeof values[r][c] === 'number' ? values[r][c] : null])]))
      .filter((d) => keys.some((k) => d[k] != null)) as Record<string, string | number | null>[]
    if (type === 'ranked') data = [...data].sort((a, b) => Number(b[keys[0]] ?? 0) - Number(a[keys[0]] ?? 0)).slice(0, 15)
    return { data, keys }
  }, [columns, values, rowIdx, left, right, type]) // eslint-disable-line react-hooks/exhaustive-deps
  const exportImg = async (kind: 'png' | 'svg') => {
    const pal = resolveChartTheme().palette
    const svg = chartToSvg(ref.current, { title: name, legend: type === 'pie' || type === 'donut' ? [] : keys.map((k, i) => ({ name: k, color: pal[i % pal.length] })) })
    if (!svg) return toast('Nothing to export', 'warn')
    if (kind === 'svg') downloadChartSvg(svg, `${slug(name)}.svg`); else await downloadChartPng(svg, `${slug(name)}.png`)
  }
  return (
    <Modal open onClose={onClose} wide title="Chart from selection" footer={<><Button icon={ImageIcon} onClick={() => void exportImg('png')}>PNG</Button><Button onClick={() => void exportImg('svg')}>SVG</Button><Button variant="primary" onClick={onClose}>Done</Button></>}>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Field label="Title" htmlFor="ch-t"><Input id="ch-t" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Chart type" htmlFor="ch-type"><Select id="ch-type" value={type} onChange={(e) => setType(e.target.value as ChartType)}>{CHARTS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
      </div>
      <p className="mb-2 text-xs text-muted">Labels: column {colLetter(labelCol)} · values: {valueCols.length ? valueCols.map(colLetter).join(', ') : colLetter(left)} · {data.length} rows. Select several columns before opening to chart more series.</p>
      {!data.length ? <p className="py-10 text-center text-sm text-muted"><BarChart3 className="mx-auto mb-2 h-6 w-6" />The selected cells contain no numbers to chart.</p> : (
        <div ref={ref}><h3 className="text-center text-sm font-semibold">{name}</h3>
          <DataChart type={type === 'ranked' ? 'bar' : type} data={data} xKey="label" yKeys={type === 'pie' || type === 'donut' ? [keys[0]] : keys} height={320} ariaLabel={`${type} chart of ${keys.join(', ')}`} /></div>
      )}
    </Modal>
  )
}

/* ---------- Cell attachments ---------- */
export function AttachmentModal({ raw, onSave, onClose }: { raw: string | number | null; onSave: (ids: string[]) => void; onClose: () => void }) {
  const [ids, setIds] = useState<string[]>(typeof raw === 'string' && raw ? raw.split(',').filter(Boolean) : [])
  return (
    <Modal open onClose={onClose} title="Cell attachments" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { onSave(ids); onClose() }}>Save</Button></>}>
      <AttachmentField label="Images, receipts, documents or videos" ids={ids} onChange={setIds} tag="sheet" />
    </Modal>
  )
}

/* ---------- Link picker (product / customer / sale) ---------- */
export function LinkPicker({ type, options, current, onPick, onClose }: { type: string; options: { id: string; label: string }[]; current: string | null; onPick: (id: string | null) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const list = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase())).slice(0, 100)
  return (
    <Modal open onClose={onClose} title={`Link to ${type}`} footer={<><Button onClick={() => { onPick(null); onClose() }}>Clear link</Button><Button onClick={onClose}>Cancel</Button></>}>
      <Input autoFocus aria-label="Search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-2 max-h-80 overflow-y-auto">{list.map((o) => (
        <li key={o.id}><button type="button" className={`flex min-h-[44px] w-full items-center rounded-xl px-3 text-start text-sm hover:bg-raised ${o.id === current ? 'font-semibold text-accent' : ''}`} onClick={() => { onPick(o.id); onClose() }}>{o.label}</button></li>
      ))}{!list.length && <li className="p-3 text-sm text-muted">No matches.</li>}</ul>
    </Modal>
  )
}
