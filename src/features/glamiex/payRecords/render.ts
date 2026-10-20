import { initials } from '../payImage/model'
import { PR_METHODS, PR_STATUSES, formatAmount, longDate, time12, weekday, type PayRecord, type PrDraft } from './model'

/* Renders one payment record to a canvas. Base width 1080 px; height grows with the content. Export at scale 2. */

export const PR_WIDTH = 1080
const PAD = 72
export const PR_DISCLAIMER = 'Payment record / summary for reference only. Not an official bank receipt or a verified transfer confirmation.'

type Rec = PayRecord | PrDraft
const FACES = {
  modern: { head: '"Plus Jakarta Sans Variable", "Inter Variable", system-ui, sans-serif', body: '"Inter Variable", system-ui, sans-serif' },
  elegant: { head: 'Georgia, "Times New Roman", serif', body: 'Georgia, "Times New Roman", serif' },
  rounded: { head: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif', body: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif' },
}

function rgba(hex: string, a: number) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

export function fitLine(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let lo = 0, hi = text.length
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(text.slice(0, mid) + '…').width <= max) lo = mid; else hi = mid - 1 }
  return text.slice(0, lo).trimEnd() + '…'
}

/** Word-wraps into at most maxLines lines (last one ellipsised). Long words are broken. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines: number) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (let w of words) {
    while (ctx.measureText(w).width > max) { // break very long words
      let k = w.length
      while (k > 1 && ctx.measureText(w.slice(0, k)).width > max) k--
      if (cur) { lines.push(cur); cur = '' }
      lines.push(w.slice(0, k)); w = w.slice(k)
    }
    const next = cur ? `${cur} ${w}` : w
    if (ctx.measureText(next).width <= max) cur = next
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) { const keep = lines.slice(0, maxLines); keep[maxLines - 1] = fitLine(ctx, `${keep[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, max); return keep }
  return lines
}

const cache = new Map<string, Promise<HTMLImageElement | null>>()
function load(src: string | null) {
  if (!src) return Promise.resolve(null)
  let p = cache.get(src)
  if (!p) {
    p = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src })
    cache.set(src, p)
    if (cache.size > 30) cache.delete(cache.keys().next().value as string)
  }
  return p
}

interface Ctx2 { ctx: CanvasRenderingContext2D; draw: boolean }

/** Lays out (and optionally draws) the record. Returns the total height. */
function layout({ ctx, draw: drawAll }: Ctx2, r: Rec, imgs: { photo: HTMLImageElement | null; proof: HTMLImageElement | null }) {
  const W = PR_WIDTH, d = r.design, F = FACES[d.font] ?? FACES.modern
  const font = (w: number, s: number, head = false) => `${w} ${s}px ${head ? F.head : F.body}`
  const dark = d.template === 'dark' || d.template === 'gradient'
  const fg = d.fg, muted = rgba(d.fg, dark ? 0.7 : 0.6), line = rgba(d.fg, dark ? 0.16 : 0.1)
  const panel = d.template === 'gradient' ? 'rgba(255,255,255,0.12)' : d.template === 'dark' ? 'rgba(255,255,255,0.05)' : d.template === 'white' ? rgba(d.accent, 0.06) : '#ffffff'
  let draw = drawAll
  const status = PR_STATUSES.find((s) => s.id === r.status) ?? PR_STATUSES[0]
  const text = (s: string, x: number, y: number, f: string, color: string, align: CanvasTextAlign = 'left') => {
    if (!draw) return
    ctx.font = f; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y)
  }
  const rect = (x: number, y: number, w: number, h: number, rad: number, fill: string, stroke?: string) => {
    if (!draw) return
    ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); ctx.fillStyle = fill; ctx.fill()
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke() }
  }

  let y = 0
  // Header
  y = 96
  text('GLAMIEX', PAD, y, font(800, 30, true), d.accent)
  ctx.font = font(700, 20)
  const tag = 'PAYMENT RECORD', tw = ctx.measureText(tag).width + 36
  rect(W - PAD - tw, y - 30, tw, 42, 21, rgba(d.accent, 0.16))
  text(tag, W - PAD - tw / 2, y - 2, font(700, 20), d.accent, 'center')
  y += 40
  ctx.font = font(800, 58, true)
  for (const l of wrapText(ctx, r.title.trim() || 'Payment Record', W - PAD * 2, 2)) { y += 64; text(l, PAD, y, font(800, 58, true), fg) }

  // Partner
  y += 44
  const av = 60
  if (draw) {
    ctx.save(); ctx.beginPath(); ctx.arc(PAD + av, y + av, av, 0, Math.PI * 2); ctx.closePath()
    if (imgs.photo) {
      ctx.clip(); const s = Math.min(imgs.photo.naturalWidth, imgs.photo.naturalHeight)
      ctx.drawImage(imgs.photo, (imgs.photo.naturalWidth - s) / 2, (imgs.photo.naturalHeight - s) / 2, s, s, PAD, y, av * 2, av * 2)
    } else {
      ctx.fillStyle = rgba(d.accent, 0.2); ctx.fill()
      ctx.fillStyle = d.accent; ctx.font = font(800, 46, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(initials(r.partnerName), PAD + av, y + av + 2)
    }
    ctx.restore()
    ctx.beginPath(); ctx.arc(PAD + av, y + av, av + 3, 0, Math.PI * 2); ctx.strokeStyle = rgba(d.accent, 0.6); ctx.lineWidth = 4; ctx.stroke()
  }
  const nx = PAD + av * 2 + 32, nw = W - nx - PAD
  text('PARTNER', nx, y + 44, font(700, 20), muted)
  ctx.font = font(800, 44, true)
  text(fitLine(ctx, r.partnerName.trim() || 'Partner', nw), nx, y + 98, font(800, 44, true), fg)
  y += av * 2 + 36

  // Amount panel
  const ph = 210
  rect(PAD, y, W - PAD * 2, ph, 32, panel, d.template === 'minimal' ? line : undefined)
  text('AMOUNT', PAD + 40, y + 58, font(700, 22), muted)
  const amt = formatAmount(r.amount, r.currency)
  let size = 96
  for (; size > 44; size -= 2) { ctx.font = font(800, size, true); if (ctx.measureText(amt).width <= W - PAD * 2 - 80) break }
  text(amt, PAD + 40, y + 70 + size * 0.9, font(800, size, true), d.template === 'white' || d.template === 'minimal' ? d.accent : fg)
  ctx.font = font(800, 22)
  const sw = ctx.measureText(status.label.toUpperCase()).width + 44
  rect(W - PAD - 40 - sw, y + 28, sw, 46, 23, rgba(status.color, dark ? 0.28 : 0.14))
  text(status.label.toUpperCase(), W - PAD - 40 - sw / 2, y + 59, font(800, 22), dark ? '#ffffff' : status.color, 'center')
  y += ph + 28

  // Details
  const method = PR_METHODS.find((m) => m.id === r.method)?.label ?? ''
  const allRows: [string, string, number][] = [
    ['Date', longDate(r.date), 1], ['Day', weekday(r.date), 1], ['Time', time12(r.time), 1], ['Payment method', method, 1],
    ['Sender', r.sender, 1], ['Receiver', r.receiver, 1], ['Purpose', r.purpose, 3], ['Reference no.', r.reference, 1], ['Location', r.location, 2],
  ]
  const rows = allRows.filter(([, v]) => v.trim())
  const bx = PAD, bw = W - PAD * 2
  const startY = y
  const details = (y: number) => {
  if (d.layout === 'compact') {
    const colW = (bw - 80 - 32) / 2
    let col = 0, rowY = y + 36
    for (const [label, value, lines] of rows) {
      const full = lines > 1
      if (full && col === 1) { col = 0; rowY += 96 }
      const x = bx + 40 + (full ? 0 : col * (colW + 32)), w = full ? bw - 80 : colW
      text(label.toUpperCase(), x, rowY + 22, font(700, 18), muted)
      ctx.font = font(600, 28)
      const ls = full ? wrapText(ctx, value, w, lines) : [fitLine(ctx, value, w)]
      ls.forEach((l, i) => text(l, x, rowY + 60 + i * 36, font(600, 28), fg))
      if (full) { rowY += 60 + ls.length * 36 + 12; col = 0 } else if (col === 1) { rowY += 96; col = 0 } else col = 1
    }
    if (col === 1) rowY += 96
    y = rowY + 4
  } else {
    let rowY = y + 16
    const labelW = 250, vw = bw - 80 - labelW
    rows.forEach(([label, value, lines], i) => {
      ctx.font = font(600, 28)
      const ls = lines > 1 ? wrapText(ctx, value, vw, lines) : [fitLine(ctx, value, vw)]
      const h = 40 + ls.length * 38
      text(label, bx + 40, rowY + 50, font(600, 24), muted)
      ls.forEach((l, k) => text(l, W - PAD - 40, rowY + 50 + k * 38, font(600, 28), fg, 'right'))
      rowY += h
      if (draw && i < rows.length - 1) { ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx + 40, rowY); ctx.lineTo(W - PAD - 40, rowY); ctx.stroke() }
    })
    y = rowY + 16
  }
  return y
  }
  // Measure the details first so their panel can be painted underneath.
  draw = false
  const endY = details(startY)
  draw = drawAll
  if (rows.length) { rect(bx, startY, bw, endY - startY, 32, panel, d.template === 'minimal' ? line : undefined); details(startY) }
  y = rows.length ? endY : startY - 28
  y += 28

  // Proof image
  if (imgs.proof) {
    text('PAYMENT PROOF', PAD, y + 24, font(700, 20), muted)
    y += 44
    const maxW = W - PAD * 2, maxH = 560
    const s = Math.min(maxW / imgs.proof.naturalWidth, maxH / imgs.proof.naturalHeight)
    const w = imgs.proof.naturalWidth * s, h = imgs.proof.naturalHeight * s, x = PAD + (maxW - w) / 2
    if (draw) { ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 24); ctx.clip(); ctx.drawImage(imgs.proof, x, y, w, h); ctx.restore() }
    y += h + 28
  }

  // Notes
  if (r.notes.trim()) {
    text('NOTES', PAD, y + 24, font(700, 20), muted)
    ctx.font = font(500, 26)
    const ls = wrapText(ctx, r.notes, W - PAD * 2, 5)
    ls.forEach((l, i) => text(l, PAD, y + 66 + i * 36, font(500, 26), fg))
    y += 66 + (ls.length - 1) * 36 + 30
  }

  // Footer
  y += 20
  if (draw) { ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke() }
  ctx.font = font(500, 20)
  const disc = r.status === 'paid' ? PR_DISCLAIMER : `${status.label} — not confirmed as paid. ${PR_DISCLAIMER}`
  const ls = wrapText(ctx, disc, W - PAD * 2, 3)
  ls.forEach((l, i) => text(l, W / 2, y + 44 + i * 28, font(500, 20), muted, 'center'))
  y += 44 + (ls.length - 1) * 28 + 24
  text('GLAMIEX · workMYwork', W / 2, y + 8, font(700, 20, true), rgba(d.fg, 0.45), 'center')
  return Math.max(Math.ceil(y + 56), d.layout === 'compact' ? 1080 : 1350)
}

