/**
 * Safe arithmetic expression evaluator (recursive descent). Never uses eval/Function.
 * Grammar:
 *   expr    := term (('+' | '-') term)*
 *   term    := factor (('*' | '/' | '%' | implicit-mul) factor)*
 *   factor  := ('-' | '+') factor | power
 *   power   := postfix ('^' factor)?          (right-associative)
 *   postfix := primary ('!')*
 *   primary := number | constant | func '(' expr ')' | '(' expr ')'
 * '%' after a number with nothing following it (e.g. "50%") means percent (/100).
 */
export type AngleMode = 'deg' | 'rad'

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

export class MathError extends Error {}

const FUNCS: Record<string, (x: number, mode: AngleMode) => number> = {
  sin: (x, m) => Math.sin(toRad(x, m)),
  cos: (x, m) => Math.cos(toRad(x, m)),
  tan: (x, m) => {
    const r = toRad(x, m)
    if (Math.abs(Math.cos(r)) < 1e-12) throw new MathError('tan is undefined here')
    return Math.tan(r)
  },
  asin: (x, m) => fromRad(Math.asin(x), m),
  acos: (x, m) => fromRad(Math.acos(x), m),
  atan: (x, m) => fromRad(Math.atan(x), m),
  sqrt: (x) => { if (x < 0) throw new MathError('Square root of a negative number'); return Math.sqrt(x) },
  cbrt: Math.cbrt,
  ln: (x) => { if (x <= 0) throw new MathError('ln requires a positive number'); return Math.log(x) },
  log: (x) => { if (x <= 0) throw new MathError('log requires a positive number'); return Math.log10(x) },
  abs: Math.abs,
  exp: Math.exp,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
}
const CONSTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E }

const toRad = (x: number, m: AngleMode) => (m === 'deg' ? (x * Math.PI) / 180 : x)
const fromRad = (x: number, m: AngleMode) => (m === 'deg' ? (x * 180) / Math.PI : x)

function tokenize(src: string): Tok[] {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/√/g, ' sqrt ')
  const out: Tok[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < s.length && /[0-9.]/.test(s[j])) j++
      if (j < s.length && /[eE]/.test(s[j]) && /[-+0-9]/.test(s[j + 1] ?? '')) {
        j++
        if (/[-+]/.test(s[j])) j++
        while (j < s.length && /[0-9]/.test(s[j])) j++
      }
      const raw = s.slice(i, j)
      if ((raw.match(/\./g) ?? []).length > 1) throw new MathError(`Invalid number "${raw}"`)
      out.push({ t: 'num', v: parseFloat(raw) })
      i = j
      continue
    }
    if (/[a-zA-Zπ]/.test(c)) {
      let j = i
      while (j < s.length && /[a-zA-Zπ]/.test(s[j])) j++
      out.push({ t: 'id', v: s.slice(i, j).toLowerCase() })
      i = j
      continue
    }
    if ('+-*/^%()!'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue }
    throw new MathError(`Unexpected character "${c}"`)
  }
  return out
}

function factorial(n: number) {
  if (n < 0 || !Number.isInteger(n)) throw new MathError('Factorial needs a non-negative whole number')
  if (n > 170) throw new MathError('Factorial too large')
  let r = 1
  for (let k = 2; k <= n; k++) r *= k
  return r
}

export function evaluate(src: string, mode: AngleMode = 'deg'): number {
  if (!src.trim()) throw new MathError('Enter an expression')
  const toks = tokenize(src)
  let p = 0
  const peek = () => toks[p]
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v
  const eat = (v: string) => { if (!isOp(v)) throw new MathError(`Expected "${v}"`); p++ }

  const startsPrimary = () => {
    const k = peek()
    return !!k && (k.t === 'num' || k.t === 'id' || (k.t === 'op' && k.v === '('))
  }

  function expr(): number {
    let v = term()
    while (isOp('+') || isOp('-')) { const o = toks[p++].v; const r = term(); v = o === '+' ? v + r : v - r }
    return v
  }
  function term(): number {
    let v = factor()
    for (;;) {
      if (isOp('*')) { p++; v *= factor() }
      else if (isOp('/')) {
        p++
        const d = factor()
        if (d === 0) throw new MathError('Cannot divide by zero')
        v /= d
      } else if (isOp('%')) {
        p++
        // Trailing or operator-followed % is "percent"; otherwise it is modulo.
        if (startsPrimary()) {
          const d = factor()
          if (d === 0) throw new MathError('Cannot take modulo by zero')
          v %= d
        } else v /= 100
      } else if (startsPrimary()) v *= factor() // implicit multiplication: 2pi, 3(4), (1)(2)
      else break
    }
    return v
  }
  // Unary minus binds looser than ^ (so -2^2 = -4, as in standard maths), and the exponent may itself be signed (2^-1).
  function factor(): number {
    if (isOp('-')) { p++; return -factor() }
    if (isOp('+')) { p++; return factor() }
    return power()
  }
  function power(): number {
    const b = postfix()
    if (isOp('^')) { p++; return Math.pow(b, factor()) }
    return b
  }
  function postfix(): number {
    let v = primary()
    while (isOp('!')) { p++; v = factorial(v) }
    return v
  }
  function primary(): number {
    const k = peek()
    if (!k) throw new MathError('Expression ended unexpectedly')
    if (k.t === 'num') { p++; return k.v }
    if (k.t === 'op' && k.v === '(') { p++; const v = expr(); eat(')'); return v }
    if (k.t === 'id') {
      p++
      if (k.v in CONSTS) return CONSTS[k.v]
      const fn = FUNCS[k.v]
      if (!fn) throw new MathError(`Unknown function or constant "${k.v}"`)
      // Allow "sqrt 9" as well as "sqrt(9)"
      const arg = isOp('(') ? (p++, ((): number => { const v = expr(); eat(')'); return v })()) : factor()
      return fn(arg, mode)
    }
    throw new MathError(`Unexpected "${k.v}"`)
  }

  const result = expr()
  if (p < toks.length) throw new MathError(`Unexpected "${toks[p].v}"`)
  if (!Number.isFinite(result)) throw new MathError('Result is not a finite number')
  return result
}

/** Round away binary floating-point noise (0.1+0.2 -> 0.3) for display. */
export function cleanNumber(n: number, sig = 12) {
  if (n === 0) return 0
  return Number.parseFloat(n.toPrecision(sig))
}

export function formatResult(n: number) {
  const c = cleanNumber(n)
  if (Math.abs(c) >= 1e15 || (Math.abs(c) < 1e-9 && c !== 0)) return c.toExponential(8).replace(/\.?0+e/, 'e')
  return String(c)
}
