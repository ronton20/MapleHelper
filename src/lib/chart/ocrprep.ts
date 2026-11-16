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
  // dark or gold pill? compare the largest single flat colour of each kind (icons are textured, pills flat)
  const flat = (f: (c: readonly number[]) => boolean) => {
    const m = new Map<number, number>()
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const c = px(xx, yy); if (f(c)) { const k = (c[0] << 16) | (c[1] << 8) | c[2]; m.set(k, (m.get(k) ?? 0) + 1) } }
    return Math.max(0, ...m.values())
  }
  const gold = flat(isGold) > flat(isDark)
  const isPill = gold ? isGold : isDark
  // pill extent: flood-fill pill-coloured pixels from the one nearest the box centre (the coloured frame
  // separates the pill from a dark page background); digits are holes inside it, so take the bounding box
  // pills are one flat colour: the most common pill-ish colour in the box is the pill (icons are textured)
  const modeCount = new Map<number, number>()
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const c = px(xx, yy); if (isPill(c)) { const k = (c[0] << 16) | (c[1] << 8) | c[2]; modeCount.set(k, (modeCount.get(k) ?? 0) + 1) } }
  const mk = [...modeCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const pillC = mk === undefined ? null : [(mk >> 16) & 255, (mk >> 8) & 255, mk & 255]
  const nearPill = (c: readonly number[]) => !pillC || Math.abs(c[0] - pillC[0]) + Math.abs(c[1] - pillC[1]) + Math.abs(c[2] - pillC[2]) < 40
  // pill extent from its exact flat colour: rows/columns that contain it (digits only leave thin pill
  // margins, so allow small gaps), taking the longest run so stray icon pixels don't stretch the box
  const run = (n: number, f: (i: number) => boolean, gap: number) => {
    let bs = 0, be = -1, s0 = -1, last = -1
    for (let i = 0; i <= n; i++) {
      const on = i < n && f(i)
      if (on) { if (s0 < 0) s0 = i; last = i }
      else if (s0 >= 0 && (i === n || i - last > gap)) { if (last - s0 > be - bs) { bs = s0; be = last } s0 = -1 }
    }
    return [bs, be] as const
  }
  const cnt = (x0: number, x1: number, y0: number, y1: number) => { let n = 0; for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (isPill(px(xx, yy)) && nearPill(px(xx, yy))) n++; return n }
  let [r0, r1] = run(h, yy => cnt(0, w - 1, yy, yy) >= 3, 1)
  let [c0, c1] = run(w, xx => cnt(xx, xx, r0, r1) >= 1, 2)
  ;[r0, r1] = run(h, yy => yy >= r0 && yy <= r1 && cnt(c0, c1, yy, yy) >= 2, 1)
  if (c1 < c0 || r1 < r0) { c0 = 0; c1 = w - 1; r0 = 0; r1 = h - 1 }
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
