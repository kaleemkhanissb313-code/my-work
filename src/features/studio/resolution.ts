/**
 * Output-size, memory and file-size maths for Image Studio exports (pure, unit-tested).
 * Presets are 16:9 boxes; for portrait images the box is rotated so "8K" means 7680 px on the long edge.
 */
export type PresetId = 'original' | '720p' | '1080p' | '2k' | '4k' | '8k' | 'custom'
export const PRESETS: { id: Exclude<PresetId, 'original' | 'custom'>; label: string; w: number; h: number }[] = [
  { id: '720p', label: '720p (HD)', w: 1280, h: 720 },
  { id: '1080p', label: '1080p (Full HD)', w: 1920, h: 1080 },
  { id: '2k', label: '2K (QHD)', w: 2560, h: 1440 },
  { id: '4k', label: '4K (UHD)', w: 3840, h: 2160 },
  { id: '8k', label: '8K (UHD-2)', w: 7680, h: 4320 },
]
export const MAX_W = 7680
export const MAX_H = 4320

/** fit = keep aspect inside the box · fill = exactly the box size (centre-cropped) */
export type FitMode = 'fit' | 'fill'
export interface SizeRequest { preset: PresetId; mode: FitMode; customW?: number; customH?: number }
export interface OutSize { w: number; h: number; /** Centre crop applied for "fill" (fractions of the source). */ cover: { x: number; y: number; w: number; h: number } | null; scale: number }

export function boxFor(preset: PresetId, srcW: number, srcH: number, customW = 0, customH = 0): { w: number; h: number } {
  if (preset === 'original') return { w: srcW, h: srcH }
  if (preset === 'custom') return { w: Math.max(1, Math.round(customW)), h: Math.max(1, Math.round(customH)) }
  const p = PRESETS.find((x) => x.id === preset)!
  return srcH > srcW ? { w: p.h, h: p.w } : { w: p.w, h: p.h }
}

/** Final pixel size for a source of srcW × srcH (already cropped / rotated). Never exceeds 8K on either orientation. */
export function outputSize(srcW: number, srcH: number, req: SizeRequest): OutSize {
  if (srcW <= 0 || srcH <= 0) throw new Error('The image has no pixels.')
  const box = boxFor(req.preset, srcW, srcH, req.customW, req.customH)
  const long = Math.max(box.w, box.h), short = Math.min(box.w, box.h)
  if (long > MAX_W || short > MAX_H) throw new Error(`Maximum export size is ${MAX_W} × ${MAX_H} (8K).`)
  if (req.preset === 'original' || req.mode === 'fit') {
    const s = req.preset === 'original' ? 1 : Math.min(box.w / srcW, box.h / srcH)
    return { w: Math.max(1, Math.round(srcW * s)), h: Math.max(1, Math.round(srcH * s)), cover: null, scale: s }
  }
  // fill: scale to cover the box, crop the overflow evenly from both sides
  const s = Math.max(box.w / srcW, box.h / srcH)
  const cw = box.w / s / srcW, ch = box.h / s / srcH
  return { w: box.w, h: box.h, cover: { x: (1 - cw) / 2, y: (1 - ch) / 2, w: cw, h: ch }, scale: s }
}

export const megapixels = (w: number, h: number) => (w * h) / 1e6

/* ---------------- Memory ---------------- */
export interface DeviceInfo { memoryGb: number | null; mobile: boolean; maxCanvasOk?: boolean }
/** Peak bytes for an export: output canvas + previous upscale step + band buffers + encoder copy. */
export function estimateBytes(w: number, h: number, srcW: number, srcH: number, sharpen: boolean) {
  const out = w * h * 4
  return Math.round(srcW * srcH * 4 + out * (sharpen ? 2.6 : 2.3))
}
/** Conservative share of device memory a single tab can safely use for one image. */
export function memoryBudget(d: DeviceInfo) {
  const GB = 1024 ** 3
  if (d.memoryGb) return Math.round(d.memoryGb * GB * (d.mobile ? 0.12 : 0.18))
  return d.mobile ? 280 * 1024 ** 2 : 1.2 * GB
}
export type MemStatus = 'ok' | 'risky' | 'insufficient'
export function memoryCheck(bytes: number, d: DeviceInfo): { status: MemStatus; budget: number; message: string | null } {
  const budget = memoryBudget(d)
  const mb = (n: number) => `${Math.round(n / 1024 ** 2)} MB`
  if (d.maxCanvasOk === false) return { status: 'insufficient', budget, message: 'This browser cannot create an image canvas this large (common on iPhone / iPad). Choose 4K or lower.' }
  if (bytes > budget) return { status: 'insufficient', budget, message: `This export needs about ${mb(bytes)} of memory, more than this device can safely give one tab (${mb(budget)}). It may fail or close the tab — choose a lower resolution, or close other tabs and try anyway.` }
  if (bytes > budget * 0.6) return { status: 'risky', budget, message: `This export uses about ${mb(bytes)} of memory. Close other heavy tabs before exporting.` }
  return { status: 'ok', budget, message: null }
}

/* ---------------- File size ---------------- */
export type OutFormat = 'image/png' | 'image/jpeg' | 'image/webp'
export const FORMATS: { id: OutFormat; label: string; ext: string; lossy: boolean }[] = [
  { id: 'image/jpeg', label: 'JPEG', ext: 'jpg', lossy: true },
  { id: 'image/png', label: 'PNG (lossless)', ext: 'png', lossy: false },
  { id: 'image/webp', label: 'WebP', ext: 'webp', lossy: true },
]
/** Rough size range for a photo-like image (real size depends on content; shown as an estimate). */
export function estimateFileBytes(w: number, h: number, format: OutFormat, quality: number) {
  const px = w * h
  const q = Math.min(1, Math.max(0.1, quality))
  const bpp = format === 'image/png' ? 1.9 : (0.04 + 0.5 * q ** 3) * (format === 'image/webp' ? 0.72 : 1)
  const mid = px * bpp
  return { low: Math.round(mid * 0.55), mid: Math.round(mid), high: Math.round(mid * 1.6) }
}
export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
/** Rough processing time in seconds (calibrated against a mid-range laptop; shown as an estimate only). */
export const estimateSeconds = (w: number, h: number, sharpen: boolean, format: OutFormat) =>
  Math.max(0.3, (w * h) / 1e6 * ((sharpen ? 0.09 : 0.05) + (format === 'image/png' ? 0.12 : 0.04)))
