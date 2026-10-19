import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { expandOccurrences, todayISO, toISODate } from '@/lib/dates'
import { addDays } from 'date-fns'
import { toast } from '@/components/feedback'

export interface AppNotification { id: string; title: string; detail: string; path: string; tone: 'danger' | 'warn' | 'info' }

/** Derived, in-app notifications (overdue tasks, bills, maintenance, today's events). */
export function useNotifications(): AppNotification[] {
  return useLiveQuery(async () => {
    const today = todayISO()
    const soon = toISODate(addDays(new Date(), 3))
    const out: AppNotification[] = []
    const tasks = (await db.tasks.toArray()).filter((t) => !t.deletedAt && !t.archived && t.status !== 'completed' && t.dueDate)
    for (const t of tasks) {
      if (t.dueDate! < today) out.push({ id: `t${t.id}`, title: `Overdue: ${t.title}`, detail: `Was due ${t.dueDate}`, path: `/tasks?open=${t.id}`, tone: 'danger' })
      else if (t.dueDate === today) out.push({ id: `t${t.id}`, title: `Due today: ${t.title}`, detail: t.area, path: `/tasks?open=${t.id}`, tone: 'warn' })
    }
    const recs = (await db.records.toArray()).filter((r) => !r.deletedAt && !r.archived && !r.done && r.dueDate && ['bills', 'maintenance', 'chores', 'invoices'].includes(r.collection))
    for (const r of recs) {
      const label = { bills: 'Bill', maintenance: 'Maintenance', chores: 'Chore', invoices: 'Invoice' }[r.collection as 'bills']
      const path = r.collection === 'invoices' ? `/work/invoices?open=${r.id}` : `/home/${r.collection}?open=${r.id}`
      if (r.dueDate! < today) out.push({ id: `r${r.id}`, title: `${label} overdue: ${r.title}`, detail: `Due ${r.dueDate}`, path, tone: 'danger' })
      else if (r.dueDate! <= soon) out.push({ id: `r${r.id}`, title: `${label} due soon: ${r.title}`, detail: `Due ${r.dueDate}`, path, tone: 'warn' })
    }
    const events = (await db.events.toArray()).filter((e) => !e.deletedAt)
    for (const e of events) {
      const d = e.allDay ? e.start.slice(0, 10) : toISODate(new Date(e.start))
      if (expandOccurrences(d, e.recurrence, today, today).length)
        out.push({ id: `e${e.id}`, title: `Today: ${e.title}`, detail: e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), path: `/calendar?date=${today}`, tone: 'info' })
    }
    return out.slice(0, 30)
  }, []) ?? []
}

/**
 * Fires event reminders while the app is open (in-app toast + desktop Notification if permitted).
 * Honest limitation: no service-worker push, so reminders do not fire when the app is closed.
 */
export function useReminderLoop() {
  useEffect(() => {
    const check = async () => {
      const now = Date.now()
      const fired = new Set(((await db.kv.get('reminders.fired'))?.value as string[]) ?? [])
      const events = (await db.events.toArray()).filter((e) => !e.deletedAt && e.reminderMins != null && !e.allDay)
      const today = todayISO()
      let changed = false
      for (const e of events) {
        const base = new Date(e.start)
        const timeOfDay = base.getTime() - new Date(toISODate(base) + 'T00:00:00').getTime()
        for (const d of expandOccurrences(toISODate(base), e.recurrence, today, toISODate(addDays(new Date(), 1)))) {
          const at = new Date(d + 'T00:00:00').getTime() + timeOfDay
          const remindAt = at - e.reminderMins! * 60_000
          const key = `${e.id}@${d}`
          if (remindAt <= now && at > now - 3_600_000 && !fired.has(key)) {
            fired.add(key); changed = true
            const msg = `${e.title} — ${new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            toast(`Reminder: ${msg}`, 'info', undefined, 10000)
            if ('Notification' in window && Notification.permission === 'granted') {
              try { new Notification('Basic to Advanced reminder', { body: msg, tag: key }) } catch { /* some platforms require SW notifications */ }
            }
          }
        }
      }
      if (changed) await db.kv.put({ key: 'reminders.fired', value: [...fired].slice(-500) })
    }
    void check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [])
}
