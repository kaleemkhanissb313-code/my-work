import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateSelectArg, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { CalendarDays, Copy, Plus, Trash2 } from 'lucide-react'
import { db } from '@/lib/db'
import { eventsRepo } from '@/services/repo'
import { useSettings } from '@/services/settings'
import { safeWrite, toast } from '@/components/feedback'
import { Button, Checkbox, Field, Input, Modal, PageHeader, Select, TagInput, Textarea } from '@/components/ui'
import { RecurrenceEditor } from '@/components/RecurrenceEditor'
import { expandOccurrences, localTimeZone, parseDate, toISODate } from '@/lib/dates'
import { AREA_LABEL } from '@/lib/format'
import { fmtOffset, wallTimeToInstant, zoneList } from '@/features/tasks/timezones'
import type { Area, CalendarEvent, EventKind } from '@/types/models'

const COLORS = { event: '#8b5cf6', meeting: '#3b82f6', task: '#f59e0b', milestone: '#ec4899', deadline: '#ef4444', date: '#14b8a6', bill: '#64748b' }
const KINDS: EventKind[] = ['event', 'meeting', 'milestone', 'birthday', 'important', 'reminder']
const REMINDERS = [null, 5, 10, 15, 30, 60, 1440]

/** Format an instant as the wall-clock `yyyy-MM-ddTHH:mm` it shows in `zone`. */
function instantToWall(iso: string, zone: string) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso))
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}

interface Range { start: string; end: string }

