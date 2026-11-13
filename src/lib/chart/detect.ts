/**
 * Pure pixel-math part of the HEXA chart importer (no DOM).
 *  - finds square icon tiles by their frames (edge-based, works on busy backgrounds, any tile size)
 *  - groups them into rows in reading order, separates a legend row (smaller tiles above the sequence)
 *  - clusters sequence tiles by visual similarity into "skills"
 */
export interface Pixels { width: number; height: number; data: Uint8ClampedArray | Uint8Array }
export interface Box { x: number; y: number; w: number; h: number }
export interface Tile extends Box { cx: number; cy: number; score: number }
export interface SeqTile extends Tile { row: number; col: number; index: number; sig: Float32Array; sigs: Float32Array[]; nsig: Float32Array; nsigs: Float32Array[]; cluster: number; legendIdx: number }
export interface LegendEntry { tiles: Tile[]; box: Box; sigs: Float32Array[] }
export interface Detection {
  tileSize: number
  rows: SeqTile[][]
  seq: SeqTile[]
  legend: LegendEntry[]
  legendBox: Box | null
  clusters: { rep: SeqTile; members: SeqTile[]; legendIdx: number }[]
}

const SIG = 10

function luma(d: Uint8ClampedArray | Uint8Array, i: number) { return (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 }

/** integral image helper */
function integral(W: number, H: number, f: (x: number, y: number) => number): Float64Array {
  const I = new Float64Array((W + 1) * (H + 1))
  for (let y = 1; y <= H; y++) {
    let rowSum = 0
    for (let x = 1; x <= W; x++) {
      rowSum += f(x - 1, y - 1)
      I[y * (W + 1) + x] = I[(y - 1) * (W + 1) + x] + rowSum
    }
  }
  return I
}
function rectSum(I: Float64Array, W: number, x0: number, y0: number, x1: number, y1: number) { // [x0,x1) x [y0,y1)
  const w = W + 1
  return I[y1 * w + x1] - I[y0 * w + x1] - I[y1 * w + x0] + I[y0 * w + x0]
}

/**
 * Square-outline detector. A tile is a square whose whole perimeter is a strong edge (the frame /
 * outline), regardless of frame colour or background. Score = the weakest of 8 perimeter segments
 * (2 per edge, rounded corners excluded), so partial edges from icon content don't qualify.
 */
interface Grad { W: number; H: number; IX: Float64Array; IY: Float64Array }
function gradients(p: Pixels): Grad {
  const { width: W, height: H, data } = p
  const L = new Float32Array(W * H)
  for (let i = 0, j = 0; i < W * H; i++, j += 4) L[i] = luma(data, j)
  const IX = integral(W, H, (x, y) => (x <= 0 || x >= W - 1) ? 0 : Math.abs(L[y * W + x + 1] - L[y * W + x - 1]))
  const IY = integral(W, H, (x, y) => (y <= 0 || y >= H - 1) ? 0 : Math.abs(L[(y + 1) * W + x] - L[(y - 1) * W + x]))
  return { W, H, IX, IY }
}
function outlineScore(g: Grad, x: number, y: number, S: number): number {
  const { W, H, IX, IY } = g
  if (x < 1 || y < 1 || x + S >= W - 1 || y + S >= H - 1) return 0
  const c = Math.max(3, Math.round(S * 0.2)), half = Math.floor((S - 2 * c) / 2)
  if (half < 3) return 0
  const m = (I: Float64Array, x0: number, y0: number, x1: number, y1: number) => rectSum(I, W, x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0))
  const segs = [
    m(IY, x + c, y - 1, x + c + half, y + 2), m(IY, x + S - c - half, y - 1, x + S - c, y + 2),                 // top
    m(IY, x + c, y + S - 2, x + c + half, y + S + 1), m(IY, x + S - c - half, y + S - 2, x + S - c, y + S + 1), // bottom
    m(IX, x - 1, y + c, x + 2, y + c + half), m(IX, x - 1, y + S - c - half, x + 2, y + S - c),                 // left
    m(IX, x + S - 2, y + c, x + S + 1, y + c + half), m(IX, x + S - 2, y + S - c - half, x + S + 1, y + S - c), // right
  ]
  let mn = Infinity; for (const v of segs) if (v < mn) mn = v
  return mn
}
function nms(cands: Tile[]): Tile[] {
  cands.sort((a, b) => b.score - a.score)
  const kept: Tile[] = []
  for (const c of cands) {
    const overlaps = kept.some(k => {
      const ix = Math.max(0, Math.min(c.x + c.w, k.x + k.w) - Math.max(c.x, k.x)), iy = Math.max(0, Math.min(c.y + c.h, k.y + k.h) - Math.max(c.y, k.y))
      return ix * iy > 0.2 * Math.min(c.w * c.h, k.w * k.h)
    })
    if (!overlaps) kept.push(c)
  }
  return kept
}
/** candidates over a size range; positions on a `step` grid; keeps local maxima above `thr` */
function scan(g: Grad, sizes: number[], step: number, thr: number): Tile[] {
  const { W, H } = g
  const best = new Float32Array(W * H), bestS = new Uint8Array(W * H)
  for (const S of sizes) for (let y = 1; y + S < H - 1; y += step) for (let x = 1; x + S < W - 1; x += step) {
    const sc = outlineScore(g, x, y, S); const i = y * W + x
    if (sc > best[i]) { best[i] = sc; bestS[i] = S }
  }
  const out: Tile[] = []
  for (let y = 1; y < H; y += step) for (let x = 1; x < W; x += step) {
    const i = y * W + x, s = best[i]
    if (s < thr) continue
    let isMax = true
    const r = Math.max(step, 3)
    for (let yy = Math.max(1, y - r); yy <= Math.min(H - 1, y + r) && isMax; yy += step)
      for (let xx = Math.max(1, x - r); xx <= Math.min(W - 1, x + r); xx += step)
        if (best[yy * W + xx] > s || (best[yy * W + xx] === s && (yy < y || (yy === y && xx < x)))) { isMax = false; break }
    if (isMax) { const S = bestS[i]; out.push({ x, y, w: S, h: S, cx: x + S / 2, cy: y + S / 2, score: s }) }
  }
  return nms(out)
}
function findSquares(p: Pixels, minS = 24, maxS = 110): { main: Tile[]; size: number; all: Tile[]; g: Grad } {
  const g = gradients(p)
  const sizes: number[] = []; for (let S = minS; S <= maxS; S += 2) sizes.push(S)
  const coarse = scan(g, sizes, 2, 25)
  if (coarse.length < 3) return { main: [], size: 0, all: coarse, g }
  // dominant size: the size with the most strong candidates (±12%)
  const strong = coarse.filter(c => c.score > 40)
  let size = 0, bestN = 0
  for (const s of new Set(strong.map(c => c.w))) { const n = strong.filter(c => Math.abs(c.w - s) <= s * 0.12).length; if (n > bestN) { bestN = n; size = s } }
  if (!size) return { main: [], size: 0, all: coarse, g }
  const ref = median(strong.filter(c => Math.abs(c.w - size) <= size * 0.12).map(c => c.score))
  // fine pass at the dominant size only (positions step 1) – nested/inner squares of other sizes can't match
  const fine = scan(g, [size - 2, size, size + 2], 1, ref * 0.45)
  return { main: fine, size, all: coarse, g }
}

