/**
 * Spreadsheet formula engine (pure, safe — no eval).
 * Supports: numbers, "strings", TRUE/FALSE, cell refs (A1, $B$2), ranges (A1:C9), + - * / ^ %, & (concat),
 * comparisons = <> < > <= >=, parentheses, and functions:
 *   SUM AVERAGE MIN MAX COUNT COUNTA IF AND OR NOT ROUND ROUNDUP ROUNDDOWN ABS PERCENT IFERROR CONCAT LEN UPPER LOWER
 * Errors are values: #DIV/0!  #VALUE!  #REF!  #NAME?  #CIRC!  #ERROR!
 */
export type CellValue = number | string | boolean | null
export class FErr { constructor(public code: '#DIV/0!' | '#VALUE!' | '#REF!' | '#NAME?' | '#CIRC!' | '#ERROR!') {} toString() { return this.code } }
export type Value = CellValue | FErr
type V = Value | Value[]

/* ---------- A1 helpers ---------- */
export const colLetter = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }
export const colIndex = (letters: string) => letters.toUpperCase().split('').reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0) - 1
export const cellName = (r: number, c: number) => `${colLetter(c)}${r + 1}`
export function parseRef(ref: string): { r: number; c: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,6})$/.exec(ref)
  if (!m) return null
  return { r: Number(m[2]) - 1, c: colIndex(m[1]) }
}

/* ---------- Tokenizer ---------- */
type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'ref'; v: string } | { t: 'range'; a: string; b: string } | { t: 'fn'; v: string } | { t: 'bool'; v: boolean } | { t: 'op'; v: string }
function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '"') {
      let j = i + 1, s = ''
      while (j < src.length) { if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue } break } s += src[j++] }
      if (j >= src.length) throw new FErr('#ERROR!')
      out.push({ t: 'str', v: s }); i = j + 1; continue
    }
    if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(?:[eE][-+]?\d+)?|^\d+\.?/.exec(src.slice(i))!
      out.push({ t: 'num', v: Number(m[0]) }); i += m[0].length; continue
    }
    if (/[A-Za-z$_]/.test(c)) {
      const m = /^\$?[A-Za-z]{1,3}\$?\d{1,6}(?::\$?[A-Za-z]{1,3}\$?\d{1,6})?/.exec(src.slice(i))
      const w = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i))
      if (m && (!w || m[0].length >= w[0].length)) {
        const [a, b] = m[0].split(':')
        out.push(b ? { t: 'range', a, b } : { t: 'ref', v: a }); i += m[0].length; continue
      }
      if (w) {
        const up = w[0].toUpperCase()
        i += w[0].length
        if (up === 'TRUE' || up === 'FALSE') out.push({ t: 'bool', v: up === 'TRUE' })
        else out.push({ t: 'fn', v: up })
        continue
      }
    }
    const two = src.slice(i, i + 2)
    if (two === '<>' || two === '<=' || two === '>=') { out.push({ t: 'op', v: two }); i += 2; continue }
    if ('+-*/^%&=<>(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue }
    throw new FErr('#ERROR!')
  }
  return out
}

/* ---------- Coercion ---------- */
const isErr = (v: unknown): v is FErr => v instanceof FErr
function num(v: Value): number | FErr {
  if (isErr(v)) return v
  if (v == null || v === '') return 0
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number') return v
  const s = v.trim().replace(/,/g, '').replace(/^Rs\.?\s*/i, '')
  if (/%$/.test(s) && Number.isFinite(Number(s.slice(0, -1)))) return Number(s.slice(0, -1)) / 100
  const n = Number(s)
  return s !== '' && Number.isFinite(n) ? n : new FErr('#VALUE!')
}
const str = (v: Value): string => (v == null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v))
const truthy = (v: Value): boolean | FErr => { if (isErr(v)) return v; if (typeof v === 'string') { const n = num(v); return isErr(n) ? v.length > 0 : n !== 0 } return !!v }
const flat = (args: V[]): Value[] => args.flatMap((a) => (Array.isArray(a) ? a : [a]))
/** Numeric aggregate: in ranges, text/blank cells are skipped (like Excel); direct args must be numeric. */
function nums(args: V[]): number[] | FErr {
  const out: number[] = []
  for (const a of args) {
    if (Array.isArray(a)) { for (const v of a) { if (isErr(v)) return v; if (typeof v === 'number') out.push(v); else if (typeof v === 'string' && v.trim() && !isErr(num(v))) out.push(num(v) as number) } }
    else { const n = num(a); if (isErr(n)) return n; out.push(n) }
  }
  return out
}
const roundTo = (x: number, d: number, mode: 'round' | 'up' | 'down') => { const f = 10 ** d; const v = x * f; const r = mode === 'round' ? Math.round(v + Math.sign(v) * 1e-9) : mode === 'up' ? Math.sign(v) * Math.ceil(Math.abs(v) - 1e-9) : Math.trunc(v); return r / f }

