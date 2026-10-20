import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays } from 'date-fns'
import { Banknote, ChevronLeft, ChevronRight, Download, LayoutDashboard, PiggyBank, Receipt, TrendingUp, Wallet } from 'lucide-react'
import { db } from '@/lib/db'
import { Badge, Button, Card, CardTitle, EmptyState, IconButton, PageHeader, Progress, Select, Tabs } from '@/components/ui'
import { RecordManager } from '@/features/records/RecordManager'
import { DataChart } from '@/features/charts/DataChart'
import { budgetUsage, dailyTotals, lastNMonths, monthKey, monthLabel, monthlyTotals, shiftMonth, sum, sumByArea, sumByCategory, inMonth } from '@/features/finance/aggregate'
import { updateSettings, useSettings } from '@/services/settings'
import { safeWrite } from '@/components/feedback'
import { AREA_LABEL, money } from '@/lib/format'
import { fmtDate, toISODate, todayISO } from '@/lib/dates'
import { objectsToCSV } from '@/lib/csv'
import { downloadText } from '@/services/backup'
import { cn } from '@/lib/cn'
import type { Area, RecordItem } from '@/types/models'

type Tab = 'overview' | 'expenses' | 'income' | 'budgets' | 'bills'
const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'income', label: 'Income', icon: TrendingUp }, { id: 'budgets', label: 'Budgets', icon: PiggyBank }, { id: 'bills', label: 'Bills', icon: Banknote },
]
const CURRENCIES = ['USD', 'EUR', 'GBP', 'PKR', 'INR', 'AED', 'SAR', 'CAD', 'AUD', 'JPY', 'CNY', 'TRY', 'BDT', 'NGN', 'ZAR', 'BRL', 'MXN', 'CHF', 'SEK']

