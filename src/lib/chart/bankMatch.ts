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
