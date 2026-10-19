import { addDays } from 'date-fns'
import { db } from '@/lib/db'
import { uid } from '@/lib/id'
import { parseDate, toISODate } from '@/lib/dates'
import { baseEntity, docsRepo, projectsRepo } from '@/services/repo'
import type { Area, Project, Task } from '@/types/models'
import type { ProjectTemplate } from './templates'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** Pure: build the task rows for a template starting on `start` (yyyy-MM-dd). */
export function planTasks(tpl: ProjectTemplate, start: string, projectId: string, area: Area): Task[] {
  const s = parseDate(start)
  const lastDueInPhase = new Map<string, number>()
  const now = Date.now()
  return [...tpl.tasks].sort((a, b) => a.day - b.day).map((x, i) => {
    const prev = lastDueInPhase.get(x.phase)
    lastDueInPhase.set(x.phase, x.day)
    const startDay = x.milestone ? x.day : prev != null ? prev : Math.max(0, x.day - Math.max(1, Math.ceil((x.est ?? 120) / 480)))
    return {
      ...baseEntity(), id: uid(), title: x.title, description: '', status: 'todo', priority: x.priority ?? 'medium',
      startDate: toISODate(addDays(s, startDay)), dueDate: toISODate(addDays(s, x.day)), projectId, area, category: x.phase,
      subtasks: (x.subtasks ?? []).map((title) => ({ id: uid(), title, done: false })), estimateMins: x.est ?? null, actualMins: 0,
      recurrence: null, completedAt: null, order: now + i, isMilestone: !!x.milestone, tags: [tpl.category.toLowerCase()],
    }
  })
}

/** Create the project, all its tasks and a brief document in one transaction. */
export async function createProjectFromTemplate(tpl: ProjectTemplate, opts: { name: string; start: string; area: Area; withBrief: boolean }): Promise<Project> {
  const project: Project = {
    ...baseEntity(), id: uid(), name: opts.name.trim() || tpl.name, description: tpl.description, startDate: opts.start,
    deadline: toISODate(addDays(parseDate(opts.start), tpl.durationDays)), status: 'active', priority: 'medium', icon: tpl.icon,
    color: tpl.color, area: opts.area, tags: [tpl.category.toLowerCase()],
  }
  const tasks = planTasks(tpl, opts.start, project.id, opts.area)
  await db.transaction('rw', db.projects, db.tasks, db.docs, async () => {
    await projectsRepo.table.add(project)
    await db.tasks.bulkAdd(tasks)
    if (opts.withBrief) {
      const phases = [...new Set(tpl.tasks.map((x) => x.phase))]
      const content = `<p>${esc(tpl.description)}</p>${tpl.brief.map((h) => `<h2>${esc(h)}</h2><p></p>`).join('')}<h2>Phases</h2><ol>${phases.map((p) => `<li><p>${esc(p)}</p></li>`).join('')}</ol>`
      await docsRepo.create({ title: `${project.name} — Brief`, description: `Project brief (${tpl.name} template)`, content, projectId: project.id, area: opts.area, tags: [tpl.category.toLowerCase(), 'brief'] })
    }
  })
  return project
}
