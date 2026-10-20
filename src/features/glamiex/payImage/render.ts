import { pkr } from '../money'
import { amountOf, initials, totals, type PayDesign, type PayPerson } from './model'

/* Draws a payment summary onto a canvas. Base width 1080 px (WhatsApp friendly); export uses scale 2. */

export const BASE_WIDTH = 1080
const PAD = 64
const HEAD_FONT = '"Plus Jakarta Sans Variable", "Inter Variable", system-ui, sans-serif'
const BODY_FONT = '"Inter Variable", system-ui, sans-serif'
export const DISCLAIMER = 'Payment record for reference only. Not an official bank receipt or a verified transaction confirmation.'

const font = (weight: number, size: number, head = false) => `${weight} ${size}px ${head ? HEAD_FONT : BODY_FONT}`

function rgba(hex: string, a: number) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
const luminance = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}
/** Text colour that stays readable on top of the given colour. */
const onColor = (hex: string) => (luminance(hex) > 0.6 ? '#111427' : '#ffffff')

/** Truncates text with an ellipsis so it fits within maxWidth at the current font. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let lo = 0, hi = text.length
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid; else hi = mid - 1 }
  return text.slice(0, lo).trimEnd() + '…'
}

/** Largest font size (down to min) at which text fits within maxWidth. */
function fitSize(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, min: number, maxWidth: number, head = true) {
  let s = size
  for (; s > min; s -= 1) { ctx.font = font(weight, s, head); if (ctx.measureText(text).width <= maxWidth) break }
  ctx.font = font(weight, s, head)
  return s
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r)
}

export const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>()
function loadImage(src: string) {
  let p = imageCache.get(src)
  if (!p) {
    p = new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src })
    imageCache.set(src, p)
    if (imageCache.size > 40) imageCache.delete(imageCache.keys().next().value as string)
  }
  return p
}

function avatar(ctx: CanvasRenderingContext2D, p: PayPerson, img: HTMLImageElement | null, cx: number, cy: number, r: number, d: PayDesign) {
  ctx.save()
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath()
  if (img) {
    ctx.clip()
    // Photos are stored square-cropped, but crop again defensively (cover fit).
    const s = Math.min(img.naturalWidth, img.naturalHeight)
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, cx - r, cy - r, r * 2, r * 2)
  } else {
    ctx.fillStyle = rgba(d.accent, 0.16); ctx.fill()
    ctx.fillStyle = d.accent; ctx.font = font(700, Math.round(r * 0.8), true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(initials(p.name), cx, cy + 1)
  }
  ctx.restore()
}

function statusPill(ctx: CanvasRenderingContext2D, status: PayPerson['status'], x: number, y: number, align: 'left' | 'right' | 'center') {
  const label = status === 'paid' ? 'PAID' : 'PENDING'
  const color = status === 'paid' ? '#059669' : '#d97706'
  ctx.font = font(700, 20)
  const w = ctx.measureText(label).width + 32, h = 36
  const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
  roundRect(ctx, left, y, w, h, h / 2); ctx.fillStyle = rgba(color, 0.14); ctx.fill()
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, left + w / 2, y + h / 2 + 1)
}

const ROW_H = 136, ROW_GAP = 16, CARD_H = 330, HEADER_H = 250, SUMMARY_H = 170, FOOTER_H = 120

export function designHeight(d: PayDesign) {
  const n = Math.max(1, d.people.length)
  const body = d.layout === 'grid' ? Math.ceil(n / 2) * (CARD_H + ROW_GAP) : n * (ROW_H + ROW_GAP)
  return HEADER_H + SUMMARY_H + 40 + body + FOOTER_H
}