function median(a: number[]) { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0 }

export function signature(p: Pixels, t: Box): Float32Array {
  const inset = Math.max(2, Math.round(Math.min(t.w, t.h) * 0.18))
  const x0 = t.x + inset, y0 = t.y + inset, w = t.w - 2 * inset, h = t.h - 2 * inset
  const out = new Float32Array(SIG * SIG * 3)
  const d = p.data
  for (let gy = 0; gy < SIG; gy++) for (let gx = 0; gx < SIG; gx++) {
    const xa = x0 + Math.floor(gx * w / SIG), xb = Math.max(xa + 1, x0 + Math.floor((gx + 1) * w / SIG))
    const ya = y0 + Math.floor(gy * h / SIG), yb = Math.max(ya + 1, y0 + Math.floor((gy + 1) * h / SIG))
    let r = 0, g = 0, b = 0, n = 0
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { const i = (y * p.width + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++ }
    const o = (gy * SIG + gx) * 3
    out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n
  }
  return out
}
/** normalised-luma signature (zero mean, unit variance) for correlation matching */
export function normSignature(p: Pixels, t: Box, n = 16): Float32Array {
  const inset = Math.max(2, Math.round(Math.min(t.w, t.h) * 0.18))
  const x0 = t.x + inset, y0 = t.y + inset, w = t.w - 2 * inset, h = t.h - 2 * inset
  const out = new Float32Array(n * n)
  const d = p.data
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    const xa = x0 + Math.floor(gx * w / n), xb = Math.max(xa + 1, x0 + Math.floor((gx + 1) * w / n))
    const ya = y0 + Math.floor(gy * h / n), yb = Math.max(ya + 1, y0 + Math.floor((gy + 1) * h / n))
    let l = 0, c = 0
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { const i = (y * p.width + x) * 4; l += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; c++ }
    out[gy * n + gx] = l / c
  }
  let mean = 0; for (const v of out) mean += v; mean /= out.length
  let va = 0; for (const v of out) va += (v - mean) ** 2; const sd = Math.sqrt(va / out.length) || 1
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mean) / sd
  return out
}
/** 1 - normalised cross-correlation (0 = identical, ~1 = unrelated) */
export function nccDist(a: Float32Array, b: Float32Array) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return 1 - s / a.length }
export function shiftedNorm(p: Pixels, t: Box): Float32Array[] {
  const out: Float32Array[] = []
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) out.push(normSignature(p, { x: t.x + dx, y: t.y + dy, w: t.w, h: t.h }))
  return out
}
export function nccDistMulti(a: Float32Array[], b: Float32Array) { let m = Infinity; for (const s of a) { const d = nccDist(s, b); if (d < m) m = d } return m }

