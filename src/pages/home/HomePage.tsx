import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, endOfMonth, startOfMonth } from 'date-fns'
import {
  AlertTriangle, Brush, CalendarHeart, CheckSquare, DoorOpen, FileText, Home, LayoutDashboard, Package, Phone, Plus, Receipt,
  Share2, ShoppingCart, Trash2, Users, Wrench,
} from 'lucide-react'
import { db } from '@/lib/db'
import { docsRepo, recordsRepo, visible } from '@/services/repo'
import { useSettings } from '@/services/settings'
import { confirm, safeWrite, toast } from '@/components/feedback'
import { Badge, Button, Card, CardTitle, EmptyState, Input, PageHeader, Select, Spinner, Tabs } from '@/components/ui'
import { RecordManager } from '@/features/records/RecordManager'
import { expandOccurrences, fmtDate, parseDate, toISODate, todayISO } from '@/lib/dates'
import { money } from '@/lib/format'
import { cn } from '@/lib/cn'
import { isLive, telHref, toggleRecordDone, toggleTaskDone, useTabRoute } from '@/features/home/actions'
import type { CollectionKey, RecordItem } from '@/types/models'

const TAB_IDS = ['overview', 'chores', 'groceries', 'maintenance', 'bills', 'inventory', 'contacts', 'documents'] as const
type TabId = (typeof TAB_IDS)[number]
const TABS: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'chores', label: 'Chores', icon: Brush },
  { id: 'groceries', label: 'Groceries', icon: ShoppingCart },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  { id: 'bills', label: 'Bills', icon: Receipt },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'documents', label: 'Documents', icon: FileText },
]

export function HomePage() {
  const [tab, setTab] = useTabRoute<TabId>('/home', TAB_IDS)
  return (
    <div>
      <PageHeader title="Home" description="Chores, groceries, maintenance, bills and everything about your household." icon={Home} tone="text-home" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Home sections" />
      {tab === 'overview' && <HomeOverview />}
      {tab === 'chores' && <RecordManager collection="chores" areas={['home']} />}
      {tab === 'groceries' && <GroceriesTab />}
      {tab === 'maintenance' && <RecordManager collection="maintenance" areas={['home']} />}
      {tab === 'bills' && <RecordManager collection="bills" areas={['home']} />}
      {tab === 'inventory' && <RecordManager collection="inventory" areas={['home']} />}
      {tab === 'contacts' && <RecordManager collection="contacts" areas={['home', 'personal', 'life']} />}
      {tab === 'documents' && <HomeDocuments />}
    </div>
  )
}

/* ---------------- Overview ---------------- */

const HOME_COLLECTIONS: CollectionKey[] = ['chores', 'groceries', 'maintenance', 'bills', 'inventory', 'contacts', 'importantDates']

