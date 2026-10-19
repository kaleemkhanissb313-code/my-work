import { useMemo, useState } from 'react'
import { Copy, Download, GitCompare, Type, Undo2 } from 'lucide-react'
import { Button, Card, CardTitle, Checkbox, PageHeader, Select, Tabs } from '@/components/ui'
import { ALPHABETS, convertCase, dedupeLines, diffLines, removeEmptyLines, reverseText, sortLines, textStats, toNato, type CaseKind } from '@/lib/text'
import { copyText } from '@/features/tools/clipboard'
import { downloadText } from '@/services/backup'
import { cn } from '@/lib/cn'

const CASES: { id: CaseKind; label: string }[] = [
  { id: 'upper', label: 'UPPERCASE' }, { id: 'lower', label: 'lowercase' }, { id: 'title', label: 'Title Case' }, { id: 'sentence', label: 'Sentence case' },
  { id: 'camel', label: 'camelCase' }, { id: 'pascal', label: 'PascalCase' }, { id: 'snake', label: 'snake_case' }, { id: 'kebab', label: 'kebab-case' },
  { id: 'constant', label: 'CONSTANT_CASE' }, { id: 'alternating', label: 'aLtErNaTiNg' }, { id: 'inverse', label: 'iNVERSE' },
]

function TextTools() {
  const [text, setText] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [caseSensitive, setCaseSensitive] = useState(false)
  const st = useMemo(() => textStats(text), [text])
  const apply = (fn: (s: string) => string) => { if (!text) return; setHistory((h) => [...h.slice(-19), text]); setText(fn(text)) }
  const stats: [string, string | number][] = [
    ['Characters', st.characters], ['No spaces', st.charactersNoSpaces], ['Words', st.words], ['Sentences', st.sentences],
    ['Paragraphs', st.paragraphs], ['Lines', st.lines], ['Reading time', st.words ? `${Math.max(1, Math.round(st.readingMinutes))} min` : '0 min'],
  ]
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <label htmlFor="tt" className="label">Your text</label>
        <textarea id="tt" className="input min-h-[300px] font-mono text-[13px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste or type text here…" />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" icon={Undo2} disabled={!history.length} onClick={() => { setText(history[history.length - 1]); setHistory((h) => h.slice(0, -1)) }}>Undo</Button>
          <Button size="sm" icon={Copy} disabled={!text} onClick={() => void copyText(text, 'Text')}>Copy</Button>
          <Button size="sm" icon={Download} disabled={!text} onClick={() => downloadText(text, 'text.txt')}>Download .txt</Button>
          <Button size="sm" variant="ghost" disabled={!text} onClick={() => apply(() => '')}>Clear</Button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-live="polite">
          {stats.map(([l, v]) => <div key={l} className="rounded-xl bg-raised p-2"><dt className="text-[11px] text-muted">{l}</dt><dd className="text-lg font-semibold tabular-nums">{v}</dd></div>)}
        </dl>
      </Card>
      <div className="space-y-4">
        <Card><CardTitle icon={Type}>Change case</CardTitle>
          <div className="grid grid-cols-2 gap-1.5">{CASES.map((c) => <Button key={c.id} size="sm" disabled={!text} onClick={() => apply((s) => convertCase(s, c.id))}>{c.label}</Button>)}</div>
        </Card>
        <Card><CardTitle icon={Type}>Lines</CardTitle>
          <Checkbox label="Case-sensitive" checked={caseSensitive} onChange={setCaseSensitive} className="mb-2" />
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" disabled={!text} onClick={() => apply((s) => sortLines(s, { caseSensitive }))}>Sort A → Z</Button>
            <Button size="sm" disabled={!text} onClick={() => apply((s) => sortLines(s, { order: 'desc', caseSensitive }))}>Sort Z → A</Button>
            <Button size="sm" disabled={!text} onClick={() => apply((s) => dedupeLines(s, { caseSensitive, trim: true }))}>Remove duplicates</Button>
            <Button size="sm" disabled={!text} onClick={() => apply(removeEmptyLines)}>Remove empty</Button>
            <Button size="sm" disabled={!text} onClick={() => apply(reverseText)}>Reverse text</Button>
            <Button size="sm" disabled={!text} onClick={() => apply(toNato)}>NATO spelling</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Compare() {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const result = useMemo(() => {
    if (!a && !b) return null
    try { return { ops: diffLines(a, b) } } catch (e) { return { error: (e as Error).message } }
  }, [a, b])
  const ops = (result && 'ops' in result && result.ops) || []
  const added = ops.filter((o) => o.type === 'add').length, removed = ops.filter((o) => o.type === 'remove').length
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        <div><label htmlFor="cmp-a" className="label">Original</label><textarea id="cmp-a" className="input min-h-[200px] font-mono text-[13px]" value={a} onChange={(e) => setA(e.target.value)} /></div>
        <div><label htmlFor="cmp-b" className="label">Changed</label><textarea id="cmp-b" className="input min-h-[200px] font-mono text-[13px]" value={b} onChange={(e) => setB(e.target.value)} /></div>
      </div>
      <Card className="mt-4"><CardTitle icon={GitCompare}>Differences {result && 'ops' in result && <span className="text-xs font-normal text-muted">· <span className="text-ok">+{added}</span> / <span className="text-danger">−{removed}</span> lines</span>}</CardTitle>
        {!result ? <p className="text-sm text-muted">Enter text in both boxes to compare line by line.</p>
          : 'error' in result ? <p className="text-sm text-danger" role="alert">{result.error}</p>
          : !added && !removed ? <p className="text-sm text-ok">The texts are identical.</p> : (
            <pre className="max-h-[420px] overflow-auto rounded-xl bg-raised p-2 font-mono text-xs">{ops.map((o, i) => (
              <div key={i} className={cn('px-2', o.type === 'add' && 'bg-ok/15 text-ok', o.type === 'remove' && 'bg-danger/15 text-danger')}>
                <span aria-hidden>{o.type === 'add' ? '+ ' : o.type === 'remove' ? '− ' : '  '}</span><span className="sr-only">{o.type === 'add' ? 'Added: ' : o.type === 'remove' ? 'Removed: ' : ''}</span>{o.line || ' '}
              </div>
            ))}</pre>
          )}
      </Card>
    </div>
  )
}

