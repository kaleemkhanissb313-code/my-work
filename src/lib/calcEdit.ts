/**
 * "Clear entry" (✕): removes the last complete item of an expression — a whole number (with its decimal point and
 * any exponent), a constant or function call opener (Ans, pi, e, sin( …), or a single operator / bracket.
 * Backspace still removes one character; Clear empties everything.
 */
const FUNCS = 'sin|cos|tan|asin|acos|atan|sqrt|ln|log|abs|exp'
const LAST_ITEM = new RegExp(`(?:\\d*\\.?\\d+(?:e[+-]?\\d+)?|\\d+\\.|(?:${FUNCS})\\(|Ans|pi|e|.)\\s*$`)

export function removeLastItem(expr: string): string {
  const s = expr.replace(/\s+$/, '')
  if (!s) return ''
  return s.replace(LAST_ITEM, '').replace(/\s+$/, '')
}
