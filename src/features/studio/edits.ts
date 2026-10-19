/**
 * Image Studio edit model: a non-destructive list of settings applied to the untouched original.
 * Pixel operations are pure and run in fixed-size row bands so even 8K images never need a second full copy.
 */
export interface Adjust { brightness: number; contrast: number; saturation: number; warmth: number; exposure: number }
export interface Crop { x: number; y: number; w: number; h: number }
export interface Edits {
  rotate: 0 | 90 | 180 | 270
  flipH: boolean
  flipV: boolean
  /** Fractions (0–1) of the rotated / flipped image. */
  crop: Crop
  adjust: Adjust
  /** Unsharp-mask strength 0–200 (%). */
  sharpen: number
  filter: FilterId
}
export type FilterId = 'none' | 'vivid' | 'mono' | 'warm' | 'cool' | 'fade' | 'dramatic'
export const FILTERS: { id: FilterId; label: string; adjust: Partial<Adjust> }[] = [
  { id: 'none', label: 'Original', adjust: {} },
  { id: 'vivid', label: 'Vivid', adjust: { saturation: 35, contrast: 12 } },
  { id: 'mono', label: 'Mono', adjust: { saturation: -100, contrast: 10 } },
  { id: 'warm', label: 'Warm', adjust: { warmth: 35, saturation: 8 } },
  { id: 'cool', label: 'Cool', adjust: { warmth: -35 } },
  { id: 'fade', label: 'Fade', adjust: { contrast: -25, brightness: 6, saturation: -20 } },
  { id: 'dramatic', label: 'Dramatic', adjust: { contrast: 35, saturation: -15, exposure: -8 } },
]
export const NO_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, exposure: 0 }
export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 }
export const DEFAULT_EDITS: Edits = { rotate: 0, flipH: false, flipV: false, crop: FULL_CROP, adjust: NO_ADJUST, sharpen: 0, filter: 'none' }

export const effectiveAdjust = (e: Edits): Adjust => {
  const f = FILTERS.find((x) => x.id === e.filter)?.adjust ?? {}
  const add = (k: keyof Adjust) => Math.max(-100, Math.min(100, e.adjust[k] + (f[k] ?? 0)))
  return { brightness: add('brightness'), contrast: add('contrast'), saturation: add('saturation'), warmth: add('warmth'), exposure: add('exposure') }
}
export const isNeutral = (a: Adjust) => !a.brightness && !a.contrast && !a.saturation && !a.warmth && !a.exposure
export const isIdentity = (e: Edits) => !e.rotate && !e.flipH && !e.flipV && e.crop.x === 0 && e.crop.y === 0 && e.crop.w === 1 && e.crop.h === 1 && isNeutral(effectiveAdjust(e)) && !e.sharpen

/** Size of the oriented (rotated) image and of the crop inside it. */
export function orientedSize(w: number, h: number, rotate: Edits['rotate']) { return rotate % 180 ? { w: h, h: w } : { w, h } }
export function cropPixels(w: number, h: number, e: Edits) {
  const o = orientedSize(w, h, e.rotate)
  const c = clampCrop(e.crop)
  const x = Math.round(c.x * o.w), y = Math.round(c.y * o.h)
  return { x, y, w: Math.max(1, Math.min(o.w - x, Math.round(c.w * o.w))), h: Math.max(1, Math.min(o.h - y, Math.round(c.h * o.h))), ow: o.w, oh: o.h }
}
export function clampCrop(c: Crop): Crop {
  const w = Math.min(1, Math.max(0.01, c.w)), h = Math.min(1, Math.max(0.01, c.h))
  return { x: Math.min(1 - w, Math.max(0, c.x)), y: Math.min(1 - h, Math.max(0, c.y)), w, h }
}
/** Largest centred crop with the given aspect (width / height in pixels) for an oriented image of w × h. */
export function aspectCrop(aspect: number | null, w: number, h: number): Crop {
  if (!aspect) return FULL_CROP
  const imgAspect = w / h
  if (imgAspect > aspect) { const cw = aspect / imgAspect; return { x: (1 - cw) / 2, y: 0, w: cw, h: 1 } }
  const ch = imgAspect / aspect
  return { x: 0, y: (1 - ch) / 2, w: 1, h: ch }
}

