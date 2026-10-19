import { db } from '@/lib/db'
import { makeRepo } from '@/services/repo'
import type { MediaFile } from '@/types/models'

/** Repo for media rows so updates keep updatedAt / version / syncedAt consistent. */
export const mediaRepo = makeRepo<MediaFile>(db.media, () => ({ name: 'file', mime: 'application/octet-stream', size: 0, blob: new Blob(), thumbnail: null, description: '' }))

export const MAX_FILE_BYTES = 100 * 1024 * 1024

export type MediaKind = 'image' | 'video' | 'document'

/** Allowed file types keyed by extension → canonical MIME. */
const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', ogg: 'video/ogg', mov: 'video/quicktime',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', csv: 'text/csv', json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
const ALLOWED_MIME = new Set(Object.values(EXT_MIME))

export const ACCEPT_ATTR = [...Object.keys(EXT_MIME).map((e) => `.${e}`), ...ALLOWED_MIME].join(',')
export const ALLOWED_LABEL = 'Images (PNG, JPEG, GIF, WebP, SVG, AVIF), video (MP4, WebM, Ogg, MOV), documents (PDF, TXT, MD, CSV, DOCX, XLSX, PPTX, JSON)'

const ext = (name: string) => (name.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase()

/** Returns the MIME type to store, or an error message if the file is not accepted. */
export function validateFile(f: File): { mime: string } | { error: string } {
  const byExt = EXT_MIME[ext(f.name)]
  // Trust the extension when the browser reports a generic or platform-specific type (e.g. CSV as application/vnd.ms-excel).
  const mime = ALLOWED_MIME.has(f.type) ? f.type : byExt
  if (!mime) return { error: `Unsupported file type${f.type ? ` (${f.type})` : ''}.` }
  if (f.size > MAX_FILE_BYTES) return { error: `File is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is 100 MB.` }
  if (f.size === 0) return { error: 'File is empty.' }
  return { mime }
}

export function kindOf(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'document'
}
export const isTextual = (mime: string) => mime.startsWith('text/') || mime === 'application/json'

export function typeLabel(mime: string, name: string) {
  const e = ext(name)
  return e ? e.toUpperCase() : mime.split('/')[1]?.toUpperCase() ?? 'FILE'
}

/** Read a file into a Blob while reporting progress (0–1). */
export function readWithProgress(file: File, mime: string, onProgress: (p: number) => void): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total) }
    r.onerror = () => reject(r.error ?? new Error('Could not read file'))
    r.onabort = () => reject(new Error('Reading was cancelled'))
    r.onload = () => { onProgress(1); resolve(new Blob([r.result as ArrayBuffer], { type: mime })) }
    r.readAsArrayBuffer(file)
  })
}

/**
 * Downscale an image to a ≤320px JPEG data URL. SVGs are rasterised through an <img> element, which never runs
 * scripts, so untrusted SVG markup is never inserted into the page DOM. Returns null when the browser can't decode it.
 */
export async function makeThumbnail(blob: Blob, max = 320): Promise<string | null> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.decoding = 'async'
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('decode failed'))
      i.src = url
    })
    const w = img.naturalWidth || max, h = img.naturalHeight || max
    const scale = Math.min(1, max / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * scale))
    canvas.height = Math.max(1, Math.round(h * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff' // JPEG has no alpha; avoid black backgrounds for transparent images.
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}
