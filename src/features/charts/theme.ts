import { useEffect, useState } from 'react'

/**
 * Chart colours resolved from the app's CSS variables at runtime. Resolving (instead of passing `rgb(var(--accent))`
 * straight to SVG attributes) keeps colours correct in exported SVG/PNG files, which cannot see the page's CSS.
 */
export interface ChartTheme {
  palette: string[]
  fg: string
  muted: string
  line: string
  surface: string
  ok: string
  danger: string
}

/** Fixed, colour-blind-friendly series colours used after the two theme accents. */
export const FIXED_PALETTE = ['#E69F00', '#009E73', '#D55E00', '#0072B2', '#CC79A7', '#56B4E9', '#8C6D31', '#999999']

const read = (name: string, fallback: string) => {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v ? `rgb(${v.split(/\s+/).join(', ')})` : fallback
}

export function resolveChartTheme(): ChartTheme {
  return {
    palette: [read('--accent', '#7c3aed'), read('--accent2', '#2563eb'), ...FIXED_PALETTE],
    fg: read('--fg', '#111427'),
    muted: read('--muted', '#58607a'),
    line: read('--line', '#d6dae8'),
    surface: read('--surface', '#ffffff'),
    ok: read('--ok', '#059669'),
    danger: read('--danger', '#dc2626'),
  }
}

/** Re-resolves when the theme class on <html> changes (light/dark switch). */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState(resolveChartTheme)
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(resolveChartTheme()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => obs.disconnect()
  }, [])
  return theme
}

export const tooltipStyle = (t: ChartTheme) => ({
  contentStyle: { background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, color: t.fg, fontSize: 12 },
  labelStyle: { color: t.fg, fontWeight: 600 },
  itemStyle: { color: t.fg },
})
