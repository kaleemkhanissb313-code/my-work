import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from '@/components/ui'
import { cn } from '@/lib/cn'

/* Crop an uploaded picture: zoom + pan (drag or sliders), then export a JPEG data URL. */

type Aspect = 'square' | 'landscape' | 'original'
const RATIO: Record<Exclude<Aspect, 'original'>, number> = { square: 1, landscape: 4 / 3 }

function geometry(img: HTMLImageElement, vw: number, vh: number, zoom: number, fx: number, fy: number) {
  const base = Math.max(vw / img.naturalWidth, vh / img.naturalHeight)
  const s = base * zoom
  const w = img.naturalWidth * s, h = img.naturalHeight * s
  return { x: (vw - w) / 2 + (fx * (w - vw)) / 2, y: (vh - h) / 2 + (fy * (h - vh)) / 2, w, h }
}

export function CropDialog({ src, title, aspects, onDone, onClose }: {
  src: string; title: string; aspects: Aspect[]; onDone: (dataUrl: string) => void; onClose: () => void
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [error, setError] = useState(false)
  const [aspect, setAspect] = useState<Aspect>(aspects[0])
  const [zoom, setZoom] = useState(1)
  const [fx, setFx] = useState(0)
  const [fy, setFy] = useState(0)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null)

  useEffect(() => {
    const i = new Image()
    i.onload = () => setImg(i); i.onerror = () => setError(true); i.src = src
  }, [src])

  const ratio = aspect === 'original' ? (img ? img.naturalWidth / img.naturalHeight : 1) : RATIO[aspect]
  const VW = 320, VH = Math.round(VW / ratio)

  useEffect(() => {
    const c = canvas.current
    if (!c || !img) return
    c.width = VW * 2; c.height = VH * 2
    const ctx = c.getContext('2d')!
    ctx.setTransform(2, 0, 0, 2, 0, 0)
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, VW, VH)
    const g = aspect === 'original' ? { x: 0, y: 0, w: VW, h: VH } : geometry(img, VW, VH, zoom, fx, fy)
    ctx.drawImage(img, g.x, g.y, g.w, g.h)
  }, [img, aspect, zoom, fx, fy, VW, VH])

  const done = () => {
    if (!img) return
    const outW = aspect === 'square' ? 480 : Math.min(1280, img.naturalWidth)
    const outH = Math.round(outW / ratio)
    const c = document.createElement('canvas'); c.width = outW; c.height = outH
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, outW, outH)
    const g = aspect === 'original' ? { x: 0, y: 0, w: outW, h: outH } : geometry(img, outW, outH, zoom, fx, fy)
    ctx.drawImage(img, g.x, g.y, g.w, g.h)
    onDone(c.toDataURL('image/jpeg', 0.85))
  }

  const clamp = (v: number) => Math.max(-1, Math.min(1, v))
  const slider = (label: string, value: number, set: (v: number) => void, min: number, max: number, step: number) => (
    <label className="block text-xs text-muted">{label}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} className="mt-1 w-full accent-[rgb(var(--accent))]" disabled={aspect === 'original'} />
    </label>
  )
  return (
    <Modal open onClose={onClose} title={title} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!img} onClick={done}>Use picture</Button></>}>
      {error ? <p className="text-sm text-danger" role="alert">This image could not be opened. Try a PNG, JPG or WebP file.</p> : (
        <div className="space-y-3">
          {aspects.length > 1 && (
            <div className="flex gap-2" role="radiogroup" aria-label="Crop shape">
              {aspects.map((a) => (
                <button key={a} type="button" role="radio" aria-checked={aspect === a} onClick={() => { setAspect(a); setZoom(1); setFx(0); setFy(0) }}
                  className={cn('btn h-9 px-3 text-xs', aspect === a ? 'btn-3d' : 'btn-soft')}>{a === 'square' ? 'Square' : a === 'landscape' ? '4:3' : 'No crop'}</button>
              ))}
            </div>
          )}
          <canvas ref={canvas} aria-label="Crop preview" role="img"
            className={cn('mx-auto block w-full max-w-[320px] touch-none rounded-xl border border-line', aspect !== 'original' && 'cursor-move', aspect === 'square' && 'rounded-full')}
            style={{ aspectRatio: `${VW} / ${VH}` }}
            onPointerDown={(e) => { if (aspect === 'original') return; (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, fx, fy } }}
            onPointerMove={(e) => {
              const s = drag.current
              if (!s || !img) return
              const g = geometry(img, VW, VH, zoom, 0, 0)
              const sx = g.w > VW ? (2 * (e.clientX - s.x)) / (g.w - VW) : 0, sy = g.h > VH ? (2 * (e.clientY - s.y)) / (g.h - VH) : 0
              setFx(clamp(s.fx + sx)); setFy(clamp(s.fy + sy))
            }}
            onPointerUp={() => { drag.current = null }} />
          {slider('Zoom', zoom, setZoom, 1, 4, 0.01)}
          <div className="grid grid-cols-2 gap-3">{slider('Horizontal', fx, setFx, -1, 1, 0.01)}{slider('Vertical', fy, setFy, -1, 1, 0.01)}</div>
        </div>
      )}
    </Modal>
  )
}
