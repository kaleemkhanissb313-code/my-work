import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, Wand2, CalendarPlus, CheckSquare, FileText, FolderPlus, Lock, Moon, NotebookPen, Search, Timer } from 'lucide-react'
import { Modal } from '@/components/ui'
import { searchAll, type SearchHit } from '@/services/search'
import { ALL_LEAVES } from '../nav'
import { can } from '@/services/access'
import { featureForPath } from '@/features/access/features'
import { quick } from '@/services/quick'
import { openQuickAdd } from '@/features/quickadd/QuickAdd'
import { lockApp } from '@/services/security'
import { getSettings, updateSettings } from '@/services/settings'
import { cn } from '@/lib/cn'

interface Cmd { id: string; label: string; hint?: string; icon: typeof Search; run: () => void; group: string }

export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => { if (open) { setQ(''); setActive(0) } }, [open])
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => { void searchAll(q, 20).then((h) => { if (!cancelled) setHits(h) }) }, 120)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q])

  const commands: Cmd[] = useMemo(() => {
    const go = (fn: () => void) => () => { onClose(); fn() }
    const actions: Cmd[] = [
      { id: 'quick-add', label: q.trim() ? `Quick add: “${q.trim()}”` : 'Smart quick add (natural language)', hint: 'Q', icon: Wand2, group: 'Actions', run: go(() => openQuickAdd(q.trim())) },
      { id: 'new-doc', label: 'Create document', hint: 'Alt N', icon: FileText, group: 'Actions', run: go(() => void quick.doc(nav)) },
      { id: 'new-note', label: 'Create note', icon: NotebookPen, group: 'Actions', run: go(() => void quick.doc(nav, 'note')) },
      { id: 'new-task', label: 'Create task', hint: 'Alt T', icon: CheckSquare, group: 'Actions', run: go(() => void quick.task(nav)) },
      { id: 'new-project', label: 'Create project', icon: FolderPlus, group: 'Actions', run: go(() => void quick.project(nav)) },
      { id: 'new-event', label: 'Create event', hint: 'Alt E', icon: CalendarPlus, group: 'Actions', run: go(() => void quick.event(nav)) },
      { id: 'timer', label: 'Start stopwatch', hint: 'Alt S', icon: Timer, group: 'Actions', run: go(() => void quick.timer(nav)) },
      { id: 'theme', label: 'Toggle dark / light theme', icon: Moon, group: 'Actions', run: go(async () => { const s = await getSettings(); await updateSettings({ theme: s.theme === 'dark' ? 'light' : 'dark' }) }) },
      { id: 'lock', label: 'Lock app', hint: 'Ctrl Shift L', icon: Lock, group: 'Actions', run: go(() => void lockApp('manual')) },
    ]
    const pages: Cmd[] = ALL_LEAVES.filter((l) => can(featureForPath(l.path))).map((l) => ({ id: `go-${l.id}`, label: `Go to ${l.label}`, icon: l.icon, group: 'Navigate', run: go(() => nav(l.path)) }))
    const term = q.toLowerCase().trim()
    if (!term) return [...actions, ...pages]
    // "Quick add: <text>" always contains the query, so it goes last; otherwise Enter would never open a matching page.
    const [quickAdd, ...rest] = actions
    const matches = [...rest, ...pages].filter((c) => c.label.toLowerCase().includes(term))
    const name = (c: Cmd) => c.label.toLowerCase().replace(/^(go to|create) /, '')
    const strong = matches.filter((c) => name(c).startsWith(term) || name(c).split(/\s+/).some((w) => w.startsWith(term)))
    const weak = matches.filter((c) => !strong.includes(c))
    const results: Cmd[] = hits.map((h) => ({ id: `hit-${h.type}-${h.id}`, label: h.title, hint: h.subtitle, icon: ArrowRight, group: 'Results', run: go(() => nav(h.path)) }))
    return [...strong.slice(0, 6), ...results, ...weak.slice(0, 4), quickAdd]
  }, [q, hits, nav, onClose])

  useEffect(() => { setActive(0) }, [q])
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(commands.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); commands[active]?.run() }
  }

  let lastGroup = ''
  return (
    <Modal open={open} onClose={onClose} title="Search & commands" wide>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} className="input h-11 ps-9 text-base"
          placeholder="Search documents, tasks, projects, events, media, links… or type a command"
          role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={commands[active] ? `cmd-${commands[active].id}` : undefined} />
      </div>
      <ul id="cmd-list" ref={listRef} role="listbox" className="mt-3 max-h-[55vh] overflow-y-auto">
        {commands.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No results for “{q}”.</li>}
        {commands.map((c, i) => {
          const header = c.group !== lastGroup ? (lastGroup = c.group) : null
          return (
            <li key={c.id}>
              {header && <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{header}</div>}
              <button id={`cmd-${c.id}`} data-idx={i} role="option" aria-selected={i === active} type="button" onMouseEnter={() => setActive(i)} onClick={c.run}
                className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm', i === active ? 'bg-raised text-fg' : 'text-muted')}>
                <c.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate text-fg">{c.label}</span>
                {c.hint && <span className={c.group === 'Results' ? 'text-xs text-muted' : 'kbd'}>{c.hint}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">↑↓ to move · Enter to open · Esc to close · Private Vault contents are never searched.</p>
    </Modal>
  )
}
