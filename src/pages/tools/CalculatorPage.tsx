import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeftRight, BarChart3, Calculator, CalendarDays, Divide, FlaskConical, History, Percent, Ruler, Scale, Tag, Trash2,
} from 'lucide-react'
import {
  addDays, addMonths, addWeeks, differenceInCalendarDays, differenceInMonths, format, intervalToDuration, isValid, setYear,
} from 'date-fns'
import { db } from '@/lib/db'
import { uid } from '@/lib/id'
import { confirm, safeWrite } from '@/components/feedback'
import { Badge, Button, Card, CardTitle, EmptyState, Field, IconButton, Input, PageHeader, Select, Spinner, Tabs, Textarea } from '@/components/ui'
import { MathError, evaluate, formatResult, type AngleMode } from '@/lib/mathParser'
import {
  UNITS, convertUnit, discount, parseNumberList, percentChange, percentOf, roundTo, simplifyRatio, solveProportion, stats, whatPercent, type UnitCategory,
} from '@/lib/numbers'
import { addWorkingDays, daysBetween, parseDate, toISODate, todayISO, workingDaysBetween } from '@/lib/dates'
import { cn } from '@/lib/cn'
import { copyText, loadPref, num, savePref } from '@/features/tools/clipboard'

type TabId = 'standard' | 'scientific' | 'percentage' | 'discount' | 'ratio' | 'stats' | 'datetime' | 'units'
type Places = number | 'auto'

/** Format a computed number for display using the chosen precision. */
const makeShow = (places: Places) => (n: number) => {
  if (!Number.isFinite(n)) return '—'
  if (places === 'auto') return formatResult(n)
  const r = roundTo(n, places)
  return Math.abs(r) >= 1e15 ? formatResult(r) : r.toFixed(places)
}

export function CalculatorPage() {
  const [tab, setTabState] = useState<TabId>(() => loadPref<TabId>('calc.tab', 'standard'))
  const [places, setPlacesState] = useState<Places>(() => loadPref<Places>('calc.places', 'auto'))
  const setTab = (t: TabId) => { setTabState(t); savePref('calc.tab', t) }
  const setPlaces = (p: Places) => { setPlacesState(p); savePref('calc.places', p) }
  const show = useMemo(() => makeShow(places), [places])

  return (
    <div>
      <PageHeader title="Calculator" icon={Calculator} description="Standard & scientific calculator plus everyday calculation tools."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="calc-places" className="text-sm text-muted">Decimal places</label>
            <Select id="calc-places" className="w-auto" value={String(places)} onChange={(e) => setPlaces(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}>
              <option value="auto">Auto</option>
              {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}</option>)}
            </Select>
          </div>
        } />
      <Tabs label="Calculator tools" value={tab} onChange={setTab} tabs={[
        { id: 'standard', label: 'Standard', icon: Calculator },
        { id: 'scientific', label: 'Scientific', icon: FlaskConical },
        { id: 'percentage', label: 'Percentage', icon: Percent },
        { id: 'discount', label: 'Discount', icon: Tag },
        { id: 'ratio', label: 'Ratio', icon: Divide },
        { id: 'stats', label: 'Statistics', icon: BarChart3 },
        { id: 'datetime', label: 'Date & time', icon: CalendarDays },
        { id: 'units', label: 'Units', icon: Ruler },
      ]} />
      {(tab === 'standard' || tab === 'scientific') && <CalculatorTool key={tab} scientific={tab === 'scientific'} show={show} />}
      {tab === 'percentage' && <PercentageTool show={show} />}
      {tab === 'discount' && <DiscountTool show={show} />}
      {tab === 'ratio' && <RatioTool show={show} />}
      {tab === 'stats' && <StatsTool show={show} />}
      {tab === 'datetime' && <DateTimeTool show={show} />}
      {tab === 'units' && <UnitsTool show={show} />}
    </div>
  )
}

/* ============================== Standard / Scientific ============================== */

const OPS = '+-*/^%!'