export function CalendarPage() {
  const s = useSettings()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const calRef = useRef<FullCalendar>(null)
  const [range, setRange] = useState<Range>(() => ({ start: toISODate(addDays(new Date(), -45)), end: toISODate(addDays(new Date(), 45)) }))
  const [editing, setEditing] = useState<{ event: CalendarEvent | null; draft?: Partial<CalendarEvent> } | null>(null)
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640

  const data = useLiveQuery(async () => ({
    events: (await db.events.toArray()).filter((e) => !e.deletedAt),
    tasks: (await db.tasks.toArray()).filter((t) => !t.deletedAt && !t.archived && t.dueDate),
    projects: (await db.projects.toArray()).filter((p) => !p.deletedAt && !p.archived),
    records: (await db.records.toArray()).filter((r) => !r.deletedAt && !r.archived && r.dueDate && (r.collection === 'importantDates' || (r.collection === 'bills' && !r.done))),
  }), [])

  // Deep links: ?open=<eventId>, ?date=yyyy-mm-dd
  useEffect(() => {
    const open = params.get('open'), date = params.get('date')
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) calRef.current?.getApi().gotoDate(parseDate(date))
    if (open && data) {
      const ev = data.events.find((e) => e.id === open)
      if (ev) setEditing({ event: ev })
    }
    if (open || date) { params.delete('open'); params.delete('date'); setParams(params, { replace: true }) }
  }, [params, data, setParams])

  const fcEvents = useMemo<EventInput[]>(() => {
    if (!data) return []
    const out: EventInput[] = []
    for (const e of data.events) {
      const color = e.kind === 'meeting' ? COLORS.meeting : e.kind === 'milestone' ? COLORS.milestone : COLORS.event
      if (e.allDay) {
        const startD = e.start.slice(0, 10)
        const span = e.end ? Math.max(0, differenceInCalendarDays(parseDate(e.end.slice(0, 10)), parseDate(startD))) : 0
        for (const d of expandOccurrences(startD, e.recurrence, toISODate(addDays(parseDate(range.start), -span)), range.end)) {
          out.push({ id: `e:${e.id}:${d}`, title: e.title, start: d, end: toISODate(addDays(parseDate(d), span + 1)), allDay: true, color, editable: !e.recurrence, extendedProps: { kind: 'event', refId: e.id } })
        }
      } else {
        const start = new Date(e.start)
        const dur = e.end ? new Date(e.end).getTime() - start.getTime() : 3_600_000
        const timeOfDay = start.getTime() - parseDate(toISODate(start)).getTime()
        for (const d of expandOccurrences(toISODate(start), e.recurrence, range.start, range.end)) {
          const st = parseDate(d).getTime() + timeOfDay
          out.push({ id: `e:${e.id}:${d}`, title: e.title, start: new Date(st), end: new Date(st + dur), color, editable: !e.recurrence, extendedProps: { kind: 'event', refId: e.id } })
        }
      }
    }
    for (const t of data.tasks) {
      out.push({ id: `t:${t.id}`, title: `${t.status === 'completed' ? '✓ ' : ''}${t.isMilestone ? '◆ ' : ''}${t.title}`, start: t.dueDate!, allDay: true, color: t.isMilestone ? COLORS.milestone : COLORS.task, editable: false, extendedProps: { kind: 'task', refId: t.id } })
    }
    for (const p of data.projects) if (p.deadline) {
      out.push({ id: `p:${p.id}`, title: `⚑ ${p.name} deadline`, start: p.deadline, allDay: true, color: COLORS.deadline, editable: false, extendedProps: { kind: 'project', refId: p.id } })
    }
    for (const r of data.records) {
      const isBill = r.collection === 'bills'
      for (const d of expandOccurrences(r.dueDate!, isBill ? null : r.recurrence, range.start, range.end, 50)) {
        out.push({ id: `r:${r.id}:${d}`, title: isBill ? `Bill: ${r.title}` : `🎉 ${r.title}`, start: d, allDay: true, color: isBill ? COLORS.bill : COLORS.date, editable: false, extendedProps: { kind: r.collection, refId: r.id } })
      }
    }
    return out
  }, [data, range])

  const onClick = (arg: EventClickArg) => {
    const { kind, refId } = arg.event.extendedProps as { kind: string; refId: string }
    if (kind === 'event') { const ev = data?.events.find((e) => e.id === refId); if (ev) setEditing({ event: ev }) }
    else if (kind === 'task') nav(`/tasks?open=${refId}`)
    else if (kind === 'project') nav(`/projects/${refId}`)
    else if (kind === 'bills') nav(`/home/bills?open=${refId}`)
    else nav(`/life/dates?open=${refId}`)
  }

  const onSelect = (arg: DateSelectArg) => {
    calRef.current?.getApi().unselect()
    if (arg.allDay) setEditing({ event: null, draft: { allDay: true, start: toISODate(arg.start), end: toISODate(addDays(arg.end, -1)) } })
    else setEditing({ event: null, draft: { allDay: false, start: arg.start.toISOString(), end: arg.end.toISOString() } })
  }

  const onMove = async (arg: EventDropArg | EventResizeDoneArg) => {
    const refId = (arg.event.extendedProps as { refId: string }).refId
    const ev = arg.event
    const patch: Partial<CalendarEvent> = ev.allDay
      ? { allDay: true, start: toISODate(ev.start!), end: ev.end ? toISODate(addDays(ev.end, -1)) : null }
      : { allDay: false, start: ev.start!.toISOString(), end: (ev.end ?? new Date(ev.start!.getTime() + 3_600_000)).toISOString() }
    const ok = await safeWrite(() => eventsRepo.update(refId, patch), 'Event rescheduled')
    if (ok === undefined) arg.revert()
  }

  return (
    <div>
      <PageHeader title="Calendar" description="Events, task due dates, project deadlines, bills and important dates." icon={CalendarDays}
        actions={<Button variant="primary" icon={Plus} onClick={() => {
          const st = new Date(); st.setMinutes(0, 0, 0); st.setHours(st.getHours() + 1)
          setEditing({ event: null, draft: { allDay: false, start: st.toISOString(), end: new Date(st.getTime() + 3_600_000).toISOString() } })
        }}>New event</Button>} />
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted" aria-label="Legend">
        {[['Event', COLORS.event], ['Meeting', COLORS.meeting], ['Task due', COLORS.task], ['Milestone', COLORS.milestone], ['Project deadline', COLORS.deadline], ['Important date', COLORS.date], ['Bill due', COLORS.bill]].map(([l, c]) => (
          <span key={l} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}</span>
        ))}
      </div>
      <div className="card p-2 sm:p-4">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={narrow ? 'timeGridDay' : 'dayGridMonth'}
          headerToolbar={narrow ? { left: 'prev,next', center: 'title', right: 'today' } : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
          footerToolbar={narrow ? { center: 'dayGridMonth,timeGridWeek,timeGridDay' } : undefined}
          firstDay={s.weekStartsOn}
          height="auto"
          nowIndicator
          selectable
          selectMirror
          dayMaxEvents={4}
          events={fcEvents}
          eventClick={onClick}
          select={onSelect}
          eventDrop={(a) => void onMove(a)}
          eventResize={(a) => void onMove(a)}
          datesSet={(a) => setRange((r) => {
            const next = { start: toISODate(a.start), end: toISODate(a.end) }
            return r.start === next.start && r.end === next.end ? r : next
          })}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">Drag events to reschedule (recurring events are edited from their dialog). Reminders fire while the app is open.</p>
      {editing && <EventModal key={editing.event?.id ?? 'new'} event={editing.event} draft={editing.draft} onClose={() => setEditing(null)} />}
    </div>
  )
}

