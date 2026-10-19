/// <reference lib="webworker" />
/** Background export: renders and encodes on an OffscreenCanvas so the page stays responsive. */
import { encode, render, type RenderOpts, type Stage } from './pipeline'

export interface ExportJob { bitmap: ImageBitmap; opts: RenderOpts; type: string; quality: number }
export type WorkerMsg =
  | { type: 'progress'; stage: Stage; pct: number }
  | { type: 'done'; blob: Blob; width: number; height: number; ms: number }
  | { type: 'error'; message: string }

const post = (m: WorkerMsg) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m)

self.onmessage = async (ev: MessageEvent<ExportJob>) => {
  const t0 = performance.now()
  const { bitmap, opts, type, quality } = ev.data
  try {
    const canvas = await render(bitmap, opts, (w, h) => new OffscreenCanvas(w, h), (stage, pct) => post({ type: 'progress', stage, pct }))
    bitmap.close()
    post({ type: 'progress', stage: 'encode', pct: 0 })
    const blob = await encode(canvas, type, quality)
    const { width, height } = canvas
    canvas.width = 0; canvas.height = 0
    post({ type: 'done', blob, width, height, ms: performance.now() - t0 })
  } catch (e) {
    post({ type: 'error', message: e instanceof RangeError || /memory|allocation/i.test(String(e)) ? 'The device ran out of memory for this size. Choose a lower resolution or close other tabs.' : (e as Error).message || String(e) })
  }
}