function Alphabets() {
  const [key, setKey] = useState('english')
  const a = ALPHABETS[key]
  const rtl = key === 'arabic' || key === 'urdu'
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label htmlFor="alpha" className="text-sm text-muted">Alphabet</label>
        <Select id="alpha" className="w-auto" value={key} onChange={(e) => setKey(e.target.value)}>{Object.entries(ALPHABETS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</Select>
        <span className="text-sm text-muted">{a.letters.length} letters{a.note ? ` · ${a.note}` : ''}</span>
        <Button size="sm" icon={Copy} className="ml-auto" onClick={() => void copyText(a.letters.join(key === 'nato' ? '\n' : ' '), a.name)}>Copy all</Button>
      </div>
      <ol dir={rtl ? 'rtl' : 'ltr'} className={cn('grid gap-2', key === 'nato' ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6' : 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-10')}>
        {a.letters.map((l, i) => (
          <li key={l + i}>
            <button type="button" onClick={() => void copyText(l, l)} aria-label={`${l}, letter ${i + 1}. Copy`}
              className="card card-hover flex w-full flex-col items-center p-2">
              <span className={cn('font-semibold', key === 'nato' ? 'text-base' : 'text-2xl')}>{l}</span>
              {key === 'english' && <span className="text-sm text-muted">{l.toLowerCase()}</span>}
              <span className="text-[10px] text-muted">{i + 1}</span>
            </button>
          </li>
        ))}
      </ol>
    </Card>
  )
}

export function TextPage() {
  const [tab, setTab] = useState<'tools' | 'compare' | 'alphabets'>('tools')
  return (
    <div>
      <PageHeader title="Alphabet & Text Tools" description="Count, convert, sort, clean and compare text; alphabet references." icon={Type} />
      <Tabs label="Text tools" value={tab} onChange={setTab} tabs={[{ id: 'tools', label: 'Text tools', icon: Type }, { id: 'compare', label: 'Compare', icon: GitCompare }, { id: 'alphabets', label: 'Alphabets' }]} />
      {tab === 'tools' ? <TextTools /> : tab === 'compare' ? <Compare /> : <Alphabets />}
    </div>
  )
}
