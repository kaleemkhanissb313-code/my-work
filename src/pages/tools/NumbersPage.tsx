import { useMemo, useState } from 'react'
import { Copy, Download, Hash } from 'lucide-react'
import { Badge, Button, Card, CardTitle, Field, Input, PageHeader, Select } from '@/components/ui'
import { formatNumber, isPrime, parseNumberList, roundTo, sequence, stats, toBase, toRoman, type SequenceKind } from '@/lib/numbers'
import { cleanNumber } from '@/lib/mathParser'
import { copyText, num } from '@/features/tools/clipboard'
import { downloadText } from '@/services/backup'
import { toCSV } from '@/lib/csv'

const LOCALES = ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'ur-PK', 'hi-IN', 'ar-SA', 'ja-JP', 'zh-CN']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'PKR', 'INR', 'AED', 'JPY', 'CNY']

function Out({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm"><span className="w-28 shrink-0 text-xs text-muted">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-lg bg-raised px-2 py-1">{value}</code>
      <button type="button" className="text-muted hover:text-fg" aria-label={`Copy ${label}`} onClick={() => void copyText(value, label)}><Copy className="h-4 w-4" /></button>
    </div>
  )
}

function Formatting() {
  const [v, setV] = useState('1234567.891')
  const [locale, setLocale] = useState('en-US')
  const [currency, setCurrency] = useState('USD')
  const [dec, setDec] = useState('2')
  const n = num(v), d = Math.max(0, Math.min(20, Number(dec) || 0))
  return (
    <Card><CardTitle icon={Hash}>Number formatting & rounding</CardTitle>
      <div className="mb-3 grid gap-3 sm:grid-cols-4">
        <Field label="Number" htmlFor="nf-v" error={v && n == null ? 'Not a valid number' : null} className="sm:col-span-2"><Input id="nf-v" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} /></Field>
        <Field label="Locale" htmlFor="nf-l"><Select id="nf-l" value={locale} onChange={(e) => setLocale(e.target.value)}>{LOCALES.map((l) => <option key={l}>{l}</option>)}</Select></Field>
        <Field label="Decimals" htmlFor="nf-d"><Input id="nf-d" type="number" min={0} max={20} value={dec} onChange={(e) => setDec(e.target.value)} /></Field>
        <Field label="Currency" htmlFor="nf-c"><Select id="nf-c" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      </div>
      {n != null && <div className="space-y-1.5">
        <Out label="Decimal" value={formatNumber(n, { locale, decimals: d })} />
        <Out label="Currency" value={formatNumber(n, { style: 'currency', currency, locale, decimals: d })} />
        <Out label="Percent" value={formatNumber(n, { style: 'percent', locale, decimals: d })} />
        <Out label="Compact" value={formatNumber(n, { style: 'compact', locale })} />
        <Out label="Scientific" value={formatNumber(n, { style: 'scientific', locale, decimals: d })} />
        <Out label="Round" value={String(roundTo(n, d))} />
        <Out label="Floor / Ceil" value={`${roundTo(n, d, 'floor')} / ${roundTo(n, d, 'ceil')}`} />
        <Out label="Truncate" value={String(roundTo(n, d, 'trunc'))} />
      </div>}
    </Card>
  )
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
function toFraction(x: number): string {
  if (Number.isInteger(x)) return `${x}/1`
  const s = String(cleanNumber(x)).split('.')[1] ?? ''
  if (s.length > 9) return '≈ ' + approxFraction(x)
  const den = 10 ** s.length, numr = Math.round(x * den), g = gcd(Math.abs(numr), den)
  return `${numr / g}/${den / g}`
}
function approxFraction(x: number) {
  let best = [0, 1], err = Infinity
  for (let d = 1; d <= 10000; d++) { const n = Math.round(x * d), e = Math.abs(x - n / d); if (e < err) { err = e; best = [n, d] } if (e < 1e-9) break }
  return `${best[0]}/${best[1]}`
}
function parseFraction(s: string): number | null {
  const m = s.trim().match(/^(-?\d+)\s*\/\s*(\d+)$/)
  if (m) return Number(m[2]) === 0 ? null : Number(m[1]) / Number(m[2])
  const p = s.trim().match(/^(-?[\d.]+)\s*%$/)
  if (p) return num(p[1]) == null ? null : Number(p[1]) / 100
  return num(s)
}

