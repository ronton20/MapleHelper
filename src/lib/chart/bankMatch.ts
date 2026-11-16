/**
 * Cross-references chart icons with the shared skill bank (main thread – cheap: 16×16 signatures).
 * A chart cluster whose icon correlates with a bank icon is that bank core: name, type and node slot come from the bank.
 */
import { normSignature, shiftedNorm, matchBox, nccDistMulti, type Pixels, type Box } from './detect'
import type { HexaNodeDef } from '../../types'
import { SLOT_BY_KEY, assignSlots, coreEntry, type BankEntry, type SkillBank } from '../../data/skillBank'

export interface BankRef { slot: string; name: string; sig: Float32Array }
export interface BankHit { slot: string; dist: number; margin: number }

/** accept a match when it is this close… */
export const MATCH_MAX = 0.56
/** …and clearly better than the best icon of any other core */
export const MATCH_MARGIN = 0.1

async function pixelsOf(dataUrl: string): Promise<Pixels> {
  const img = new Image(); img.src = dataUrl; await img.decode()
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
  const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height)
  return { width: d.width, height: d.height, data: d.data }
}

/** signatures for bank icons; `badges` = the chart draws level badges over the icon's lower part */
export async function bankRefs(entries: BankEntry[], badges: boolean): Promise<BankRef[]> {
  const out: BankRef[] = []
  for (const e of entries) {
    try {
      const p = await pixelsOf(e.icon)
      out.push({ slot: e.slot, name: e.name, sig: normSignature(p, matchBox({ x: 0, y: 0, w: p.width, h: p.height }, badges)) })
    } catch { /* unreadable icon – skip */ }
  }
  return out
}

/** best bank core for one chart tile (box in chart pixels), or null when nothing is a confident match */
export function matchTile(p: Pixels, box: Box, badges: boolean, refs: BankRef[]): BankHit | null {
  if (!refs.length) return null
  const sigs = shiftedNorm(p, matchBox(box, badges))
  const best = new Map<string, number>()
  for (const r of refs) { const d = nccDistMulti(sigs, r.sig); if (d < (best.get(r.slot) ?? Infinity)) best.set(r.slot, d) }
  const ranked = [...best.entries()].sort((a, b) => a[1] - b[1])
  const [slot, dist] = ranked[0]
  const margin = (ranked[1]?.[1] ?? 1) - dist
  return dist <= MATCH_MAX && margin >= MATCH_MARGIN ? { slot, dist, margin } : null
}

// ---- composite / split icons ----------------------------------------------------------------------------
// Some charts draw a multi-skill core as one icon cut into parts (diagonal halves, a Y-shaped 3-way split…),
// each part showing a different skill of the core. Those don't match any single bank icon, so for icons left
// over after normal matching we score every core by region: each part of the chart icon is compared with the
// same part of every icon in the core, the best per part is kept, and the parts are averaged.
const CG = 24   // colour grid size

export function colorGrid(p: Pixels, b: Box, inset = 0.12): Float32Array {
  const ins = Math.round(Math.min(b.w, b.h) * inset)
  const x0 = b.x + ins, y0 = b.y + ins, w = b.w - 2 * ins, h = b.h - 2 * ins
  const out = new Float32Array(CG * CG * 3)
  for (let gy = 0; gy < CG; gy++) for (let gx = 0; gx < CG; gx++) {
    const xa = x0 + Math.floor(gx * w / CG), xb = Math.max(xa + 1, x0 + Math.floor((gx + 1) * w / CG))
    const ya = y0 + Math.floor(gy * h / CG), yb = Math.max(ya + 1, y0 + Math.floor((gy + 1) * h / CG))
    let r = 0, g = 0, bl = 0, n = 0
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
      if (x < 0 || y < 0 || x >= p.width || y >= p.height) continue
      const i = (y * p.width + x) * 4, a = p.data[i + 3] / 255
      r += p.data[i] * a; g += p.data[i + 1] * a; bl += p.data[i + 2] * a; n++
    }
    const o = (gy * CG + gx) * 3
    out[o] = n ? r / n : 0; out[o + 1] = n ? g / n : 0; out[o + 2] = n ? bl / n : 0
  }
  return out
}

