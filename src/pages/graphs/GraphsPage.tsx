import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, startOfWeek } from 'date-fns'
import { ArrowDown, ArrowUp, BarChart3, Columns3, Copy, Download, FileUp, Image as ImageIcon, Plus, Rows3, Search, Sparkles, Trash2, X } from 'lucide-react'
import { db } from '@/lib/db'
import { datasetsRepo } from '@/services/repo'
import { useSettings } from '@/services/settings'
import { safeWrite, toast } from '@/components/feedback'
import { Badge, Button, Card, CardTitle, Checkbox, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, Spinner, Tabs } from '@/components/ui'
import { DataChart, type ChartRow } from '@/features/charts/DataChart'
import { chartToSvg, downloadChartPng, downloadChartSvg, slug } from '@/features/charts/exportChart'
import { resolveChartTheme } from '@/features/charts/theme'
import { coerceCell, parseCSV, toCSV } from '@/lib/csv'
import { downloadText } from '@/services/backup'
import { toISODate, todayISO } from '@/lib/dates'
import { money } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { ChartType, Dataset } from '@/types/models'

const CHART_TYPES: ChartType[] = ['bar', 'line', 'area', 'pie', 'donut']
const MAX_ROWS = 5000

const toRows = (d: Dataset): ChartRow[] => d.rows.map((r) => Object.fromEntries(d.columns.map((c, i) => [c, r[i] ?? null])))

function ChartExport({ target, title, legend }: { target: React.RefObject<HTMLDivElement>; title: string; legend: string[] }) {
  const svg = () => {
    const pal = resolveChartTheme().palette
    const s = chartToSvg(target.current, { title, legend: legend.map((n, i) => ({ name: n, color: pal[i % pal.length] })) })
    if (!s) toast('Nothing to export yet', 'warn')
    return s
  }
  return <>
    <Button size="sm" icon={ImageIcon} onClick={async () => { const s = svg(); if (s) try { await downloadChartPng(s, `${slug(title)}.png`) } catch (e) { toast((e as Error).message, 'error') } }}>Download PNG</Button>
    <Button size="sm" icon={Download} onClick={() => { const s = svg(); if (s) downloadChartSvg(s, `${slug(title)}.svg`) }}>Download SVG</Button>
  </>
}