function CalculatorTool({ scientific, show }: { scientific: boolean; show: (n: number) => string }) {
  const [expr, setExpr] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [justEvaluated, setJustEvaluated] = useState(false)
  const [mode, setModeState] = useState<AngleMode>(() => loadPref<AngleMode>('calc.angle', 'deg'))
  const [memory, setMemoryState] = useState<number>(() => loadPref<number>('calc.memory', 0))
  const [ans, setAnsState] = useState<number>(() => loadPref<number>('calc.ans', 0))
  const inputRef = useRef<HTMLInputElement>(null)
  const setMode = (m: AngleMode) => { setModeState(m); savePref('calc.angle', m) }
  const setMemory = (m: number) => { setMemoryState(m); savePref('calc.memory', m) }
  const setAns = (a: number) => { setAnsState(a); savePref('calc.ans', a) }
  const history = useLiveQuery(() => db.calcHistory.orderBy('at').reverse().limit(100).toArray(), [])

  const prepare = (s: string) => s.replace(/\bans\b/gi, `(${ans})`)
  const tryEval = (s: string): number => evaluate(prepare(s), mode)

  // Live preview while typing (errors are only shown on "=").
  const preview = useMemo(() => {
    if (!expr.trim() || justEvaluated) return null
    try { return show(tryEval(expr)) } catch { return null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expr, mode, ans, show, justEvaluated])

  const run = async () => {
    if (!expr.trim()) return
    try {
      const n = tryEval(expr)
      const shown = show(n)
      setResult(shown); setError(null); setAns(n); setJustEvaluated(true)
      await safeWrite(() => db.calcHistory.add({ id: uid(), at: Date.now(), expression: expr.trim(), result: shown, tool: scientific ? `scientific (${mode})` : 'standard' }))
    } catch (e) {
      setError(e instanceof MathError ? e.message : 'Could not evaluate this expression')
      setResult(null)
    }
  }

  const insert = (s: string) => {
    setError(null)
    if (justEvaluated) {
      // After "=", an operator continues from the answer; anything else starts a new expression.
      setJustEvaluated(false)
      setExpr(OPS.includes(s[0]) ? `Ans${s}` : s)
    } else setExpr((cur) => cur + s)
  }
  const clear = () => { setExpr(''); setResult(null); setError(null); setJustEvaluated(false) }
  const back = () => { setJustEvaluated(false); setExpr((c) => c.replace(/(sin|cos|tan|asin|acos|atan|sqrt|ln|log|abs|exp|Ans)\($|Ans$|.$/, '')) }
  const currentValue = (): number | null => {
    try { return expr.trim() ? tryEval(expr) : ans } catch (e) { setError(e instanceof MathError ? e.message : 'Invalid expression'); return null }
  }

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return
    if (el.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const k = e.key
    let handled = true
    if (/^[0-9.]$/.test(k) || '+-*/^%()!'.includes(k)) insert(k)
    else if (k === 'Enter' || k === '=') void run()
    else if (k === 'Backspace') back()
    else if (k === 'Escape' || k === 'Delete') clear()
    else handled = false
    if (handled) { e.preventDefault(); e.stopPropagation() }
  }

  const fnKey = (f: string) => ({ label: f, run: () => insert(`${f}(`) })
  const std: { label: string; run: () => void; tone?: 'op' | 'eq' | 'mem'; aria?: string }[] = [
    { label: 'MC', run: () => setMemory(0), tone: 'mem', aria: 'Memory clear' },
    { label: 'MR', run: () => insert(formatResult(memory)), tone: 'mem', aria: 'Memory recall' },
    { label: 'M+', run: () => { const v = currentValue(); if (v != null) setMemory(memory + v) }, tone: 'mem', aria: 'Add to memory' },
    { label: 'M−', run: () => { const v = currentValue(); if (v != null) setMemory(memory - v) }, tone: 'mem', aria: 'Subtract from memory' },
    { label: 'C', run: clear, tone: 'op', aria: 'Clear' },
    { label: '⌫', run: back, tone: 'op', aria: 'Backspace' },
    { label: '(', run: () => insert('(') , tone: 'op' },
    { label: ')', run: () => insert(')'), tone: 'op' },
    { label: '7', run: () => insert('7') }, { label: '8', run: () => insert('8') }, { label: '9', run: () => insert('9') },
    { label: '÷', run: () => insert('/'), tone: 'op', aria: 'Divide' },
    { label: '4', run: () => insert('4') }, { label: '5', run: () => insert('5') }, { label: '6', run: () => insert('6') },
    { label: '×', run: () => insert('*'), tone: 'op', aria: 'Multiply' },
    { label: '1', run: () => insert('1') }, { label: '2', run: () => insert('2') }, { label: '3', run: () => insert('3') },
    { label: '−', run: () => insert('-'), tone: 'op', aria: 'Minus' },
    { label: '0', run: () => insert('0') }, { label: '.', run: () => insert('.'), aria: 'Decimal point' },
    { label: '%', run: () => insert('%'), tone: 'op', aria: 'Percent or modulo' },
    { label: '+', run: () => insert('+'), tone: 'op', aria: 'Plus' },
    { label: 'Ans', run: () => insert('Ans'), tone: 'mem', aria: 'Insert previous answer' },
    { label: '^', run: () => insert('^'), tone: 'op', aria: 'Power' },
    { label: '±', run: () => { setJustEvaluated(false); setExpr((c) => (c ? `-(${c})` : '-')) }, tone: 'op', aria: 'Negate' },
    { label: '=', run: () => void run(), tone: 'eq', aria: 'Equals' },
  ]
  const sci = [
    ...['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'ln', 'log', 'abs', 'exp'].map(fnKey),
    { label: 'x²', run: () => insert('^2') }, { label: 'n!', run: () => insert('!') },
    { label: 'π', run: () => insert('pi') }, { label: 'e', run: () => insert('e') },
    { label: '1/x', run: () => { setJustEvaluated(false); setExpr((c) => `1/(${c || 'Ans'})`) } },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <div role="group" aria-label={scientific ? 'Scientific calculator' : 'Standard calculator'} tabIndex={0} onKeyDown={onKey}
          className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
          <div className="mb-3 rounded-2xl border border-line bg-raised/60 p-3 shadow-inner">
            <div className="flex items-center gap-2 text-xs text-muted">
              {scientific && (
                <div role="radiogroup" aria-label="Angle unit" className="flex overflow-hidden rounded-lg border border-line">
                  {(['deg', 'rad'] as const).map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                      className={cn('px-2 py-0.5 font-semibold uppercase', mode === m ? 'bg-accent text-white' : 'text-muted hover:text-fg')}>{m}</button>
                  ))}
                </div>
              )}
              {memory !== 0 && <Badge tone="accent">M = {formatResult(memory)}</Badge>}
              <span className="ml-auto">Ans = {formatResult(ans)}</span>
            </div>
            <label htmlFor="calc-expr" className="sr-only">Expression</label>
            <input id="calc-expr" ref={inputRef} value={expr} spellCheck={false} autoComplete="off" placeholder="Type an expression, e.g. 2(3+4)^2"
              onChange={(e) => { setExpr(e.target.value); setJustEvaluated(false); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run() } else if (e.key === 'Escape') { e.preventDefault(); clear() } }}
              className="mt-2 w-full bg-transparent text-right font-mono text-lg outline-none" />
            <div className="mt-1 min-h-[2.5rem] text-right font-mono text-3xl font-bold tabular-nums" aria-live="polite">
              {error ? <span className="text-base font-medium text-danger" role="alert">{error}</span>
                : result != null && justEvaluated ? <span>= {result}</span>
                : preview != null ? <span className="text-muted">{preview}</span> : null}
            </div>
          </div>
          {scientific && (
            <div className="mb-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
              {sci.map((k) => (
                <button key={k.label} type="button" onClick={k.run} aria-label={k.label === 'x²' ? 'Square' : k.label === 'n!' ? 'Factorial' : k.label === '1/x' ? 'Reciprocal' : k.label}
                  className="btn btn-soft h-10 px-1 text-xs font-semibold">{k.label}</button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            {std.map((k) => (
              <button key={k.label} type="button" onClick={k.run} aria-label={k.aria ?? k.label}
                className={cn('btn h-12 text-base font-semibold', k.tone === 'eq' ? 'btn-3d' : k.tone === 'op' ? 'btn-soft text-accent' : k.tone === 'mem' ? 'btn-soft text-sm text-muted' : 'btn-soft')}>
                {k.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Click the calculator to use your keyboard: digits, + − * / ^ % ( ) !, Enter to evaluate, Backspace, Esc to clear. “50%” means 0.5; “7 % 3” is modulo.
          </p>
        </div>
      </Card>
      <HistoryPanel history={history} onReuse={(h) => { setExpr(h.expression); setJustEvaluated(false); setError(null); inputRef.current?.focus() }} />
    </div>
  )
}

function HistoryPanel({ history, onReuse }: { history: { id: string; at: number; expression: string; result: string; tool: string }[] | undefined; onReuse: (h: { expression: string }) => void }) {
  const clearAll = async () => {
    if (!(await confirm({ title: 'Clear calculation history?', body: 'All saved calculations are permanently removed.', danger: true, confirmLabel: 'Clear history' }))) return
    await safeWrite(() => db.calcHistory.clear(), 'History cleared')
  }
  return (
    <Card>
      <CardTitle icon={History} action={<Button size="sm" variant="ghost" icon={Trash2} disabled={!history?.length} onClick={() => void clearAll()}>Clear</Button>}>History</CardTitle>
      {!history ? <Spinner /> : history.length === 0 ? (
        <EmptyState icon={History} title="No calculations yet">Results you evaluate are saved here. Click one to reuse it.</EmptyState>
      ) : (
        <ul className="max-h-[520px] space-y-1 overflow-y-auto">
          {history.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => onReuse(h)} className="w-full rounded-xl px-2 py-1.5 text-right hover:bg-raised" title="Reuse this expression">
                <div className="truncate font-mono text-xs text-muted">{h.expression}</div>
                <div className="truncate font-mono font-semibold">= {h.result}</div>
                <div className="text-[10px] text-muted">{h.tool} · {format(h.at, 'MMM d, HH:mm')}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/* ============================== Shared bits ============================== */

function NumInput({ id, label, value, onChange, hint, suffix }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; suffix?: string }) {
  const bad = value.trim() !== '' && num(value) == null
  return (
    <Field label={label} htmlFor={id} error={bad ? 'Enter a valid number.' : null} hint={hint}>
      <div className="relative">
        <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className={suffix ? 'pr-10' : undefined} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
      </div>
    </Field>
  )
}

function ResultRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line/60 py-1.5 text-sm first:border-t-0">
      <span className="text-muted">{label}</span>
      <button type="button" onClick={() => value !== '—' && void copyText(value)} title="Copy" className={cn('font-mono tabular-nums hover:text-accent', strong && 'text-lg font-bold')}>{value}</button>
    </div>
  )
}

/** Returns the numbers if all given strings are valid numbers, otherwise null. */
const nums = (...v: string[]) => {
  const out = v.map(num)
  return out.every((x) => x != null) ? (out as number[]) : null
}

/* ============================== Percentage ============================== */

function PercentageTool({ show }: { show: (n: number) => string }) {
  const [a, setA] = useState({ pct: '15', of: '200' })
  const [b, setB] = useState({ part: '30', whole: '120' })
  const [c, setC] = useState({ from: '80', to: '100' })
  const r1 = nums(a.pct, a.of), r2 = nums(b.part, b.whole), r3 = nums(c.from, c.to)
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardTitle icon={Percent}>X% of Y</CardTitle>
        <div className="grid grid-cols-2 gap-2">
          <NumInput id="p1" label="Percent (X)" value={a.pct} suffix="%" onChange={(v) => setA({ ...a, pct: v })} />
          <NumInput id="p2" label="Of (Y)" value={a.of} onChange={(v) => setA({ ...a, of: v })} />
        </div>
        <div className="mt-3"><ResultRow strong label="Result" value={r1 ? show(percentOf(r1[0], r1[1])) : '—'} /></div>
      </Card>
      <Card>
        <CardTitle icon={Percent}>X is what % of Y</CardTitle>
        <div className="grid grid-cols-2 gap-2">
          <NumInput id="p3" label="Part (X)" value={b.part} onChange={(v) => setB({ ...b, part: v })} />
          <NumInput id="p4" label="Whole (Y)" value={b.whole} onChange={(v) => setB({ ...b, whole: v })} />
        </div>
        <div className="mt-3">
          {r2 && r2[1] === 0 ? <p className="text-sm text-danger" role="alert">The whole cannot be zero.</p>
            : <ResultRow strong label="Percentage" value={r2 ? `${show(whatPercent(r2[0], r2[1]))}%` : '—'} />}
        </div>
      </Card>
      <Card>
        <CardTitle icon={Percent}>Percentage change</CardTitle>
        <div className="grid grid-cols-2 gap-2">
          <NumInput id="p5" label="From" value={c.from} onChange={(v) => setC({ ...c, from: v })} />
          <NumInput id="p6" label="To" value={c.to} onChange={(v) => setC({ ...c, to: v })} />
        </div>
        <div className="mt-3">
          {r3 && r3[0] === 0 ? <p className="text-sm text-danger" role="alert">Change from zero is undefined.</p> : (
            <>
              <ResultRow strong label={r3 && r3[1] < r3[0] ? 'Decrease' : 'Increase'} value={r3 ? `${show(percentChange(r3[0], r3[1]))}%` : '—'} />
              <ResultRow label="Difference" value={r3 ? show(r3[1] - r3[0]) : '—'} />
            </>
          )}
        </div>
      </Card>
    </div>
  )
}

/* ============================== Discount ============================== */

function DiscountTool({ show }: { show: (n: number) => string }) {
  const [f, setF] = useState({ price: '120', pct: '25', tax: '0' })
  const v = nums(f.price, f.pct, f.tax || '0')
  const err = !v ? null : v[0] < 0 ? 'Price cannot be negative.' : v[1] < 0 || v[1] > 100 ? 'Discount must be between 0 and 100%.' : v[2] < 0 ? 'Tax cannot be negative.' : null
  const r = v && !err ? discount(v[0], v[1], v[2]) : null
  return (
    <Card className="max-w-xl">
      <CardTitle icon={Tag}>Discount & tax</CardTitle>
      <div className="grid gap-2 sm:grid-cols-3">
        <NumInput id="d1" label="Original price" value={f.price} onChange={(x) => setF({ ...f, price: x })} />
        <NumInput id="d2" label="Discount" value={f.pct} suffix="%" onChange={(x) => setF({ ...f, pct: x })} />
        <NumInput id="d3" label="Sales tax" value={f.tax} suffix="%" onChange={(x) => setF({ ...f, tax: x })} />
      </div>
      {err && <p className="mt-2 text-sm text-danger" role="alert">{err}</p>}
      <div className="mt-3">
        <ResultRow label="You save" value={r ? show(r.saved) : '—'} />
        <ResultRow label="Price after discount" value={r ? show(r.after) : '—'} />
        <ResultRow label="Tax" value={r ? show(r.tax) : '—'} />
        <ResultRow strong label="Total to pay" value={r ? show(r.total) : '—'} />
      </div>
    </Card>
  )
}

/* ============================== Ratio ============================== */

function RatioTool({ show }: { show: (n: number) => string }) {
  const [s, setS] = useState({ a: '1920', b: '1080' })
  const [p, setP] = useState({ a: '3', b: '4', c: '9' })
  const sv = nums(s.a, s.b), pv = nums(p.a, p.b, p.c)
  const simplified = sv ? simplifyRatio(sv[0], sv[1]) : null
  const x = pv ? solveProportion(pv[0], pv[1], pv[2]) : NaN
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardTitle icon={Scale}>Simplify a ratio</CardTitle>
        <div className="grid grid-cols-2 gap-2">
          <NumInput id="r1" label="A" value={s.a} onChange={(v) => setS({ ...s, a: v })} />
          <NumInput id="r2" label="B" value={s.b} onChange={(v) => setS({ ...s, b: v })} />
        </div>
        <div className="mt-3">
          {sv && !simplified ? <p className="text-sm text-danger" role="alert">Both values cannot be zero.</p> : (
            <>
              <ResultRow strong label="Simplified" value={simplified ? `${simplified[0]} : ${simplified[1]}` : '—'} />
              <ResultRow label="As decimal (A ÷ B)" value={sv && sv[1] !== 0 ? show(sv[0] / sv[1]) : '—'} />
            </>
          )}
        </div>
      </Card>
      <Card>
        <CardTitle icon={Scale}>Solve a : b = c : x</CardTitle>
        <div className="grid grid-cols-3 gap-2">
          <NumInput id="r3" label="a" value={p.a} onChange={(v) => setP({ ...p, a: v })} />
          <NumInput id="r4" label="b" value={p.b} onChange={(v) => setP({ ...p, b: v })} />
          <NumInput id="r5" label="c" value={p.c} onChange={(v) => setP({ ...p, c: v })} />
        </div>
        <div className="mt-3">
          {pv && pv[0] === 0 ? <p className="text-sm text-danger" role="alert">“a” cannot be zero.</p>
            : <ResultRow strong label="x" value={pv ? show(x) : '—'} />}
        </div>
      </Card>
    </div>
  )
}

/* ============================== Statistics ============================== */

function StatsTool({ show }: { show: (n: number) => string }) {
  const [text, setText] = useState('4, 8, 15, 16, 23, 42')
  const { values, invalid } = useMemo(() => parseNumberList(text), [text])
  const st = useMemo(() => stats(values), [values])
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardTitle icon={BarChart3}>Numbers</CardTitle>
        <Field label="Enter numbers separated by commas, spaces or new lines" htmlFor="st-in"
          error={invalid.length ? `Ignored ${invalid.length} invalid value${invalid.length > 1 ? 's' : ''}: ${invalid.slice(0, 10).join(', ')}${invalid.length > 10 ? '…' : ''}` : null}>
          <Textarea id="st-in" rows={8} value={text} onChange={(e) => setText(e.target.value)} className="font-mono" />
        </Field>
        <p className="mt-2 text-xs text-muted">{values.length} valid number{values.length === 1 ? '' : 's'}</p>
      </Card>
      <Card>
        <CardTitle icon={BarChart3}>Results</CardTitle>
        {!st ? <p className="text-sm text-muted">Enter at least one number.</p> : (
          <div>
            <ResultRow label="Count" value={String(st.count)} />
            <ResultRow label="Sum" value={show(st.sum)} />
            <ResultRow strong label="Mean" value={show(st.mean)} />
            <ResultRow label="Median" value={show(st.median)} />
            <ResultRow label="Mode" value={st.mode.length ? st.mode.map(show).join(', ') : 'No mode'} />
            <ResultRow label="Minimum" value={show(st.min)} />
            <ResultRow label="Maximum" value={show(st.max)} />
            <ResultRow label="Range" value={show(st.range)} />
            <ResultRow label="Q1 / Q3" value={`${show(st.q1)} / ${show(st.q3)}`} />
            <ResultRow label="Variance (population)" value={show(st.variance)} />
            <ResultRow label="Std deviation (population)" value={show(st.stdDev)} />
            <ResultRow label="Std deviation (sample)" value={st.count > 1 ? show(st.sampleStdDev) : '—'} />
          </div>
        )}
      </Card>
    </div>
  )
}

/* ============================== Date & time ============================== */

const validISO = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(parseDate(s))

function DateTimeTool({ show }: { show: (n: number) => string }) {
  const [diff, setDiff] = useState({ a: todayISO(), b: toISODate(addDays(new Date(), 30)) })
  const [add, setAdd] = useState({ date: todayISO(), n: '14', unit: 'days' as 'days' | 'weeks' | 'months' | 'workdays', op: 'add' as 'add' | 'sub' })
  const [age, setAge] = useState({ birth: '1990-01-01', asOf: todayISO() })
  const [dur, setDur] = useState({ start: '09:00', end: '17:30' })

  const diffOk = validISO(diff.a) && validISO(diff.b)
  const days = diffOk ? daysBetween(diff.a, diff.b) : 0

  const n = num(add.n)
  const addErr = !validISO(add.date) ? 'Choose a valid date.' : n == null || !Number.isInteger(n) || Math.abs(n) > 100000 ? 'Enter a whole number.' : null
  let added: string | null = null
  if (!addErr) {
    const k = add.op === 'add' ? n! : -n!
    const d = parseDate(add.date)
    added = add.unit === 'workdays' ? addWorkingDays(add.date, k) : toISODate(add.unit === 'days' ? addDays(d, k) : add.unit === 'weeks' ? addWeeks(d, k) : addMonths(d, k))
  }

  const ageOk = validISO(age.birth) && validISO(age.asOf)
  const ageErr = ageOk && age.birth > age.asOf ? 'Birth date must be before the “as of” date.' : !ageOk ? 'Choose valid dates.' : null
  let ageRes: { y: number; m: number; d: number; total: number; next: number } | null = null
  if (!ageErr) {
    const b = parseDate(age.birth), o = parseDate(age.asOf)
    const i = intervalToDuration({ start: b, end: o })
    let next = setYear(b, o.getFullYear())
    if (differenceInCalendarDays(next, o) < 0) next = setYear(b, o.getFullYear() + 1)
    ageRes = { y: i.years ?? 0, m: i.months ?? 0, d: i.days ?? 0, total: differenceInCalendarDays(o, b), next: differenceInCalendarDays(next, o) }
  }

  const tm = (s: string) => { const m = s.match(/^(\d{2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
  const s1 = tm(dur.start), s2 = tm(dur.end)
  let mins = s1 != null && s2 != null ? s2 - s1 : null
  const overnight = mins != null && mins < 0
  if (mins != null && mins < 0) mins += 24 * 60

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardTitle icon={CalendarDays}>Difference between dates</CardTitle>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start date" htmlFor="dd-a"><Input id="dd-a" type="date" value={diff.a} onChange={(e) => setDiff({ ...diff, a: e.target.value })} /></Field>
          <Field label="End date" htmlFor="dd-b"><Input id="dd-b" type="date" value={diff.b} onChange={(e) => setDiff({ ...diff, b: e.target.value })} /></Field>
        </div>
        <div className="mt-3">
          {!diffOk ? <p className="text-sm text-danger" role="alert">Choose two valid dates.</p> : (
            <>
              <ResultRow strong label="Days" value={String(days)} />
              <ResultRow label="Weeks" value={`${Math.trunc(days / 7)} weeks ${Math.abs(days % 7)} days (${show(days / 7)})`} />
              <ResultRow label="Months (whole)" value={String(differenceInMonths(parseDate(diff.b), parseDate(diff.a)))} />
              <ResultRow label="Working days (Mon–Fri, inclusive)" value={String(workingDaysBetween(diff.a, diff.b))} />
            </>
          )}
        </div>
      </Card>
      <Card>
        <CardTitle icon={CalendarDays}>Add or subtract time</CardTitle>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date" htmlFor="ad-d"><Input id="ad-d" type="date" value={add.date} onChange={(e) => setAdd({ ...add, date: e.target.value })} /></Field>
          <Field label="Operation" htmlFor="ad-op">
            <Select id="ad-op" value={add.op} onChange={(e) => setAdd({ ...add, op: e.target.value as 'add' | 'sub' })}><option value="add">Add</option><option value="sub">Subtract</option></Select>
          </Field>
          <Field label="Amount" htmlFor="ad-n"><Input id="ad-n" inputMode="numeric" value={add.n} onChange={(e) => setAdd({ ...add, n: e.target.value })} /></Field>
          <Field label="Unit" htmlFor="ad-u">
            <Select id="ad-u" value={add.unit} onChange={(e) => setAdd({ ...add, unit: e.target.value as typeof add.unit })}>
              <option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="workdays">Working days</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          {addErr ? <p className="text-sm text-danger" role="alert">{addErr}</p> : <ResultRow strong label="Result" value={format(parseDate(added!), 'EEEE, MMMM d, yyyy')} />}
        </div>
      </Card>
      <Card>
        <CardTitle icon={CalendarDays}>Age calculator</CardTitle>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date of birth" htmlFor="ag-b"><Input id="ag-b" type="date" value={age.birth} onChange={(e) => setAge({ ...age, birth: e.target.value })} /></Field>
          <Field label="Age as of" htmlFor="ag-o"><Input id="ag-o" type="date" value={age.asOf} onChange={(e) => setAge({ ...age, asOf: e.target.value })} /></Field>
        </div>
        <div className="mt-3">
          {ageErr || !ageRes ? <p className="text-sm text-danger" role="alert">{ageErr}</p> : (
            <>
              <ResultRow strong label="Age" value={`${ageRes.y} years, ${ageRes.m} months, ${ageRes.d} days`} />
              <ResultRow label="Total days" value={ageRes.total.toLocaleString()} />
              <ResultRow label="Next birthday" value={ageRes.next === 0 ? 'Today!' : `in ${ageRes.next} days`} />
            </>
          )}
        </div>
      </Card>
      <Card>
        <CardTitle icon={CalendarDays}>Duration between times</CardTitle>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start time" htmlFor="du-s"><Input id="du-s" type="time" value={dur.start} onChange={(e) => setDur({ ...dur, start: e.target.value })} /></Field>
          <Field label="End time" htmlFor="du-e"><Input id="du-e" type="time" value={dur.end} onChange={(e) => setDur({ ...dur, end: e.target.value })} /></Field>
        </div>
        <div className="mt-3">
          {mins == null ? <p className="text-sm text-danger" role="alert">Choose two valid times.</p> : (
            <>
              <ResultRow strong label="Duration" value={`${Math.floor(mins / 60)} h ${mins % 60} min`} />
              <ResultRow label="In hours" value={show(mins / 60)} />
              <ResultRow label="In minutes" value={String(mins)} />
              {overnight && <p className="mt-1 text-xs text-muted">End is earlier than start, so this assumes the period crosses midnight.</p>}
            </>
          )}
        </div>
      </Card>
    </div>
  )
}

/* ============================== Units ============================== */

const CATEGORY_LABEL: Record<UnitCategory, string> = {
  length: 'Length', mass: 'Mass / weight', volume: 'Volume', area: 'Area', speed: 'Speed', time: 'Time', data: 'Data size', temperature: 'Temperature',
}

function UnitsTool({ show }: { show: (n: number) => string }) {
  const [cat, setCat] = useState<UnitCategory>('length')
  const units = Object.keys(UNITS[cat])
  const [from, setFrom] = useState(units[0])
  const [to, setTo] = useState(units[1])
  const [value, setValue] = useState('1')
  const changeCat = (c: UnitCategory) => { const u = Object.keys(UNITS[c]); setCat(c); setFrom(u[0]); setTo(u[1]) }
  const v = num(value)
  const out = v == null ? NaN : convertUnit(v, cat, from, to)
  const err = value.trim() && v == null ? 'Enter a valid number.' : v != null && !Number.isFinite(out) ? 'Below absolute zero — not a valid temperature.' : null

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardTitle icon={Ruler}>Unit converter</CardTitle>
        <div className="space-y-3">
          <Field label="Category" htmlFor="u-cat">
            <Select id="u-cat" value={cat} onChange={(e) => changeCat(e.target.value as UnitCategory)}>
              {(Object.keys(UNITS) as UnitCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </Select>
          </Field>
          <Field label="Value" htmlFor="u-val" error={err}><Input id="u-val" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
          <div className="flex items-end gap-2">
            <Field label="From" htmlFor="u-from" className="flex-1">
              <Select id="u-from" value={from} onChange={(e) => setFrom(e.target.value)}>{units.map((u) => <option key={u}>{u}</option>)}</Select>
            </Field>
            <IconButton icon={ArrowLeftRight} label="Swap units" onClick={() => { setFrom(to); setTo(from) }} className="mb-0.5" />
            <Field label="To" htmlFor="u-to" className="flex-1">
              <Select id="u-to" value={to} onChange={(e) => setTo(e.target.value)}>{units.map((u) => <option key={u}>{u}</option>)}</Select>
            </Field>
          </div>
          <ResultRow strong label={`${value || '—'} ${from} =`} value={err || v == null ? '—' : `${show(out)} ${to}`} />
        </div>
      </Card>
      <Card>
        <CardTitle icon={Ruler}>All {CATEGORY_LABEL[cat].toLowerCase()} units</CardTitle>
        {err || v == null ? <p className="text-sm text-muted">Enter a valid value to see every conversion.</p> : (
          <div>{units.map((u) => <ResultRow key={u} label={u} value={show(convertUnit(v, cat, from, u))} />)}</div>
        )}
      </Card>
    </div>
  )
}