/** split layouts → list of regions (cell index lists); cells on the dividing lines are left out */
const SPLITS: number[][][] = (() => {
  const m = (f: (x: number, y: number) => boolean) => { const r: number[] = []; for (let y = 0; y < CG; y++) for (let x = 0; x < CG; x++) if (f(x, y)) r.push(y * CG + x); return r }
  const H = CG / 2, E = CG - 1
  return [
    [m(() => true)],                                                         // whole icon
    [m((x, y) => x + y < E - 2), m((x, y) => x + y > E + 2)],                // diagonal /
    [m((x, y) => x > y + 2), m((x, y) => x < y - 2)],                        // diagonal \
    [m(x => x < H - 1), m(x => x > H)],                                      // left | right
    [m((_, y) => y < H - 1), m((_, y) => y > H)],                            // top / bottom
    [m((x, y) => y + 1 < x && y + 1 < E - x), m((x, y) => x < H - 1 && y > x + 1), m((x, y) => x > H && y > E - x + 1)],   // Y
  ]
})()

function regionDist(a: Float32Array, b: Float32Array, cells: number[]): number {
  let ma = 0, mb = 0
  for (const c of cells) for (let k = 0; k < 3; k++) { ma += a[c * 3 + k]; mb += b[c * 3 + k] }
  const n = cells.length * 3; ma /= n; mb /= n
  let ab = 0, aa = 0, bb = 0
  for (const c of cells) for (let k = 0; k < 3; k++) { const x = a[c * 3 + k] - ma, y = b[c * 3 + k] - mb; ab += x * y; aa += x * x; bb += y * y }
  return 1 - ab / (Math.sqrt(aa * bb) || 1)
}

export interface ColorRef { slot: string; grid: Float32Array }
export async function bankColorRefs(entries: BankEntry[], badges: boolean): Promise<ColorRef[]> {
  const out: ColorRef[] = []
  for (const e of entries) {
    try { const p = await pixelsOf(e.icon); out.push({ slot: e.slot, grid: colorGrid(p, matchBox({ x: 0, y: 0, w: p.width, h: p.height }, badges)) }) } catch { /* skip */ }
  }
  return out
}

/** accept a region (split-aware) match when it is this close and this far ahead of the next core */
export const SPLIT_MAX = 0.66
export const SPLIT_MARGIN = 0.04

/** distance of a chart tile to each candidate core, allowing for split icons; sorted, best first */
export function coreDistances(p: Pixels, box: Box, badges: boolean, refs: ColorRef[], slots: Set<string>): { slot: string; dist: number }[] {
  const by = new Map<string, Float32Array[]>()
  for (const r of refs) if (slots.has(r.slot)) by.set(r.slot, [...(by.get(r.slot) ?? []), r.grid])
  const best = new Map<string, number>()
  const mb = matchBox(box, badges)
  for (const dy of [-2, 0, 2]) for (const dx of [-2, 0, 2]) {
    const t = colorGrid(p, { ...mb, x: mb.x + dx, y: mb.y + dy })
    for (const [slot, grids] of by) {
      for (const parts of SPLITS) {
        let sum = 0
        for (const cells of parts) { let m = Infinity; for (const g of grids) { const d = regionDist(t, g, cells); if (d < m) m = d } sum += m }
        const d = sum / parts.length
        if (d < (best.get(slot) ?? Infinity)) best.set(slot, d)
      }
    }
  }
  return [...best.entries()].map(([slot, dist]) => ({ slot, dist })).sort((a, b) => a.dist - b.dist)
}

