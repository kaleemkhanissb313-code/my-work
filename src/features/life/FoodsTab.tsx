import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays } from 'date-fns'
import { Coffee, Cookie, Moon, Pencil, Plus, Search, Sun, Trash2, UtensilsCrossed } from 'lucide-react'
import { db } from '@/lib/db'
import { recordsRepo } from '@/services/repo'
import { confirm, safeWrite, toast } from '@/components/feedback'
import { Badge, Button, EmptyState, Field, IconButton, Input, Modal, Select, Spinner, Textarea } from '@/components/ui'
import { fmtDate, parseDate, toISODate, todayISO } from '@/lib/dates'
import { time12 } from '@/lib/time12'
import { cn } from '@/lib/cn'
import { isLive } from '@/features/home/actions'
import { filterFoods, groupByDay, MEALS, toFood, toRecordPatch, validateFood, type FoodEntry, type Meal } from './foods'

const MEAL_ICON: Record<Meal, typeof Sun> = { Breakfast: Coffee, Lunch: Sun, Dinner: Moon, Snack: Cookie }
const MEAL_TONE: Record<Meal, string> = { Breakfast: 'text-amber-500', Lunch: 'text-orange-500', Dinner: 'text-indigo-400', Snack: 'text-pink-500' }
type Range = '7' | '30' | '90' | 'all'
const rangeFrom = (r: Range) => (r === 'all' ? null : toISODate(addDays(parseDate(todayISO()), -(Number(r) - 1))))
const timeLabel = (hhmm: string) => (hhmm ? time12(new Date(`2000-01-01T${hhmm}:00`)) : '')
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const guessMeal = (): Meal => { const h = new Date().getHours(); return h < 11 ? 'Breakfast' : h < 16 ? 'Lunch' : h < 22 ? 'Dinner' : 'Snack' }

