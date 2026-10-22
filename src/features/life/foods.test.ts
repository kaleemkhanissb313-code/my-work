import { filterFoods, groupByDay, toFood, toRecordPatch, validateFood, type FoodEntry } from './foods'
import type { RecordItem } from '@/types/models'

const f = (id: string, date: string, meal: FoodEntry['meal'], time: string, calories: number | null, name = id): FoodEntry => ({ id, name, meal, date, time, calories, notes: '' })

describe('foods', () => {
  it('groups newest day first, meals in order, items by time, with calorie totals', () => {
    const g = groupByDay([
      f('tea', '2026-10-22', 'Breakfast', '08:00', 50), f('rice', '2026-10-23', 'Dinner', '20:00', 600),
      f('egg', '2026-10-23', 'Breakfast', '07:30', 80), f('paratha', '2026-10-23', 'Breakfast', '07:00', 300), f('apple', '2026-10-23', 'Snack', '', null),
    ])
    expect(g.map((d) => d.date)).toEqual(['2026-10-23', '2026-10-22'])
    expect(g[0].meals.map((m) => m.meal)).toEqual(['Breakfast', 'Dinner', 'Snack'])
    expect(g[0].meals[0].items.map((i) => i.name)).toEqual(['paratha', 'egg'])
    expect(g[0].total).toBe(980)
    expect(groupByDay([f('x', '2026-10-01', 'Lunch', '', null)])[0].total).toBeNull()
  })

  it('filters by text, meal and start date', () => {
    const all = [f('a', '2026-10-01', 'Lunch', '', null, 'Daal chawal'), f('b', '2026-10-20', 'Dinner', '', null, 'Daal makhni'), f('c', '2026-10-20', 'Lunch', '', null, 'Salad')]
    expect(filterFoods(all, 'daal', '', null).map((x) => x.id)).toEqual(['a', 'b'])
    expect(filterFoods(all, '', 'Lunch', '2026-10-10').map((x) => x.id)).toEqual(['c'])
  })

  it('validates input and round-trips through a private record', () => {
    expect(validateFood({ name: '', meal: 'Lunch', date: '2026-10-23', time: '', calories: null, notes: '' })).toMatch(/name/)
    expect(validateFood({ name: 'Tea', meal: 'Lunch', date: '2026-10-23', time: '25:00', calories: null, notes: '' })).toMatch(/time/)
    expect(validateFood({ name: 'Tea', meal: 'Lunch', date: '2026-10-23', time: '', calories: -1, notes: '' })).toMatch(/Calories/)
    const entry = { name: ' Chai ', meal: 'Breakfast' as const, date: '2026-10-23', time: '07:15', calories: 90, notes: 'with milk' }
    expect(validateFood(entry)).toBeNull()
    const patch = toRecordPatch(entry)
    expect(patch).toMatchObject({ collection: 'foods', area: 'life', title: 'Chai', category: 'Breakfast', dueDate: '2026-10-23' })
    expect(toFood({ ...(patch as RecordItem), id: 'r1' })).toEqual({ id: 'r1', ...entry, name: 'Chai' })
  })
})
