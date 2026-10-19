export interface RGB { r: number; g: number; b: number }
export interface HSL { h: number; s: number; l: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function parseHex(input: string): RGB | null {
  let h = input.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) return null
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export const rgbToHex = ({ r, g, b }: RGB) =>
  '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === R) h = (G - B) / d + (G < B ? 6 : 0)
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h *= 60
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const S = clamp(s, 0, 100) / 100, L = clamp(l, 0, 100) / 100
  const k = (n: number) => (n + ((h % 360) + 360) % 360 / 30) % 12
  const a = S * Math.min(L, 1 - L)
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) }
}

/** Accepts #hex, rgb(r,g,b) or hsl(h,s%,l%). */
export function parseColor(input: string): RGB | null {
  const s = input.trim().toLowerCase()
  const hex = parseHex(s)
  if (hex) return hex
  let m = s.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/)
  if (m) {
    const [r, g, b] = m.slice(1, 4).map(Number)
    return [r, g, b].every((v) => v <= 255) ? { r, g, b } : null
  }
  m = s.match(/^hsla?\(\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)%?\s*[, ]\s*(\d+(?:\.\d+)?)%?/)
  if (m) {
    const [h, sat, l] = m.slice(1, 4).map(Number)
    return sat <= 100 && l <= 100 ? hslToRgb({ h, s: sat, l }) : null
  }
  return null
}

export const fmtRgb = ({ r, g, b }: RGB) => `rgb(${r}, ${g}, ${b})`
export const fmtHsl = ({ h, s, l }: HSL) => `hsl(${h}, ${s}%, ${l}%)`

/** WCAG 2.x relative luminance. */
export function luminance({ r, g, b }: RGB) {
  const ch = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

export function contrastRatio(a: RGB, b: RGB) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export function wcagRating(ratio: number) {
  return {
    aaNormal: ratio >= 4.5, aaLarge: ratio >= 3, aaaNormal: ratio >= 7, aaaLarge: ratio >= 4.5,
  }
}

export const readableTextOn = (bg: RGB) => (luminance(bg) > 0.179 ? '#000000' : '#ffffff')

export function shades(hex: string, steps = 9): string[] {
  const rgb = parseHex(hex)
  if (!rgb) return []
  const { h, s } = rgbToHsl(rgb)
  return Array.from({ length: steps }, (_, i) => rgbToHex(hslToRgb({ h, s, l: Math.round(95 - (i * 85) / (steps - 1)) })))
}

export function harmonies(hex: string) {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const hsl = rgbToHsl(rgb)
  const rot = (d: number) => rgbToHex(hslToRgb({ ...hsl, h: hsl.h + d }))
  return {
    complementary: [hex, rot(180)],
    analogous: [rot(-30), hex, rot(30)],
    triadic: [hex, rot(120), rot(240)],
    tetradic: [hex, rot(90), rot(180), rot(270)],
  }
}