function Overview() {
  const s = useSettings()
  const [month, setMonth] = useState(monthKey())
  const [area, setArea] = useState<Area | ''>('')
  const all = useLiveQuery(async () => {
    const rows = (await db.records.toArray()).filter((r) => !r.deletedAt && !r.archived)
    const by = (c: string) => rows.filter((r) => r.collection === c)
    return { expenses: by('expenses'), income: by('income'), budgets: by('budgets'), bills: by('bills') }
  }, [])
  const cur = (n: number) => money(n, s.currency)

  const view = useMemo(() => {
    if (!all) return null
    const f = (rs: RecordItem[]) => (area ? rs.filter((r) => r.area === area) : rs)
    const exp = f(all.expenses), inc = f(all.income)
    const mExp = exp.filter((r) => inMonth(r.dueDate, month)), mInc = inc.filter((r) => inMonth(r.dueDate, month))
    const end = toISODate(addDays(new Date(), 30))
    return {
      mExp, mInc,
      totalExp: sum(mExp), totalInc: sum(mInc),
      byCat: sumByCategory(mExp).map((c) => ({ category: c.category, total: c.total })),
      daily: dailyTotals(mExp, month).map((d) => ({ day: String(d.day), spent: d.total })),
      months: monthlyTotals(inc, exp, lastNMonths(month, 6)).map((m) => ({ month: m.label, Income: m.income, Expenses: m.expenses })),
      byArea: sumByArea(all.expenses.filter((r) => inMonth(r.dueDate, month))),
      budgets: budgetUsage(f(all.budgets), exp, month),
      bills: all.bills.filter((b) => !b.done && b.dueDate && b.dueDate <= end).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)),
    }
  }, [all, month, area])

  const exportMonth = () => {
    if (!view) return
    const rows = [...view.mInc.map((r) => ({ ...r, kind: 'Income' })), ...view.mExp.map((r) => ({ ...r, kind: 'Expense' }))].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    downloadText(objectsToCSV(rows, [
      { key: 'dueDate', label: 'Date' }, { key: 'kind', label: 'Type' }, { key: 'title', label: 'Description' }, { key: 'category', label: 'Category' },
      { key: (r) => AREA_LABEL[r.area], label: 'Area' }, { key: 'amount', label: `Amount (${s.currency})` },
    ]), `transactions-${month}.csv`, 'text/csv;charset=utf-8')
  }

  if (!view) return null
  const net = view.totalInc - view.totalExp
  const hasData = view.mExp.length > 0 || view.mInc.length > 0

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <IconButton icon={ChevronLeft} label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} />
        <span className="min-w-[8rem] text-center font-semibold" aria-live="polite">{monthLabel(month, 'MMMM yyyy')}</span>
        <IconButton icon={ChevronRight} label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} />
        {month !== monthKey() && <Button size="sm" onClick={() => setMonth(monthKey())}>This month</Button>}
        <Select aria-label="Filter by area" className="ml-auto w-auto" value={area} onChange={(e) => setArea(e.target.value as Area | '')}>
          <option value="">All areas</option>{(Object.keys(AREA_LABEL) as Area[]).map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
        </Select>
        <Select aria-label="Currency" className="w-auto" value={s.currency} onChange={(e) => void safeWrite(() => updateSettings({ currency: e.target.value }))}>
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Button icon={Download} disabled={!hasData} onClick={exportMonth}>CSV</Button>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {[['Income', view.totalInc, 'text-ok'], ['Expenses', view.totalExp, 'text-danger'], ['Net', net, net >= 0 ? 'text-ok' : 'text-danger']].map(([l, v, c]) => (
          <Card key={l as string}><div className="text-sm text-muted">{l}</div><div className={cn('mt-1 text-2xl font-bold tabular-nums', c as string)}>{cur(v as number)}</div></Card>
        ))}
      </div>

      {!hasData && <div className="mb-4"><EmptyState icon={Wallet} title={`No transactions in ${monthLabel(month, 'MMMM yyyy')}`}>Add expenses and income in their tabs — charts use only your real records.</EmptyState></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {view.byCat.length > 0 && <Card><CardTitle icon={Receipt}>Spending by category</CardTitle>
          <DataChart type="donut" data={view.byCat} xKey="category" yKeys={['total']} valueFormatter={cur} height={260} ariaLabel="Donut chart of spending by category this month" />
        </Card>}
        {view.mExp.length > 0 && <Card><CardTitle icon={TrendingUp}>Daily spending</CardTitle>
          <DataChart type="bar" data={view.daily} xKey="day" yKeys={['spent']} showLegend={false} valueFormatter={cur} height={260} ariaLabel="Bar chart of spending per day this month" />
        </Card>}
        <Card className="lg:col-span-2"><CardTitle icon={TrendingUp}>Income vs expenses — last 6 months</CardTitle>
          <DataChart type="bar" data={view.months} xKey="month" yKeys={['Income', 'Expenses']} valueFormatter={cur} height={260} ariaLabel="Bar chart comparing income and expenses for the last six months" />
        </Card>
        <Card><CardTitle icon={Wallet}>Expenses by area</CardTitle>
          <ul className="space-y-2 text-sm">{(Object.keys(view.byArea) as Area[]).map((a) => (
            <li key={a} className="flex items-center justify-between"><Badge tone={a === 'personal' ? 'accent' : a}>{AREA_LABEL[a]}</Badge><span className="tabular-nums">{cur(view.byArea[a])}</span></li>
          ))}</ul>
          <p className="mt-2 text-xs text-muted">Personal and work money stay separate: each record has its own area.</p>
        </Card>
        <Card><CardTitle icon={PiggyBank} action={<Link to="/finance/budgets" className="text-xs text-accent">Manage</Link>}>Budgets this month</CardTitle>
          {!view.budgets.length ? <p className="text-sm text-muted">No budgets yet. Set a monthly limit per category in the Budgets tab.</p> : (
            <ul className="space-y-3">{view.budgets.map((b) => (
              <li key={b.title + b.category}>
                <div className="mb-1 flex justify-between text-sm"><span>{b.title}{b.category !== b.title && <span className="text-muted"> · {b.category}</span>}</span>
                  <span className={cn('tabular-nums', b.over && 'font-semibold text-danger')}>{cur(b.spent)} / {cur(b.limit)}</span></div>
                <div className={cn(b.over && '[&_.progress-bar]:bg-none [&_.progress-bar]:bg-danger')}><Progress value={b.pct} label={`${b.title} budget used`} /></div>
                {b.over && <p className="mt-1 text-xs text-danger">Over budget by {cur(-b.remaining)}</p>}
              </li>
            ))}</ul>
          )}
        </Card>
        <Card className="lg:col-span-2"><CardTitle icon={Banknote} action={<Link to="/finance/bills" className="text-xs text-accent">All bills</Link>}>Upcoming bills (30 days)</CardTitle>
          {!view.bills.length ? <p className="text-sm text-muted">No unpaid bills due in the next 30 days.</p> : (
            <ul className="divide-y divide-line/60">{view.bills.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2 text-sm">
                <span className={cn('w-20 shrink-0', b.dueDate! < todayISO() ? 'font-semibold text-danger' : 'text-muted')}>{fmtDate(b.dueDate, 'MMM d')}</span>
                <Link to={`/finance/bills?open=${b.id}`} className="min-w-0 flex-1 truncate hover:text-accent">{b.title}</Link>
                <span className="tabular-nums">{cur(b.amount ?? 0)}</span>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>
    </div>
  )
}

export function FinancePage() {
  const { tab = 'overview' } = useParams()
  const nav = useNavigate()
  const current = (TABS.some((t) => t.id === tab) ? tab : 'overview') as Tab
  return (
    <div>
      <PageHeader title="Finance & Expenses" description="Income, expenses, budgets and bills — separated by personal, home, work and life." icon={Banknote} />
      <Tabs label="Finance sections" tabs={TABS} value={current} onChange={(t) => nav(t === 'overview' ? '/finance' : `/finance/${t}`)} />
      {current === 'overview' && <Overview />}
      {current === 'expenses' && <RecordManager collection="expenses" />}
      {current === 'income' && <RecordManager collection="income" />}
      {current === 'budgets' && <RecordManager collection="budgets" />}
      {current === 'bills' && <RecordManager collection="bills" areas={['home', 'personal', 'work']} defaultArea="home" />}
    </div>
  )
}
