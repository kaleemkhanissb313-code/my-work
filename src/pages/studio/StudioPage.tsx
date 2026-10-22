import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle, CheckCircle2, ChevronDown, Columns2, Crop as CropIcon, Download, Eye, FlipHorizontal2, FlipVertical2, FolderOpen, ImagePlus, Maximize, Minus,
  Plus, Redo2, RotateCcw, RotateCw, Save, SlidersHorizontal, Sparkles, Undo2, Upload, Wand2, X,
} from 'lucide-react'
import { Button, IconButton, Modal, Progress, Select } from '@/components/ui'
import { toast } from '@/components/feedback'
import { db } from '@/lib/db'
import { cn } from '@/lib/cn'
import { downloadBlob } from '@/services/backup'
import { makeThumbnail, mediaRepo } from '@/features/media/media'
import {
  aspectCrop, clampCrop, commit, cropPixels, DEFAULT_EDITS, FILTERS, FULL_CROP, initHistory, isIdentity, orientedSize, redo, undo, type Adjust, type Crop, type Edits, type History,
} from '@/features/studio/edits'
import {
  estimateBytes, estimateFileBytes, estimateSeconds, FORMATS, formatBytes, megapixels, memoryCheck, outputSize, PRESETS, type FitMode, type OutFormat, type PresetId,
} from '@/features/studio/resolution'
import { render, type Stage } from '@/features/studio/pipeline'
import { deviceInfo, previewSource, probeCanvas, startExport, supportsWorkerExport, type ExportHandle, type ExportResult } from '@/features/studio/exporter'

const STAGE_LABEL: Record<Stage, string> = { decode: 'Decoding original', transform: 'Cropping & rotating', resize: 'Resampling', adjust: 'Applying colour', sharpen: 'Sharpening detail', encode: 'Encoding file', verify: 'Verifying output' }
const STAGE_WEIGHT: Record<Stage, [number, number]> = { decode: [0, 5], transform: [5, 12], resize: [12, 40], adjust: [40, 60], sharpen: [60, 80], encode: [80, 97], verify: [97, 100] }
const MAX_SOURCE_BYTES = 200 * 1024 * 1024
type Tool = 'adjust' | 'crop' | 'filters' | 'detail' | 'export'

interface Source { blob: Blob; name: string; w: number; h: number; mediaId: string | null }

