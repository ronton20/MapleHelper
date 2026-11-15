/**
 * OCR pre-processing (pure): crop a band from the image, binarise with Otsu (text = minority class),
 * remove blobs touching the top edge (tile-frame remnants) and tall thin bars (row separators),
 * then upscale. Returns an 8-bit grayscale buffer (0 = text, 255 = background).
 */
import type { Pixels, Box } from './detect'

export interface Bitmap { width: number; height: number; gray: Uint8Array; /** white margin around the content (badge bitmaps) */ pad?: number }

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

/**
 * Level badge (badge-style charts): a small dark pill with light digits, or a gold pill with dark
 * digits (max level). Finds the pill inside `b`, keeps only the digits and returns them dark-on-white,
 * upscaled with a margin – much cleaner for Tesseract than a generic Otsu crop over a coloured frame.
 */
export function prepareBadge(p: Pixels, b: Box, scale: number): Bitmap {
  const x = Math.max(0, Math.round(b.x)), y = Math.max(0, Math.round(b.y))
  const w = Math.max(1, Math.min(Math.round(b.w), p.width - x)), h = Math.max(1, Math.min(Math.round(b.h), p.height - y))
  const px = (xx: number, yy: number) => { const i = ((y + yy) * p.width + x + xx) * 4; return [p.data[i], p.data[i + 1], p.data[i + 2]] as const }
  const lum = (c: readonly number[]) => (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000
  const isDark = (c: readonly number[]) => lum(c) < 70 && Math.max(...c) - Math.min(...c) < 40
  const isGold = (c: readonly number[]) => c[0] > 170 && c[1] > 120 && c[2] < 120 && c[0] - c[2] > 80
  let nd = 0, ng = 0
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const c = px(xx, yy); if (isDark(c)) nd++; else if (isGold(c)) ng++ }
  const gold = ng > nd
  const isPill = gold ? isGold : isDark
  // pill extent: flood-fill pill-coloured pixels from the one nearest the box centre (the coloured frame
  // separates the pill from a dark page background); digits are holes inside it, so take the bounding box
  let seed = -1, sd = Infinity
  const solid = (xx: number, yy: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const ax = xx + dx, ay = yy + dy; if (ax < 0 || ay < 0 || ax >= w || ay >= h || !isPill(px(ax, ay))) return false } return true }
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (solid(xx, yy)) { const dd = (xx - w / 2) ** 2 + (yy - h / 2) ** 2; if (dd < sd) { sd = dd; seed = yy * w + xx } }
  let c0 = 0, c1 = w - 1, r0 = 0, r1 = h - 1
  if (seed >= 0) {
    const seen = new Uint8Array(w * h); const st = [seed]; seen[seed] = 1
    const sc = px(seed % w, (seed / w) | 0)
    c0 = w; c1 = -1; r0 = h; r1 = -1
    while (st.length) {
      const i = st.pop()!, xx = i % w, yy = (i / w) | 0
      if (xx < c0) c0 = xx; if (xx > c1) c1 = xx; if (yy < r0) r0 = yy; if (yy > r1) r1 = yy
      for (const [nx, ny] of [[xx + 1, yy], [xx - 1, yy], [xx, yy + 1], [xx, yy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx; if (seen[j]) continue; seen[j] = 1
        const c = px(nx, ny)
        if (isPill(c) && Math.abs(c[0] - sc[0]) + Math.abs(c[1] - sc[1]) + Math.abs(c[2] - sc[2]) < 70) st.push(j)
      }
    }
    // the fill can leak into the icon's dark outline above the pill: keep the longest band of rows
    // where the pill colour covers a good part of the bbox width
    const rowFrac = (yy: number) => { let n = 0; for (let xx = c0; xx <= c1; xx++) if (isPill(px(xx, yy))) n++; return n / Math.max(1, c1 - c0 + 1) }
    let bs = r0, be = r0 - 1, st0 = -1
    for (let yy = r0; yy <= r1 + 1; yy++) { const on = yy <= r1 && rowFrac(yy) >= 0.3; if (on && st0 < 0) st0 = yy; if (!on && st0 >= 0) { if (yy - 1 - st0 > be - bs) { bs = st0; be = yy - 1 } st0 = -1 } }
    if (be >= bs) { r0 = bs; r1 = be }
  }
  const bw = Math.max(1, c1 - c0 + 1), bh = Math.max(1, r1 - r0 + 1)
  // digit strength 0..1 (light digits on dark pill / dark digits on gold pill)
  const ink = (c: readonly number[]) => { const l = lum(c); return gold ? Math.min(1, Math.max(0, (150 - l) / 80)) : Math.min(1, Math.max(0, (l - 90) / 90)) }
  const pad = 4, W = (bw + 2 * pad) * scale, H = (bh + 2 * pad) * scale
  const gray = new Uint8Array(W * H).fill(255)
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    const sx = (xx + 0.5) / scale - 0.5 - pad, sy = (yy + 0.5) / scale - 0.5 - pad
    if (sx < 0 || sy < 0 || sx > bw - 1 || sy > bh - 1) continue
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(bw - 1, x0 + 1), y1 = Math.min(bh - 1, y0 + 1), fx = sx - x0, fy = sy - y0
    const v = (ax: number, ay: number) => ink(px(c0 + ax, r0 + ay))
    const t = v(x0, y0) * (1 - fx) * (1 - fy) + v(x1, y0) * fx * (1 - fy) + v(x0, y1) * (1 - fx) * fy + v(x1, y1) * fx * fy
    gray[yy * W + xx] = Math.round(255 * (1 - t))
  }
  return { width: W, height: H, gray, pad: pad * scale }
}