export function sigDist(a: Float32Array, b: Float32Array) { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length }
/** signatures of a tile shifted by ±1px – makes matching tolerant to 1px localisation error */
export function shiftedSignatures(p: Pixels, t: Box): Float32Array[] {
  const out: Float32Array[] = []
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) out.push(signature(p, { x: t.x + dx, y: t.y + dy, w: t.w, h: t.h }))
  return out
}
export function sigDistMulti(a: Float32Array[], b: Float32Array) { let m = Infinity; for (const s of a) { const d = sigDist(s, b); if (d < m) m = d } return m }

export function detect(p: Pixels): Detection {
  const { main, size, all } = findSquares(p)
  const empty: Detection = { tileSize: 0, rows: [], seq: [], legend: [], legendBox: null, clusters: [] }
  if (main.length < 3) return empty

  // rows of main tiles (cluster by cy)
  const rowsOf = (ts: Tile[]) => {
    const sorted = [...ts].sort((a, b) => a.cy - b.cy)
    const rows: Tile[][] = []
    for (const t of sorted) { const last = rows[rows.length - 1]; if (last && Math.abs(last[0].cy - t.cy) < t.h * 0.5) last.push(t); else rows.push([t]) }
    for (const r of rows) r.sort((a, b) => a.cx - b.cx)
    return rows
  }
  // keep only rows with regular spacing (>= 3 tiles) – rejects stray squares in artwork
  const regular = (r: Tile[]) => {
    if (r.length < 3) return false
    const gaps: number[] = []; for (let i = 1; i < r.length; i++) gaps.push(r[i].cx - r[i - 1].cx)
    const g = median(gaps); return g > size * 0.9 && g < size * 3.5
  }
  let rows = rowsOf(main).filter(regular)
  if (!rows.length) return empty
  // drop tiles whose spacing from neighbours is wildly off the row's pitch
  rows = rows.map(r => {
    const gaps: number[] = []; for (let i = 1; i < r.length; i++) gaps.push(r[i].cx - r[i - 1].cx)
    const g = median(gaps)
    return r.filter((t, i) => { const dl = i > 0 ? t.cx - r[i - 1].cx : Infinity; const dr = i < r.length - 1 ? r[i + 1].cx - t.cx : Infinity; return Math.min(dl, dr) < g * 1.9 && Math.min(dl, dr) > g * 0.45 })
  }).filter(r => r.length >= 3)

  // sequence tiles with signatures
  const seq: SeqTile[] = []
  let idx = 0
  const srows: SeqTile[][] = rows.map((r, ri) => r.map((t, ci) => { const s: SeqTile = { ...t, row: ri, col: ci, index: idx++, sig: signature(p, t), sigs: shiftedSignatures(p, t), nsig: normSignature(p, t), nsigs: shiftedNorm(p, t), cluster: -1, legendIdx: -1 }; seq.push(s); return s }))

  // clustering by signature (identical icons are ~0 apart, different icons > 25)
  const thr = 0.3
  const clusters: { rep: SeqTile; members: SeqTile[]; legendIdx: number }[] = []
  for (const s of seq) {
    let best = -1, bd = Infinity
    clusters.forEach((c, ci) => { const d = nccDistMulti(s.nsigs, c.rep.nsig); if (d < bd) { bd = d; best = ci } })
    if (best >= 0 && bd < thr) { clusters[best].members.push(s); s.cluster = best }
    else { s.cluster = clusters.length; clusters.push({ rep: s, members: [s], legendIdx: -1 }) }
  }

  // legend (NW-style charts): smaller copies of the icons above the first row. Seeds = small coarse
  // candidates up there; each seed is refined (position ±6px, size 45–85% of the tile) by template-matching
  // against the cluster representatives. Seeds that don't match any icon well are dropped (artwork, text).
  const firstY = rows[0][0].y
  const seeds = all.filter(c => c.w < size * 0.85 && c.w >= size * 0.4 && c.cy < firstY - 2)
  type Hit = { box: Box; cluster: number; d: number }
  const hits: Hit[] = []
  for (const sd of seeds) {
    let best: Hit | null = null
    for (let S = Math.round(size * 0.45); S <= Math.round(size * 0.85); S++) for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
      const x = Math.round(sd.cx - S / 2) + dx, y = Math.round(sd.cy - S / 2) + dy
      if (x < 0 || y < 0 || x + S > p.width || y + S > p.height) continue
      const sg = signature(p, { x, y, w: S, h: S })
      clusters.forEach((c, ci) => { const d = sigDist(sg, c.rep.sig); if (!best || d < best.d) best = { box: { x, y, w: S, h: S }, cluster: ci, d } })
    }
    if (best && (best as Hit).d < 26) hits.push(best as Hit)
  }
  // one hit per cluster (best)
  const byCluster = new Map<number, Hit>()
  for (const h of hits) { const e = byCluster.get(h.cluster); if (!e || h.d < e.d) byCluster.set(h.cluster, h) }
  // second chance: slide along the legend row (now that we know its y and icon size) for clusters still unmatched
  if (byCluster.size >= 3) {
    const hs = [...byCluster.values()]
    const ly = median(hs.map(h => h.box.y)), lS = median(hs.map(h => h.box.w))
    const xMin = Math.max(0, Math.min(...hs.map(h => h.box.x)) - size * 6), xMax = Math.min(p.width, Math.max(...hs.map(h => h.box.x + h.box.w)) + size * 6)
    clusters.forEach((c, ci) => {
      if (byCluster.has(ci)) return
      let best: Hit | null = null
      for (let S = lS - 2; S <= lS + 2; S++) for (let y = ly - 4; y <= ly + 4; y++) for (let x = xMin; x + S <= xMax; x += 1) {
        if (y < 0 || y + S > p.height) continue
        const d = sigDist(signature(p, { x, y, w: S, h: S }), c.rep.sig)
        if (!best || d < best.d) best = { box: { x, y, w: S, h: S }, cluster: ci, d }
      }
      if (best && (best as Hit).d < 26) {
        // don't steal a box already claimed by another cluster (unless it's a touching variant – handled by grouping)
        const b = (best as Hit).box
        const clash = hs.some(h => Math.abs(h.box.x - b.x) < b.w * 0.5)
        if (!clash) { byCluster.set(ci, best as Hit); hs.push(best as Hit) }
      }
    })
  }
  const sortedHits = [...byCluster.values()].sort((a, b) => a.box.x - b.box.x)
  const legend: LegendEntry[] = []
  const legendClusters: number[][] = []
  for (const h of sortedHits) {
    const last = legend[legend.length - 1]
    if (last && h.box.x - (last.box.x + last.box.w) < h.box.w * 0.5 && Math.abs(h.box.y - last.box.y) < h.box.h * 0.5) {
      last.tiles.push({ ...h.box, cx: h.box.x + h.box.w / 2, cy: h.box.y + h.box.h / 2, score: 1 })
      last.box = { x: last.box.x, y: Math.min(last.box.y, h.box.y), w: h.box.x + h.box.w - last.box.x, h: Math.max(last.box.h, h.box.h) }
      last.sigs.push(clusters[h.cluster].rep.sig); legendClusters[legendClusters.length - 1].push(h.cluster)
    } else {
      legend.push({ tiles: [{ ...h.box, cx: h.box.x + h.box.w / 2, cy: h.box.y + h.box.h / 2, score: 1 }], box: { ...h.box }, sigs: [clusters[h.cluster].rep.sig] })
      legendClusters.push([h.cluster])
    }
  }
  const legendBox = legend.length ? { x: legend[0].box.x, y: Math.min(...legend.map(l => l.box.y)), w: legend[legend.length - 1].box.x + legend[legend.length - 1].box.w - legend[0].box.x, h: Math.max(...legend.map(l => l.box.h)) } : null

  // merge clusters that share a legend entry; tag every cluster/tile with its legend index
  if (legend.length >= 3) {
    const remap: number[] = clusters.map((_, i) => i)
    legendClusters.forEach((cs, li) => { const target = cs[0]; for (const c of cs) { remap[c] = target; clusters[c].legendIdx = li } })
    const merged: typeof clusters = []
    const newIndex: number[] = []
    clusters.forEach((c, ci) => {
      if (remap[ci] === ci) { newIndex[ci] = merged.length; merged.push({ ...c, members: [...c.members] }) }
    })
    clusters.forEach((c, ci) => { if (remap[ci] !== ci) { merged[newIndex[remap[ci]]].members.push(...c.members) } })
    merged.forEach(c => c.members.sort((a, b) => a.index - b.index))
    for (const s of seq) { s.cluster = newIndex[remap[s.cluster]]; s.legendIdx = merged[s.cluster].legendIdx }
    clusters.length = 0; clusters.push(...merged)
  } else { legend.length = 0 }
  return { tileSize: size, rows: srows, seq, legend, legendBox, clusters }
}
