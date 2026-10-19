import { addMonths, endOfMonth, format, getDaysInMonth } from 'date-fns'
import { parseDate, toISODate } from '@/lib/dates'
import type { Area } from '@/types/models'

/** Minimal shape of a finance record (a RecordItem from 'expenses' / 'income' / 'budgets'). */
export interface MoneyRecord {
  title: string
  amount: number | null
  dueDate: string | null
  category: string
  area: Area
}

/** yyyy-MM month key. */
export type MonthKey = string

export const monthKey = (d: Date = new Date()): MonthKey => format(d, 'yyyy-MM')
export const monthStart = (m: MonthKey) => `${m}-01`
export const monthEnd = (m: MonthKey) => toISODate(endOfMonth(parseDate(monthStart(m))))
export const monthLabel = (m: MonthKey, pattern = 'MMM yyyy') => format(parseDate(monthStart(m)), pattern)
export const shiftMonth = (m: MonthKey, n: number): MonthKey => monthKey(addMonths(parseDate(monthStart(m)), n))

/** The `n` months ending with `m` (inclusive), oldest first. */
export const lastNMonths = (m: MonthKey, n: number): MonthKey[] => Array.from({ length: n }, (_, i) => shiftMonth(m, i - (n - 1)))

export const inMonth = (date: string | null | undefined, m: MonthKey) => !!date && date.slice(0, 7) === m
export const amountOf = (r: Pick<MoneyRecord, 'amount'>) => (r.amount != null && Number.isFinite(r.amount) ? r.amount : 0)
export const sum = (rs: Pick<MoneyRecord, 'amount'>[]) => round2(rs.reduce((s, r) => s + amountOf(r), 0))
const round2 = (n: number) => Math.round(n * 100) / 100

const UNCATEGORISED = 'Uncategorised'
export const categoryOf = (r: Pick<MoneyRecord, 'category'>) => r.category.trim() || UNCATEGORISED

/** Totals per category, largest first. */
export function sumByCategory(rs: MoneyRecord[]): { category: string; total: number }[] {
  const m = new Map<string, number>()
  for (const r of rs) m.set(categoryOf(r), (m.get(categoryOf(r)) ?? 0) + amountOf(r))
  return [...m].map(([category, total]) => ({ category, total: round2(total) })).filter((x) => x.total !== 0).sort((a, b) => b.total - a.total)
}

/** Totals per area (every area present, zero when empty). */
export function sumByArea(rs: MoneyRecord[]): Record<Area, number> {
  const out: Record<Area, number> = { personal: 0, home: 0, work: 0, life: 0 }
  for (const r of rs) out[r.area] += amountOf(r)
  for (const k of Object.keys(out) as Area[]) out[k] = round2(out[k])
  return out
}

/** Spending per day of month (1…days in month). */
export function dailyTotals(rs: MoneyRecord[], m: MonthKey): { day: number; date: string; total: number }[] {
  const days = getDaysInMonth(parseDate(monthStart(m)))
  const totals = new Array<number>(days).fill(0)
  for (const r of rs) if (inMonth(r.dueDate, m)) totals[Number(r.dueDate!.slice(8, 10)) - 1] += amountOf(r)
  return totals.map((total, i) => ({ day: i + 1, date: `${m}-${String(i + 1).padStart(2, '0')}`, total: round2(total) }))
}

/** Income vs expenses for each month. */
export function monthlyTotals(income: MoneyRecord[], expenses: MoneyRecord[], months: MonthKey[]) {
  return months.map((m) => {
    const inc = sum(income.filter((r) => inMonth(r.dueDate, m)))
    const exp = sum(expenses.filter((r) => inMonth(r.dueDate, m)))
    return { month: m, label: monthLabel(m, 'MMM'), income: inc, expenses: exp, net: round2(inc - exp) }
  })
}

export interface BudgetUsage { title: string; category: string; limit: number; spent: number; remaining: number; pct: number; over: boolean }

/**
 * Compare monthly budget limits with spending in month `m`. A budget applies to expenses whose category
 * matches its category (case-insensitive); a budget without a category matches by its title.
 */
export function budgetUsage(budgets: MoneyRecord[], expenses: MoneyRecord[], m: MonthKey): BudgetUsage[] {
  const monthExp = expenses.filter((e) => inMonth(e.dueDate, m))
  return budgets.map((b) => {
    const key = (b.category.trim() || b.title.trim()).toLowerCase()
    const spent = sum(monthExp.filter((e) => e.category.trim().toLowerCase() === key))
    const limit = amountOf(b)
    return {
      title: b.title, category: b.category.trim() || b.title.trim(), limit, spent, remaining: round2(limit - spent),
      pct: limit > 0 ? (spent / limit) * 100 : spent > 0 ? 100 : 0, over: spent > limit,
    }
  }).sort((a, b) => b.pct - a.pct)
}
