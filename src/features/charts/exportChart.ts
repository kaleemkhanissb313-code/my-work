import { downloadBlob, downloadText } from '@/services/backup'
import { resolveChartTheme } from './theme'
import { escapeHtml } from '@/lib/html'

/**
 * Serialise the Recharts SVG inside `container` into a standalone SVG document. Recharts renders its legend as HTML,
 * so legend entries are re-drawn inside the exported SVG, together with an optional title.
 */
export function chartToSvg(container: HTMLElement | null, opts: { title?: string; legend?: { name: string; color: string }[] } = {}) {
  const svg = container?.querySelector<SVGSVGElement>('svg.recharts-surface')
  if (!svg) return null
  const theme = resolveChartTheme()
  const w = Math.round(svg.width.baseVal.value || svg.getBoundingClientRect().width)
  const h = Math.round(svg.height.baseVal.value || svg.getBoundingClientRect().height)
  const top = opts.title ? 36 : 8
  const legendH = opts.legend?.length ? 28 : 0
  const W = w + 16, H = h + top + legendH + 8
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('x', '8')
  clone.setAttribute('y', String(top))
  const ns = 'http://www.w3.org/2000/svg'
  let legend = ''
  if (opts.legend?.length) {
    let x = 12
    const y = top + h + 18
    for (const l of opts.legend) {
      legend += `<rect x="${x}" y="${y - 9}" width="10" height="10" rx="2" fill="${escapeHtml(l.color)}"/><text x="${x + 14}" y="${y}" font-size="12" fill="${theme.fg}">${escapeHtml(l.name)}</text>`
      x += 26 + l.name.length * 7
    }
  }
  const title = opts.title ? `<text x="${W / 2}" y="24" text-anchor="middle" font-size="16" font-weight="600" fill="${theme.fg}">${escapeHtml(opts.title)}</text>` : ''
  const inner = new XMLSerializer().serializeToString(clone)
  return `<svg xmlns="${ns}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, Segoe UI, sans-serif"><rect width="100%" height="100%" fill="${theme.surface}"/>${title}${inner}${legend}</svg>`
}

export function downloadChartSvg(svg: string, filename: string) {
  downloadText(svg, filename, 'image/svg+xml;charset=utf-8')
}

/** Rasterise an SVG string to PNG via an off-screen canvas (2× scale for sharpness). */
export function downloadChartPng(svg: string, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    img.onload = () => {
      try {
        const scale = 2
        const canvas = document.createElement('canvas')
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas is not available')
        ctx.scale(scale, scale)
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)
        canvas.toBlob((b) => {
          if (!b) { reject(new Error('Could not create PNG')); return }
          downloadBlob(b, filename)
          resolve()
        }, 'image/png')
      } catch (e) { URL.revokeObjectURL(url); reject(e as Error) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not render chart image')) }
    img.src = url
  })
}

/** File-name-safe slug. */
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart'