function EventModal({ event, draft, onClose }: { event: CalendarEvent | null; draft?: Partial<CalendarEvent>; onClose: () => void }) {
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deletedAt).toArray(), [])
  const zones = useMemo(() => zoneList(), [])
  const base = { ...(event ?? {}), ...(draft ?? {}) } as Partial<CalendarEvent>
  const zone0 = base.timeZone ?? localTimeZone()
  const [f, setF] = useState(() => ({
    title: base.title ?? '',
    allDay: base.allDay ?? false,
    zone: zone0,
    startDate: base.allDay ? (base.start ?? toISODate(new Date())).slice(0, 10) : '',
    endDate: base.allDay ? (base.end ?? base.start ?? '').slice(0, 10) : '',
    startWall: !base.allDay && base.start ? instantToWall(base.start, zone0) : '',
    endWall: !base.allDay && base.end ? instantToWall(base.end, zone0) : '',
    kind: base.kind ?? 'event' as EventKind,
    area: base.area ?? 'personal' as Area,
    location: base.location ?? '',
    notes: base.notes ?? '',
    recurrence: base.recurrence ?? null,
    reminderMins: base.reminderMins ?? null,
    projectId: base.projectId ?? '',
    tags: base.tags ?? [],
  }))
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const browserZone = localTimeZone()

  const build = (): Partial<CalendarEvent> | null => {
    if (!f.title.trim()) { setErr('Title is required.'); return null }
    let start: string, end: string | null
    if (f.allDay) {
      if (!f.startDate) { setErr('Start date is required.'); return null }
      start = f.startDate
      end = f.endDate || null
      if (end && end < start) { setErr('End date must be on or after the start date.'); return null }
    } else {
      const st = wallTimeToInstant(f.startWall, f.zone)
      const en = f.endWall ? wallTimeToInstant(f.endWall, f.zone) : null
      if (st == null) { setErr('Start date and time are required.'); return null }
      if (en != null && en <= st) { setErr('End must be after start.'); return null }
      start = new Date(st).toISOString()
      end = en != null ? new Date(en).toISOString() : new Date(st + 3_600_000).toISOString()
    }
    setErr(null)
    return {
      title: f.title.trim(), allDay: f.allDay, start, end, timeZone: f.zone, kind: f.kind, area: f.area, location: f.location, notes: f.notes,
      recurrence: f.recurrence, reminderMins: f.allDay ? null : f.reminderMins, projectId: f.projectId || null, tags: f.tags,
    }
  }

  const save = async () => {
    const data = build()
    if (!data) return
    setSaving(true)
    const ok = event ? await safeWrite(() => eventsRepo.update(event.id, data), 'Event saved') : await safeWrite(() => eventsRepo.create(data), 'Event created')
    setSaving(false)
    if (ok !== undefined) onClose()
  }

  const startInstant = !f.allDay ? wallTimeToInstant(f.startWall, f.zone) : null

  return (
    <Modal open onClose={onClose} title={event ? 'Edit event' : 'New event'} wide footer={<>
      {event && <Button variant="ghost" icon={Trash2} className="mr-auto" onClick={async () => {
        await safeWrite(() => eventsRepo.trash(event.id))
        toast('Event moved to trash', 'success', { label: 'Undo', run: () => void eventsRepo.restore(event.id) })
        onClose()
      }}>Delete</Button>}
      {event && <Button icon={Copy} onClick={async () => { await safeWrite(() => eventsRepo.duplicate(event.id, (e) => ({ title: `${e.title} (copy)` })), 'Duplicated'); onClose() }}>Duplicate</Button>}
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={saving} onClick={save}>Save</Button>
    </>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Field label="Title" htmlFor="ev-title" className="sm:col-span-2"><Input id="ev-title" value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={200} /></Field>
        <div className="sm:col-span-2"><Checkbox label="All-day" checked={f.allDay} onChange={(v) => {
          if (v) setF((x) => ({ ...x, allDay: true, startDate: x.startWall.slice(0, 10) || toISODate(new Date()), endDate: x.endWall.slice(0, 10) }))
          else setF((x) => ({ ...x, allDay: false, startWall: `${x.startDate || toISODate(new Date())}T09:00`, endWall: `${x.endDate || x.startDate || toISODate(new Date())}T10:00` }))
        }} /></div>
        {f.allDay ? <>
          <Field label="Start date" htmlFor="ev-sd"><Input id="ev-sd" type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
          <Field label="End date" htmlFor="ev-ed"><Input id="ev-ed" type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        </> : <>
          <Field label="Starts" htmlFor="ev-st"><Input id="ev-st" type="datetime-local" value={f.startWall} onChange={(e) => set('startWall', e.target.value)} /></Field>
          <Field label="Ends" htmlFor="ev-en"><Input id="ev-en" type="datetime-local" value={f.endWall} onChange={(e) => set('endWall', e.target.value)} /></Field>
          <Field label="Time zone" htmlFor="ev-tz" className="sm:col-span-2"
            hint={startInstant != null && f.zone !== browserZone ? `= ${format(startInstant, 'EEE d MMM, HH:mm')} your time (${browserZone}, ${fmtOffset(browserZone, startInstant)})` : undefined}>
            <Select id="ev-tz" value={f.zone} onChange={(e) => set('zone', e.target.value)}>{zones.map((z) => <option key={z}>{z}</option>)}</Select>
          </Field>
        </>}
        <Field label="Type" htmlFor="ev-kind"><Select id="ev-kind" value={f.kind} onChange={(e) => set('kind', e.target.value as EventKind)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</Select></Field>
        <Field label="Area" htmlFor="ev-area"><Select id="ev-area" value={f.area} onChange={(e) => set('area', e.target.value as Area)}>{(Object.keys(AREA_LABEL) as Area[]).map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}</Select></Field>
        <Field label="Location" htmlFor="ev-loc"><Input id="ev-loc" value={f.location} onChange={(e) => set('location', e.target.value)} /></Field>
        <Field label="Project" htmlFor="ev-proj"><Select id="ev-proj" value={f.projectId} onChange={(e) => set('projectId', e.target.value)}><option value="">None</option>{projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        {!f.allDay && <Field label="Reminder" htmlFor="ev-rem" hint="Reminders fire while the app is open.">
          <Select id="ev-rem" value={f.reminderMins ?? ''} onChange={(e) => set('reminderMins', e.target.value === '' ? null : Number(e.target.value))}>
            {REMINDERS.map((m) => <option key={String(m)} value={m ?? ''}>{m == null ? 'None' : m >= 1440 ? '1 day before' : m >= 60 ? '1 hour before' : `${m} minutes before`}</option>)}
          </Select>
        </Field>}
        <Field label="Repeat" className="sm:col-span-2"><RecurrenceEditor value={f.recurrence} onChange={(r) => set('recurrence', r)} /></Field>
        <Field label="Notes" htmlFor="ev-notes" className="sm:col-span-2"><Textarea id="ev-notes" value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <Field label="Tags" className="sm:col-span-2"><TagInput value={f.tags} onChange={(t) => set('tags', t)} /></Field>
        {err && <p className="text-sm text-danger sm:col-span-2" role="alert">{err}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
