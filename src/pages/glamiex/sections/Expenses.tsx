import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, Field, IconButton, Input, Modal, Select, Textarea } from '@/components/ui'
import { confirm, safeWrite, toast } from '@/components/feedback'
import { gxAudit, gxExpenseRepo, saveRecord } from '@/features/glamiex/service'
import { pkr } from '@/features/glamiex/money'
import { inRange } from '@/features/glamiex/time'
import { AttachmentField, DataTable, ExportButtons, Money, MoneyInput, RangeBar, rs, useRange, type Col } from '@/features/glamiex/ui'
import { PAYMENT_METHODS, type GxExpense, type PaymentMethod } from '@/features/glamiex/types'
import { useGx, live } from '../context'
import { Stat, earliestDate, nowLocal } from './shared'

export default function Expenses({ id }: { id?: string }) {
  const { data, tz, settings } = useGx()
  const { state, setState, range: raw } = useRange('expenses', tz, 'thisMonth')
  const range = state.preset === 'all' ? { ...raw, from: earliestDate(data, tz) ?? raw.from } : raw
  const [cat, setCat] = useState('')
  const [editing, setEditing] = useState<GxExpense | 'new' | null>(id === 'new' ? 'new' : null)
  const rows = useMemo(() => live(data.expenses).filter((x) => inRange(x.date, range) && (!cat || x.category === cat)), [data.expenses, range.from, range.to, cat]) // eslint-disable-line react-hooks/exhaustive-deps
  const total = rows.reduce((a, x) => a + x.amount, 0)
  const byCat = [...rows.reduce((m, x) => m.set(x.category, (m.get(x.category) ?? 0) + x.amount), new Map<string, number>())].sort((a, b) => b[1] - a[1])
  const cats = [...new Set([...settings.expenseCategories, ...live(data.expenses).map((x) => x.category)])]

  const cols: Col<GxExpense>[] = [
    { key: 'date', label: 'Date', render: (x) => x.date, sort: (x) => x.date, text: (x) => `${x.category} ${x.description} ${x.vendor} ${x.notes}` },
    { key: 'cat', label: 'Category', render: (x) => x.category, sort: (x) => x.category },
    { key: 'desc', label: 'Description', render: (x) => <div><div>{x.description || '—'}</div>{x.vendor && <div className="text-xs text-muted">{x.vendor}</div>}</div> },
    { key: 'method', label: 'Method', render: (x) => PAYMENT_METHODS.find((m) => m.id === x.method)?.label },
    { key: 'amt', label: 'Amount', align: 'right', render: (x) => <b className="text-danger"><Money v={x.amount} /></b>, sort: (x) => x.amount },
    { key: 'act', label: '', render: (x) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><IconButton icon={Pencil} label="Edit" onClick={() => setEditing(x)} /><IconButton icon={Trash2} label="Delete" onClick={async () => {
      if (!(await confirm({ title: 'Delete expense?', body: `${x.category} — ${pkr(x.amount)} on ${x.date}. It moves to Trash.`, danger: true, confirmLabel: 'Delete' }))) return
      await safeWrite(() => gxExpenseRepo.trash(x.id)); await gxAudit('expense', x.id, 'delete', `${x.category} ${pkr(x.amount)}`)
      toast('Moved to trash', 'success', { label: 'Undo', run: () => void gxExpenseRepo.restore(x.id) })
    }} /></div> },
  ]
  return (
    <div>
      <RangeBar state={state} setState={setState} range={range} extra={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add expense</Button>} />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total expenses" tone="danger"><Money v={total} /></Stat>
        {byCat.slice(0, 3).map(([c, v]) => <Stat key={c} label={c}><Money v={v} /> <span className="text-xs text-muted">({total ? Math.round((v / total) * 100) : 0}%)</span></Stat>)}
      </div>
      <DataTable rows={rows} cols={cols} rowKey={(x) => x.id} onRowClick={setEditing} initialSort={{ key: 'date', dir: -1 }} empty="No expenses in this period."
        toolbar={<>
          <Select aria-label="Category" className="w-auto" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select>
          <ExportButtons name="Business expenses" period={`${range.from} to ${range.to}`} sheets={() => [{ name: 'Expenses', rows: [['Date', 'Category', 'Description', 'Vendor', 'Method', 'Amount (Rs)'], ...rows.map((x) => [x.date, x.category, x.description, x.vendor, x.method, rs(x.amount)])] }, { name: 'By category', rows: [['Category', 'Amount (Rs)'], ...byCat.map(([c, v]) => [c, rs(v)])] }]} />
        </>}
        card={(x) => <div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="truncate font-medium">{x.description || x.category}</div><div className="text-xs text-muted">{x.date} · {x.category}</div></div><b className="text-danger"><Money v={x.amount} /></b></div>} />
      {editing && <ExpenseForm item={editing === 'new' ? null : editing} cats={cats} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ExpenseForm({ item, cats, onClose }: { item: GxExpense | null; cats: string[]; onClose: () => void }) {
  const { tz } = useGx()
  const [f, setF] = useState({ category: item?.category ?? cats[0] ?? 'Miscellaneous', description: item?.description ?? '', amount: item?.amount ?? null as number | null, date: item?.date ?? nowLocal(tz).date, method: item?.method ?? 'cash' as PaymentMethod, vendor: item?.vendor ?? '', notes: item?.notes ?? '', attachmentIds: item?.attachmentIds ?? [] })
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const save = async () => {
    if (!f.category.trim()) return setErr('Category is required.')
    if (f.amount == null || f.amount <= 0) return setErr('Enter an amount greater than 0.')
    if (!f.date) return setErr('Date is required.')
    const ok = await safeWrite(() => saveRecord(gxExpenseRepo, 'expense', item?.id ?? null, { ...f, category: f.category.trim(), amount: f.amount! }, `${f.category} ${pkr(f.amount!)}`), 'Saved')
    if (ok) onClose()
  }
  return (
    <Modal open onClose={onClose} title={item ? 'Edit expense' : 'Add expense'} wide footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Category" htmlFor="ex-c"><Input id="ex-c" list="ex-cats" value={f.category} onChange={(e) => set('category', e.target.value)} /><datalist id="ex-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Amount" htmlFor="ex-a"><MoneyInput id="ex-a" value={f.amount} onChange={(v) => set('amount', v)} /></Field>
        <Field label="Date" htmlFor="ex-d"><Input id="ex-d" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Description" htmlFor="ex-desc" className="sm:col-span-2"><Input id="ex-desc" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Method" htmlFor="ex-m"><Select id="ex-m" value={f.method} onChange={(e) => set('method', e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
        <Field label="Vendor / paid to" htmlFor="ex-v"><Input id="ex-v" value={f.vendor} onChange={(e) => set('vendor', e.target.value)} /></Field>
        <Field label="Notes" htmlFor="ex-n" className="sm:col-span-2"><Textarea id="ex-n" className="min-h-[44px]" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
      <div className="mt-3"><AttachmentField label="Receipt" ids={f.attachmentIds} onChange={(ids) => set('attachmentIds', ids)} tag="expense-receipt" /></div>
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
    </Modal>
  )
}
