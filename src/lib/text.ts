export function textStats(s: string) {
  const trimmed = s.trim()
  // A "word" is a whitespace-separated token containing at least one letter or digit (emoji/punctuation alone don't count).
  const words = trimmed ? trimmed.split(/\s+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0
  const sentences = trimmed ? (trimmed.match(/[^.!?…]+(?:[.!?…]+|$)/gu) ?? []).filter((x) => /\p{L}|\p{N}/u.test(x)).length : 0
  const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).filter((p) => p.trim()).length : 0
  const lines = s ? s.split(/\r?\n/).length : 0
  return {
    characters: [...s].length,
    charactersNoSpaces: [...s.replace(/\s/g, '')].length,
    words,
    sentences,
    paragraphs,
    lines,
    readingMinutes: words / 230,
  }
}

const splitWords = (s: string) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').trim().split(/\s+/).filter(Boolean)

export type CaseKind = 'upper' | 'lower' | 'title' | 'sentence' | 'camel' | 'pascal' | 'snake' | 'kebab' | 'constant' | 'alternating' | 'inverse'

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'via'])

export function convertCase(s: string, kind: CaseKind): string {
  switch (kind) {
    case 'upper': return s.toUpperCase()
    case 'lower': return s.toLowerCase()
    case 'title':
      return s.toLowerCase().replace(/\S+/g, (w, offset: number) =>
        offset > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))
    case 'sentence':
      return s.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase())
    case 'camel': return splitWords(s).map((w, i) => (i ? cap(w) : w.toLowerCase())).join('')
    case 'pascal': return splitWords(s).map(cap).join('')
    case 'snake': return splitWords(s).map((w) => w.toLowerCase()).join('_')
    case 'kebab': return splitWords(s).map((w) => w.toLowerCase()).join('-')
    case 'constant': return splitWords(s).map((w) => w.toUpperCase()).join('_')
    case 'alternating': {
      let i = 0
      return [...s].map((c) => (/\p{L}/u.test(c) ? (i++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c)).join('')
    }
    case 'inverse': return [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('')
  }
}
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

export const lines = (s: string) => s.split(/\r?\n/)

export function sortLines(s: string, opts: { order?: 'asc' | 'desc'; caseSensitive?: boolean; numeric?: boolean } = {}) {
  const coll = new Intl.Collator(undefined, { sensitivity: opts.caseSensitive ? 'variant' : 'base', numeric: opts.numeric ?? true })
  const out = [...lines(s)].sort(coll.compare)
  return (opts.order === 'desc' ? out.reverse() : out).join('\n')
}

export function dedupeLines(s: string, opts: { caseSensitive?: boolean; trim?: boolean } = {}) {
  const seen = new Set<string>()
  return lines(s).filter((l) => {
    let k = opts.trim ? l.trim() : l
    if (!opts.caseSensitive) k = k.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).join('\n')
}

export const reverseText = (s: string) => [...s].reverse().join('')
export const removeEmptyLines = (s: string) => lines(s).filter((l) => l.trim()).join('\n')

export type DiffOp = { type: 'equal' | 'add' | 'remove'; line: string }

/** Line-based diff using LCS (fine for the text sizes handled in the browser tool). */
export function diffLines(a: string, b: string): DiffOp[] {
  const A = lines(a), B = lines(b)
  const n = A.length, m = B.length
  if (n * m > 4_000_000) throw new Error('Texts are too large to compare in the browser (limit ≈ 2,000 × 2,000 lines).')
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffOp[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ type: 'equal', line: A[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ type: 'remove', line: A[i++] })
    else out.push({ type: 'add', line: B[j++] })
  }
  while (i < n) out.push({ type: 'remove', line: A[i++] })
  while (j < m) out.push({ type: 'add', line: B[j++] })
  return out
}

export const ALPHABETS: Record<string, { name: string; letters: string[]; note?: string }> = {
  english: { name: 'English (Latin)', letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') },
  greek: { name: 'Greek', letters: 'Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω'.split(' ') },
  russian: { name: 'Russian (Cyrillic)', letters: 'А Б В Г Д Е Ё Ж З И Й К Л М Н О П Р С Т У Ф Х Ц Ч Ш Щ Ъ Ы Ь Э Ю Я'.split(' ') },
  arabic: { name: 'Arabic', letters: 'ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي'.split(' '), note: 'Written right-to-left' },
  urdu: { name: 'Urdu', letters: 'ا ب پ ت ٹ ث ج چ ح خ د ڈ ذ ر ڑ ز ژ س ش ص ض ط ظ ع غ ف ق ک گ ل م ن ں و ہ ھ ء ی ے'.split(' '), note: 'Written right-to-left' },
  nato: {
    name: 'NATO phonetic',
    letters: 'Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu'.split(' '),
  },
}

export const NATO_MAP: Record<string, string> = Object.fromEntries(ALPHABETS.nato.letters.map((w) => [w[0].toLowerCase(), w]))
export const toNato = (s: string) => [...s].map((c) => NATO_MAP[c.toLowerCase()] ?? (c.trim() ? c : '')).filter(Boolean).join(' ')

/** Collapse runs of spaces/tabs, trim each line, and limit blank lines to one. */
export const removeExtraSpaces = (s: string) => lines(s).map((l) => l.replace(/[ \t00a0]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n')

/** Capitalize the first letter of every word (keeps the rest of each word unchanged). */
export const capitalizeWords = (s: string) => s.replace(/(^|[\s\-(“"'])(\p{Ll})/gu, (_m, p: string, c: string) => p + c.toUpperCase())

export interface FindOptions { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }
/** Build a safe RegExp for find/replace. Throws a readable error for invalid regex input. */
export function buildFindRegex(find: string, o: FindOptions = {}): RegExp {
  if (!find) throw new Error('Enter text to find.')
  let src = o.regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (o.wholeWord) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`
  try { return new RegExp(src, `g${o.caseSensitive ? '' : 'i'}u`) } catch { throw new Error('That regular expression is not valid.') }
}
export function countMatches(text: string, find: string, o: FindOptions = {}) { return [...text.matchAll(buildFindRegex(find, o))].length }
export function replaceAll(text: string, find: string, replacement: string, o: FindOptions = {}) {
  const re = buildFindRegex(find, o)
  let n = 0
  const out = text.replace(re, (...args) => { n++; return o.regex ? replacement.replace(/\$(\d)/g, (_x, i: string) => String(args[Number(i)] ?? '')) : replacement })
  return { text: out, count: n }
}
