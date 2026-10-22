import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, endOfWeek, startOfWeek } from 'date-fns'
import {
  BookOpen, CalendarHeart, CheckCircle2, Dumbbell, Flame, Heart, LayoutDashboard, Lock, Luggage, NotebookPen, Plane, Plus,
  Repeat, Save, Sparkles, Star, Target, Trophy, UtensilsCrossed,
} from 'lucide-react'
import { FoodsTab } from '@/features/life/FoodsTab'
import { MEALS, toFood } from '@/features/life/foods'
import { db } from '@/lib/db'
import { recordsRepo } from '@/services/repo'
import { useSettings } from '@/services/settings'
import { safeWrite, toast } from '@/components/feedback'
import { Badge, Button, Card, CardTitle, EmptyState, Field, PageHeader, Progress, Spinner, Tabs, Textarea } from '@/components/ui'
import { RecordManager } from '@/features/records/RecordManager'
import { daysBetween, expandOccurrences, fmtDate, parseDate, toISODate, todayISO } from '@/lib/dates'
import { cn } from '@/lib/cn'
import { isLive, useTabRoute } from '@/features/home/actions'
import { bestStreak, completionRate, currentStreak, doneDatesFor, heatmapWeeks, lastNDays } from '@/features/life/habits'
import { setHabitDone } from '@/features/life/habitLogs'
import type { CollectionKey, HabitLog, RecordItem } from '@/types/models'

const TAB_IDS = ['overview', 'goals', 'habits', 'journal', 'reading', 'travel', 'packing', 'fitness', 'foods', 'reviews', 'dates'] as const
type TabId = (typeof TAB_IDS)[number]
const TABS: { id: TabId; label: string; icon: typeof Heart }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'habits', label: 'Habits', icon: Repeat },
  { id: 'journal', label: 'Journal', icon: NotebookPen },
  { id: 'reading', label: 'Reading', icon: BookOpen },
  { id: 'travel', label: 'Travel', icon: Plane },
  { id: 'packing', label: 'Packing', icon: Luggage },
  { id: 'fitness', label: 'Fitness', icon: Dumbbell },
  { id: 'foods', label: 'Foods', icon: UtensilsCrossed },
  { id: 'reviews', label: 'Reviews', icon: Sparkles },
  { id: 'dates', label: 'Dates', icon: CalendarHeart },
]

export function LifePage() {
  const [tab, setTab] = useTabRoute<TabId>('/life', TAB_IDS)
  return (
    <div>
      <PageHeader title="Life" description="Goals, habits, journal, reading, travel, fitness, foods and the dates that matter." icon={Heart} tone="text-life" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Life sections" />
      {tab === 'overview' && <LifeOverview />}
      {tab === 'goals' && <RecordManager collection="goals" areas={['life', 'personal']} />}
      {tab === 'habits' && <HabitsTab />}
      {tab === 'journal' && <JournalTab />}
      {tab === 'reading' && <RecordManager collection="reading" areas={['life', 'personal', 'work']} />}
      {tab === 'travel' && <RecordManager collection="trips" areas={['life', 'personal', 'work']} />}
      {tab === 'packing' && <PackingTab />}
      {tab === 'fitness' && <RecordManager collection="fitness" areas={['life', 'personal']} />}
      {tab === 'foods' && <FoodsTab />}
      {tab === 'reviews' && <ReviewsTab />}
      {tab === 'dates' && <RecordManager collection="importantDates" defaults={{ recurrence: { freq: 'yearly', interval: 1 } }} />}
    </div>
  )
}

const useLogs = () => useLiveQuery(() => db.habitLogs.filter((l) => !l.deletedAt).toArray(), [])
const useHabits = () => useLiveQuery(() => db.records.where('collection').equals('habits').filter(isLive).toArray(), [])

async function toggleHabit(habitId: string, date: string, done: boolean) {
  await safeWrite(() => setHabitDone(habitId, date, done))
}

/* ---------------- Overview ---------------- */

const OVERVIEW_COLLECTIONS: CollectionKey[] = ['goals', 'importantDates', 'journal', 'reading', 'fitness', 'trips', 'foods']

