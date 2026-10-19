// @vitest-environment node
import { estimateBytes, estimateFileBytes, memoryCheck, outputSize, PRESETS } from './resolution'
import { applyAdjust, aspectCrop, commit, cropPixels, DEFAULT_EDITS, effectiveAdjust, initHistory, NO_ADJUST, redo, sharpenBand, undo } from './edits'

describe('output sizes', () => {
  it('has the five presets with exact pixel sizes', () => {
    expect(PRESETS.map((p) => `${p.id}:${p.w}x${p.h}`)).toEqual(['720p:1280x720', '1080p:1920x1080', '2k:2560x1440', '4k:3840x2160', '8k:7680x4320'])
  })
  it('8K fit on a 16:9 source is exactly 7680 × 4320, and upscales small images', () => {
    expect(outputSize(1920, 1080, { preset: '8k', mode: 'fit' })).toMatchObject({ w: 7680, h: 4320, scale: 4, cover: null })
    expect(outputSize(640, 360, { preset: '4k', mode: 'fit' })).toMatchObject({ w: 3840, h: 2160, scale: 6 })
  })
  it('fit keeps the aspect ratio; portrait images use a rotated box', () => {
    expect(outputSize(4000, 3000, { preset: '8k', mode: 'fit' })).toMatchObject({ w: 5760, h: 4320 })
    expect(outputSize(3000, 4000, { preset: '8k', mode: 'fit' })).toMatchObject({ w: 4320, h: 5760 })
    expect(outputSize(1080, 1920, { preset: '1080p', mode: 'fit' })).toMatchObject({ w: 1080, h: 1920 })
  })
  it('fill gives the exact preset size with an even centre crop', () => {
    const s = outputSize(4000, 3000, { preset: '8k', mode: 'fill' })
    expect([s.w, s.h]).toEqual([7680, 4320])
    expect(s.cover!.w).toBe(1)
    expect(s.cover!.h).toBeCloseTo(0.75, 5)
    expect(s.cover!.y).toBeCloseTo(0.125, 5)
  })
  it('original keeps the size; custom is capped at 8K', () => {
    expect(outputSize(1234, 567, { preset: 'original', mode: 'fit' })).toMatchObject({ w: 1234, h: 567 })
    expect(() => outputSize(100, 100, { preset: 'custom', mode: 'fit', customW: 8000, customH: 4000 })).toThrow(/8K/)
    expect(outputSize(1000, 500, { preset: 'custom', mode: 'fill', customW: 300, customH: 300 })).toMatchObject({ w: 300, h: 300 })
  })
})

describe('memory checks', () => {
  const bytes8k = estimateBytes(7680, 4320, 1920, 1080, true)
  it('allows 8K on an 8 GB laptop and warns on a 2 GB phone', () => {
    expect(bytes8k).toBeGreaterThan(7680 * 4320 * 4 * 2)
    expect(memoryCheck(bytes8k, { memoryGb: 8, mobile: false }).status).toBe('ok')
    expect(memoryCheck(bytes8k, { memoryGb: 2, mobile: true }).status).toBe('insufficient')
    expect(memoryCheck(bytes8k, { memoryGb: 2, mobile: true }).message).toMatch(/lower resolution/)
  })
  it('reports when the browser cannot allocate the canvas at all', () => {
    expect(memoryCheck(1000, { memoryGb: 8, mobile: false, maxCanvasOk: false }).message).toMatch(/4K or lower/)
  })
  it('estimates larger files for PNG and higher quality', () => {
    const j = estimateFileBytes(7680, 4320, 'image/jpeg', 0.9).mid
    expect(estimateFileBytes(7680, 4320, 'image/png', 1).mid).toBeGreaterThan(j)
    expect(estimateFileBytes(7680, 4320, 'image/jpeg', 0.5).mid).toBeLessThan(j)
  })
})

describe('edits', () => {
  it('undo / redo restores exact states and ignores no-op commits', () => {
    let h = initHistory()
    h = commit(h, { ...DEFAULT_EDITS, rotate: 90 })
    h = commit(h, { ...h.present, sharpen: 50 })
    expect(commit(h, { ...h.present })).toBe(h)
    h = undo(h)
    expect(h.present.sharpen).toBe(0)
    expect(h.present.rotate).toBe(90)
    h = redo(h)
    expect(h.present.sharpen).toBe(50)
    h = commit(undo(h), { ...DEFAULT_EDITS, flipH: true })
    expect(h.future).toHaveLength(0)
  })
  it('crops in oriented pixels (rotation swaps width and height)', () => {
    const c = cropPixels(4000, 3000, { ...DEFAULT_EDITS, rotate: 90, crop: { x: 0.5, y: 0, w: 0.5, h: 0.5 } })
    expect(c).toMatchObject({ ow: 3000, oh: 4000, x: 1500, y: 0, w: 1500, h: 2000 })
    expect(aspectCrop(1, 4000, 3000)).toMatchObject({ y: 0, h: 1 })
    expect(aspectCrop(1, 4000, 3000).w).toBeCloseTo(0.75)
  })
  it('neutral adjustments leave pixels unchanged; brightness and mono behave', () => {
    const px = new Uint8ClampedArray([10, 120, 250, 255])
    applyAdjust(px, NO_ADJUST)
    expect([...px]).toEqual([10, 120, 250, 255])
    applyAdjust(px, { ...NO_ADJUST, brightness: 100 })
    expect([...px]).toEqual([20, 240, 255, 255])
    const g = new Uint8ClampedArray([200, 50, 50, 255])
    applyAdjust(g, effectiveAdjust({ ...DEFAULT_EDITS, filter: 'mono', adjust: { ...NO_ADJUST, contrast: -10 } }))
    expect(g[0]).toBe(g[1]); expect(g[1]).toBe(g[2])
  })
  it('sharpening leaves flat areas alone and increases edge contrast, band edges included', () => {
    const w = 4, rows = 2
    const flat = new Uint8ClampedArray(w * rows * 4).fill(100)
    sharpenBand(flat, w, rows, null, null, 100)
    expect([...flat].every((v) => v === 100)).toBe(true)
    const edge = new Uint8ClampedArray(w * rows * 4)
    for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) edge.fill(x < 2 ? 50 : 200, (y * w + x) * 4, (y * w + x) * 4 + 4)
    const above = edge.slice(0, w * 4)
    sharpenBand(edge, w, rows, above, null, 100)
    expect(edge[4]).toBeLessThan(50) // dark side of the edge gets darker
    expect(edge[8]).toBeGreaterThan(200) // bright side gets brighter
  })
})
