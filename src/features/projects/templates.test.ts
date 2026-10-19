// @vitest-environment node
import { db } from '@/lib/db'
import { PROJECT_TEMPLATES, TEMPLATE_CATEGORIES } from './templates'
import { createProjectFromTemplate, planTasks } from './fromTemplate'

describe('project templates', () => {
  it('every template is well-formed', () => {
    const ids = new Set<string>()
    for (const t of PROJECT_TEMPLATES) {
      expect(ids.has(t.id), t.id).toBe(false); ids.add(t.id)
      expect(TEMPLATE_CATEGORIES).toContain(t.category)
      expect(t.tasks.length).toBeGreaterThan(3)
      for (const x of t.tasks) {
        expect(x.day, `${t.id}: ${x.title}`).toBeGreaterThanOrEqual(0)
        expect(x.day, `${t.id}: ${x.title}`).toBeLessThanOrEqual(t.durationDays)
      }
      expect(t.tasks.some((x) => x.milestone)).toBe(true)
    }
    for (const c of ['SEO', 'Marketing', 'Design'] as const) expect(PROJECT_TEMPLATES.some((t) => t.category === c)).toBe(true)
  })

  it('plans dates relative to the start, with start <= due', () => {
    const tpl = PROJECT_TEMPLATES.find((t) => t.id === 'seo-audit')!
    const tasks = planTasks(tpl, '2026-11-02', 'p1', 'work')
    expect(tasks).toHaveLength(tpl.tasks.length)
    expect(tasks[0].dueDate).toBe('2026-11-03') // day 1
    expect(tasks.at(-1)!.dueDate).toBe('2026-12-14') // day 42
    for (const x of tasks) expect(x.startDate! <= x.dueDate!).toBe(true)
    expect(tasks.filter((x) => x.isMilestone).every((x) => x.startDate === x.dueDate)).toBe(true)
  })

  it('creates the project, tasks and brief in the database', async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    const tpl = PROJECT_TEMPLATES.find((t) => t.id === 'design-uiux')!
    const p = await createProjectFromTemplate(tpl, { name: 'Shop redesign', start: '2026-11-02', area: 'work', withBrief: true })
    expect((await db.projects.get(p.id))?.name).toBe('Shop redesign')
    expect(await db.tasks.where('projectId').equals(p.id).count()).toBe(tpl.tasks.length)
    const docs = await db.docs.toArray()
    expect(docs[0]).toMatchObject({ projectId: p.id, title: 'Shop redesign — Brief' })
    expect(p.deadline).toBe('2026-12-07')
  })
})