function HomeOverview() {
  const settings = useSettings()
  const records = useLiveQuery(() => db.records.where('collection').anyOf(HOME_COLLECTIONS).filter(isLive).toArray(), [])
  const tasks = useLiveQuery(() => db.tasks.where('area').equals('home').filter((t) => !t.deletedAt && !t.archived && t.status !== 'completed').toArray(), [])
  const [grocery, setGrocery] = useState('')

  const today = todayISO()
  const data = useMemo(() => {
    if (!records) return null
    const by = (c: CollectionKey) => records.filter((r) => r.collection === c)
    const plus = (n: number) => toISODate(addDays(parseDate(today), n))
    const sortDue = (a: RecordItem, b: RecordItem) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
    const chores = by('chores').filter((r) => !r.done && r.dueDate && r.dueDate <= today).sort(sortDue)
    const maintenance = by('maintenance').filter((r) => !r.done && r.dueDate && r.dueDate <= plus(30)).sort(sortDue)
    const bills = by('bills').filter((r) => r.area === 'home' && !r.done && r.dueDate && r.dueDate <= plus(14)).sort(sortDue)
    const groceries = by('groceries').filter((r) => !r.done)
    const warranties = by('inventory').filter((r) => r.dueDate && r.dueDate >= today && r.dueDate <= plus(60)).sort(sortDue)
    const emergency = by('contacts').filter((r) => r.category === 'Emergency')
    const ms = toISODate(startOfMonth(parseDate(today))), me = toISODate(endOfMonth(parseDate(today)))
    const dates = by('importantDates').filter((r) => r.dueDate)
      .flatMap((r) => expandOccurrences(r.dueDate!, r.recurrence, ms, me, 5).map((date) => ({ r, date })))
      .sort((a, b) => a.date.localeCompare(b.date))
    const rooms = new Map<string, RecordItem[]>()
    for (const r of [...by('chores').filter((x) => !x.done), ...by('maintenance').filter((x) => !x.done), ...by('inventory')]) {
      const room = String(r.fields.room ?? '').trim()
      if (!room) continue
      rooms.set(room, [...(rooms.get(room) ?? []), r])
    }
    return { chores, maintenance, bills, billTotal: bills.reduce((s, b) => s + (b.amount ?? 0), 0), groceries, warranties, emergency, dates, rooms: [...rooms].sort((a, b) => a[0].localeCompare(b[0])) }
  }, [records, today])

  if (!data || !tasks) return <Spinner />
  const homeTasks = tasks.filter((t) => t.dueDate && t.dueDate <= today).sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))

  const addGrocery = async (e: React.FormEvent) => {
    e.preventDefault()
    const title = grocery.trim()
    if (!title) return
    const ok = await safeWrite(() => recordsRepo.create({ collection: 'groceries', area: 'home', title }), `Added “${title}” to groceries`)
    if (ok) setGrocery('')
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardTitle icon={Brush} tone="text-home" action={<Link className="text-xs text-accent hover:underline" to="/home/chores">All chores</Link>}>Today's chores</CardTitle>
        {data.chores.length === 0 ? <p className="text-sm text-muted">No chores due today. 🎉</p> : (
          <ul className="space-y-1.5">
            {data.chores.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={false} aria-label={`Mark “${r.title}” done`} onChange={() => void toggleRecordDone(r)} />
                <Link to={`/home/chores?open=${r.id}`} className="min-w-0 flex-1 truncate hover:underline">{r.title}</Link>
                {r.dueDate! < today && <Badge tone="danger">overdue</Badge>}
                {r.fields.room ? <span className="text-xs text-muted">{String(r.fields.room)}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon={CheckSquare} tone="text-home" action={<Link className="text-xs text-accent hover:underline" to="/tasks">All tasks</Link>}>Home tasks due today</CardTitle>
        {homeTasks.length === 0 ? <p className="text-sm text-muted">No home tasks due today.</p> : (
          <ul className="space-y-1.5">
            {homeTasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={false} aria-label={`Complete task “${t.title}”`} onChange={() => void toggleTaskDone(t)} />
                <Link to={`/tasks?open=${t.id}`} className="min-w-0 flex-1 truncate hover:underline">{t.title}</Link>
                {t.dueDate! < today && <Badge tone="danger">overdue</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon={Receipt} tone="text-home" action={<Link className="text-xs text-accent hover:underline" to="/home/bills">All bills</Link>}>Bills due in 14 days</CardTitle>
        {data.bills.length === 0 ? <p className="text-sm text-muted">No unpaid home bills due in the next two weeks.</p> : (
          <>
            <ul className="space-y-1.5">
              {data.bills.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={false} aria-label={`Mark bill “${r.title}” paid`} onChange={() => void toggleRecordDone(r)} />
                  <Link to={`/home/bills?open=${r.id}`} className="min-w-0 flex-1 truncate hover:underline">{r.title}</Link>
                  <span className={cn('text-xs', r.dueDate! < today ? 'font-semibold text-danger' : 'text-muted')}>{fmtDate(r.dueDate, 'MMM d')}</span>
                  <span className="tabular-nums">{money(r.amount, settings.currency)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line pt-2 text-end text-sm">Total due: <span className="font-semibold">{money(data.billTotal, settings.currency)}</span></p>
          </>
        )}
      </Card>

      <Card>
        <CardTitle icon={ShoppingCart} tone="text-home" action={<Link className="text-xs text-accent hover:underline" to="/home/groceries">Open list</Link>}>Groceries</CardTitle>
        <p className="mb-3 text-sm"><span className="text-2xl font-bold tabular-nums">{data.groceries.length}</span> <span className="text-muted">item{data.groceries.length === 1 ? '' : 's'} still to buy</span></p>
        <form className="flex gap-2" onSubmit={addGrocery}>
          <Input aria-label="Quick-add grocery item" placeholder="Add an item…" value={grocery} onChange={(e) => setGrocery(e.target.value)} maxLength={200} />
          <Button type="submit" variant="primary" icon={Plus} disabled={!grocery.trim()}>Add</Button>
        </form>
      </Card>

      <Card>
        <CardTitle icon={Wrench} tone="text-home" action={<Link className="text-xs text-accent hover:underline" to="/home/maintenance">All</Link>}>Maintenance — next 30 days</CardTitle>
        {data.maintenance.length === 0 ? <p className="text-sm text-muted">Nothing scheduled in the next 30 days.</p> : (
          <ul className="space-y-1.5">
            {data.maintenance.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={false} aria-label={`Mark “${r.title}” done`} onChange={() => void toggleRecordDone(r)} />
                <Link to={`/home/maintenance?open=${r.id}`} className="min-w-0 flex-1 truncate hover:underline">{r.title}</Link>
                <span className={cn('text-xs', r.dueDate! < today ? 'font-semibold text-danger' : 'text-muted')}>{fmtDate(r.dueDate, 'MMM d')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon={AlertTriangle} tone="text-home" action={<Link className="text-xs text-accent hover:underline" to="/home/inventory">Inventory</Link>}>Warranties expiring (60 days)</CardTitle>
        {data.warranties.length === 0 ? <p className="text-sm text-muted">No warranties expire in the next 60 days.</p> : (
          <ul className="space-y-1.5">
            {data.warranties.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <Link to={`/home/inventory?open=${r.id}`} className="min-w-0 flex-1 truncate hover:underline">{r.title}</Link>
                <span className="text-xs text-warn">{fmtDate(r.dueDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon={Phone} tone="text-home" action={<Link className="text-xs text-accent hover:underline" to="/home/contacts">Contacts</Link>}>Emergency contacts</CardTitle>
        {data.emergency.length === 0 ? <p className="text-sm text-muted">Add contacts with the category “Emergency” to see them here.</p> : (
          <ul className="space-y-1.5">
            {data.emergency.map((r) => {
              const phone = String(r.fields.phone ?? '').trim()
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{r.title}{r.fields.company ? <span className="text-muted"> · {String(r.fields.company)}</span> : null}</span>
                  {phone ? <a href={telHref(phone)} className="btn btn-soft h-8 shrink-0 px-3 text-xs" aria-label={`Call ${r.title} at ${phone}`}><Phone className="h-3.5 w-3.5" aria-hidden />{phone}</a>
                    : <span className="text-xs text-muted">No phone</span>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon={CalendarHeart} tone="text-home" action={<Link className="text-xs text-accent hover:underline" to="/life/dates">All dates</Link>}>Family & important dates this month</CardTitle>
        {data.dates.length === 0 ? <p className="text-sm text-muted">No birthdays or important dates this month.</p> : (
          <ul className="space-y-1.5">
            {data.dates.map(({ r, date }) => (
              <li key={r.id + date} className={cn('flex items-center justify-between gap-2 text-sm', date < today && 'text-muted')}>
                <span className="min-w-0 truncate">{r.title}{r.fields.person ? ` · ${String(r.fields.person)}` : ''}</span>
                <span className={cn('text-xs', date === today ? 'font-semibold text-home' : 'text-muted')}>{date === today ? 'Today' : fmtDate(date, 'EEE, MMM d')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="md:col-span-2 xl:col-span-3">
        <CardTitle icon={DoorOpen} tone="text-home">Rooms</CardTitle>
        {data.rooms.length === 0 ? (
          <p className="text-sm text-muted">Set a “Room” on chores, maintenance items or inventory to see them grouped here.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.rooms.map(([room, items]) => (
              <div key={room} className="rounded-xl border border-line p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="truncate font-medium">{room}</h3>
                  <span className="text-xs text-muted">{items.length} item{items.length === 1 ? '' : 's'}</span>
                </div>
                <ul className="space-y-1 text-sm">
                  {items.slice(0, 8).map((r) => (
                    <li key={r.id} className="flex items-center gap-2">
                      <Badge className="shrink-0">{r.collection === 'chores' ? 'Chore' : r.collection === 'maintenance' ? 'Maint.' : 'Item'}</Badge>
                      <Link to={`/home/${r.collection}?open=${r.id}`} className="min-w-0 flex-1 truncate hover:underline">{r.title}</Link>
                      {r.collection !== 'inventory' && r.dueDate && <span className={cn('text-xs', r.dueDate < today ? 'text-danger' : 'text-muted')}>{fmtDate(r.dueDate, 'MMM d')}</span>}
                    </li>
                  ))}
                  {items.length > 8 && <li className="text-xs text-muted">+{items.length - 8} more</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ---------------- Groceries ---------------- */

const UNSORTED = '__unsorted__'

function GroceriesTab() {
  const items = useLiveQuery(() => db.records.where('collection').equals('groceries').filter((r) => isLive(r) && r.area === 'home').toArray(), [])
  const [sel, setSel] = useState('') // '' = all lists, UNSORTED = items without a list
  const [newList, setNewList] = useState('')
  const [extraLists, setExtraLists] = useState<string[]>([])
  const [quick, setQuick] = useState('')

  const listOf = (r: RecordItem) => String(r.fields.list ?? '').trim()
  const lists = useMemo(() => {
    const m = new Map<string, { open: number; total: number }>()
    for (const r of items ?? []) {
      const k = listOf(r) || UNSORTED
      const c = m.get(k) ?? { open: 0, total: 0 }
      c.total++
      if (!r.done) c.open++
      m.set(k, c)
    }
    for (const l of extraLists) if (!m.has(l)) m.set(l, { open: 0, total: 0 })
    return [...m].sort((a, b) => (a[0] === UNSORTED ? 1 : b[0] === UNSORTED ? -1 : a[0].localeCompare(b[0])))
  }, [items, extraLists])

  const inSel = (r: RecordItem) => !sel || (sel === UNSORTED ? !listOf(r) : listOf(r) === sel)
  const checked = (items ?? []).filter((r) => r.done && inSel(r))
  const listName = sel && sel !== UNSORTED ? sel : ''

  const createList = (e: React.FormEvent) => {
    e.preventDefault()
    const name = newList.trim().slice(0, 60)
    if (!name) return
    setExtraLists((l) => (l.includes(name) ? l : [...l, name]))
    setSel(name)
    setNewList('')
    toast(`List “${name}” ready — add items to save it`, 'info')
  }

  const quickAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const title = quick.trim()
    if (!title) return
    const ok = await safeWrite(() => recordsRepo.create({ collection: 'groceries', area: 'home', title, fields: listName ? { list: listName } : {} }))
    if (ok) setQuick('')
  }

  const clearChecked = async () => {
    if (!checked.length) return
    const ok = await confirm({
      title: 'Clear checked items?',
      body: `${checked.length} checked item${checked.length === 1 ? '' : 's'}${listName ? ` in “${listName}”` : ''} will be moved to Trash. You can restore them from Trash.`,
      confirmLabel: 'Move to trash', danger: true,
    })
    if (!ok) return
    const ids = checked.map((r) => r.id)
    const done = await safeWrite(() => db.transaction('rw', db.records, () => Promise.all(ids.map((id) => recordsRepo.trash(id)))))
    if (done) toast(`Cleared ${ids.length} item${ids.length === 1 ? '' : 's'}`, 'success', { label: 'Undo', run: () => void safeWrite(() => Promise.all(ids.map((id) => recordsRepo.restore(id)))) })
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <label htmlFor="grocery-list" className="label">Shopping list</label>
            <Select id="grocery-list" value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">All lists</option>
              {lists.map(([name, c]) => <option key={name} value={name}>{name === UNSORTED ? 'No list' : name} ({c.open} open / {c.total})</option>)}
            </Select>
          </div>
          <form className="flex min-w-[220px] flex-1 items-end gap-2" onSubmit={createList}>
            <div className="flex-1">
              <label htmlFor="grocery-new-list" className="label">New list</label>
              <Input id="grocery-new-list" placeholder="e.g. Weekly groceries" value={newList} onChange={(e) => setNewList(e.target.value)} maxLength={60} />
            </div>
            <Button type="submit" icon={Plus} disabled={!newList.trim()}>Create</Button>
          </form>
          <Button variant="danger" icon={Trash2} onClick={() => void clearChecked()} disabled={!checked.length}>Clear checked ({checked.length})</Button>
        </div>
        {lists.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Lists">
            {lists.map(([name, c]) => (
              <button key={name} type="button" onClick={() => setSel(sel === name ? '' : name)} aria-pressed={sel === name}
                className={cn('chip', sel === name ? 'border-home/50 bg-home/10 text-home' : 'border-line text-muted hover:text-fg')}>
                {name === UNSORTED ? 'No list' : name} · {c.open}
              </button>
            ))}
          </div>
        )}
        <form className="mt-3 flex gap-2" onSubmit={quickAdd}>
          <Input aria-label={`Quick-add item${listName ? ` to ${listName}` : ''}`} placeholder={`Quick add to ${listName || 'groceries'}…`} value={quick} onChange={(e) => setQuick(e.target.value)} maxLength={200} />
          <Button type="submit" variant="primary" icon={Plus} disabled={!quick.trim()}>Add</Button>
        </form>
      </Card>

      {!items ? <Spinner /> : (
        <RecordManager key={sel} collection="groceries" areas={['home']} filter={inSel}
          title={sel ? (sel === UNSORTED ? 'Items without a list' : sel) : 'All grocery & shopping items'}
          defaults={listName ? { fields: { list: listName } } : undefined} />
      )}

      <Card className="border-dashed">
        <CardTitle icon={Share2} tone="text-home">Shared household lists</CardTitle>
        <p className="text-sm text-muted">
          Sharing a list with family members needs cloud accounts and list sharing, which are not available yet. Your lists are stored on this device
          (and in your own cloud backup if sync is enabled).
        </p>
        <div className="mt-3">
          <Button icon={Share2} disabled title="Shared lists require cloud accounts and sharing, which are not available yet">Share list</Button>
        </div>
      </Card>
    </div>
  )
}

/* ---------------- Documents ---------------- */

function HomeDocuments() {
  const navigate = useNavigate()
  const docs = useLiveQuery(() => db.docs.where('area').equals('home').filter(visible()).toArray(), [])
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    const d = await safeWrite(() => docsRepo.create({ area: 'home', title: 'Untitled home document' }))
    setBusy(false)
    if (d) navigate(`/documents/${d.id}`)
  }
  const sorted = (docs ?? []).sort((a, b) => b.updatedAt - a.updatedAt)
  return (
    <section aria-label="Home documents">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="me-auto text-base font-semibold">Home documents</h2>
        <Button variant="primary" icon={Plus} loading={busy} onClick={() => void create()}>New home document</Button>
      </div>
      {!docs ? <Spinner /> : sorted.length === 0 ? (
        <EmptyState icon={FileText} title="No home documents yet" action={<Button variant="primary" icon={Plus} loading={busy} onClick={() => void create()}>New home document</Button>}>
          Keep manuals, house rules, recipes or moving checklists here. Documents with the Home area appear in this list.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {sorted.map((d) => (
            <li key={d.id}>
              <Link to={`/${d.kind === 'note' ? 'notes' : 'documents'}/${d.id}`} className="card card-hover flex items-center gap-3 p-3">
                <FileText className="h-5 w-5 shrink-0 text-home" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{d.title || 'Untitled'}</div>
                  <div className="text-xs text-muted">Updated {fmtDate(new Date(d.updatedAt).toISOString(), 'MMM d, yyyy HH:mm')}</div>
                </div>
                {d.kind === 'note' && <Badge>Note</Badge>}
                {d.isTemplate && <Badge tone="accent">Template</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