/* ---------------- Dataset editor ---------------- */
function DatasetEditor({ ds }: { ds: Dataset }) {
  const [filter, setFilter] = useState('')
  const [sortCol, setSortCol] = useState<{ i: number; dir: 1 | -1 } | null>(null)
  const [showLegend, setShowLegend] = useState(true)
  const [showLabels, setShowLabels] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)
  const save = (patch: Partial<Dataset>) => void safeWrite(() => datasetsRepo.update(ds.id, patch))
  const numericCols = ds.columns.filter((_, i) => ds.rows.some((r) => typeof r[i] === 'number'))

  const view = useMemo(() => {
    let idx = ds.rows.map((r, i) => ({ r, i }))
    if (filter) idx = idx.filter(({ r }) => r.some((c) => String(c ?? '').toLowerCase().includes(filter.toLowerCase())))
    if (sortCol) idx = [...idx].sort((a, b) => {
      const x = a.r[sortCol.i], y = b.r[sortCol.i]
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true })) * sortCol.dir
    })
    return idx
  }, [ds.rows, filter, sortCol])

  const setCell = (ri: number, ci: number, v: string) => save({ rows: ds.rows.map((r, i) => (i === ri ? ds.columns.map((_, j) => (j === ci ? coerceCell(v) : r[j] ?? '')) : r)) })
  const renameCol = (ci: number, name: string) => {
    const n = name.trim()
    if (!n || ds.columns.some((c, j) => j !== ci && c === n)) return toast('Column names must be unique and not empty', 'warn')
    const old = ds.columns[ci]
    save({ columns: ds.columns.map((c, j) => (j === ci ? n : c)), chart: { ...ds.chart, xKey: ds.chart.xKey === old ? n : ds.chart.xKey, yKeys: ds.chart.yKeys.map((k) => (k === old ? n : k)) } })
  }
  const addCol = () => {
    let n = `Column ${ds.columns.length + 1}`
    while (ds.columns.includes(n)) n += '′'
    save({ columns: [...ds.columns, n], rows: ds.rows.map((r) => [...r, '']) })
  }
  const removeCol = (ci: number) => {
    if (ds.columns.length <= 1) return
    const name = ds.columns[ci]
    save({ columns: ds.columns.filter((_, j) => j !== ci), rows: ds.rows.map((r) => r.filter((_, j) => j !== ci)), chart: { ...ds.chart, xKey: ds.chart.xKey === name ? ds.columns.find((c) => c !== name)! : ds.chart.xKey, yKeys: ds.chart.yKeys.filter((k) => k !== name) } })
  }
  const yKeys = ds.chart.yKeys.filter((k) => ds.columns.includes(k))

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="Chart title" htmlFor="ct" className="min-w-[12rem] flex-1"><Input id="ct" defaultValue={ds.chart.title} key={ds.id + 't'} onBlur={(e) => e.target.value !== ds.chart.title && save({ chart: { ...ds.chart, title: e.target.value } })} /></Field>
          <Field label="Type" htmlFor="ctype"><Select id="ctype" value={ds.chart.type} onChange={(e) => save({ chart: { ...ds.chart, type: e.target.value as ChartType } })}>{CHART_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Labels (X)" htmlFor="cx"><Select id="cx" value={ds.chart.xKey} onChange={(e) => save({ chart: { ...ds.chart, xKey: e.target.value } })}>{ds.columns.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <fieldset className="mb-3 flex flex-wrap items-center gap-3 text-sm"><legend className="label">Values (Y){ds.chart.type === 'pie' || ds.chart.type === 'donut' ? ' — pie charts use the first' : ''}</legend>
          {ds.columns.filter((c) => c !== ds.chart.xKey).map((c) => (
            <Checkbox key={c} label={c} checked={yKeys.includes(c)} onChange={(v) => save({ chart: { ...ds.chart, yKeys: v ? [...yKeys, c] : yKeys.filter((k) => k !== c) } })} />
          ))}
          <span className="mx-2 h-4 w-px bg-line" />
          <Checkbox label="Legend" checked={showLegend} onChange={setShowLegend} />
          <Checkbox label="Value labels" checked={showLabels} onChange={setShowLabels} />
        </fieldset>
        {ds.sample && <Badge tone="warn" className="mb-2">Sample data — not your records</Badge>}
        {ds.chart.title && <h3 className="text-center font-semibold">{ds.chart.title}</h3>}
        {!ds.rows.length || !yKeys.length ? (
          <p className="py-10 text-center text-sm text-muted">{!ds.rows.length ? 'Add rows or import a CSV to draw a chart.' : 'Choose at least one numeric value column.'}{!numericCols.length && ds.rows.length ? ' No column contains numbers yet.' : ''}</p>
        ) : (
          <div ref={chartRef}><DataChart type={ds.chart.type} data={toRows(ds)} xKey={ds.chart.xKey} yKeys={yKeys} showLegend={showLegend} showLabels={showLabels} ariaLabel={`${ds.chart.type} chart of ${ds.name}`} /></div>
        )}
        <div className="mt-3 flex flex-wrap gap-2"><ChartExport target={chartRef} title={ds.chart.title || ds.name} legend={ds.chart.type === 'pie' || ds.chart.type === 'donut' ? [] : yKeys} /></div>
      </Card>

      <Card>
        <CardTitle icon={Rows3} action={<div className="flex flex-wrap gap-2">
          <Button size="sm" icon={Plus} disabled={ds.rows.length >= MAX_ROWS} onClick={() => save({ rows: [...ds.rows, ds.columns.map(() => '')] })}>Row</Button>
          <Button size="sm" icon={Columns3} onClick={addCol}>Column</Button>
          <Button size="sm" icon={Download} onClick={() => downloadText(toCSV([ds.columns, ...ds.rows]), `${slug(ds.name)}.csv`, 'text/csv;charset=utf-8')}>CSV</Button>
        </div>}>Data ({ds.rows.length} rows)</CardTitle>
        <div className="relative mb-2 sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Filter rows" className="pl-9" placeholder="Filter rows…" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
        <div className="max-h-[480px] overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-raised">
              <tr>{ds.columns.map((c, ci) => (
                <th key={c + ci} className="min-w-[8rem] border-b border-line p-1 text-left">
                  <div className="flex items-center gap-1">
                    <input aria-label={`Column ${ci + 1} name`} defaultValue={c} key={c} onBlur={(e) => e.target.value !== c && renameCol(ci, e.target.value)} className="w-full min-w-0 rounded bg-transparent px-1 py-1 font-semibold outline-none focus:bg-bg" />
                    <IconButton icon={sortCol?.i === ci && sortCol.dir === -1 ? ArrowDown : ArrowUp} label={`Sort by ${c}`} active={sortCol?.i === ci} className="h-7 w-7"
                      onClick={() => setSortCol(sortCol?.i === ci ? (sortCol.dir === 1 ? { i: ci, dir: -1 } : null) : { i: ci, dir: 1 })} />
                    <IconButton icon={X} label={`Delete column ${c}`} className="h-7 w-7" disabled={ds.columns.length <= 1} onClick={() => removeCol(ci)} />
                  </div>
                </th>
              ))}<th className="w-10 border-b border-line"><span className="sr-only">Row actions</span></th></tr>
            </thead>
            <tbody>
              {view.map(({ r, i }) => (
                <tr key={i} className="border-b border-line/50">
                  {ds.columns.map((c, ci) => (
                    <td key={ci} className="p-0">
                      <input aria-label={`Row ${i + 1}, ${c}`} defaultValue={String(r[ci] ?? '')} key={`${i}-${ci}-${r[ci]}`} onBlur={(e) => e.target.value !== String(r[ci] ?? '') && setCell(i, ci, e.target.value)}
                        className={cn('w-full bg-transparent px-2 py-1.5 outline-none focus:bg-bg', typeof r[ci] === 'number' && 'text-right tabular-nums')} />
                    </td>
                  ))}
                  <td><IconButton icon={Trash2} label={`Delete row ${i + 1}`} className="h-7 w-7" onClick={() => save({ rows: ds.rows.filter((_, j) => j !== i) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!view.length && <p className="p-4 text-center text-sm text-muted">{ds.rows.length ? 'No rows match the filter.' : 'No rows yet.'}</p>}
        </div>
      </Card>
    </div>
  )
}

/* ---------------- CSV import ---------------- */
function ImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (id: string) => void }) {
  const [rows, setRows] = useState<string[][] | null>(null)
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const onFile = async (f: File) => {
    setErr(null); setRows(null)
    if (f.size > 10 * 1024 * 1024) return setErr('CSV files up to 10 MB are supported.')
    try {
      const parsed = parseCSV(await f.text(), f.name.endsWith('.tsv') ? '\t' : ',')
      if (parsed.length < 2) return setErr('The file needs a header row and at least one data row.')
      if (parsed.length - 1 > MAX_ROWS) return setErr(`Too many rows (${parsed.length - 1}). The limit is ${MAX_ROWS}.`)
      setRows(parsed); setName(f.name.replace(/\.(csv|tsv|txt)$/i, ''))
    } catch (e) { setErr(`Could not read CSV: ${(e as Error).message}`) }
  }
  const doImport = async () => {
    if (!rows) return
    const header = rows[0].map((h, i) => h.trim() || `Column ${i + 1}`)
    const uniq = header.map((h, i) => (header.indexOf(h) === i ? h : `${h} ${i + 1}`))
    const body = rows.slice(1).map((r) => uniq.map((_, i) => coerceCell(r[i] ?? '')))
    const numeric = uniq.filter((_, i) => body.some((r) => typeof r[i] === 'number'))
    const d = await safeWrite(() => datasetsRepo.create({ name: name.trim() || 'Imported data', columns: uniq, rows: body, chart: { type: 'bar', title: name, xKey: uniq[0], yKeys: numeric.filter((c) => c !== uniq[0]).slice(0, 3) } }), `Imported ${body.length} rows`)
    if (d) { onImported(d.id); onClose(); setRows(null) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Import CSV" wide footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!rows} onClick={doImport}>Import</Button></>}>
      <input type="file" accept=".csv,.tsv,text/csv,text/plain" aria-label="CSV file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f) }} className="text-sm" />
      <p className="mt-1 text-xs text-muted">First row = column headers. Numbers are detected automatically.</p>
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
      {rows && <>
        <Field label="Dataset name" htmlFor="imp-name" className="mt-3"><Input id="imp-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <p className="mt-3 text-sm text-muted">Preview ({rows.length - 1} rows):</p>
        <div className="mt-1 max-h-60 overflow-auto rounded-xl border border-line text-xs">
          <table className="w-full">{rows.slice(0, 8).map((r, i) => <tr key={i} className={cn('border-b border-line/50', i === 0 && 'font-semibold')}>{r.map((c, j) => <td key={j} className="px-2 py-1">{c}</td>)}</tr>)}</table>
        </div>
      </>}
    </Modal>
  )
}

/* ---------------- Charts from app data (read-only, live) ---------------- */
function AppDataCharts() {
  const s = useSettings()
  const data = useLiveQuery(async () => {
    const tasks = (await db.tasks.toArray()).filter((t) => !t.deletedAt)
    const status = (['todo', 'in_progress', 'blocked', 'completed'] as const).map((st) => ({ status: st.replace('_', ' '), count: tasks.filter((t) => t.status === st).length }))
    const weeks = Array.from({ length: 8 }, (_, i) => startOfWeek(addDays(new Date(), (i - 7) * 7), { weekStartsOn: s.weekStartsOn }))
    const perWeek = weeks.map((w) => ({ week: toISODate(w).slice(5), completed: tasks.filter((t) => t.completedAt && t.completedAt >= w.getTime() && t.completedAt < addDays(w, 7).getTime()).length }))
    const projects = await db.projects.toArray()
    const sessions = (await db.timerSessions.toArray()).filter((x) => !x.deletedAt)
    const byProj = new Map<string, number>()
    for (const x of sessions) { const n = projects.find((p) => p.id === x.projectId)?.name ?? 'No project'; byProj.set(n, (byProj.get(n) ?? 0) + x.durationMs / 3_600_000) }
    const month = todayISO().slice(0, 7)
    const exp = (await db.records.where('collection').equals('expenses').toArray()).filter((r) => !r.deletedAt && r.dueDate?.startsWith(month))
    const byCat = new Map<string, number>()
    for (const r of exp) byCat.set(r.category || 'Uncategorised', (byCat.get(r.category || 'Uncategorised') ?? 0) + (r.amount ?? 0))
    return {
      status, hasTasks: tasks.length > 0, perWeek,
      time: [...byProj].map(([project, hours]) => ({ project, hours: +hours.toFixed(2) })),
      expenses: [...byCat].map(([category, total]) => ({ category, total: +total.toFixed(2) })),
    }
  }, [s.weekStartsOn])
  if (!data) return <Spinner />
  const empty = (msg: string) => <p className="py-8 text-center text-sm text-muted">{msg}</p>
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardTitle icon={BarChart3}>Tasks by status</CardTitle>{data.hasTasks ? <DataChart type="donut" data={data.status} xKey="status" yKeys={['count']} height={260} ariaLabel="Donut chart of tasks by status" /> : empty('No tasks yet.')}</Card>
      <Card><CardTitle icon={BarChart3}>Tasks completed per week</CardTitle>{data.perWeek.some((w) => w.completed) ? <DataChart type="line" data={data.perWeek} xKey="week" yKeys={['completed']} showLegend={false} height={260} ariaLabel="Line chart of tasks completed per week for 8 weeks" /> : empty('Complete tasks to see weekly progress.')}</Card>
      <Card><CardTitle icon={BarChart3}>Time tracked per project (hours)</CardTitle>{data.time.length ? <DataChart type="bar" data={data.time} xKey="project" yKeys={['hours']} showLegend={false} height={260} ariaLabel="Bar chart of hours tracked per project" /> : empty('Track time in Time Tools to see this chart.')}</Card>
      <Card><CardTitle icon={BarChart3}>Expenses by category this month</CardTitle>{data.expenses.length ? <DataChart type="pie" data={data.expenses} xKey="category" yKeys={['total']} valueFormatter={(v) => money(v, s.currency)} height={260} ariaLabel="Pie chart of this month's expenses by category" /> : empty('No expenses recorded this month.')}</Card>
    </div>
  )
}

const SAMPLE: Partial<Dataset> = {
  name: 'Sample — Monthly sales', sample: true, tags: ['sample'],
  columns: ['Month', 'Online', 'Store'],
  rows: [['Jan', 120, 80], ['Feb', 135, 76], ['Mar', 160, 90], ['Apr', 150, 95], ['May', 182, 101], ['Jun', 210, 99]],
  chart: { type: 'bar', title: 'Sample — Monthly sales', xKey: 'Month', yKeys: ['Online', 'Store'] },
}

export function GraphsPage() {
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<'datasets' | 'app'>('datasets')
  const [q, setQ] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const all = useLiveQuery(() => db.datasets.orderBy('updatedAt').reverse().filter((d) => !d.deletedAt).toArray(), [])
  const list = all?.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()))
  const active = all?.find((d) => d.id === activeId) ?? all?.[0]

  useEffect(() => {
    const open = params.get('open')
    if (open) { setActiveId(open); setTab('datasets'); params.delete('open'); setParams(params, { replace: true }) }
  }, [params, setParams])

  const create = async (data: Partial<Dataset>) => { const d = await safeWrite(() => datasetsRepo.create(data)); if (d) setActiveId(d.id) }

  return (
    <div>
      <PageHeader title="Graphs & Data" description="Editable datasets, charts, CSV import/export and live charts from your app data." icon={BarChart3}
        actions={<>
          <Button icon={FileUp} onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button variant="primary" icon={Plus} onClick={() => void create({ name: 'Untitled dataset', columns: ['Label', 'Value'], rows: [['A', 1], ['B', 2]], chart: { type: 'bar', title: '', xKey: 'Label', yKeys: ['Value'] } })}>New dataset</Button>
        </>} />
      <Tabs label="Graph sections" value={tab} onChange={setTab} tabs={[{ id: 'datasets', label: 'My datasets', icon: Rows3 }, { id: 'app', label: 'From app data', icon: Sparkles }]} />
      {tab === 'app' ? <AppDataCharts /> : !all ? <Spinner /> : !all.length ? (
        <EmptyState icon={BarChart3} title="No datasets yet" action={<div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" icon={Plus} onClick={() => void create({ name: 'Untitled dataset', columns: ['Label', 'Value'], rows: [], chart: { type: 'bar', title: '', xKey: 'Label', yKeys: ['Value'] } })}>New dataset</Button>
          <Button icon={FileUp} onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button icon={Sparkles} onClick={() => void create(SAMPLE)}>Insert sample data</Button>
        </div>}>Create a table of values, import a CSV, or try clearly-labelled sample data.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="h-fit p-3">
            <Input aria-label="Search datasets" placeholder="Search datasets…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
            <ul className="space-y-1">
              {list?.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => setActiveId(d.id)} aria-current={active?.id === d.id}
                    className={cn('w-full rounded-xl px-3 py-2 text-left text-sm', active?.id === d.id ? 'bg-raised font-medium' : 'hover:bg-raised/60')}>
                    <div className="truncate">{d.name}</div><div className="text-xs text-muted">{d.rows.length} rows · {d.chart.type}{d.sample ? ' · sample' : ''}</div>
                  </button>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="ghost" icon={Sparkles} className="mt-2 w-full" onClick={() => void create(SAMPLE)}>Insert sample data</Button>
          </Card>
          {active && (
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input aria-label="Dataset name" key={active.id} defaultValue={active.name} onBlur={(e) => e.target.value.trim() && e.target.value !== active.name && void safeWrite(() => datasetsRepo.update(active.id, { name: e.target.value.trim() }))}
                  className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-1 text-lg font-semibold outline-none focus:bg-raised" />
                <Button size="sm" icon={Copy} onClick={() => void safeWrite(() => datasetsRepo.duplicate(active.id, (d) => ({ name: `${d.name} (copy)`, sample: d.sample })), 'Duplicated')}>Duplicate</Button>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={async () => {
                  await safeWrite(() => datasetsRepo.trash(active.id)); setActiveId(null)
                  toast('Dataset moved to trash', 'success', { label: 'Undo', run: () => void datasetsRepo.restore(active.id) })
                }}>Delete</Button>
              </div>
              <DatasetEditor ds={active} />
            </div>
          )}
        </div>
      )}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImported={setActiveId} />
    </div>
  )
}