/** Renders the design into `canvas` (resized to BASE_WIDTH × height at the given scale). */
export async function renderPaymentImage(canvas: HTMLCanvasElement, d: PayDesign, scale = 1) {
  const imgs = await Promise.all(d.people.map((p) => (p.photo ? loadImage(p.photo) : Promise.resolve(null))))
  await document.fonts?.ready
  const W = BASE_WIDTH, H = designHeight(d)
  canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.imageSmoothingQuality = 'high'
  const muted = rgba(d.fg, 0.62), line = rgba(d.fg, 0.1), soft = rgba(d.fg, d.template === 'minimal' ? 0 : 0.045)

  // Background
  ctx.fillStyle = d.bg; ctx.fillRect(0, 0, W, H)

  // Header
  let headFg = d.fg, headMuted = muted
  if (d.template === 'bold') {
    ctx.fillStyle = d.accent; ctx.fillRect(0, 0, W, HEADER_H)
    headFg = onColor(d.accent); headMuted = rgba(headFg, 0.75)
  } else if (d.template === 'classic') {
    ctx.fillStyle = d.accent; ctx.fillRect(0, 0, W, 10)
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = d.template === 'bold' ? headMuted : d.accent; ctx.font = font(700, 22)
  ctx.fillText('PAYMENT RECORD', PAD, 92)
  fitSize(ctx, d.title.trim() || 'Payment Summary', 800, 60, 34, W - PAD * 2)
  ctx.fillStyle = headFg; ctx.fillText(fitText(ctx, d.title.trim() || 'Payment Summary', W - PAD * 2), PAD, 160)
  ctx.font = font(500, 24); ctx.fillStyle = headMuted
  const n = d.people.length
  ctx.fillText(`${n} ${n === 1 ? 'person' : 'people'} · Created ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())}`, PAD, 205)

  // Summary band
  const t = totals(d.people)
  let y = HEADER_H + 20
  roundRect(ctx, PAD, y, W - PAD * 2, SUMMARY_H - 20, 28)
  ctx.fillStyle = d.template === 'minimal' ? 'transparent' : rgba(d.accent, d.template === 'bold' ? 0.18 : 0.08); ctx.fill()
  if (d.template === 'minimal') { ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke() }
  ctx.fillStyle = muted; ctx.font = font(600, 22); ctx.textAlign = 'left'
  ctx.fillText('TOTAL AMOUNT', PAD + 36, y + 52)
  ctx.fillStyle = d.fg
  fitSize(ctx, pkr(t.total), 800, 54, 30, (W - PAD * 2) * 0.55)
  ctx.fillText(pkr(t.total), PAD + 36, y + 112)
  ctx.textAlign = 'right'; ctx.font = font(600, 22); ctx.fillStyle = '#059669'
  ctx.fillText(`Paid  ${pkr(t.paid)}`, W - PAD - 36, y + 64)
  ctx.fillStyle = '#d97706'
  ctx.fillText(`Pending  ${pkr(t.pending)}`, W - PAD - 36, y + 108)

  // People
  y = HEADER_H + SUMMARY_H + 40
  if (d.layout === 'list') {
    d.people.forEach((p, i) => {
      const x = PAD, w = W - PAD * 2
      roundRect(ctx, x, y, w, ROW_H, 26); ctx.fillStyle = soft; ctx.fill()
      if (d.template !== 'bold') { ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke() }
      avatar(ctx, p, imgs[i], x + 32 + 42, y + ROW_H / 2, 42, d)
      // Right column: amount + status. Measured first so the name never runs into it.
      const amt = pkr(amountOf(p))
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'
      fitSize(ctx, amt, 800, 36, 24, 330)
      const amtW = Math.min(330, ctx.measureText(amt).width)
      ctx.fillStyle = d.fg; ctx.fillText(amt, x + w - 32, y + 60)
      statusPill(ctx, p.status, x + w - 32, y + 78, 'right')
      const textX = x + 32 + 84 + 26, textW = w - (textX - x) - 32 - Math.max(amtW, 150) - 28
      ctx.textAlign = 'left'
      ctx.font = font(700, 32, true); ctx.fillStyle = d.fg
      ctx.fillText(fitText(ctx, p.name.trim() || 'Unnamed', textW), textX, y + 60)
      ctx.font = font(500, 22); ctx.fillStyle = muted
      const meta = [fmtDate(p.date), p.note.trim()].filter(Boolean).join('  ·  ')
      ctx.fillText(fitText(ctx, meta, textW), textX, y + 100)
      y += ROW_H + ROW_GAP
    })
  } else {
    const gap = ROW_GAP, cw = (W - PAD * 2 - gap) / 2
    d.people.forEach((p, i) => {
      const odd = d.people.length % 2 === 1 && i === d.people.length - 1
      const x = odd ? (W - cw) / 2 : PAD + (i % 2) * (cw + gap)
      const cy = y + Math.floor(i / 2) * (CARD_H + gap)
      roundRect(ctx, x, cy, cw, CARD_H, 28); ctx.fillStyle = soft; ctx.fill()
      if (d.template !== 'bold') { ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke() }
      const mid = x + cw / 2, inner = cw - 48
      avatar(ctx, p, imgs[i], mid, cy + 82, 50, d)
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
      ctx.font = font(700, 30, true); ctx.fillStyle = d.fg
      ctx.fillText(fitText(ctx, p.name.trim() || 'Unnamed', inner), mid, cy + 178)
      const amt = pkr(amountOf(p))
      fitSize(ctx, amt, 800, 38, 24, inner); ctx.fillText(amt, mid, cy + 226)
      ctx.font = font(500, 21); ctx.fillStyle = muted
      ctx.fillText(fitText(ctx, [fmtDate(p.date), p.note.trim()].filter(Boolean).join(' · '), inner), mid, cy + 260)
      statusPill(ctx, p.status, mid, cy + 276, 'center')
    })
  }

  // Footer disclaimer
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, H - FOOTER_H + 24); ctx.lineTo(W - PAD, H - FOOTER_H + 24); ctx.stroke()
  ctx.font = font(500, 19); ctx.fillStyle = muted
  ctx.fillText(fitText(ctx, DISCLAIMER, W - PAD * 2), W / 2, H - FOOTER_H + 68)
  ctx.font = font(700, 19); ctx.fillStyle = rgba(d.fg, 0.45)
  ctx.fillText('GLAMIEX · workMYwork', W / 2, H - FOOTER_H + 98)
  return canvas
}

/** Center-crops an uploaded image to a square JPEG data URL (keeps saved designs small). */
export async function cropToSquare(file: Blob, size = 320): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('unreadable')); i.src = url })
    const s = Math.min(img.naturalWidth, img.naturalHeight)
    if (!s) throw new Error('unreadable')
    const c = document.createElement('canvas'); c.width = c.height = size
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size)
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size)
    return c.toDataURL('image/jpeg', 0.9)
  } finally { URL.revokeObjectURL(url) }
}