function Conversions() {
  const [v, setV] = useState('0.375')
  const x = parseFraction(v)
  return (
    <Card><CardTitle icon={Hash}>Percent ↔ decimal ↔ fraction</CardTitle>
      <Field label="Enter a decimal (0.375), percentage (37.5%) or fraction (3/8)" htmlFor="pc-v" error={v && x == null ? 'Could not read that value' : null}>
        <Input id="pc-v" value={v} onChange={(e) => setV(e.target.value)} />
      </Field>
      {x != null && <div className="mt-3 space-y-1.5">
        <Out label="Decimal" value={String(cleanNumber(x))} />
        <Out label="Percentage" value={`${cleanNumber(x * 100)}%`} />
        <Out label="Fraction" value={toFraction(x)} />
      </div>}
    </Card>
  )
}

const BASES = { 2: 'Binary', 8: 'Octal', 10: 'Decimal', 16: 'Hexadecimal' } as const
const VALID = { 2: /^-?[01]+$/, 8: /^-?[0-7]+$/, 10: /^-?\d+$/, 16: /^-?[0-9a-f]+$/i }
const ROMAN_VAL: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }
function fromRoman(s: string): number | null {
  const t = s.trim().toUpperCase()
  if (!/^[IVXLCDM]+$/.test(t)) return null
  let n = 0
  for (let i = 0; i < t.length; i++) { const a = ROMAN_VAL[t[i]], b = ROMAN_VAL[t[i + 1]] ?? 0; n += a < b ? -a : a }
  return toRoman(n) === t ? n : null // reject non-canonical forms like IIII or VX
}