/* ---------------- History (undo / redo) ---------------- */
export interface History { past: Edits[]; present: Edits; future: Edits[] }
export const initHistory = (e: Edits = DEFAULT_EDITS): History => ({ past: [], present: e, future: [] })
export function commit(h: History, next: Edits, limit = 100): History {
  if (JSON.stringify(next) === JSON.stringify(h.present)) return h
  return { past: [...h.past, h.present].slice(-limit), present: next, future: [] }
}
export const undo = (h: History): History => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h)
export const redo = (h: History): History => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h)

/* ---------------- Pixel operations ---------------- */
/** Per-channel lookup tables for exposure, brightness, contrast and warmth (CSS-filter-compatible formulas). */
export function buildLuts(a: Adjust) {
  const exp = 2 ** (a.exposure / 50) // ±2 stops at ±100
  const b = 1 + a.brightness / 100
  const k = 1 + a.contrast / 100
  const warmR = 1 + a.warmth / 300, warmB = 1 - a.warmth / 300
  const make = (warm: number) => {
    const t = new Uint8ClampedArray(256)
    for (let i = 0; i < 256; i++) {
      let v = (i / 255) * exp * b
      v = (v - 0.5) * k + 0.5
      t[i] = Math.round(v * warm * 255)
    }
    return t
  }
  return { r: make(warmR), g: make(1), b: make(warmB) }
}

/** Applies adjustments in place to RGBA pixels. */
export function applyAdjust(px: Uint8ClampedArray, a: Adjust) {
  if (isNeutral(a)) return
  const lut = buildLuts(a)
  const s = 1 + a.saturation / 100
  for (let i = 0; i < px.length; i += 4) {
    let r = lut.r[px[i]], g = lut.g[px[i + 1]], bl = lut.b[px[i + 2]]
    if (s !== 1) {
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * bl
      r = L + (r - L) * s; g = L + (g - L) * s; bl = L + (bl - L) * s
    }
    px[i] = r; px[i + 1] = g; px[i + 2] = bl // Uint8ClampedArray clamps and rounds
  }
}

/**
 * Unsharp mask for one band of rows. `band` holds `rows` rows of width `w` (RGBA) to sharpen in place.
 * `above` / `below` are the unsharpened neighbour rows (or null at the image edge). Uses a 3×3 box blur.
 */
export function sharpenBand(band: Uint8ClampedArray, w: number, rows: number, above: Uint8ClampedArray | null, below: Uint8ClampedArray | null, amount: number) {
  if (amount <= 0 || w < 1 || rows < 1) return
  const k = amount / 100
  const stride = w * 4
  const src = band.slice() // unsharpened copy of this band only
  const row = (y: number) => (y < 0 ? above ?? src.subarray(0, stride) : y >= rows ? below ?? src.subarray((rows - 1) * stride, rows * stride) : src.subarray(y * stride, (y + 1) * stride))
  for (let y = 0; y < rows; y++) {
    const up = row(y - 1), mid = row(y), dn = row(y + 1)
    for (let x = 0; x < w; x++) {
      const xl = Math.max(0, x - 1) * 4, xc = x * 4, xr = Math.min(w - 1, x + 1) * 4
      for (let c = 0; c < 3; c++) {
        const blur = (up[xl + c] + up[xc + c] + up[xr + c] + mid[xl + c] + mid[xc + c] + mid[xr + c] + dn[xl + c] + dn[xc + c] + dn[xr + c]) / 9
        const v = mid[xc + c]
        band[y * stride + xc + c] = v + (v - blur) * k
      }
    }
  }
}
