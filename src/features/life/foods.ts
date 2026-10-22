/**
 * Foods log (My Life). Stored as ordinary private records (collection "foods") so it uses the same local storage,
 * sync, backup, trash and access rules as every other personal record. Pure helpers here are unit-tested.
 */
import type { RecordItem } from '@/types/models'

export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const
export type Meal = (typeof MEALS)[number]

export interface FoodEntry { id: string; name: string; meal: Meal; date: string; time: string; calories: number | null; notes: string }

export const isMeal = (v: string): v is Meal => (MEALS as readonly string[]).includes(v)

export function toFood(r: RecordItem): FoodEntry {
  const cal = r.fields.calories
  return {
    id: r.id, name: r.title, meal: isMeal(r.category) ? r.category : 'Snack', date: r.dueDate ?? '',
    time: typeof r.fields.time === 'string' ? r.fields.time : '', calories: typeof cal === 'number' && Number.isFinite(cal) ? cal : null,
    notes: typeof r.fields.notes === 'string' ? r.fields.notes : '',
  }
}

export function toRecordPatch(f: Omit<FoodEntry, 'id'>): Partial<RecordItem> {
  return {
    collection: 'foods', area: 'life', title: f.name.trim(), category: f.meal, dueDate: f.date,
    fields: { time: f.time, calories: f.calories, notes: f.notes.trim() },
  }
}

export function validateFood(f: Omit<FoodEntry, 'id'>): string | null {
  if (!f.name.trim()) return 'Enter the food name.'
  if (f.name.trim().length > 120) return 'Food name is too long (120 characters max).'
  if (!isMeal(f.meal)) return 'Choose a meal type.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return 'Choose a date.'
  if (f.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time)) return 'Enter a valid time.'
  if (f.calories != null && (!Number.isFinite(f.calories) || f.calories < 0 || f.calories > 20000)) return 'Calories must be between 0 and 20,000.'
  return null
}

export interface DayGroup { date: string; total: number | null; meals: { meal: Meal; items: FoodEntry[] }[] }

/** Newest day first; within a day, meals in Breakfast → Snack order; within a meal, by time. */
export function groupByDay(entries: FoodEntry[]): DayGroup[] {
  const days = new Map<string, FoodEntry[]>()
  for (const e of entries) days.set(e.date, [...(days.get(e.date) ?? []), e])
  return [...days].sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => {
    const withCal = items.filter((i) => i.calories != null)
    return {
      date,
      total: withCal.length ? withCal.reduce((a, i) => a + (i.calories ?? 0), 0) : null,
      meals: MEALS.map((meal) => ({ meal, items: items.filter((i) => i.meal === meal).sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.name.localeCompare(b.name)) })).filter((m) => m.items.length),
    }
  })
}

export function filterFoods(entries: FoodEntry[], q: string, meal: Meal | '', from: string | null) {
  const t = q.trim().toLowerCase()
  return entries.filter((e) => (!meal || e.meal === meal) && (!from || e.date >= from) && (!t || e.name.toLowerCase().includes(t) || e.notes.toLowerCase().includes(t)))
}