function paintBackground(ctx: CanvasRenderingContext2D, r: Rec, H: number) {
  const d = r.design
  if (d.template === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, PR_WIDTH, H)
    g.addColorStop(0, d.bg); g.addColorStop(1, d.accent)
    ctx.fillStyle = g
  } else ctx.fillStyle = d.bg
  ctx.fillRect(0, 0, PR_WIDTH, H)
  if (d.template === 'white') { ctx.fillStyle = d.accent; ctx.fillRect(0, 0, PR_WIDTH, 12) }
  if (d.template === 'dark') { ctx.strokeStyle = rgba(d.accent, 0.5); ctx.lineWidth = 3; ctx.strokeRect(24, 24, PR_WIDTH - 48, H - 48) }
}

/** Draws the record into `canvas` at `scale` (2 = 2160 px wide export). Waits for fonts and images first. */
export async function renderRecord(canvas: HTMLCanvasElement, r: Rec, scale = 1) {
  const [photo, proof] = await Promise.all([load(r.photo), load(r.proof)])
  await document.fonts?.ready
  const measure = document.createElement('canvas').getContext('2d')!
  const H = layout({ ctx: measure, draw: false }, r, { photo, proof })
  canvas.width = Math.round(PR_WIDTH * scale); canvas.height = Math.round(H * scale)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.imageSmoothingQuality = 'high'
  paintBackground(ctx, r, H)
  layout({ ctx, draw: true }, r, { photo, proof })
  return canvas
}

export async function recordBlob(r: Rec, type: 'image/png' | 'image/jpeg', scale = 2) {
  const c = await renderRecord(document.createElement('canvas'), r, scale)
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, type, type === 'image/jpeg' ? 0.92 : undefined))
  if (!blob) throw new Error('Could not create the image')
  return blob
}

export const recordFileName = (r: Rec, ext: 'png' | 'jpg') =>
  `payment-${(r.partnerName.trim() || 'partner').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${r.date}.${ext}`