export function FoodsTab() {
  const rows = useLiveQuery(() => db.records.where('collection').equals('foods').filter(isLive).toArray(), [])
  const [q, setQ] = useState('')
  const [meal, setMeal] = useState<Meal | ''>('')
  const [range, setRange] = useState<Range>('30')
  const [editing, setEditing] = useState<FoodEntry | 'new' | null>(null)
  const foods = useMemo(() => (rows ?? []).map(toFood), [rows])
  const shown = useMemo(() => filterFoods(foods, q, meal, rangeFrom(range)), [foods, q, meal, range])
  const days = useMemo(() => groupByDay(shown), [shown])
  const today = todayISO()
  const todayTotal = groupByDay(foods.filter((f) => f.date === today))[0]?.total ?? null

  const remove = async (f: FoodEntry) => {
    if (!(await confirm({ title: `Delete “${f.name}”?`, body: 'The entry moves to Trash, where you can restore it.', danger: true, confirmLabel: 'Delete' }))) return
    if (await safeWrite(() => recordsRepo.trash(f.id).then(() => true))) toast('Moved to Trash', 'success', { label: 'Undo', run: () => void recordsRepo.restore(f.id) })
  }

  if (!rows) return <Spinner label="Loading foods" />
  return (
    <section aria-label="Foods" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">Today: <b className="text-fg">{foods.filter((f) => f.date === today).length}</b> {foods.filter((f) => f.date === today).length === 1 ? 'entry' : 'entries'}{todayTotal != null && <> · <b className="text-fg">{todayTotal.toLocaleString()}</b> kcal</>}</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add food</Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative col-span-2 sm:col-span-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search foods" placeholder="Search food or notes…" className="ps-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Meal type" value={meal} onChange={(e) => setMeal(e.target.value as Meal | '')}><option value="">All meals</option>{MEALS.map((m) => <option key={m} value={m}>{m}</option>)}</Select>
        <Select aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value as Range)}>
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option>
        </Select>
      </div>

      {!foods.length ? (
        <EmptyState icon={UtensilsCrossed} title="No foods logged yet" action={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>Add your first meal</Button>}>
          Keep a private log of what you eat — meal, time and optional calories. Only you can see it.
        </EmptyState>
      ) : !days.length ? (
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">No entries match these filters.</p>
      ) : (
        <ol className="space-y-3">
          {days.map((d) => (
            <li key={d.date} className="card p-0">
              <div className="flex items-center justify-between gap-2 border-b border-line/60 px-4 py-2.5">
                <h3 className="text-sm">{d.date === today ? 'Today' : fmtDate(d.date)}</h3>
                {d.total != null && <Badge tone="accent">{d.total.toLocaleString()} kcal</Badge>}
              </div>
              <div className="divide-y divide-line/50">
                {d.meals.map((m) => {
                  const Icon = MEAL_ICON[m.meal]
                  return (
                    <div key={m.meal} className="px-4 py-2.5">
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Icon className={cn('h-4 w-4', MEAL_TONE[m.meal])} aria-hidden />{m.meal}</div>
                      <ul className="space-y-1">
                        {m.items.map((f) => (
                          <li key={f.id} className="group flex min-h-[44px] items-center gap-2 rounded-xl px-1 hover:bg-raised/60">
                            <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setEditing(f)}>
                              <span className="block truncate font-medium">{f.name}</span>
                              {(f.time || f.notes) && <span className="block truncate text-xs text-muted">{timeLabel(f.time)}{f.time && f.notes ? ' · ' : ''}{f.notes}</span>}
                            </button>
                            {f.calories != null && <span className="shrink-0 text-sm tabular-nums text-muted">{f.calories.toLocaleString()} kcal</span>}
                            <IconButton icon={Pencil} label={`Edit ${f.name}`} onClick={() => setEditing(f)} />
                            <IconButton icon={Trash2} label={`Delete ${f.name}`} onClick={() => void remove(f)} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </li>
          ))}
        </ol>
      )}
      {editing && <FoodForm food={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

function FoodForm({ food, onClose }: { food: FoodEntry | null; onClose: () => void }) {
  const [f, setF] = useState<Omit<FoodEntry, 'id'>>(food ?? { name: '', meal: guessMeal(), date: todayISO(), time: nowHHMM(), calories: null, notes: '' })
  const [cal, setCal] = useState(food?.calories != null ? String(food.calories) : '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const entry = { ...f, calories: cal.trim() === '' ? null : Number(cal) }
    const e = validateFood(entry)
    if (e) return setErr(e)
    setBusy(true)
    const ok = await safeWrite(() => (food ? recordsRepo.update(food.id, toRecordPatch(entry)) : recordsRepo.create(toRecordPatch(entry))).then(() => true), food ? 'Saved' : 'Food added')
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Modal open onClose={onClose} title={food ? 'Edit food' : 'Add food'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => void save()}>Save</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save() }} noValidate>
        <Field label="Food" htmlFor="fd-n" className="sm:col-span-2"><Input id="fd-n" value={f.name} maxLength={120} autoFocus onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Chicken biryani" /></Field>
        <Field label="Meal" htmlFor="fd-m">
          <div id="fd-m" role="radiogroup" aria-label="Meal" className="grid grid-cols-4 gap-1">
            {MEALS.map((m) => { const Icon = MEAL_ICON[m]; return (
              <button key={m} type="button" role="radio" aria-checked={f.meal === m} onClick={() => setF({ ...f, meal: m })}
                className={cn('flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-0.5 text-[11px]', f.meal === m ? 'border-accent bg-accent/10 font-semibold' : 'border-line')}>
                <Icon className={cn('h-4 w-4', MEAL_TONE[m])} aria-hidden /><span className="tile-label">{m}</span>
              </button>
            ) })}
          </div>
        </Field>
        <Field label="Calories (optional)" htmlFor="fd-c"><Input id="fd-c" type="number" inputMode="numeric" min={0} max={20000} value={cal} onChange={(e) => setCal(e.target.value)} placeholder="kcal" /></Field>
        <Field label="Date" htmlFor="fd-d"><Input id="fd-d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Time" htmlFor="fd-t" hint={f.time ? timeLabel(f.time) : undefined}><Input id="fd-t" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
        <Field label="Notes" htmlFor="fd-x" className="sm:col-span-2"><Textarea id="fd-x" className="min-h-[60px]" value={f.notes} maxLength={1000} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Portion, where, how you felt…" /></Field>
        {err && <p className="text-sm text-danger sm:col-span-2" role="alert">{err}</p>}
      </form>
    </Modal>
  )
}
