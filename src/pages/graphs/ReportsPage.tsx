import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, startOfMonth, startOfWeek } from 'date-fns'
import { CheckSquare, Clock, Download, FolderKanban, Heart, PieChart, Printer, Wallet } from 'lucide-react'
import { db } from '@/lib/db'
import { useSettings } from '@/services/settings'
import { Button, Card, CardTitle, Field, Input, PageHeader, Progress, Select, Spinner } from '@/components/ui'
import { DataChart } from '@/features/charts/DataChart'
import { expandOccurrences, fmtDate, fmtHours, parseDate, toISODate, todayISO } from '@/lib/dates'
import { AREA_LABEL, money } from '@/lib/format'
import { objectsToCSV } from '@/lib/csv'
import { downloadText } from '@/services/backup'
import { lastNMonths, monthKey, monthlyTotals } from '@/features/finance/aggregate'
import type { Area } from '@/types/models'

type Preset = 'week' | 'month' | '30' | 'custom'

const csv = (name: string, rows: Record<string, unknown>[]) => {
  if (!rows.length) return
  const cols = Object.keys(rows[0]).map((k) => ({ key: k, label: k }))
  downloadText(objectsToCSV(rows, cols), `${name}.csv`, 'text/csv;charset=utf-8')
}

function Section({ icon, title, onCsv, children, empty }: { icon: typeof Clock; title: string; onCsv?: () => void; children: React.ReactNode; empty?: React.ReactNode }) {
  return (
    <Card className="break-inside-avoid">
      <CardTitle icon={icon} action={onCsv && !empty && <Button size="sm" icon={Download} className="no-print" onClick={onCsv}>CSV</Button>}>{title}</CardTitle>
      {empty ? <p className="py-6 text-center text-sm text-muted">{empty}</p> : children}
    </Card>
  )
}