const FUNCS: Record<string, (args: V[]) => Value> = {
  SUM: (a) => { const n = nums(a); return isErr(n) ? n : n.reduce((x, y) => x + y, 0) },
  AVERAGE: (a) => { const n = nums(a); return isErr(n) ? n : n.length ? n.reduce((x, y) => x + y, 0) / n.length : new FErr('#DIV/0!') },
  MIN: (a) => { const n = nums(a); return isErr(n) ? n : n.length ? Math.min(...n) : 0 },
  MAX: (a) => { const n = nums(a); return isErr(n) ? n : n.length ? Math.max(...n) : 0 },
  COUNT: (a) => flat(a).filter((v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isErr(num(v)))).length,
  COUNTA: (a) => flat(a).filter((v) => v != null && v !== '').length,
  IF: (a) => { if (a.length < 2) return new FErr('#VALUE!'); const c = truthy(a[0] as Value); if (isErr(c)) return c; return (c ? a[1] : a[2] ?? false) as Value },
  AND: (a) => { for (const v of flat(a)) { const t = truthy(v); if (isErr(t)) return t; if (!t) return false } return true },
  OR: (a) => { for (const v of flat(a)) { const t = truthy(v); if (isErr(t)) return t; if (t) return true } return false },
  NOT: (a) => { const t = truthy(a[0] as Value); return isErr(t) ? t : !t },
  ROUND: (a) => { const x = num(a[0] as Value), d = num((a[1] ?? 0) as Value); return isErr(x) ? x : isErr(d) ? d : roundTo(x, d, 'round') },
  ROUNDUP: (a) => { const x = num(a[0] as Value), d = num((a[1] ?? 0) as Value); return isErr(x) ? x : isErr(d) ? d : roundTo(x, d, 'up') },
  ROUNDDOWN: (a) => { const x = num(a[0] as Value), d = num((a[1] ?? 0) as Value); return isErr(x) ? x : isErr(d) ? d : roundTo(x, d, 'down') },
  ABS: (a) => { const x = num(a[0] as Value); return isErr(x) ? x : Math.abs(x) },
  /** PERCENT(part, whole) → part / whole × 100 */
  PERCENT: (a) => { const p = num(a[0] as Value), w = num(a[1] as Value); return isErr(p) ? p : isErr(w) ? w : w === 0 ? new FErr('#DIV/0!') : (p / w) * 100 },
  IFERROR: (a) => (isErr(a[0]) ? (a[1] as Value) ?? '' : (a[0] as Value)),
  CONCAT: (a) => flat(a).map(str).join(''),
  LEN: (a) => str(a[0] as Value).length,
  UPPER: (a) => str(a[0] as Value).toUpperCase(),
  LOWER: (a) => str(a[0] as Value).toLowerCase(),
}
export const FUNCTION_NAMES = Object.keys(FUNCS)

/* ---------- Parser / evaluator ---------- */
export interface Resolver { cell: (r: number, c: number) => Value; rows: number; cols: number }