export function canvasPixels(canvas: HTMLCanvasElement): Pixels {
  const d = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
  return { width: d.width, height: d.height, data: d.data }
}

// ---- linking node lists made before the skill bank (chart crops as icons, no slot) ---------------------

/**
 * Give every node a skill-bank slot: by its stored icon (chart crop) first, then by name / type order.
 * Linked nodes take the slot's type and drop their stored icon when the bank has one. Node ids stay the same
 * (leveling orders point at them). Returns null when nothing changed.
 */
export async function linkNodesToBank(nodes: HexaNodeDef[], cls: SkillBank | null, common: SkillBank | null): Promise<{ nodes: HexaNodeDef[]; linked: number; unlinked: number } | null> {
  const entries = [...(cls?.entries ?? []), ...(common?.entries ?? [])].filter(e => e.slot !== 'stat')
  const out = nodes.map(n => ({ ...n }))
  const taken = new Set(out.map(n => n.slot).filter(Boolean) as string[])
  if (entries.length && out.some(n => !n.slot && n.icon)) {
    const refsBy = { false: await bankRefs(entries, false), true: await bankRefs(entries, true) }
    // the stored icons are whole chart tiles: try both crops (with / without a level badge) and keep the one that
    // spreads the nodes over the most distinct cores (a wrong crop piles them onto one look-alike icon)
    const hits: Record<'false' | 'true', { n: HexaNodeDef; slot: string; dist: number; margin: number }[]> = { false: [], true: [] }
    for (const n of out) {
      if (n.slot || !n.icon) continue
      let p: Pixels
      try { p = await pixelsOf(n.icon) } catch { continue }
      for (const b of [false, true]) {
        const k = String(b) as 'false' | 'true'
        const sigs = shiftedNorm(p, matchBox({ x: 2, y: 2, w: p.width - 4, h: p.height - 4 }, b))
        const per = new Map<string, number>()
        for (const r of refsBy[k]) { const d = nccDistMulti(sigs, r.sig); if (d < (per.get(r.slot) ?? Infinity)) per.set(r.slot, d) }
        const ranked = [...per.entries()].sort((a, c) => a[1] - c[1])
        if (ranked.length) hits[k].push({ n, slot: ranked[0][0], dist: ranked[0][1], margin: (ranked[1]?.[1] ?? 1) - ranked[0][1] })
      }
    }
    // stored icons are small re-scaled crops → a looser threshold than live chart matching; cores are then
    // handed out greedily (closest first), so a node can't take a core another node matches better
    const ok = (h: { dist: number; margin: number }) => h.dist <= 0.63 && h.margin >= 0.05
    const score = (hs: typeof hits.true) => new Set(hs.filter(ok).map(h => h.slot)).size - (hs.length ? hs.reduce((a, h) => a + h.dist, 0) / hs.length : 0)
    const cands = (score(hits.true) > score(hits.false) ? hits.true : hits.false).filter(ok)
    for (const c of cands.sort((a, b) => a.dist - b.dist)) {
      if (taken.has(c.slot) || c.n.slot) continue
      c.n.slot = c.slot; taken.add(c.slot)
    }
  }
  const rest = assignSlots(out, cls, common) ?? out
  let changed = false
  for (let i = 0; i < rest.length; i++) {
    const n = rest[i]
    if (!n.slot) continue
    const def = SLOT_BY_KEY[n.slot]
    if (def) {
      n.type = def.type
      if (def.unlockFrags && !n.unlockFrags) { n.unlockFrags = def.unlockFrags; n.unlockErda = def.unlockErda }
    }
    if (n.icon && coreEntry(n.slot, cls, common)) delete n.icon
    if (n.slot !== nodes[i].slot || n.type !== nodes[i].type || n.icon !== nodes[i].icon) changed = true
  }
  if (!changed) return null
  return { nodes: rest, linked: rest.filter(n => n.slot).length, unlinked: rest.filter(n => !n.slot).length }
}