function Bases() {
  const [v, setV] = useState('255')
  const [base, setBase] = useState<2 | 8 | 10 | 16>(10)
  const [roman, setRoman] = useState('MMXXVI')
  const valid = VALID[base].test(v.trim())
  const n = valid ? parseInt(v.trim(), base) : null
  const safe = n != null && Number.isSafeInteger(n)
  const r = fromRoman(roman)
  return (
    <Card><CardTitle icon={Hash}>Bases, Roman numerals & primes</CardTitle>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Whole number" htmlFor="b-v" error={v && !valid ? `Not a valid ${BASES[base].toLowerCase()} number` : n != null && !safe ? 'Number too large' : null}><Input id="b-v" value={v} onChange={(e) => setV(e.target.value)} /></Field>
        <Field label="Input base" htmlFor="b-b"><Select id="b-b" value={base} onChange={(e) => setBase(Number(e.target.value) as 2)}>{Object.entries(BASES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      </div>
      {n != null && safe && <div className="mt-3 space-y-1.5">
        {Object.entries(BASES).map(([k, l]) => <Out key={k} label={l} value={toBase(n, Number(k)) ?? ''} />)}
        <Out label="Roman" value={toRoman(n) ?? 'Only 1–3999'} />
        <div className="flex items-center gap-2 text-sm"><span className="w-28 text-xs text-muted">Prime?</span><Badge tone={isPrime(n) ? 'ok' : 'muted'}>{isPrime(n) ? 'Prime' : 'Not prime'}</Badge></div>
      </div>}
      <Field label="Roman numeral → number" htmlFor="rom" className="mt-4" error={roman && r == null ? 'Not a valid Roman numeral (I–MMMCMXCIX)' : null}><Input id="rom" value={roman} onChange={(e) => setRoman(e.target.value)} /></Field>
      {r != null && <div className="mt-2"><Out label="Value" value={String(r)} /></div>}
    </Card>
  )
}

function Statistics() {
  const [v, setV] = useState('4, 8, 15, 16, 23, 42')
  const { values, invalid } = parseNumberList(v)
  const s = stats(values)
  const f = (n: number) => String(cleanNumber(n, 10))
  return (
    <Card><CardTitle icon={Hash}>Basic statistics</CardTitle>
      <Field label="Numbers (separated by commas, spaces or new lines)" htmlFor="st-v" error={invalid.length ? `Ignored: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? '…' : ''}` : null}>
        <textarea id="st-v" className="input min-h-[80px]" value={v} onChange={(e) => setV(e.target.value)} />
      </Field>
      {s ? <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {([['Count', s.count], ['Sum', s.sum], ['Mean', s.mean], ['Median', s.median], ['Min', s.min], ['Max', s.max], ['Range', s.range], ['Std dev (pop.)', s.stdDev], ['Std dev (sample)', s.sampleStdDev], ['Q1 / Q3', null]] as [string, number | null][]).map(([l, n]) => (
          <Out key={l} label={l} value={n == null ? `${f(s.q1)} / ${f(s.q3)}` : f(n)} />
        ))}
        <Out label="Mode" value={s.mode.length ? s.mode.map(f).join(', ') : 'none'} />
      </div> : <p className="mt-2 text-sm text-muted">Enter at least one number.</p>}
    </Card>
  )
}

function Sequences() {
  const [kind, setKind] = useState<SequenceKind>('arithmetic')
  const [count, setCount] = useState('10')
  const [start, setStart] = useState('1')
  const [step, setStep] = useState('2')
  const c = Number(count), st = num(start), sp = num(step)
  const err = !Number.isInteger(c) || c < 1 || c > 1000 ? 'Count must be 1–1000' : st == null || (['arithmetic', 'geometric'].includes(kind) && sp == null) ? 'Enter valid numbers' : null
  const seq = useMemo(() => (err ? [] : sequence(kind, c, st!, sp ?? 1)), [err, kind, c, st, sp])
  return (
    <Card><CardTitle icon={Hash} action={<div className="flex gap-2">
      <Button size="sm" icon={Copy} disabled={!seq.length} onClick={() => void copyText(seq.join(', '), 'Sequence')}>Copy</Button>
      <Button size="sm" icon={Download} disabled={!seq.length} onClick={() => downloadText(toCSV([['n', 'value'], ...seq.map((x, i) => [i + 1, x])]), `${kind}-sequence.csv`, 'text/csv')}>CSV</Button>
    </div>}>Sequence generator</CardTitle>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Type" htmlFor="sq-k"><Select id="sq-k" value={kind} onChange={(e) => setKind(e.target.value as SequenceKind)}>{['arithmetic', 'geometric', 'fibonacci', 'primes', 'squares'].map((k) => <option key={k}>{k}</option>)}</Select></Field>
        <Field label="Count" htmlFor="sq-c"><Input id="sq-c" type="number" min={1} max={1000} value={count} onChange={(e) => setCount(e.target.value)} /></Field>
        {kind !== 'fibonacci' && <Field label={kind === 'primes' ? 'Start from' : 'Start'} htmlFor="sq-s"><Input id="sq-s" value={start} onChange={(e) => setStart(e.target.value)} /></Field>}
        {(kind === 'arithmetic' || kind === 'geometric') && <Field label={kind === 'geometric' ? 'Ratio' : 'Step'} htmlFor="sq-p"><Input id="sq-p" value={step} onChange={(e) => setStep(e.target.value)} /></Field>}
      </div>
      {err ? <p className="mt-2 text-sm text-danger" role="alert">{err}</p> : <p className="mt-3 max-h-40 overflow-auto break-words rounded-xl bg-raised p-3 font-mono text-xs">{seq.map((x) => String(cleanNumber(x))).join(', ')}</p>}
    </Card>
  )
}

export function NumbersPage() {
  return (
    <div>
      <PageHeader title="Number Tools" description="Formatting, rounding, conversions, bases, statistics and sequences." icon={Hash} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Formatting /><Conversions /><Bases /><Statistics /><div className="lg:col-span-2"><Sequences /></div>
      </div>
    </div>
  )
}