export function evalFormula(src: string, res: Resolver): Value {
  let toks: Tok[]
  try { toks = tokenize(src) } catch (e) { return e instanceof FErr ? e : new FErr('#ERROR!') }
  let p = 0
  const peek = () => toks[p]
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v
  const refVal = (ref: string): Value => { const x = parseRef(ref); if (!x || x.r >= res.rows || x.c >= res.cols) return new FErr('#REF!'); return res.cell(x.r, x.c) }
  const rangeVals = (a: string, b: string): Value[] | FErr => {
    const x = parseRef(a), y = parseRef(b)
    if (!x || !y) return new FErr('#REF!')
    const out: Value[] = []
    for (let r = Math.min(x.r, y.r); r <= Math.max(x.r, y.r); r++) for (let c = Math.min(x.c, y.c); c <= Math.max(x.c, y.c); c++) {
      if (r >= res.rows || c >= res.cols) continue
      out.push(res.cell(r, c))
    }
    return out
  }

  const binNum = (a: Value, b: Value, f: (x: number, y: number) => number | FErr): Value => { const x = num(a), y = num(b); if (isErr(x)) return x; if (isErr(y)) return y; const r = f(x, y); return isErr(r) ? r : Number.isFinite(r) ? r : new FErr('#VALUE!') }
  function cmp(): V {
    let l = concat()
    while (peek()?.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes((peek() as { v: string }).v)) {
      const op = (toks[p++] as { v: string }).v
      const r = concat()
      const a = l as Value, b = r as Value
      if (isErr(a)) return a
      if (isErr(b)) return b
      const na = typeof a === 'number' || typeof b === 'number' ? num(a) : null, nb = na != null ? num(b) : null
      const [x, y]: [number | string, number | string] = na != null && !isErr(na) && nb != null && !isErr(nb) ? [na, nb] : [str(a).toLowerCase(), str(b).toLowerCase()]
      l = op === '=' ? x === y : op === '<>' ? x !== y : op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y
    }
    return l
  }
  function concat(): V {
    let l = add()
    while (isOp('&')) { p++; const r = add(); if (isErr(l)) return l; if (isErr(r)) return r; l = str(l as Value) + str(r as Value) }
    return l
  }
  function add(): V {
    let l = mul()
    while (isOp('+') || isOp('-')) { const op = (toks[p++] as { v: string }).v; const r = mul(); l = binNum(l as Value, r as Value, (x, y) => (op === '+' ? x + y : x - y)) }
    return l
  }
  function mul(): V {
    let l = unary()
    while (isOp('*') || isOp('/')) { const op = (toks[p++] as { v: string }).v; const r = unary(); l = binNum(l as Value, r as Value, (x, y) => (op === '*' ? x * y : y === 0 ? new FErr('#DIV/0!') : x / y)) }
    return l
  }
  // Unary minus binds looser than ^ so -A1^2 = -(A1^2); the exponent may be signed (2^-1).
  function unary(): V {
    if (isOp('-')) { p++; const v = unary(); return binNum(0, v as Value, (_x, y) => -y) }
    if (isOp('+')) { p++; return unary() }
    return pow()
  }
  function pow(): V {
    const b = postfix()
    if (isOp('^')) { p++; const e = unary(); return binNum(b as Value, e as Value, (x, y) => x ** y) }
    return b
  }
  function postfix(): V {
    let v = primary()
    while (isOp('%')) { p++; v = binNum(v as Value, 0, (x) => x / 100) }
    return v
  }
  function primary(): V {
    const k = toks[p++]
    if (!k) throw new FErr('#ERROR!')
    switch (k.t) {
      case 'num': return k.v
      case 'str': return k.v
      case 'bool': return k.v
      case 'ref': return refVal(k.v)
      case 'range': { const r = rangeVals(k.a, k.b); return isErr(r) ? r : r }
      case 'fn': {
        const f = FUNCS[k.v]
        if (!isOp('(')) throw new FErr('#NAME?')
        p++
        const args: V[] = []
        if (!isOp(')')) { for (;;) { args.push(cmp()); if (isOp(',')) { p++; continue } break } }
        if (!isOp(')')) throw new FErr('#ERROR!')
        p++
        if (!f) return new FErr('#NAME?')
        // Lazy IFERROR semantics: errors in args are passed as values.
        if (k.v !== 'IFERROR' && k.v !== 'IF') for (const a of args) if (isErr(a)) return a
        if (k.v === 'IF' && isErr(args[0])) return args[0] as FErr
        return f(args)
      }
      case 'op':
        if (k.v === '(') { const v = cmp(); if (!isOp(')')) throw new FErr('#ERROR!'); p++; return v }
        throw new FErr('#ERROR!')
    }
  }
  try {
    const v = cmp()
    if (p < toks.length) return new FErr('#ERROR!')
    if (Array.isArray(v)) return v.length === 1 ? v[0] : new FErr('#VALUE!')
    return v
  } catch (e) { return e instanceof FErr ? e : new FErr('#ERROR!') }
}

/**
 * Evaluate a whole grid of raw inputs (strings starting with "=" are formulas) with memoisation and
 * circular-reference detection. Returns computed values in the same shape.
 */
export function computeGrid(raw: (string | number | null)[][]): Value[][] {
  const rows = raw.length, cols = Math.max(0, ...raw.map((r) => r.length))
  const memo: (Value | undefined)[][] = raw.map(() => new Array(cols).fill(undefined))
  const visiting = new Set<string>()
  const literal = (v: string | number | null): Value => {
    if (v == null || v === '') return null
    if (typeof v === 'number') return v
    const s = v.trim()
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
    if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true'
    return v
  }
  const get = (r: number, c: number): Value => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return new FErr('#REF!')
    const m = memo[r][c]
    if (m !== undefined) return m
    const key = `${r},${c}`
    if (visiting.has(key)) return new FErr('#CIRC!')
    const rawV = raw[r]?.[c] ?? null
    let v: Value
    if (typeof rawV === 'string' && rawV.startsWith('=') && rawV.length > 1) {
      visiting.add(key)
      v = evalFormula(rawV.slice(1), { cell: get, rows, cols })
      visiting.delete(key)
    } else v = literal(rawV)
    memo[r][c] = v
    return v
  }
  return raw.map((row, r) => Array.from({ length: cols }, (_, c) => { void row; return get(r, c) }))
}

export const displayValue = (v: Value) => (v instanceof FErr ? v.code : v == null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v)
export const isError = isErr
