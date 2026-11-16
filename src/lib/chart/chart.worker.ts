/// <reference lib="webworker" />
/**
 * Web Worker: runs the chart analysis (tile detection + OCR via tesseract.js) off the main thread.
 * Messages in:  { type: 'analyze', pixels: {width,height,data}, refs: RefIcon[], tess: { workerPath, corePath, langPath } }
 * Messages out: { type: 'progress', msg, frac } | { type: 'result', analysis } | { type: 'error', message }
 */
import { createWorker, PSM, type Worker as TWorker } from 'tesseract.js'
import { analyzeChart, type OcrWord, type RefIcon } from './analyze'
import { prepareForOcr, prepareBadge } from './ocrprep'
import type { Pixels, Box } from './detect'

interface AnalyzeMsg { type: 'analyze'; pixels: { width: number; height: number; data: ArrayBuffer }; refs: { name: string; type: RefIcon['type']; width: number; height: number; data: ArrayBuffer }[]; tess: { workerPath: string; corePath: string; langPath: string } }

self.onmessage = async (ev: MessageEvent<AnalyzeMsg>) => {
  const m = ev.data
  if (m.type !== 'analyze') return
  const p: Pixels = { width: m.pixels.width, height: m.pixels.height, data: new Uint8ClampedArray(m.pixels.data) }
  const refs: RefIcon[] = m.refs.map(r => ({ name: r.name, type: r.type, pixels: { width: r.width, height: r.height, data: new Uint8ClampedArray(r.data) } }))
  let tw: TWorker | null = null
  try {
    postMessage({ type: 'progress', msg: 'Loading OCR engine…', frac: 0.02 })
    tw = await createWorker('eng', 1, { workerPath: m.tess.workerPath, corePath: m.tess.corePath, langPath: m.tess.langPath, gzip: true, logger: () => {} })
    const ocr = async (box: Box, mode: 'line' | 'block' | 'word' | 'wordgray' | 'badge', digitsOnly: boolean, dropSides = false): Promise<OcrWord[]> => {
      const scale = mode === 'block' ? 3 : mode === 'badge' ? 6 : 4
      const bm = mode === 'badge' ? prepareBadge(p, box, scale) : prepareForOcr(p, box, scale, dropSides, mode === 'word' || mode === 'line')
      const canvas = new OffscreenCanvas(bm.width, bm.height)
      const ctx = canvas.getContext('2d')!
      const img = ctx.createImageData(bm.width, bm.height)
      for (let i = 0; i < bm.gray.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = bm.gray[i]; img.data[i * 4 + 3] = 255 }
      ctx.putImageData(img, 0, 0)
      const blob = await canvas.convertToBlob({ type: 'image/png' })
      await tw!.setParameters({ tessedit_pageseg_mode: mode === 'line' ? PSM.SINGLE_LINE : mode === 'word' || mode === 'wordgray' || mode === 'badge' ? PSM.SINGLE_WORD : PSM.SINGLE_BLOCK, tessedit_char_whitelist: digitsOnly ? '0123456789' : '' })
      const r = await tw!.recognize(blob, {}, { blocks: true })
      const words = (r.data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(pp => pp.lines.flatMap(l => l.words)))
      const bx = Math.max(0, Math.round(box.x)), by = Math.max(0, Math.round(box.y))
      return words.map(w => ({ text: w.text, conf: w.confidence, x0: bx + w.bbox.x0 / scale, y0: by + w.bbox.y0 / scale, x1: bx + w.bbox.x1 / scale, y1: by + w.bbox.y1 / scale }))
    }
    const a = await analyzeChart(p, ocr, (msg, frac) => postMessage({ type: 'progress', msg, frac }), refs)
    // strip heavy/unserialisable bits before posting
    const detection = { tileSize: a.detection.tileSize, badges: !!a.detection.badges, rows: a.detection.rows.map(r => r.map(t => ({ x: t.x, y: t.y, w: t.w, h: t.h, index: t.index, row: t.row, col: t.col, cluster: t.cluster }))) }
    postMessage({ type: 'result', analysis: { tileSize: a.tileSize, skills: a.skills, steps: a.steps, warnings: a.warnings, headers: a.headers, detection } })
  } catch (e) {
    postMessage({ type: 'error', message: (e as Error).message })
  } finally {
    await tw?.terminate()
  }
}
