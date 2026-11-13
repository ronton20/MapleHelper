/**
 * Main-thread helpers for the chart importer: decode an image file, load reference icons,
 * run the worker, crop icons to data URLs.
 */
import type { Box } from './detect'
import type { ChartSkill, ChartStep } from './analyze'
import type { HexaNodeType } from '../../types'

export interface ChartResult {
  tileSize: number
  skills: ChartSkill[]
  steps: ChartStep[]
  warnings: string[]
  headers?: string[]
  detection: { tileSize: number; rows: { x: number; y: number; w: number; h: number; index: number; row: number; col: number; cluster: number }[][] }
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')
const abs = (path: string) => new URL(`${BASE}${path}`, location.href).href

export async function loadImage(file: File | Blob): Promise<{ canvas: HTMLCanvasElement; dataUrl: string }> {
  const bmp = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width; canvas.height = bmp.height
  canvas.getContext('2d')!.drawImage(bmp, 0, 0)
  bmp.close()
  return { canvas, dataUrl: canvas.toDataURL('image/png') }
}

export function cropDataUrl(src: HTMLCanvasElement, b: Box, size = 64): string {
  const c = document.createElement('canvas'); c.width = size; c.height = size
  const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, size, size)
  return c.toDataURL('image/png')
}

const REFS: [string, string, HexaNodeType][] = [
  ['stat1', 'HEXA Stat I', 'stat'], ['stat2', 'HEXA Stat II', 'stat'], ['stat3', 'HEXA Stat III', 'stat'],
  ['hecate1', 'Sol Hecate', 'common'], ['hecate20', 'Sol Hecate', 'common'], ['hecate30', 'Sol Hecate', 'common'],
]
async function loadRefs() {
  const out: { name: string; type: HexaNodeType; width: number; height: number; data: ArrayBuffer }[] = []
  for (const [file, name, type] of REFS) {
    try {
      const res = await fetch(`${BASE}/icons/ref/${file}.png`); if (!res.ok) continue
      const bmp = await createImageBitmap(await res.blob())
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
      const ctx = c.getContext('2d')!; ctx.drawImage(bmp, 0, 0)
      const img = ctx.getImageData(0, 0, c.width, c.height)
      out.push({ name, type, width: img.width, height: img.height, data: img.data.buffer.slice(0) })
    } catch { /* optional */ }
  }
  return out
}

export function analyzeInWorker(canvas: HTMLCanvasElement, onProgress: (msg: string, frac: number) => void): Promise<ChartResult> {
  return new Promise(async (resolve, reject) => {
    const img = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    const refs = await loadRefs()
    const worker = new Worker(new URL('./chart.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (ev) => {
      const m = ev.data
      if (m.type === 'progress') onProgress(m.msg, m.frac)
      else if (m.type === 'result') { resolve(m.analysis); worker.terminate() }
      else if (m.type === 'error') { reject(new Error(m.message)); worker.terminate() }
    }
    worker.onerror = (e) => { reject(new Error(e.message)); worker.terminate() }
    const data = img.data.buffer.slice(0)
    worker.postMessage({
      type: 'analyze',
      pixels: { width: img.width, height: img.height, data },
      refs,
      tess: { workerPath: abs('/tess/worker.min.js'), corePath: abs('/tess/'), langPath: abs('/tessdata') },
    }, [data, ...refs.map(r => r.data)])
  })
}