export function ReportsPage() {
  const s = useSettings()
  const [preset, setPreset] = useState<Preset>('month')
  const [from, setFrom] = useState(toISODate(startOfMonth(new Date())))
  const [to, setTo] = useState(todayISO())

  const range = useMemo(() => {
    const now = new Date()
    if (preset === 'week') return { from: toISODate(startOfWeek(now, { weekStartsOn: s.weekStartsOn })), to: todayISO() }
    if (preset === 'month') return { from: toISODate(startOfMonth(now)), to: todayISO() }
    if (preset === '30') return { from: toISODate(addDays(now, -29)), to: todayISO() }
    return from <= to ? { from, to } : { from: to, to: from }
  }, [preset, from, to, s.weekStartsOn])
  const t0 = parseDate(range.from).getTime(), t1 = addDays(parseDate(range.to), 1).getTime()

  const data = useLiveQuery(async () => {
    const live = <T extends { deletedAt: number | null }>(a: T[]) => a.filter((x) => !x.deletedAt)
    return {
      projects: live(await db.projects.toArray()), tasks: live(await db.tasks.toArray()), sessions: live(await db.timerSessions.toArray()),
      records: live(await db.records.toArray()), logs: live(await db.habitLogs.toArray()),
    }
  }, [])

  const r = useMemo(() => {
    if (!data) return null
    const today = todayISO()
    const sessions = data.sessions.filter((x) => x.startedAt >= t0 && x.startedAt < t1)
    const projName = (id?: string | null) => data.projects.find((p) => p.id === id)?.name ?? 'No project'

    const projects = data.projects.filter((p) => !p.archived).map((p) => {
      const ts = data.tasks.filter((t) => t.projectId === p.id)
      const done = ts.filter((t) => t.status === 'completed').length
      const hours = data.sessions.filter((x) => x.projectId === p.id && x.startedAt >= t0 && x.startedAt < t1).reduce((a, x) => a + x.durationMs, 0) / 3_600_000
      return { Project: p.name, Status: p.status, Done: done, Total: ts.length, Percent: ts.length ? Math.round((done / ts.length) * 100) : 0, Overdue: ts.filter((t) => t.status !== 'completed' && t.dueDate && t.dueDate < today).length, Hours: +hours.toFixed(2), Deadline: p.deadline ?? '' }
    })

    const days: string[] = []
    for (let d = parseDate(range.from); d <= parseDate(range.to) && days.length < 370; d = addDays(d, 1)) days.push(toISODate(d))
    const perDay = days.map((d) => ({ day: fmtDate(d, 'MMM d'), hours: +(sessions.filter((x) => toISODate(new Date(x.startedAt)) === d).reduce((a, x) => a + x.durationMs, 0) / 3_600_000).toFixed(2) }))
    const byProject = new Map<string, number>(), byArea = new Map<string, number>()
    for (const x of sessions) {
      byProject.set(projName(x.projectId), (byProject.get(projName(x.projectId)) ?? 0) + x.durationMs / 3_600_000)
      byArea.set(AREA_LABEL[x.area], (byArea.get(AREA_LABEL[x.area]) ?? 0) + x.durationMs / 3_600_000)
    }
    const totalMs = sessions.reduce((a, x) => a + x.durationMs, 0)
    const billableMs = sessions.filter((x) => x.billable).reduce((a, x) => a + x.durationMs, 0)

    const completed = data.tasks.filter((t) => t.completedAt && t.completedAt >= t0 && t.completedAt < t1)
    const created = data.tasks.filter((t) => t.createdAt >= t0 && t.createdAt < t1)
    const completedPerDay = days.map((d) => ({ day: fmtDate(d, 'MMM d'), completed: completed.filter((t) => toISODate(new Date(t.completedAt!)) === d).length }))

    const workSessions = sessions.filter((x) => x.area === 'work').sort((a, b) => a.startedAt - b.startedAt)
    const timesheet = workSessions.map((x) => ({ Date: toISODate(new Date(x.startedAt)), Label: x.label, Project: projName(x.projectId), Hours: +(x.durationMs / 3_600_000).toFixed(2), Billable: x.billable ? 'yes' : 'no' }))

    const habits = data.records.filter((h) => h.collection === 'habits' && !h.archived).map((h) => {
      const done = data.logs.filter((l) => l.habitId === h.id && l.done && l.date >= range.from && l.date <= range.to).length
      return { Habit: h.title, 'Days done': done, 'Days in range': days.length, Percent: days.length ? Math.round((done / days.length) * 100) : 0 }
    })

    const fin = (c: string) => data.records.filter((x) => x.collection === c)
    const months = monthlyTotals(fin('income'), fin('expenses'), lastNMonths(monthKey(), 6)).map((m) => ({ Month: m.label, Income: m.income, Expenses: m.expenses, Net: m.net }))
    const inRange = (c: string, area?: Area) => fin(c).filter((x) => x.dueDate && x.dueDate >= range.from && x.dueDate <= range.to && (!area || x.area === area)).reduce((a, x) => a + (x.amount ?? 0), 0)

    // Upcoming important dates within the range (for context in the life section)
    const dates = data.records.filter((x) => x.collection === 'importantDates' && x.dueDate).flatMap((x) => expandOccurrences(x.dueDate!, x.recurrence, range.from, range.to, 5).map((d) => ({ d, t: x.title })))

    return {
      projects, perDay, byProject: [...byProject].map(([project, hours]) => ({ project, hours: +hours.toFixed(2) })), byArea: [...byArea].map(([area, hours]) => ({ area, hours: +hours.toFixed(2) })),
      totalMs, billableMs, completed, created, completedPerDay, timesheet, habits, months, dates,
      income: inRange('income'), expenses: inRange('expenses'), workExpenses: inRange('expenses', 'work'),
    }
  }, [data, t0, t1, range])

  const tag = `${range.from}_to_${range.to}`
  const cur = (n: number) => money(n, s.currency)

  return (
    <div>
      <PageHeader title="Reports" description={`Reporting on your real data · ${fmtDate(range.from)} – ${fmtDate(range.to)}`} icon={PieChart}
        actions={<Button icon={Printer} className="no-print" onClick={() => window.print()}>Print / Save as PDF</Button>} />
      <div className="no-print mb-4 flex flex-wrap items-end gap-3">
        <Field label="Range" htmlFor="rp"><Select id="rp" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
          <option value="week">This week</option><option value="month">This month</option><option value="30">Last 30 days</option><option value="custom">Custom</option>
        </Select></Field>
        {preset === 'custom' && <>
          <Field label="From" htmlFor="rf"><Input id="rf" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To" htmlFor="rt"><Input id="rt" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </>}
      </div>
      {!r ? <Spinner /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <Section icon={FolderKanban} title="Project progress" onCsv={() => csv(`project-progress-${tag}`, r.projects)} empty={!r.projects.length && <>No projects yet. <Link className="text-accent" to="/projects">Create one</Link>.</> }>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-start text-xs text-muted"><tr><th className="py-1 pe-3">Project</th><th className="pe-3">Status</th><th className="w-40 pe-3">Progress</th><th className="pe-3 text-end">Tasks</th><th className="pe-3 text-end">Overdue</th><th className="text-end">Hours</th></tr></thead>
                  <tbody>{r.projects.map((p) => (
                    <tr key={p.Project} className="border-t border-line/60"><td className="py-2 pe-3 font-medium">{p.Project}</td><td className="pe-3 text-muted">{p.Status.replace('_', ' ')}</td>
                      <td className="pe-3"><div className="flex items-center gap-2"><Progress value={p.Percent} label={`${p.Project} progress`} /><span className="w-9 text-end text-xs">{p.Percent}%</span></div></td>
                      <td className="pe-3 text-end tabular-nums">{p.Done}/{p.Total}</td><td className={`pe-3 text-end tabular-nums ${p.Overdue ? 'text-danger' : ''}`}>{p.Overdue}</td><td className="text-end tabular-nums">{p.Hours}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              {r.projects.some((p) => p.Total) && <div className="mt-4"><DataChart type="bar" data={r.projects.filter((p) => p.Total)} xKey="Project" yKeys={['Done', 'Total']} height={240} ariaLabel="Bar chart of completed versus total tasks per project" /></div>}
            </Section>
          </div>

          <Section icon={Clock} title={`Time tracked · ${fmtHours(r.totalMs)}`} onCsv={() => csv(`time-per-day-${tag}`, r.perDay)} empty={!r.totalMs && 'No time tracked in this range.'}>
            <p className="mb-2 text-sm text-muted">Billable {fmtHours(r.billableMs)} · Non-billable {fmtHours(r.totalMs - r.billableMs)}</p>
            <DataChart type="line" data={r.perDay} xKey="day" yKeys={['hours']} showLegend={false} height={220} ariaLabel="Line chart of hours tracked per day" />
          </Section>
          <Section icon={Clock} title="Time by project and area" onCsv={() => csv(`time-by-project-${tag}`, r.byProject)} empty={!r.totalMs && 'No time tracked in this range.'}>
            <DataChart type="pie" data={r.byProject} xKey="project" yKeys={['hours']} height={200} ariaLabel="Pie chart of hours per project" />
            <ul className="mt-2 flex flex-wrap gap-3 text-sm">{r.byArea.map((a) => <li key={a.area}><b>{a.area}</b> {a.hours} h</li>)}</ul>
          </Section>

          <Section icon={CheckSquare} title={`Tasks · ${r.completed.length} completed, ${r.created.length} created`} onCsv={() => csv(`tasks-completed-${tag}`, r.completed.map((t) => ({ Task: t.title, Completed: toISODate(new Date(t.completedAt!)), Area: AREA_LABEL[t.area], Priority: t.priority })))} empty={!r.completed.length && 'No tasks completed in this range.'}>
            <DataChart type="bar" data={r.completedPerDay} xKey="day" yKeys={['completed']} showLegend={false} height={220} ariaLabel="Bar chart of tasks completed per day" />
          </Section>

          <Section icon={Clock} title="Work timesheet" onCsv={() => csv(`timesheet-${tag}`, r.timesheet)} empty={!r.timesheet.length && 'No work-area time entries in this range.'}>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-start text-xs text-muted"><tr><th className="py-1">Date</th><th>Entry</th><th>Project</th><th className="text-end">Hours</th></tr></thead>
                <tbody>{r.timesheet.map((x, i) => <tr key={i} className="border-t border-line/60"><td className="py-1.5 pe-2">{x.Date}</td><td className="pe-2">{x.Label}{x.Billable === 'yes' && ' 💲'}</td><td className="pe-2 text-muted">{x.Project}</td><td className="text-end tabular-nums">{x.Hours}</td></tr>)}</tbody>
                <tfoot><tr className="border-t border-line font-semibold"><td colSpan={3} className="py-1.5">Total</td><td className="text-end tabular-nums">{r.timesheet.reduce((a, x) => a + x.Hours, 0).toFixed(2)}</td></tr></tfoot>
              </table>
            </div>
          </Section>

          <Section icon={Heart} title="Habit completion" onCsv={() => csv(`habits-${tag}`, r.habits)} empty={!r.habits.length && 'No habits yet.'}>
            <ul className="space-y-3">{r.habits.map((h) => (
              <li key={h.Habit}><div className="mb-1 flex justify-between text-sm"><span>{h.Habit}</span><span className="text-muted">{h['Days done']}/{h['Days in range']} days</span></div><Progress value={h.Percent} label={`${h.Habit} completion`} /></li>
            ))}</ul>
            {r.dates.length > 0 && <p className="mt-3 text-xs text-muted">Important dates in range: {r.dates.map((d) => `${d.t} (${fmtDate(d.d, 'MMM d')})`).join(', ')}</p>}
          </Section>

          <Section icon={Wallet} title="Finance" onCsv={() => csv('finance-6-months', r.months)} empty={!r.months.some((m) => m.Income || m.Expenses) && 'No income or expenses recorded.'}>
            <p className="mb-2 text-sm">In range: income <b className="text-ok">{cur(r.income)}</b> · expenses <b className="text-danger">{cur(r.expenses)}</b> (work {cur(r.workExpenses)})</p>
            <DataChart type="bar" data={r.months} xKey="Month" yKeys={['Income', 'Expenses']} valueFormatter={cur} height={220} ariaLabel="Bar chart of income and expenses for the last six months" />
          </Section>
        </div>
      )}
    </div>
  )
}