export function StudioPage() {
  const [params, setParams] = useSearchParams()
  const [src, setSrc] = useState<Source | null>(null)
  const [preview, setPreview] = useState<ImageBitmap | HTMLCanvasElement | null>(null)
  const [hist, setHist] = useState<History>(initHistory())
  const [draft, setDraft] = useState<Edits | null>(null) // live slider value before it is committed to history
  const edits = draft ?? hist.present
  const [tool, setTool] = useState<Tool>('adjust')
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [compare, setCompare] = useState(false)
  const [split, setSplit] = useState(50)
  const [showOriginal, setShowOriginal] = useState(false)
  const [picker, setPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const open = useCallback(async (blob: Blob, name: string, mediaId: string | null) => {
    if (!blob.type.startsWith('image/')) return toast('Choose an image file (JPEG, PNG, WebP, AVIF, GIF).', 'error')
    if (blob.size > MAX_SOURCE_BYTES) return toast(`That image is ${formatBytes(blob.size)} — the limit is ${formatBytes(MAX_SOURCE_BYTES)}.`, 'error')
    setLoading(true)
    try {
      const pv = await previewSource(blob, 4000)
      const full = await createImageBitmap(blob).catch(() => null)
      const w = full?.width ?? pv.width, h = full?.height ?? pv.height
      full?.close()
      setSrc({ blob, name, w, h, mediaId }); setPreview(pv); setHist(initHistory()); setDraft(null); setZoom('fit')
    } catch (e) { toast((e as Error).message || 'This image could not be opened.', 'error') } finally { setLoading(false) }
  }, [])

  // ?media=<id> opens an image from the Media Library
  const mediaParam = params.get('media')
  useEffect(() => {
    if (!mediaParam) return
    void db.media.get(mediaParam).then((m) => { if (m && !m.deletedAt) void open(m.blob, m.name, m.id); else toast('That image is no longer in the library.', 'error') })
  }, [mediaParam, open])

  const set = (patch: Partial<Edits>, live = false) => {
    const next = { ...edits, ...patch }
    if (live) setDraft(next)
    else { setDraft(null); setHist((h) => commit(h, next)) }
  }
  const setAdjust = (k: keyof Adjust, v: number, live: boolean) => set({ adjust: { ...edits.adjust, [k]: v } }, live)
  const doUndo = () => { setDraft(null); setHist(undo) }
  const doRedo = () => { setDraft(null); setHist(redo) }

  // Keyboard: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, + / − zoom, 0 fit, \ hold for original
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && (t as HTMLInputElement).type !== 'range') return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo() }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo() }
      else if (!mod && (e.key === '+' || e.key === '=')) setZoom((z) => Math.min(8, (z === 'fit' ? 1 : z) * 1.25))
      else if (!mod && e.key === '-') setZoom((z) => Math.max(0.1, (z === 'fit' ? 1 : z) / 1.25))
      else if (!mod && e.key === '0') setZoom('fit')
      else if (!mod && e.key === '\\') setShowOriginal(e.type === 'keydown')
    }
    const up = (e: KeyboardEvent) => { if (e.key === '\\') setShowOriginal(false) }
    window.addEventListener('keydown', k); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('keyup', up) }
  })

  if (!src || !preview) return (
    <div className="mx-auto max-w-3xl">
      <Header />
      <div className="card mt-4 flex flex-col items-center gap-4 border-dashed p-8 text-center sm:p-12"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void open(f, f.name, null) }}>
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-raised text-accent"><ImagePlus className="h-7 w-7" aria-hidden /></span>
        <div><h2 className="text-lg font-semibold">Open an image to edit</h2><p className="mt-1 text-sm text-muted">Drop a file here, choose one from your device or from the Media Library. The original is never changed.</p></div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" icon={Upload} loading={loading} onClick={() => fileRef.current?.click()}>Choose image</Button>
          <Button icon={FolderOpen} onClick={() => setPicker(true)}>Media Library</Button>
        </div>
        <p className="text-xs text-muted">Export up to 8K (7680 × 4320) as JPEG, PNG or WebP.</p>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f, f.name, null); e.target.value = '' }} />
      {picker && <LibraryPicker onClose={() => setPicker(false)} onPick={(id) => { setPicker(false); setParams({ media: id }) }} />}
    </div>
  )

  const o = orientedSize(src.w, src.h, edits.rotate)
  const cp = cropPixels(src.w, src.h, edits)
  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-6.5rem)]">
      <div className="flex flex-wrap items-center gap-1.5">
        <h1 className="me-auto min-w-0 truncate text-base font-semibold sm:text-lg" title={src.name}>{src.name} <span className="text-xs font-normal text-muted">{src.w} × {src.h}</span></h1>
        <IconButton icon={Undo2} label="Undo (Ctrl+Z)" disabled={!hist.past.length} onClick={doUndo} />
        <IconButton icon={Redo2} label="Redo (Ctrl+Shift+Z)" disabled={!hist.future.length} onClick={doRedo} />
        <IconButton icon={RotateCcw} label="Reset all edits" disabled={isIdentity(edits)} onClick={() => set(DEFAULT_EDITS)} />
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
        <IconButton icon={Columns2} label="Before / after comparison" active={compare} onClick={() => setCompare(!compare)} />
        <IconButton icon={Eye} label="Hold to see the original (\\)" active={showOriginal} onPointerDown={() => setShowOriginal(true)} onPointerUp={() => setShowOriginal(false)} onPointerLeave={() => setShowOriginal(false)} />
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
        <Button size="sm" icon={FolderOpen} onClick={() => fileRef.current?.click()}><span className="hidden sm:inline">Open</span></Button>
        <Button size="sm" variant="primary" icon={Download} onClick={() => setTool('export')}>Export</Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f, f.name, null); e.target.value = '' }} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <Canvas preview={preview} edits={edits} srcW={src.w} srcH={src.h} zoom={zoom} setZoom={setZoom} compare={compare} split={split} setSplit={setSplit} showOriginal={showOriginal}
          cropping={tool === 'crop'} onCrop={(c, live) => set({ crop: c }, live)} />
        <aside className="card flex min-h-0 flex-col p-0 lg:w-[22rem] lg:shrink-0" aria-label="Editing tools">
          <div role="tablist" aria-label="Tool categories" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line/60 p-1.5" style={{ scrollbarWidth: 'none' }}>
            {([['adjust', 'Adjust', SlidersHorizontal], ['crop', 'Crop', CropIcon], ['filters', 'Filters', Wand2], ['detail', 'Detail', Sparkles], ['export', 'Export', Download]] as const).map(([id, label, Icon]) => (
              <button key={id} role="tab" aria-selected={tool === id} onClick={() => setTool(id)}
                className={cn('flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors', tool === id ? 'bg-accent text-onaccent' : 'text-muted hover:bg-raised hover:text-fg')}>
                <Icon className="h-4 w-4" aria-hidden />{label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tool === 'adjust' && <AdjustPanel a={edits.adjust} onChange={setAdjust} />}
            {tool === 'crop' && <CropPanel edits={edits} ow={o.w} oh={o.h} cp={cp} set={set} />}
            {tool === 'filters' && <FilterPanel preview={preview} edits={edits} set={set} />}
            {tool === 'detail' && <DetailPanel edits={edits} set={set} />}
            {tool === 'export' && <ExportPanel src={src} edits={edits} />}
          </div>
        </aside>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-raised text-accent"><ImagePlus className="h-5 w-5" aria-hidden /></span>
      <div><h1 className="text-xl font-semibold tracking-tight">Image Studio</h1><p className="text-sm text-muted">Edit photos and export up to 8K.</p></div>
    </div>
  )
}

/* ---------------- Canvas (live preview, zoom, crop overlay, comparison) ---------------- */
function Canvas({ preview, edits, srcW, srcH, zoom, setZoom, compare, split, setSplit, showOriginal, cropping, onCrop }: {
  preview: ImageBitmap | HTMLCanvasElement; edits: Edits; srcW: number; srcH: number; zoom: number | 'fit'; setZoom: (z: number | 'fit') => void
  compare: boolean; split: number; setSplit: (n: number) => void; showOriginal: boolean; cropping: boolean; onCrop: (c: Crop, live: boolean) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const before = useRef<HTMLCanvasElement>(null)
  const [boxSize, setBoxSize] = useState({ w: 600, h: 400 })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const w = Math.max(100, Math.round(e.contentRect.width)), h = Math.max(100, Math.round(e.contentRect.height))
      setBoxSize((b) => (Math.abs(b.w - w) < 4 && Math.abs(b.h - h) < 4 ? b : { w, h }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // While cropping, show the whole oriented image so the crop box can be moved.
  const viewEdits = cropping ? { ...edits, crop: FULL_CROP } : edits
  const pc = cropPixels(preview.width, preview.height, viewEdits)
  const fitScale = Math.min(boxSize.w / pc.w, boxSize.h / pc.h, 4)
  // Zoom is relative to ORIGINAL pixels (100% = one image pixel per screen pixel).
  const previewToSrc = pc.w / Math.max(1, cropPixels(srcW, srcH, viewEdits).w)
  const scale = zoom === 'fit' ? fitScale : zoom / previewToSrc
  const dispW = Math.max(1, Math.round(pc.w * scale)), dispH = Math.max(1, Math.round(pc.h * scale))
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1
  const renderW = Math.min(pc.w, Math.round(dispW * dpr)), renderH = Math.max(1, Math.round(renderW * (pc.h / pc.w)))

  // Live preview: same pipeline as export, on a screen-sized copy (fast even for very large originals).
  useEffect(() => {
    let alive = true
    // Short debounce (not requestAnimationFrame, which pauses in background tabs and would leave the preview stale).
    const id = setTimeout(async () => {
      setBusy(true)
      try {
        const make = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h })
        const scaleSharpen = (edits.sharpen * renderW) / Math.max(1, cropPixels(srcW, srcH, viewEdits).w)
        const out = await render(preview, { edits: viewEdits, outW: renderW, outH: renderH, cover: null, sharpen: Math.min(edits.sharpen, scaleSharpen * 1.5 + edits.sharpen * 0.3), skipAdjust: showOriginal }, make)
        if (!alive || !canvas.current) return
        const c = canvas.current
        c.width = renderW; c.height = renderH
        c.getContext('2d')!.drawImage(out, 0, 0)
        if (compare && before.current) {
          const b = await render(preview, { edits: viewEdits, outW: renderW, outH: renderH, cover: null, skipAdjust: true }, make)
          if (!alive) return
          before.current.width = renderW; before.current.height = renderH
          before.current.getContext('2d')!.drawImage(b, 0, 0)
        }
      } catch (e) { toast((e as Error).message, 'error') } finally { if (alive) setBusy(false) }
    }, 16)
    return () => { alive = false; clearTimeout(id) }
  }, [preview, JSON.stringify(viewEdits), renderW, renderH, compare, showOriginal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Crop overlay interactions (pointer events work for mouse, pen and touch)
  const drag = useRef<{ mode: 'move' | 'new'; sx: number; sy: number; start: Crop } | null>(null)
  const toFrac = (e: React.PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height } }
  const onDown = (e: React.PointerEvent) => {
    if (!cropping) return
    const p = toFrac(e)
    const c = edits.crop
    const inside = p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h
    drag.current = { mode: inside ? 'move' : 'new', sx: p.x, sy: p.y, start: c }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toFrac(e)
    if (d.mode === 'move') onCrop(clampCrop({ ...d.start, x: d.start.x + p.x - d.sx, y: d.start.y + p.y - d.sy }), true)
    else onCrop(clampCrop({ x: Math.min(d.sx, p.x), y: Math.min(d.sy, p.y), w: Math.abs(p.x - d.sx), h: Math.abs(p.y - d.sy) }), true)
  }
  const onUp = () => { if (drag.current) { drag.current = null; onCrop(clampCrop(edits.crop), false) } }

  const pct = Math.round(scale * previewToSrc * 100)
  return (
    <div className="card relative flex h-[55dvh] min-w-0 shrink-0 flex-col overflow-hidden p-0 lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink">
      <div ref={box} className="checker relative min-h-0 flex-1 overflow-auto" style={{ background: 'repeating-conic-gradient(rgb(var(--line) / 0.35) 0 25%, transparent 0 50%) 0 0 / 20px 20px' }}>
        <div className="grid min-h-full min-w-full place-items-center p-2" style={{ width: zoom === 'fit' ? undefined : dispW + 16, height: zoom === 'fit' ? undefined : dispH + 16 }}>
          <div className={cn('relative touch-none select-none', cropping && 'cursor-crosshair')} style={{ width: dispW, height: dispH }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <canvas ref={canvas} className="block h-full w-full" aria-label="Edited image preview" role="img" />
            {compare && !cropping && <>
              <canvas ref={before} className="absolute inset-0 block h-full w-full" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} aria-hidden />
              <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${split}%` }} aria-hidden />
              <span className="pointer-events-none absolute start-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">Before</span>
              <span className="pointer-events-none absolute end-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">After</span>
            </>}
            {cropping && (
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                  style={{ left: `${edits.crop.x * 100}%`, top: `${edits.crop.y * 100}%`, width: `${edits.crop.w * 100}%`, height: `${edits.crop.h * 100}%` }}>
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">{Array.from({ length: 9 }, (_, i) => <span key={i} className="border border-white/25" />)}</div>
                </div>
              </div>
            )}
            {showOriginal && <span className="pointer-events-none absolute bottom-2 start-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">Original colours</span>}
          </div>
        </div>
      </div>
      <div className="flex h-11 shrink-0 flex-nowrap items-center gap-1 overflow-hidden border-t border-line/60 px-2 text-xs sm:gap-2">
        <IconButton icon={Minus} label="Zoom out (−)" className="h-8 w-8" onClick={() => setZoom(Math.max(0.05, (zoom === 'fit' ? fitScale * previewToSrc : zoom) / 1.25))} />
        <span className="w-12 text-center tabular-nums">{pct}%</span>
        <IconButton icon={Plus} label="Zoom in (+)" className="h-8 w-8" onClick={() => setZoom(Math.min(8, (zoom === 'fit' ? fitScale * previewToSrc : zoom) * 1.25))} />
        <Button size="sm" variant="ghost" icon={Maximize} onClick={() => setZoom('fit')}>Fit</Button>
        <Button size="sm" variant="ghost" className="hidden sm:inline-flex" onClick={() => setZoom(1)}>100%</Button>
        {compare && !cropping
          ? <label className="ms-auto flex min-w-0 items-center gap-2"><span className="hidden sm:inline">Split</span><input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Before/after split position" className="w-24 min-w-0 accent-[rgb(var(--accent))] sm:w-28" /></label>
          : <span className="ms-auto min-w-0 truncate text-muted" aria-live="polite">{busy ? 'Rendering…' : cropping ? 'Drag to crop' : 'Original kept'}</span>}
      </div>
    </div>
  )
}

/* ---------------- Tool panels ---------------- */
function Panel({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-line/50 py-2 last:border-0">
      <button type="button" className="flex min-h-[36px] w-full items-center justify-between text-start text-xs font-semibold uppercase tracking-wide text-muted" aria-expanded={open} onClick={() => setOpen(!open)}>
        {title}<ChevronDown className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')} aria-hidden />
      </button>
      {open && <div className="space-y-3 pt-1">{children}</div>}
    </section>
  )
}
function Slider({ label, value, min = -100, max = 100, onChange, unit = '' }: { label: string; value: number; min?: number; max?: number; unit?: string; onChange: (v: number, live: boolean) => void }) {
  const id = `sl-${label.replace(/\W+/g, '-')}`
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm"><label htmlFor={id}>{label}</label>
        <button type="button" className="tabular-nums text-xs text-muted hover:text-fg" onDoubleClick={() => onChange(0, false)} title="Double-click to reset">{value > 0 && min < 0 ? '+' : ''}{value}{unit}</button></div>
      <input id={id} type="range" min={min} max={max} value={value} className="w-full accent-[rgb(var(--accent))]"
        onChange={(e) => onChange(Number(e.target.value), true)} onPointerUp={(e) => onChange(Number((e.target as HTMLInputElement).value), false)} onKeyUp={(e) => onChange(Number((e.target as HTMLInputElement).value), false)} />
    </div>
  )
}

function AdjustPanel({ a, onChange }: { a: Adjust; onChange: (k: keyof Adjust, v: number, live: boolean) => void }) {
  return <>
    <Panel title="Light">
      <Slider label="Exposure" value={a.exposure} onChange={(v, l) => onChange('exposure', v, l)} />
      <Slider label="Brightness" value={a.brightness} onChange={(v, l) => onChange('brightness', v, l)} />
      <Slider label="Contrast" value={a.contrast} onChange={(v, l) => onChange('contrast', v, l)} />
    </Panel>
    <Panel title="Colour">
      <Slider label="Saturation" value={a.saturation} onChange={(v, l) => onChange('saturation', v, l)} />
      <Slider label="Warmth" value={a.warmth} onChange={(v, l) => onChange('warmth', v, l)} />
    </Panel>
  </>
}

const ASPECTS: { label: string; v: number | null }[] = [{ label: 'Free', v: null }, { label: '1:1', v: 1 }, { label: '4:5', v: 4 / 5 }, { label: '4:3', v: 4 / 3 }, { label: '3:2', v: 3 / 2 }, { label: '16:9', v: 16 / 9 }, { label: '9:16', v: 9 / 16 }]
function CropPanel({ edits, ow, oh, cp, set }: { edits: Edits; ow: number; oh: number; cp: { w: number; h: number }; set: (p: Partial<Edits>, live?: boolean) => void }) {
  const rot = (d: 90 | -90) => set({ rotate: (((edits.rotate + d) % 360) + 360) % 360 as Edits['rotate'], crop: FULL_CROP })
  return <>
    <Panel title="Rotate & flip">
      <div className="grid grid-cols-4 gap-2">
        <IconButton icon={RotateCcw} label="Rotate left" onClick={() => rot(-90)} className="w-full" />
        <IconButton icon={RotateCw} label="Rotate right" onClick={() => rot(90)} className="w-full" />
        <IconButton icon={FlipHorizontal2} label="Flip horizontally" active={edits.flipH} onClick={() => set({ flipH: !edits.flipH })} className="w-full" />
        <IconButton icon={FlipVertical2} label="Flip vertically" active={edits.flipV} onClick={() => set({ flipV: !edits.flipV })} className="w-full" />
      </div>
    </Panel>
    <Panel title="Crop">
      <div className="flex flex-wrap gap-1.5">{ASPECTS.map((a) => (
        <button key={a.label} type="button" className="chip min-h-[36px] px-3" onClick={() => set({ crop: aspectCrop(a.v, ow, oh) })}>{a.label}</button>
      ))}</div>
      <p className="text-xs text-muted">Drag on the image to draw a crop, or drag inside it to move it. Result: {cp.w} × {cp.h} px.</p>
      <Button size="sm" onClick={() => set({ crop: FULL_CROP })}>Clear crop</Button>
    </Panel>
  </>
}

function FilterPanel({ preview, edits, set }: { preview: ImageBitmap | HTMLCanvasElement; edits: Edits; set: (p: Partial<Edits>) => void }) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    void (async () => {
      const make = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h })
      const s = 96 / Math.max(preview.width, preview.height)
      const w = Math.max(1, Math.round(preview.width * s)), h = Math.max(1, Math.round(preview.height * s))
      const out: Record<string, string> = {}
      for (const f of FILTERS) {
        const c = await render(preview, { edits: { ...DEFAULT_EDITS, filter: f.id }, outW: w, outH: h, cover: null }, make)
        out[f.id] = (c as HTMLCanvasElement).toDataURL('image/jpeg', 0.8)
      }
      if (alive) setThumbs(out)
    })()
    return () => { alive = false }
  }, [preview])
  return (
    <Panel title="Filters">
      <div className="grid grid-cols-3 gap-2">{FILTERS.map((f) => (
        <button key={f.id} type="button" onClick={() => set({ filter: f.id })} aria-pressed={edits.filter === f.id}
          className={cn('overflow-hidden rounded-xl border text-xs transition', edits.filter === f.id ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-accent/50')}>
          <div className="aspect-square bg-raised">{thumbs[f.id] && <img loading="lazy" decoding="async" src={thumbs[f.id]} alt="" className="h-full w-full object-cover" />}</div>
          <div className="py-1">{f.label}</div>
        </button>
      ))}</div>
      <p className="text-xs text-muted">Filters combine with your Adjust settings.</p>
    </Panel>
  )
}

function DetailPanel({ edits, set }: { edits: Edits; set: (p: Partial<Edits>, live?: boolean) => void }) {
  return (
    <Panel title="Sharpness">
      <Slider label="Sharpen" value={edits.sharpen} min={0} max={200} unit="%" onChange={(v, l) => set({ sharpen: v }, l)} />
      <p className="text-xs text-muted">Unsharp mask on the final resolution. The preview is a scaled copy; zoom to 100% to judge fine detail.</p>
    </Panel>
  )
}

/* ---------------- Export ---------------- */
function ExportPanel({ src, edits }: { src: Source; edits: Edits }) {
  const cp = cropPixels(src.w, src.h, edits)
  const [preset, setPreset] = useState<PresetId>('4k')
  const [mode, setMode] = useState<FitMode>('fit')
  const [customW, setCustomW] = useState(cp.w)
  const [customH, setCustomH] = useState(cp.h)
  const [lock, setLock] = useState(true)
  const [format, setFormat] = useState<OutFormat>('image/jpeg')
  const [quality, setQuality] = useState(92)
  const [enhance, setEnhance] = useState(true)
  const [saveCopy, setSaveCopy] = useState(false)
  const [run, setRun] = useState<{ stage: Stage; pct: number; started: number } | null>(null)
  const [result, setResult] = useState<(ExportResult & { name: string }) | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const handle = useRef<ExportHandle | null>(null)
  const dev = useMemo(deviceInfo, [])

  let size: ReturnType<typeof outputSize> | null = null
  let sizeErr: string | null = null
  try { size = outputSize(cp.w, cp.h, { preset, mode, customW, customH }) } catch (e) { sizeErr = (e as Error).message }
  const upscale = size ? size.scale > 1.001 : false
  const canvasOk = useMemo(() => (size ? probeCanvas(size.w, size.h) : true), [size?.w, size?.h]) // eslint-disable-line react-hooks/exhaustive-deps
  const mem = size ? memoryCheck(estimateBytes(size.w, size.h, src.w, src.h, edits.sharpen > 0 || (enhance && upscale)), { ...dev, maxCanvasOk: canvasOk }) : null
  const est = size ? estimateFileBytes(size.w, size.h, format, quality / 100) : null
  const fmt = FORMATS.find((f) => f.id === format)!
  const pct = run ? STAGE_WEIGHT[run.stage][0] + (STAGE_WEIGHT[run.stage][1] - STAGE_WEIGHT[run.stage][0]) * run.pct : 0
  const etaS = size ? estimateSeconds(size.w, size.h, edits.sharpen > 0 || (enhance && upscale), format) : 0

  const go = async (force = false) => {
    if (!size) return
    if (mem?.status === 'insufficient' && !force) return setErr(mem.message)
    setErr(null); setResult(null)
    setRun({ stage: 'decode', pct: 0, started: performance.now() })
    const h = startExport(src.blob, { edits, outW: size.w, outH: size.h, cover: size.cover, enhance }, format, quality / 100, (stage, p) => setRun((r) => (r ? { ...r, stage, pct: p } : r)))
    handle.current = h
    try {
      const r = await h.promise
      const base = src.name.replace(/\.[^.]+$/, '') || 'image'
      const name = `${base}-${size.w}x${size.h}.${fmt.ext}`
      setResult({ ...r, name })
      if (saveCopy) {
        if (r.blob.size > 100 * 1024 * 1024) toast('Too large for the Media Library (100 MB limit) — download it instead.', 'warn')
        else {
          await mediaRepo.create({ name, mime: r.blob.type, size: r.blob.size, blob: r.blob, thumbnail: await makeThumbnail(r.blob), description: `Exported from Image Studio (${size.w} × ${size.h})${src.mediaId ? ' — original kept' : ''}`, tags: ['studio-export'] })
          toast('Saved a copy to the Media Library')
        }
      }
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') toast('Export cancelled', 'info')
      else setErr((e as Error).message || 'Export failed.')
    } finally { setRun(null); handle.current = null }
  }

  const presets: { id: PresetId; label: string }[] = [{ id: 'original', label: `Original (${cp.w} × ${cp.h})` }, ...PRESETS.map((p) => ({ id: p.id, label: p.label })), { id: 'custom', label: 'Custom size' }]
  return <>
    <Panel title="Resolution">
      <div className="grid grid-cols-2 gap-1.5">{presets.map((p) => (
        <button key={p.id} type="button" onClick={() => setPreset(p.id)} aria-pressed={preset === p.id}
          className={cn('min-h-[40px] rounded-lg border px-2 text-start text-xs', preset === p.id ? 'border-accent bg-raised font-semibold' : 'border-line hover:bg-raised/60', p.id === 'original' && 'col-span-2')}>{p.label}</button>
      ))}</div>
      {preset === 'custom' && <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <label className="text-xs">Width<input type="number" min={1} max={7680} className="input mt-1" value={customW} onChange={(e) => { const w = Number(e.target.value); setCustomW(w); if (lock) setCustomH(Math.round(w * cp.h / cp.w)) }} /></label>
        <button type="button" className={cn('chip mb-1 h-9', lock && 'border-accent text-accent')} aria-pressed={lock} onClick={() => setLock(!lock)} title="Keep aspect ratio">{lock ? '🔗' : '⛓'}</button>
        <label className="text-xs">Height<input type="number" min={1} max={4320} className="input mt-1" value={customH} onChange={(e) => { const h = Number(e.target.value); setCustomH(h); if (lock) setCustomW(Math.round(h * cp.w / cp.h)) }} /></label>
      </div>}
      {preset !== 'original' && <div className="flex gap-1.5 text-xs" role="radiogroup" aria-label="Fit mode">
        {([['fit', 'Fit (keep whole image)'], ['fill', 'Fill exact size (crop edges)']] as const).map(([id, l]) => (
          <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)} className={cn('min-h-[36px] flex-1 rounded-lg border px-2', mode === id ? 'border-accent bg-raised font-semibold' : 'border-line')}>{l}</button>
        ))}
      </div>}
      {size && <p className="text-sm">Output: <b className="tabular-nums">{size.w} × {size.h}</b> <span className="text-xs text-muted">({megapixels(size.w, size.h).toFixed(1)} MP{upscale ? ` · ${size.scale.toFixed(2)}× upscale` : ''})</span></p>}
      {sizeErr && <p className="text-sm text-danger" role="alert">{sizeErr}</p>}
    </Panel>
    {upscale && <Panel title="Upscaling">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} />
        <span>Enhance when enlarging<span className="block text-xs text-muted">Step-by-step high-quality resampling plus edge sharpening. It keeps edges crisp but cannot invent detail the original doesn't have.</span></span></label>
      <p className="rounded-lg bg-raised/70 p-2 text-xs text-muted">AI super-resolution isn't available yet: it needs a downloadable AI model (≈5–60 MB) or a paid cloud service. Upscaling here runs fully on your device.</p>
    </Panel>}
    <Panel title="Format & quality">
      <Select aria-label="Format" value={format} onChange={(e) => setFormat(e.target.value as OutFormat)}>{FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</Select>
      {fmt.lossy && <div><div className="mb-1 flex justify-between text-sm"><label htmlFor="ex-q">Quality</label><span className="text-xs tabular-nums text-muted">{quality}%</span></div>
        <input id="ex-q" type="range" min={40} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" /></div>}
      {est && <p className="text-xs text-muted">Estimated file size: <b className="text-fg">{formatBytes(est.mid)}</b> (≈{formatBytes(est.low)}–{formatBytes(est.high)}, depends on image content)</p>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveCopy} onChange={(e) => setSaveCopy(e.target.checked)} />Also save a copy to the Media Library</label>
    </Panel>

    {mem?.message && <div className={cn('my-2 flex gap-2 rounded-xl border p-2.5 text-xs', mem.status === 'insufficient' ? 'border-danger/40 bg-danger/10 text-danger' : 'border-warn/40 bg-warn/10')} role="alert">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /><span>{mem.message}</span></div>}

    {run ? (
      <div className="space-y-2 py-2" aria-live="polite">
        <div className="flex justify-between text-sm"><span>{STAGE_LABEL[run.stage]}…</span><span className="tabular-nums text-muted">{Math.round(pct)}%</span></div>
        <Progress value={pct} label="Export progress" />
        <p className="text-xs text-muted">Estimated about {etaS < 2 ? 'a second' : `${Math.round(etaS)} s`} on a typical laptop · {supportsWorkerExport() ? 'running in the background — you can keep using the app' : 'running on this page'}</p>
        <Button size="sm" icon={X} onClick={() => handle.current?.cancel()}>Cancel</Button>
      </div>
    ) : (
      <div className="space-y-2 py-2">
        <Button variant="primary" className="w-full" icon={Download} disabled={!size} onClick={() => void go(false)}>Export {size ? `${size.w} × ${size.h}` : ''}</Button>
        {mem?.status === 'insufficient' && canvasOk && <Button size="sm" variant="ghost" className="w-full" onClick={() => void go(true)}>Try anyway</Button>}
        {size && <p className="text-center text-xs text-muted">Estimated time ≈ {etaS < 2 ? '1 s' : `${Math.round(etaS)} s`}</p>}
      </div>
    )}
    {err && <p className="rounded-xl border border-danger/40 bg-danger/10 p-2.5 text-sm text-danger" role="alert">{err}</p>}
    {result && (
      <div className="space-y-2 rounded-xl border border-ok/40 bg-ok/10 p-3 text-sm" data-testid="export-result">
        <p className="flex items-center gap-1.5 font-medium"><CheckCircle2 className="h-4 w-4 text-ok" aria-hidden />{result.verified ? 'Verified' : 'Exported'}: <span className="tabular-nums" data-testid="export-dims">{result.width} × {result.height}</span></p>
        <p className="text-xs text-muted">{formatBytes(result.blob.size)} · {result.blob.type.replace('image/', '').toUpperCase()} · {(result.ms / 1000).toFixed(1)} s{result.background ? ' · background' : ''}{result.verified ? ' · decoded and checked' : ' · could not re-check size'}</p>
        <Button className="w-full" icon={Save} onClick={() => downloadBlob(result.blob, result.name)}>Download {result.name}</Button>
      </div>
    )}
  </>
}

/* ---------------- Library picker ---------------- */
function LibraryPicker({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const items = useLiveQuery(() => db.media.filter((m) => !m.deletedAt && m.mime.startsWith('image/') && m.mime !== 'image/svg+xml').reverse().sortBy('updatedAt'), [])
  return (
    <Modal open onClose={onClose} title="Choose from Media Library" wide>
      {!items?.length ? <p className="text-sm text-muted">No images in the library yet.</p> : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">{items.map((m) => (
          <li key={m.id}><button type="button" onClick={() => onPick(m.id)} className="block w-full overflow-hidden rounded-xl border border-line text-start hover:border-accent">
            <div className="aspect-square bg-raised">{m.thumbnail && <img src={m.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
            <div className="truncate p-1 text-[11px]">{m.name}</div>
          </button></li>
        ))}</ul>
      )}
    </Modal>
  )
}
