/**
 * Main-thread export API. Uses a Web Worker + OffscreenCanvas when available (background processing), otherwise
 * falls back to the same pipeline on the page. After encoding, the file is decoded again to VERIFY its real size.
 */
import { encode, render, canvasSupports, type RenderOpts, type Stage } from './pipeline'
import type { WorkerMsg } from './export.worker'
import type { DeviceInfo } from './resolution'

export interface ExportResult { blob: Blob; width: number; height: number; ms: number; verified: boolean; background: boolean }
export interface ExportHandle { promise: Promise<ExportResult>; cancel: () => void }

export const supportsWorkerExport = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined' &&
  !!(OffscreenCanvas.prototype as unknown as { convertToBlob?: unknown }).convertToBlob

export function deviceInfo(): DeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } }
  const mobile = nav.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  return { memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null, mobile }
}
const domCanvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h })
export const probeCanvas = (w: number, h: number) => canvasSupports(w, h, typeof OffscreenCanvas !== 'undefined' ? (a, b) => new OffscreenCanvas(a, b) : domCanvas)

async function verify(blob: Blob) {
  try { const b = await createImageBitmap(blob); const r = { width: b.width, height: b.height }; b.close(); return r } catch { return null }
}

export function startExport(source: Blob, opts: RenderOpts, type: string, quality: number, onProgress: (stage: Stage, pct: number) => void): ExportHandle {
  let cancel = () => {}
  const promise = (async (): Promise<ExportResult> => {
    onProgress('decode', 0)
    if (supportsWorkerExport()) {
      const bitmap = await createImageBitmap(source)
      const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' })
      const done = await new Promise<{ blob: Blob; width: number; height: number; ms: number }>((resolve, reject) => {
        cancel = () => { worker.terminate(); bitmap.close(); reject(new DOMException('Export cancelled', 'AbortError')) }
        worker.onmessage = (ev: MessageEvent<WorkerMsg>) => {
          const m = ev.data
          if (m.type === 'progress') onProgress(m.stage, m.pct)
          else if (m.type === 'done') resolve(m)
          else reject(new Error(m.message))
        }
        worker.onerror = (e) => reject(new Error(e.message || 'The export worker crashed (usually out of memory). Try a lower resolution.'))
        worker.postMessage({ bitmap, opts, type, quality }, [bitmap])
      }).finally(() => worker.terminate())
      onProgress('verify', 0)
      const real = await verify(done.blob)
      return { ...done, verified: !!real && real.width === opts.outW && real.height === opts.outH, background: true }
    }
    // Fallback: same pipeline on the main thread (yields between bands so the page stays usable).
    let aborted = false
    cancel = () => { aborted = true }
    const t0 = performance.now()
    const img = typeof createImageBitmap !== 'undefined' ? await createImageBitmap(source) : await loadImage(source)
    const canvas = await render(img, opts, domCanvas, (s, p) => { if (aborted) throw new DOMException('Export cancelled', 'AbortError'); onProgress(s, p) })
    if ('close' in img) img.close()
    onProgress('encode', 0)
    const blob = await encode(canvas, type, quality)
    const { width, height } = canvas
    canvas.width = 0; canvas.height = 0
    onProgress('verify', 0)
    const real = await verify(blob)
    return { blob, width, height, ms: performance.now() - t0, verified: !!real && real.width === opts.outW && real.height === opts.outH, background: false }
  })()
  return { promise, cancel: () => cancel() }
}

export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); res(img) }
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('This file could not be opened as an image.')) }
    img.src = url
  })
}

/** Decodes a downscaled copy for the live preview (keeps the UI fast for huge originals). */
export async function previewSource(blob: Blob, maxEdge: number): Promise<ImageBitmap | HTMLCanvasElement> {
  const full = typeof createImageBitmap !== 'undefined' ? await createImageBitmap(blob) : await loadImage(blob)
  const s = Math.min(1, maxEdge / Math.max(full.width, full.height))
  if (s === 1) return full instanceof HTMLImageElement ? drawTo(full, full.width, full.height) : full
  const w = Math.max(1, Math.round(full.width * s)), h = Math.max(1, Math.round(full.height * s))
  const c = drawTo(full, w, h)
  if ('close' in full) full.close()
  return c
}
function drawTo(img: CanvasImageSource, w: number, h: number) {
  const c = domCanvas(w, h)
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(img, 0, 0, w, h)
  return c
}
