import type { NavigateFunction } from 'react-router-dom'
import { docsRepo, eventsRepo, projectsRepo, tasksRepo } from './repo'
import { safeWrite } from '@/components/feedback'
import { db } from '@/lib/db'
import { uid } from '@/lib/id'
import { todayISO } from '@/lib/dates'

/** Global quick-create actions shared by the Create menu, command palette and keyboard shortcuts. */
export const quick = {
  async doc(nav: NavigateFunction, kind: 'document' | 'note' = 'document') {
    const d = await safeWrite(() => docsRepo.create({ kind, title: kind === 'note' ? 'Untitled note' : 'Untitled document' }))
    if (d) nav(`/${kind === 'note' ? 'notes' : 'documents'}/${d.id}`)
  },
  async task(nav: NavigateFunction) {
    const t = await safeWrite(() => tasksRepo.create({ title: 'New task', dueDate: todayISO() }))
    if (t) nav(`/tasks?open=${t.id}`)
  },
  async project(nav: NavigateFunction) {
    const p = await safeWrite(() => projectsRepo.create({ name: 'New project', status: 'planning', startDate: todayISO() }))
    if (p) nav(`/projects/${p.id}`)
  },
  async event(nav: NavigateFunction) {
    const start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1)
    const end = new Date(start.getTime() + 3_600_000)
    const e = await safeWrite(() => eventsRepo.create({ title: 'New event', start: start.toISOString(), end: end.toISOString() }))
    if (e) nav(`/calendar?open=${e.id}`)
  },
  async timer(nav: NavigateFunction) {
    await safeWrite(() => db.timers.add({ id: uid(), name: 'Stopwatch', kind: 'stopwatch', startedAt: Date.now(), accumulatedMs: 0, targetMs: null, laps: [], createdAt: Date.now() }), 'Stopwatch started')
    nav('/time')
  },
}
