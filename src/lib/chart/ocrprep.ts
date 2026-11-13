/**
 * OCR pre-processing (pure): crop a band from the image, binarise with Otsu (text = minority class),
 * remove blobs touching the top edge (tile-frame remnants) and tall thin bars (row separators),
 * then upscale. Returns an 8-bit grayscale buffer (0 = text, 255 = background).
 */
import type { Pixels, Box } from './detect'

export interface Bitmap { width: number; height: number; gray: Uint8Array }

export function prepareForOcr(p: Pixels, b: Box, scale: number, dropSideEdges = false, binary = false): Bitmap {
  const x = Math.max(0, Math.round(b.x)), y = Math.max(0, Math.round(b.y))
  const w = Math.max(1, Math.min(Math.round(b.w), p.width - x)), h = Math.max(1, Math.min(Math.round(b.h), p.height - y))
  const L = new Float32Array(w * h); const hist = new Array<number>(256).fill(0)
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = ((y + yy) * p.width + x + xx) * 4
    const l = (p.data[i] * 299 + p.data[i + 1] * 587 + p.data[i + 2] * 114) / 1000
    L[yy * w + xx] = l; hist[Math.round(l)]++
  }
  // Otsu
  const total = w * h; let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0, wB = 0, best = -1, thr = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break
    sumB += t * hist[t]; const mB = sumB / wB, mF = (sum - sumB) / wF
    const v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; thr = t }
  }
  let bright = 0; for (let i = 0; i < total; i++) if (L[i] > thr) bright++
  const textIsBright = bright < total / 2
  const text = new Uint8Array(total)
  for (let i = 0; i < total; i++) text[i] = (textIsBright ? L[i] > thr : L[i] <= thr) ? 1 : 0

  // tile-frame remnants: dense rows in the top 40% of the band (a frame spans most of the width) – clear them
  for (let yy = 0; yy < Math.floor(h * 0.4); yy++) {
    let n = 0; for (let xx = 0; xx < w; xx++) n += text[yy * w + xx]
    if (n > w * 0.5) for (let xx = 0; xx < w; xx++) text[yy * w + xx] = 0
  }
  // connected components; drop those touching the top edge, tall thin bars, huge blobs,
  // and isolated thin ticks (row-separator remnants)
  const seen = new Uint8Array(total); const stack = new Int32Array(total)
  const comps: { px: number[]; minx: number; maxx: number; miny: number; maxy: number }[] = []
  for (let s = 0; s < total; s++) {
    if (!text[s] || seen[s]) continue
    let sp = 0; stack[sp++] = s; seen[s] = 1
    const px: number[] = []; let minx = w, maxx = 0, miny = h, maxy = 0
    while (sp) {
      const i = stack[--sp]; const cx = i % w, cy = (i - cx) / w; px.push(i)
      if (cx < minx) minx = cx; if (cx > maxx) maxx = cx; if (cy < miny) miny = cy; if (cy > maxy) maxy = cy
      const nb = [cx > 0 ? i - 1 : -1, cx < w - 1 ? i + 1 : -1, cy > 0 ? i - w : -1, cy < h - 1 ? i + w : -1]
      for (const k of nb) if (k >= 0 && text[k] && !seen[k]) { seen[k] = 1; stack[sp++] = k }
    }
    const bw = maxx - minx + 1, bh = maxy - miny + 1
    const touchesTop = (miny === 0 && bh < h * 0.3) || (dropSideEdges && (minx === 0 || maxx === w - 1)), tallBar = bh > h * 0.7 && bw < bh * 0.35, huge = bw > w * 0.5 || px.length > total * 0.2
    if (touchesTop || tallBar || huge) for (const i of px) text[i] = 0
    else comps.push({ px, minx, maxx, miny, maxy })
  }
  for (const c of comps) {
    const bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1
    if (bw / bh > 0.35 || bh > h * 0.6) continue
    const near = comps.some(o => o !== c && o.minx < c.maxx + bh * 1.2 && o.maxx > c.minx - bh * 1.2 && o.miny < c.maxy && o.maxy > c.miny)
    if (!near) for (const i of c.px) text[i] = 0
  }
  const keep = new Uint8Array(total)
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    if (!text[yy * w + xx]) continue
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = xx + dx, Y = yy + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) keep[Y * w + X] = 1 }
  }
  // upscale with bilinear interpolation (smooth glyph edges), masking out erased components
  const W = w * scale, H = h * scale
  const gray = new Uint8Array(W * H)
  for (let yy = 0; yy < H; yy++) {
    const sy = (yy + 0.5) / scale - 0.5, y0i = Math.max(0, Math.floor(sy)), y1i = Math.min(h - 1, y0i + 1), fy = Math.min(1, Math.max(0, sy - y0i))
    for (let xx = 0; xx < W; xx++) {
      const sx = (xx + 0.5) / scale - 0.5, x0i = Math.max(0, Math.floor(sx)), x1i = Math.min(w - 1, x0i + 1), fx = Math.min(1, Math.max(0, sx - x0i))
      const i00 = y0i * w + x0i, i01 = y0i * w + x1i, i10 = y1i * w + x0i, i11 = y1i * w + x1i
      // a source pixel counts as "text" (dark) only if it is in a kept component; others are background (white)
      const v = (k: number) => keep[k] ? (textIsBright ? 255 - L[k] : L[k]) : 255
      const top = v(i00) * (1 - fx) + v(i01) * fx, bot = v(i10) * (1 - fx) + v(i11) * fx
      const g = top * (1 - fy) + bot * fy
      gray[yy * W + xx] = binary ? (text[Math.floor(yy / scale) * w + Math.floor(xx / scale)] ? 0 : 255) : Math.max(0, Math.min(255, Math.round(g)))
    }
  }
  return { width: W, height: H, gray }
}