function LifeOverview() {
  const settings = useSettings()
  const habits = useHabits()
  const logs = useLogs()
  const records = useLiveQuery(() => db.records.where('collection').anyOf(OVERVIEW_COLLECTIONS).filter(isLive).toArray(), [])
  const [reveal, setReveal] = useState(false)
  const today = todayISO()

  const data = useMemo(() => {
    if (!records) return null
    const by = (c: CollectionKey) => records.filter((r) => r.collection === c)
    const in30 = toISODate(addDays(parseDate(today), 30))
    const goals = by('goals').filter((r) => !r.done && r.area !== 'work')
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    const dates = by('importantDates').filter((r) => r.dueDate)
      .flatMap((r) => expandOccurrences(r.dueDate!, r.recurrence, today, in30, 3).map((date) => ({ r, date })))
      .sort((a, b) => a.date.localeCompare(b.date))
    const journal = by('journal').sort((a, b) => (b.dueDate ?? '').localeCompare(a.dueDate ?? '') || b.createdAt - a.createdAt)[0]
    const reading = by('reading').filter((r) => !r.done && r.fields.status === 'In progress')
    const ws = toISODate(startOfWeek(parseDate(today), { weekStartsOn: settings.weekStartsOn }))
    const we = toISODate(endOfWeek(parseDate(today), { weekStartsOn: settings.weekStartsOn }))
    const fitness = by('fitness').filter((r) => r.dueDate && r.dueDate >= ws && r.dueDate <= we)
    const fitnessMins = fitness.reduce((s, r) => s + (Number(r.fields.minutes) || 0), 0)
    const trips = by('trips').filter((r) => !r.done && r.dueDate)
    const current = trips.find((r) => r.dueDate! <= today && String(r.fields.returnDate ?? '') >= today)
    const next = trips.filter((r) => r.dueDate! > today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0]
    const foods = by('foods').map(toFood).filter((f) => f.date === today).sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) || a.time.localeCompare(b.time))
    const foodCals = foods.reduce((t, f) => t + (f.calories ?? 0), 0)
    return { goals, dates, journal, reading, fitness, fitnessMins, current, next, foods, foodCals }
  }, [records, today, settings.weekStartsOn])

  if (!data || !habits || !logs) return <Spinner />
  const doneToday = new Set(logs.filter((l) => l.date === today && l.done).map((l) => l.habitId))
  const hide = settings.lock.hideSensitive && !reveal
  const entry = data.journal ? String(data.journal.fields.entry ?? '') : ''

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardTitle icon={Repeat} tone="text-life" action={<Link className="text-xs text-accent hover:underline" to="/life/habits">Habits</Link>}>Today's habits</CardTitle>
        {habits.length === 0 ? <p className="text-sm text-muted">No habits yet. <Link className="text-accent hover:underline" to="/life/habits">Create one</Link>.</p> : (
          <>
            <p className="mb-2 text-xs text-muted">{doneToday.size} of {habits.length} done today</p>
            <ul className="space-y-1.5">
              {habits.map((h) => (
                <li key={h.id}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={doneToday.has(h.id)} onChange={(e) => void toggleHabit(h.id, today, e.target.checked)} />
                    <span className={cn('truncate', doneToday.has(h.id) && 'text-muted line-through')}>{h.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card>
        <CardTitle icon={Target} tone="text-life" action={<Link className="text-xs text-accent hover:underline" to="/life/goals">Goals</Link>}>Active goals</CardTitle>
        {data.goals.length === 0 ? <p className="text-sm text-muted">No active goals.</p> : (
          <ul className="space-y-3">
            {data.goals.slice(0, 6).map((g) => {
              const pct = Math.max(0, Math.min(100, Number(g.fields.progress) || 0))
              return (
                <li key={g.id}>
                  <Link to={`/life/goals?open=${g.id}`} className="block hover:underline">
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{g.title}</span><span className="shrink-0 text-xs text-muted">{pct}%{g.dueDate ? ` · ${fmtDate(g.dueDate, 'MMM d')}` : ''}</span>
                    </div>
                  </Link>
                  <Progress value={pct} label={`${g.title} progress`} />
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon={CalendarHeart} tone="text-life" action={<Link className="text-xs text-accent hover:underline" to="/life/dates">Dates</Link>}>Birthdays & dates — next 30 days</CardTitle>
        {data.dates.length === 0 ? <p className="text-sm text-muted">Nothing in the next 30 days.</p> : (
          <ul className="space-y-1.5">
            {data.dates.slice(0, 8).map(({ r, date }) => {
              const n = daysBetween(today, date)
              return (
                <li key={r.id + date} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{r.title}{r.fields.person ? <span className="text-muted"> · {String(r.fields.person)}</span> : null}</span>
                  <span className={cn('shrink-0 text-xs', n === 0 ? 'font-semibold text-life' : 'text-muted')}>{n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${fmtDate(date, 'MMM d')} · in ${n}d`}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon={NotebookPen} tone="text-life" action={<Link className="text-xs text-accent hover:underline" to="/life/journal">Journal</Link>}>Latest journal entry</CardTitle>
        {!data.journal ? <p className="text-sm text-muted">No entries yet. <Link className="text-accent hover:underline" to="/life/journal">Write today's entry</Link>.</p> : (
          <div>
            <div className="mb-1 text-sm font-medium">{data.journal.title} <span className="text-xs font-normal text-muted">· {fmtDate(data.journal.dueDate)}</span></div>
            {hide ? (
              <button type="button" onClick={() => setReveal(true)} className="w-full rounded-lg text-start" aria-label="Reveal journal entry (hidden by sensitive-content setting)">
                <p className="select-none text-sm text-muted blur-sm" aria-hidden>{(entry || 'No text').slice(0, 220)}</p>
                <span className="mt-1 block text-xs text-accent">Hidden — click to reveal</span>
              </button>
            ) : <p className="line-clamp-4 whitespace-pre-line text-sm text-muted">{entry.slice(0, 400) || 'No text'}</p>}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle icon={BookOpen} tone="text-life" action={<Link className="text-xs text-accent hover:underline" to="/life/reading">Reading</Link>}>Reading in progress</CardTitle>
        {data.reading.length === 0 ? <p className="text-sm text-muted">Nothing in progress. Set an item's status to “In progress”.</p> : (
          <ul className="space-y-1.5">
            {data.reading.slice(0, 6).map((r) => (
              <li key={r.id} className="text-sm"><Link to={`/life/reading?open=${r.id}`} className="hover:underline">{r.title}</Link>{r.fields.author ? <span className="text-muted"> · {String(r.fields.author)}</span> : null}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle icon={UtensilsCrossed} tone="text-life" action={<Link className="text-xs text-accent hover:underline" to="/life/foods">Foods</Link>}>Today's meals</CardTitle>
        {data.foods.length ? (
          <ul className="space-y-1 text-sm">
            {data.foods.slice(0, 6).map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2"><span className="truncate"><span className="text-muted">{f.meal} · </span>{f.name}</span>{f.calories != null && <span className="shrink-0 tabular-nums text-muted">{f.calories} kcal</span>}</li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Nothing logged yet today.</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{data.foodCals ? `${data.foodCals} kcal today` : ''}</span>
          <Link to="/life/foods" className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"><Plus className="h-3.5 w-3.5" aria-hidden />Add food</Link>
        </div>
      </Card>

      <Card>
        <CardTitle icon={Dumbbell} tone="text-life" action={<Link className="text-xs text-accent hover:underline" to="/life/fitness">Fitness</Link>}>Fitness this week</CardTitle>
        <div className="text-3xl font-bold tabular-nums">{data.fitnessMins}<span className="ms-1 text-base font-normal text-muted">min</span></div>
        <p className="text-sm text-muted">{data.fitness.length} log{data.fitness.length === 1 ? '' : 's'} this week</p>
      </Card>

      <Card>
        <CardTitle icon={Plane} tone="text-life" action={<Link className="text-xs text-accent hover:underline" to="/life/travel">Trips</Link>}>Next trip</CardTitle>
        {data.current ? (
          <p className="text-sm"><span className="font-semibold">{data.current.title}</span> — you're on this trip now (back {fmtDate(String(data.current.fields.returnDate))}).</p>
        ) : data.next ? (
          <div>
            <div className="text-3xl font-bold tabular-nums">{daysBetween(today, data.next.dueDate!)}<span className="ms-1 text-base font-normal text-muted">days</span></div>
            <p className="text-sm text-muted">until <span className="text-fg">{data.next.title}</span> · {fmtDate(data.next.dueDate)}</p>
          </div>
        ) : <p className="text-sm text-muted">No upcoming trips planned.</p>}
      </Card>

      <Card>
        <CardTitle icon={Lock} tone="text-secure">Private notes</CardTitle>
        <p className="mb-3 text-sm text-muted">For very personal notes, use the encrypted Private Vault — entries are encrypted with your passphrase on this device.</p>
        <Link to="/vault" className="btn btn-soft h-10 px-4 text-sm"><Lock className="h-4 w-4" aria-hidden />Open Private Vault</Link>
      </Card>
    </div>
  )
}

/* ---------------- Habits ---------------- */

function HabitsTab() {
  const settings = useSettings()
  const habits = useHabits()
  const logs = useLogs()
  const today = todayISO()

  return (
    <div className="space-y-6">
      {!habits || !logs ? <Spinner /> : habits.length === 0 ? (
        <EmptyState icon={Repeat} title="No habits yet">Create a habit below, then tick it off each day to build streaks.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {habits.map((h) => <HabitCard key={h.id} habit={h} logs={logs} today={today} weekStartsOn={settings.weekStartsOn} />)}
        </div>
      )}
      <RecordManager collection="habits" areas={['life', 'personal', 'work', 'home']} defaultArea="life" title="Manage habits" />
    </div>
  )
}

function HabitCard({ habit, logs, today, weekStartsOn }: { habit: RecordItem; logs: HabitLog[]; today: string; weekStartsOn: 0 | 1 }) {
  const dates = useMemo(() => doneDatesFor(logs, habit.id), [logs, habit.id])
  const done = useMemo(() => new Set(dates), [dates])
  const cur = currentStreak(dates, today)
  const best = bestStreak(dates, today)
  const pct = Math.round(completionRate(dates, today, 30) * 100)
  const week = lastNDays(today, 7)
  const heat = heatmapWeeks(today, 12, weekStartsOn)
  const heatDone = heat.flat().filter((c) => done.has(c.date)).length
  const target = Number(habit.fields.target) || 0
  const thisWeek = week.filter((d) => done.has(d)).length

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{habit.title}</h3>
          <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted">
            {habit.category && <Badge>{habit.category}</Badge>}
            {target > 0 && <span>Target {target}/week · {thisWeek} in last 7 days</span>}
            {habit.fields.cue ? <span>Cue: {String(habit.fields.cue)}</span> : null}
          </div>
        </div>
        <div className="flex gap-3 text-center text-xs">
          <div><div className="flex items-center justify-center gap-1 text-lg font-bold text-warn"><Flame className="h-4 w-4" aria-hidden />{cur}</div><div className="text-muted">streak</div></div>
          <div><div className="flex items-center justify-center gap-1 text-lg font-bold"><Trophy className="h-4 w-4 text-accent" aria-hidden />{best}</div><div className="text-muted">best</div></div>
          <div><div className="text-lg font-bold">{pct}%</div><div className="text-muted">30 days</div></div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-7 gap-1.5" role="group" aria-label={`${habit.title}: last 7 days`}>
        {week.map((d) => {
          const on = done.has(d)
          return (
            <button key={d} type="button" aria-pressed={on} aria-label={`${habit.title} on ${fmtDate(d, 'EEEE, MMM d')}: ${on ? 'done' : 'not done'}`}
              onClick={() => void toggleHabit(habit.id, d, !on)}
              className={cn('flex flex-col items-center rounded-xl border py-1.5 text-xs transition', on ? 'border-life/60 bg-life/15 text-life' : 'border-line text-muted hover:text-fg', d === today && 'ring-1 ring-accent/50')}>
              <span>{fmtDate(d, 'EEEEE')}</span>
              <span className="font-semibold">{fmtDate(d, 'd')}</span>
              {on ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5" aria-hidden /> : <span className="mt-0.5 h-3.5 w-3.5" aria-hidden />}
            </button>
          )
        })}
      </div>

      <div className="overflow-x-auto">
        <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label={`${habit.title}: done on ${heatDone} of the last 12 weeks' days`}>
          {heat.flat().map((c) => (
            <div key={c.date} title={`${fmtDate(c.date)}${done.has(c.date) ? ' — done' : ''}`}
              className={cn('h-3 w-3 rounded-[3px]', c.future ? 'bg-transparent' : done.has(c.date) ? 'bg-life' : 'bg-raised border border-line/60')} />
          ))}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted">Last 12 weeks</p>
    </Card>
  )
}

/* ---------------- Journal ---------------- */

function JournalTab() {
  const today = todayISO()
  const todays = useLiveQuery(() => db.records.where('collection').equals('journal').filter((r) => isLive(r) && r.dueDate === today).toArray(), [today])
  const existing = todays?.sort((a, b) => (a.category === 'Daily' ? -1 : 0) - (b.category === 'Daily' ? -1 : 0) || a.createdAt - b.createdAt)[0]
  return (
    <div className="space-y-6">
      {!todays ? <Spinner /> : <TodayEntry key={existing?.id ?? 'new'} existing={existing ?? null} today={today} />}
      <RecordManager collection="journal" areas={['life', 'personal']} />
    </div>
  )
}

function TodayEntry({ existing, today }: { existing: RecordItem | null; today: string }) {
  const [text, setText] = useState(String(existing?.fields.entry ?? ''))
  const [mood, setMood] = useState<number | null>(existing?.fields.mood != null ? Number(existing.fields.mood) : null)
  const [saving, setSaving] = useState(false)
  const dirty = text !== String(existing?.fields.entry ?? '') || mood !== (existing?.fields.mood != null ? Number(existing.fields.mood) : null)

  const save = async () => {
    if (!text.trim()) { toast('Write something before saving', 'warn'); return }
    setSaving(true)
    if (existing) await safeWrite(() => recordsRepo.update(existing.id, { fields: { ...existing.fields, entry: text, mood } }), 'Journal saved')
    else await safeWrite(() => recordsRepo.create({ collection: 'journal', area: 'life', title: `Journal — ${fmtDate(today)}`, dueDate: today, category: 'Daily', fields: { entry: text, mood } }), 'Journal saved')
    setSaving(false)
  }

  return (
    <Card>
      <CardTitle icon={NotebookPen} tone="text-life">Today's entry · {fmtDate(today, 'EEEE, MMM d')}</CardTitle>
      <form onSubmit={(e) => { e.preventDefault(); void save() }} className="space-y-3">
        <Field label="How was your day?" htmlFor="today-entry">
          <Textarea id="today-entry" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened, how you felt, what you're grateful for…" maxLength={20000} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Mood (1–5)">
            <span className="me-1 text-sm text-muted">Mood</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={mood === n} aria-label={`Mood ${n} of 5`} onClick={() => setMood(mood === n ? null : n)}
                className={cn('h-9 w-9 rounded-lg border', mood != null && mood >= n ? 'border-warn text-warn' : 'border-line text-muted')}>
                <Star className="mx-auto h-4 w-4" aria-hidden fill={mood != null && mood >= n ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
          <Button type="submit" variant="primary" icon={Save} loading={saving} disabled={!dirty} className="ms-auto">{existing ? 'Update entry' : 'Save entry'}</Button>
        </div>
        <p className="text-xs text-muted">Very private thoughts? Use the <Link to="/vault" className="text-accent hover:underline">encrypted Private Vault</Link> instead.</p>
      </form>
    </Card>
  )
}

/* ---------------- Reviews ---------------- */

const REVIEW_TEMPLATES = {
  Daily: {
    wins: 'What went well today?\n- ',
    challenges: 'What was hard or got in the way?\n- ',
    lessons: 'What did I learn?\n- ',
    nextFocus: 'Top 3 priorities for tomorrow:\n1. \n2. \n3. ',
  },
  Weekly: {
    wins: 'Biggest wins this week:\n- ',
    challenges: "What didn't go to plan, and why?\n- ",
    lessons: 'What will I keep, stop and start doing?\n- ',
    nextFocus: 'Focus and key outcomes for next week:\n- ',
  },
  Monthly: {
    wins: 'Highlights and achievements this month:\n- ',
    challenges: 'Where did I fall short of my goals?\n- ',
    lessons: 'Patterns I noticed (energy, time, money, habits):\n- ',
    nextFocus: 'Goals and themes for next month:\n- ',
  },
} as const

function ReviewsTab() {
  const [, setParams] = useSearchParams()
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const ids = useLiveQuery(() => db.records.where('collection').equals('reviews').primaryKeys(), [])
  // Open the new review in RecordManager's editor (?open=id) only once live queries can see it.
  useEffect(() => {
    if (pending && ids?.includes(pending)) { setParams({ open: pending }, { replace: true }); setPending(null) }
  }, [pending, ids, setParams])
  const start = async (kind: keyof typeof REVIEW_TEMPLATES) => {
    setBusy(kind)
    const today = todayISO()
    const r = await safeWrite(() => recordsRepo.create({
      collection: 'reviews', area: 'life', title: `${kind} review — ${fmtDate(today)}`, dueDate: today, category: kind, fields: { ...REVIEW_TEMPLATES[kind] },
    }), `${kind} review started`)
    setBusy(null)
    if (r) setPending(r.id)
  }
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(REVIEW_TEMPLATES) as (keyof typeof REVIEW_TEMPLATES)[]).map((k) => (
          <Card key={k} className="flex flex-col">
            <CardTitle icon={Sparkles} tone="text-life">{k} review</CardTitle>
            <ul className="mb-3 list-disc space-y-0.5 ps-5 text-xs text-muted">
              {Object.values(REVIEW_TEMPLATES[k]).map((p) => <li key={p}>{p.split('\n')[0]}</li>)}
            </ul>
            <Button className="mt-auto" icon={Plus} loading={busy === k} onClick={() => void start(k)}>Start {k.toLowerCase()} review</Button>
          </Card>
        ))}
      </div>
      <RecordManager collection="reviews" areas={['life', 'personal', 'work']} />
    </div>
  )
}

/* ---------------- Packing ---------------- */

const NO_TRIP = '__none__'

function PackingTab() {
  const items = useLiveQuery(() => db.records.where('collection').equals('packing').filter(isLive).toArray(), [])
  const trips = useLiveQuery(() => db.records.where('collection').equals('trips').filter((r) => isLive(r) && !r.done).toArray(), [])
  const [sel, setSel] = useState('')
  const tripOf = (r: RecordItem) => String(r.fields.trip ?? '').trim()

  const groups = useMemo(() => {
    const m = new Map<string, { packed: number; total: number }>()
    for (const t of trips ?? []) m.set(t.title.trim(), { packed: 0, total: 0 })
    for (const r of items ?? []) {
      const k = tripOf(r) || NO_TRIP
      const g = m.get(k) ?? { packed: 0, total: 0 }
      g.total++
      if (r.done) g.packed++
      m.set(k, g)
    }
    m.delete('')
    return [...m].sort((a, b) => (a[0] === NO_TRIP ? 1 : b[0] === NO_TRIP ? -1 : a[0].localeCompare(b[0])))
  }, [items, trips])

  const inSel = (r: RecordItem) => !sel || (sel === NO_TRIP ? !tripOf(r) : tripOf(r) === sel)
  const tripName = sel && sel !== NO_TRIP ? sel : ''

  if (!items || !trips) return <Spinner />
  return (
    <div className="space-y-4">
      {groups.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(([name, g]) => (
            <button key={name} type="button" aria-pressed={sel === name} onClick={() => setSel(sel === name ? '' : name)}
              className={cn('card card-hover p-3 text-start', sel === name && 'ring-2 ring-life/60')}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium">{name === NO_TRIP ? 'No trip' : name}</span>
                <span className="shrink-0 text-xs text-muted">{g.packed}/{g.total} packed</span>
              </div>
              <Progress value={g.total ? (g.packed / g.total) * 100 : 0} label={`${name === NO_TRIP ? 'No trip' : name} packing progress`} />
            </button>
          ))}
        </div>
      )}
      {sel && <p className="text-sm text-muted">Showing <span className="text-fg">{sel === NO_TRIP ? 'items without a trip' : sel}</span>. <button type="button" className="text-accent hover:underline" onClick={() => setSel('')}>Show all</button></p>}
      <RecordManager key={sel} collection="packing" areas={['life', 'personal', 'work', 'home']} defaultArea="life" filter={inSel}
        title={tripName ? `Packing — ${tripName}` : undefined} defaults={tripName ? { fields: { trip: tripName } } : undefined} />
      {trips.length === 0 && items.length === 0 && <p className="text-xs text-muted">Tip: set the “Trip” field on items to group them; trips from the Travel tab appear as groups automatically.</p>}
    </div>
  )
}
