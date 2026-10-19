import { budgetUsage, dailyTotals, inMonth, lastNMonths, monthEnd, monthlyTotals, shiftMonth, sumByArea, sumByCategory, type MoneyRecord } from './aggregate'

const r = (p: Partial<MoneyRecord>): MoneyRecord => ({ title: '', amount: 0, dueDate: '2026-10-05', category: '', area: 'personal', ...p })

describe('finance aggregation', () => {
  it('handles month helpers', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(lastNMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
    expect(monthEnd('2024-02')).toBe('2024-02-29')
    expect(inMonth('2026-10-31', '2026-10')).toBe(true)
    expect(inMonth(null, '2026-10')).toBe(false)
  })

  it('sums by category, largest first, with uncategorised bucket and float rounding', () => {
    const res = sumByCategory([r({ category: 'Food', amount: 0.1 }), r({ category: 'Food', amount: 0.2 }), r({ category: 'Travel', amount: 5 }), r({ amount: 1 }), r({ category: 'X', amount: null })])
    expect(res).toEqual([{ category: 'Travel', total: 5 }, { category: 'Uncategorised', total: 1 }, { category: 'Food', total: 0.3 }])
  })

  it('sums by area', () => {
    expect(sumByArea([r({ area: 'work', amount: 10 }), r({ area: 'work', amount: 5 }), r({ area: 'home', amount: 2 })])).toEqual({ personal: 0, home: 2, work: 15, life: 0 })
  })

  it('computes daily totals for every day in the month', () => {
    const d = dailyTotals([r({ dueDate: '2026-02-01', amount: 3 }), r({ dueDate: '2026-02-01', amount: 2 }), r({ dueDate: '2026-02-28', amount: 1 }), r({ dueDate: '2026-03-01', amount: 99 })], '2026-02')
    expect(d).toHaveLength(28)
    expect(d[0]).toEqual({ day: 1, date: '2026-02-01', total: 5 })
    expect(d[27].total).toBe(1)
  })

  it('computes monthly income vs expenses', () => {
    const res = monthlyTotals([r({ dueDate: '2026-09-01', amount: 1000 })], [r({ dueDate: '2026-09-10', amount: 400 }), r({ dueDate: '2026-10-10', amount: 50 })], ['2026-09', '2026-10'])
    expect(res.map((x) => [x.month, x.income, x.expenses, x.net])).toEqual([['2026-09', 1000, 400, 600], ['2026-10', 0, 50, -50]])
  })

  it('computes budget usage per category for the month', () => {
    const budgets = [r({ title: 'Eating out', category: 'Food', amount: 100 }), r({ title: 'Travel', category: '', amount: 50 }), r({ title: 'Zero', category: 'None', amount: 0 })]
    const expenses = [
      r({ category: 'food', amount: 80, dueDate: '2026-10-02' }), r({ category: 'Food', amount: 30, dueDate: '2026-10-20' }),
      r({ category: 'Food', amount: 500, dueDate: '2026-09-20' }), r({ category: 'Travel', amount: 20, dueDate: '2026-10-03' }),
    ]
    const res = budgetUsage(budgets, expenses, '2026-10')
    const food = res.find((b) => b.category === 'Food')!
    expect(food).toMatchObject({ limit: 100, spent: 110, remaining: -10, over: true })
    expect(food.pct).toBeCloseTo(110)
    expect(res.find((b) => b.category === 'Travel')).toMatchObject({ spent: 20, over: false, pct: 40 })
    expect(res.find((b) => b.category === 'None')).toMatchObject({ pct: 0, over: false })
    expect(res[0].category).toBe('Food')
  })
})
