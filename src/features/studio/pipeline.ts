/**
 * Render pipeline shared by the live preview (main thread) and the export worker (OffscreenCanvas).
 * Steps: orient + crop → (optional cover crop) → step-wise resample → adjustments → sharpen. Pixels are processed in
 * row bands so peak memory stays near one output canvas, even at 8K.
 */
import { applyAdjust, cropPixels, effectiveAdjust, isNeutral, sharpenBand, type Edits } from './edits'

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
export type MakeCanvas = (w: number, h: number) => AnyCanvas
export type Stage = 'decode' | 'transform' | 'resize' | 'adjust' | 'sharpen' | 'encode' | 'verify'
export type Progress = (stage: Stage, pct: number) => void
export interface RenderOpts {
  edits: Edits
  outW: number
  outH: number
  /** Extra centre crop (fractions) for "fill" mode. */
  cover: { x: number; y: number; w: number; h: number } | null
  /** Sharpen strength override (preview scales it down); defaults to edits.sharpen. */
  sharpen?: number
  /** Skip colour adjustments (used for the "before" side of the comparison). */
  skipAdjust?: boolean
  /** Enhance mode adds a light sharpen after enlarging to restore edge contrast. */
  enhance?: boolean
}

const ctx2d = (c: AnyCanvas): Ctx => {
  const x = c.getContext('2d', { willReadFrequently: false }) as Ctx | null
  if (!x) throw new Error('This browser could not create a drawing surface for an image this large.')
  return x
}
const release = (c: AnyCanvas) => { c.width = 0; c.height = 0 }
const tick = () => new Promise<void>((r) => setTimeout(r, 0))
export const BAND = 256

/** Draws the source rotated / flipped and cropped into a canvas at source resolution. */
function orientAndCrop(src: CanvasImageSource & { width: number; height: number }, e: Edits, make: MakeCanvas, cover: RenderOpts['cover']) {
  const c = cropPixels(src.width, src.height, e)
  let { x, y, w, h } = c
  if (cover) { x += Math.round(cover.x * w); y += Math.round(cover.y * h); w = Math.max(1, Math.round(cover.w * w)); h = Math.max(1, Math.round(cover.h * h)) }
  const out = make(w, h)
  const g = ctx2d(out)
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  g.translate(-x, -y)
  g.translate(c.ow / 2, c.oh / 2)
  g.rotate((e.rotate * Math.PI) / 180)
  g.scale(e.flipH ? -1 : 1, e.flipV ? -1 : 1)
  g.drawImage(src, -src.width / 2, -src.height / 2)
  return out
}

/** High-quality resample: halves (or doubles) in steps so large scale changes keep detail instead of aliasing. */
async function resample(src: AnyCanvas, w: number, h: number, make: MakeCanvas, onStep?: (i: number, n: number) => void) {
  if (src.width === w && src.height === h) return src
  let cur = src
  const steps: { w: number; h: number }[] = []
  let cw = src.width, ch = src.height
  if (w > cw) { while (cw * 2 < w && ch * 2 < h) { cw *= 2; ch *= 2; steps.push({ w: cw, h: ch }) } }
  else { while (cw / 2 > w && ch / 2 > h) { cw = Math.round(cw / 2); ch = Math.round(ch / 2); steps.push({ w: cw, h: ch }) } }
  steps.push({ w, h })
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    const next = make(s.w, s.h)
    const g = ctx2d(next)
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    g.drawImage(cur, 0, 0, s.w, s.h)
    if (cur !== src) release(cur)
    cur = next
    onStep?.(i + 1, steps.length)
    await tick()
  }
  return cur
}

/** Full render. Returns a canvas of exactly outW × outH. */
export async function render(src: CanvasImageSource & { width: number; height: number }, o: RenderOpts, make: MakeCanvas, progress: Progress = () => {}) {
  progress('transform', 0)
  const oriented = orientAndCrop(src, o.edits, make, o.cover)
  progress('transform', 1)
  await tick()
  const upscaling = o.outW * o.outH > oriented.width * oriented.height
  const out = await resample(oriented, o.outW, o.outH, make, (i, n) => progress('resize', i / n))
  if (out !== oriented) release(oriented)
  const g = ctx2d(out)
  const adj = effectiveAdjust(o.edits)
  const doAdjust = !o.skipAdjust && !isNeutral(adj)
  // Enhance: a gentle extra sharpen restores edge contrast lost when enlarging (it cannot invent missing detail).
  const sharpen = o.skipAdjust ? 0 : (o.sharpen ?? o.edits.sharpen) + (o.enhance && upscaling ? 35 : 0)
  if (doAdjust) {
    for (let y = 0; y < o.outH; y += BAND) {
      const rows = Math.min(BAND, o.outH - y)
      const d = g.getImageData(0, y, o.outW, rows)
      applyAdjust(d.data, adj)
      g.putImageData(d, 0, y)
      progress('adjust', (y + rows) / o.outH)
      if ((y / BAND) % 8 === 7) await tick()
    }
  }
  if (sharpen > 0) {
    const stride = o.outW * 4
    let above: Uint8ClampedArray | null = null
    for (let y = 0; y < o.outH; y += BAND) {
      const rows = Math.min(BAND, o.outH - y)
      const d = g.getImageData(0, y, o.outW, rows)
      const below = y + rows < o.outH ? g.getImageData(0, y + rows, o.outW, 1).data : null
      const lastRow = d.data.slice((rows - 1) * stride, rows * stride) // unsharpened, needed by the next band
      sharpenBand(d.data, o.outW, rows, above, below, sharpen)
      g.putImageData(d, 0, y)
      above = lastRow
      progress('sharpen', (y + rows) / o.outH)
      if ((y / BAND) % 4 === 3) await tick()
    }
  }
  return out
}

export async function encode(c: AnyCanvas, type: string, quality: number): Promise<Blob> {
  const blob = 'convertToBlob' in c
    ? await (c as OffscreenCanvas).convertToBlob({ type, quality })
    : await new Promise<Blob | null>((res) => (c as HTMLCanvasElement).toBlob(res, type, quality))
  if (!blob) throw new Error('The browser could not encode the image (out of memory or unsupported format).')
  if (type !== 'image/png' && blob.type === 'image/png') throw new Error(`This browser cannot save ${type.replace('image/', '').toUpperCase()} files. Choose PNG or JPEG.`)
  return blob
}

/** Tests whether the browser can actually allocate and read a canvas of w × h (iOS Safari caps at ~16.7 MP). */
export function canvasSupports(w: number, h: number, make: MakeCanvas): boolean {
  try {
    const c = make(w, h)
    const g = c.getContext('2d') as Ctx | null
    if (!g) return false
    g.fillStyle = '#ff0000'
    g.fillRect(w - 1, h - 1, 1, 1)
    const ok = g.getImageData(w - 1, h - 1, 1, 1).data[0] === 255
    release(c)
    return ok
  } catch { return false }
}
