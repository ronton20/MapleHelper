/**
 * Skill bank: the shared catalog of HEXA skill icons/names per class (stored in the worker's KV, cached locally).
 * Every HEXA node in the app points at a bank "slot" (one HEXA core); icons, default names and node types come
 * from the bank. The class banks hold the class cores (Origin … Common), the "common" bank holds Sol Janus,
 * Sol Hecate and the HEXA Stat icons.
 */
import type { HexaNodeDef, HexaNodeType } from '../types'

export const COMMON_BANK = 'common'

export interface BankEntry {
  slot: string          // slot key (see SLOTS)
  name: string          // skill name (GMS)
  primary: boolean      // the icon the game / charts show for this core
  icon: string          // data URL (png)
}
export interface SkillBank { classKey: string; entries: BankEntry[]; updatedAt: number }
export interface BankMeta { classKey: string; count: number; slots: number; updatedAt: number }

export interface SlotDef { key: string; label: string; type: HexaNodeType; bank: 'class' | 'common'; unlockFrags?: number; unlockErda?: number }

/** every slot, in HEXA-window order. Node ids of bank-based profiles are the slot keys. */
export const SLOTS: SlotDef[] = [
  { key: 'o1', label: 'Origin', type: 'origin', bank: 'class' },
  { key: 'a1', label: 'Ascent', type: 'ascent', bank: 'class' },
  { key: 'k1', label: 'Skill 3', type: 'skill3', bank: 'class' },
  { key: 'm1', label: 'Mastery 1', type: 'mastery', bank: 'class' },
  { key: 'm2', label: 'Mastery 2', type: 'mastery', bank: 'class' },
  { key: 'm3', label: 'Mastery 3', type: 'mastery', bank: 'class' },
  { key: 'm4', label: 'Mastery 4', type: 'mastery', bank: 'class' },
  { key: 'b1', label: 'Boost 1', type: 'boost', bank: 'class' },
  { key: 'b2', label: 'Boost 2', type: 'boost', bank: 'class' },
  { key: 'b3', label: 'Boost 3', type: 'boost', bank: 'class' },
  { key: 'b4', label: 'Boost 4', type: 'boost', bank: 'class' },
  { key: 'c1', label: 'Sol Janus', type: 'common', bank: 'common' },
  { key: 'c2', label: 'Sol Hecate', type: 'common', bank: 'common' },
  { key: 'c3', label: 'Common (class group)', type: 'commonBoost', bank: 'class' },
  { key: 'stat1', label: 'HEXA Stat I', type: 'stat', bank: 'common', unlockFrags: 10, unlockErda: 5 },
  { key: 'stat2', label: 'HEXA Stat II', type: 'stat', bank: 'common', unlockFrags: 200, unlockErda: 10 },
  { key: 'stat3', label: 'HEXA Stat III', type: 'stat', bank: 'common', unlockFrags: 350, unlockErda: 15 },
  /** the plain HEXA Stat icon (no numeral) – only used for matching; nodes are stat1-3 */
  { key: 'stat', label: 'HEXA Stat (plain icon)', type: 'stat', bank: 'common' },
]
export const SLOT_BY_KEY: Record<string, SlotDef> = Object.fromEntries(SLOTS.map(s => [s.key, s]))
export const CLASS_SLOTS = SLOTS.filter(s => s.bank === 'class')
export const COMMON_SLOTS = SLOTS.filter(s => s.bank === 'common')
export const slotRank = (key?: string) => { const i = SLOTS.findIndex(s => s.key === key); return i < 0 ? 999 : i }

/** slot column of the hexa-skills CSVs → slot key */
export function slotKeyFromLabel(label: string, folder: string): string | null {
  const l = label.trim().toLowerCase()
  if (folder === COMMON_BANK) {
    if (l.startsWith('sol janus')) return 'c1'
    if (l.startsWith('sol hecate')) return 'c2'
    const m = l.match(/^hexa stat\s*(i{1,3})?$/)
    if (m) return m[1] ? `stat${m[1].length}` : 'stat'
    return null
  }
  if (l === 'origin') return 'o1'
  if (l === 'ascent') return 'a1'
  if (l === 'skill 3') return 'k1'
  if (l === 'common') return 'c3'
  const mm = l.match(/^(mastery|boost)\s*([1-4])$/)
  return mm ? `${mm[1][0]}${mm[2]}` : null
}

const bankOf = (slot: string, cls?: SkillBank | null, common?: SkillBank | null) => SLOT_BY_KEY[slot]?.bank === 'common' ? common : cls
const entriesOf = (slot: string, cls?: SkillBank | null, common?: SkillBank | null) => (bankOf(slot, cls, common)?.entries ?? []).filter(e => e.slot === slot)
/** the core's display entry: its primary icon, else the first one */
export function coreEntry(slot: string, cls?: SkillBank | null, common?: SkillBank | null): BankEntry | undefined {
  const es = entriesOf(slot, cls, common); return es.find(e => e.primary) ?? es[0]
}
export function coreName(slot: string, cls?: SkillBank | null, common?: SkillBank | null): string {
  return coreEntry(slot, cls, common)?.name ?? SLOT_BY_KEY[slot]?.label ?? slot
}

const PLACEHOLDER = /^(origin skill|ascent skill|skill 3|mastery [1-4]|boost [1-4]|common boost|new .* node)$/i
/** name shown for a node: the user's name, unless it is still a generic placeholder ("Mastery 2") → the bank's core name */
export function nodeName(n: HexaNodeDef, cls?: SkillBank | null, common?: SkillBank | null): string {
  if (n.slot && (!n.name.trim() || PLACEHOLDER.test(n.name.trim()))) return coreEntry(n.slot, cls, common)?.name ?? n.name
  return n.name
}

/** icon for a node: the bank's icon for its slot, else whatever the node carried before the bank existed */
export function nodeIcon(n: HexaNodeDef, cls?: SkillBank | null, common?: SkillBank | null): string | undefined {
  return (n.slot && coreEntry(n.slot, cls, common)?.icon) || n.icon
}

/** full node list for a class from its bank (cores that exist in the bank + Sol Janus/Hecate + HEXA Stats) */
export function nodesFromBank(cls: SkillBank | null | undefined, common: SkillBank | null | undefined): HexaNodeDef[] {
  const has = new Set((cls?.entries ?? []).map(e => e.slot))
  return SLOTS.filter(s => s.key !== 'stat' && (s.bank === 'common' || has.has(s.key) || (!cls && s.key !== 'k1')))
    .map(s => ({ id: s.key, slot: s.key, name: coreName(s.key, cls, common), type: s.type, ...(s.unlockFrags ? { unlockFrags: s.unlockFrags, unlockErda: s.unlockErda } : {}) }))
}

const norm = (s: string) => s.toLowerCase().replace(/^hexa\s+/, '').replace(/\s+vi$/, '').replace(/[^a-z0-9]+/g, '')

/**
 * Give nodes made before the bank existed a slot: by name (any skill name in the core), then by type order
 * (origin → o1, the n-th mastery → m<n> …). Nodes that already have a slot are left alone.
 */
export function assignSlots(nodes: HexaNodeDef[], cls?: SkillBank | null, common?: SkillBank | null): HexaNodeDef[] | null {
  if (nodes.every(n => n.slot)) return null
  const taken = new Set(nodes.map(n => n.slot).filter(Boolean) as string[])
  const all = [...(cls?.entries ?? []), ...(common?.entries ?? [])]
  const out = nodes.map(n => ({ ...n }))
  for (const n of out) {
    if (n.slot) continue
    const key = norm(n.name)
    const hit = key && all.find(e => !taken.has(e.slot) && e.slot !== 'stat' && norm(e.name) === key)
    if (hit) { n.slot = hit.slot; taken.add(hit.slot); continue }
    if (/^hexa stat\s*(i{1,3})$/i.test(n.name.trim())) { const k = `stat${n.name.trim().split(/\s+/).pop()!.length}`; if (!taken.has(k)) { n.slot = k; taken.add(k) } continue }
    if (/janus/i.test(n.name) && !taken.has('c1')) { n.slot = 'c1'; taken.add('c1'); continue }
    if (/hecate/i.test(n.name) && !taken.has('c2')) { n.slot = 'c2'; taken.add('c2') }
  }
  for (const n of out) {
    if (n.slot) continue
    const free = SLOTS.find(s => s.type === n.type && s.key !== 'stat' && !taken.has(s.key))
    if (free) { n.slot = free.key; taken.add(free.key) }
  }
  return out.some((n, i) => n.slot !== nodes[i].slot) ? out : null
}

/** parse one hexa-skills CSV (name,type,slot,primary,icon); names may be quoted */
export function parseBankCsv(text: string): { name: string; slot: string; primary: boolean; icon: string }[] {
  const rows: string[][] = []
  let cur: string[] = [], f = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"' && text[i + 1] === '"') { f += '"'; i++ } else if (ch === '"') q = false; else f += ch; continue }
    if (ch === '"') q = true
    else if (ch === ',') { cur.push(f); f = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; cur.push(f); f = ''; if (cur.some(x => x !== '')) rows.push(cur); cur = [] }
    else f += ch
  }
  if (f || cur.length) { cur.push(f); if (cur.some(x => x !== '')) rows.push(cur) }
  const head = rows.shift()?.map(h => h.trim().toLowerCase()) ?? []
  const ix = (k: string) => head.indexOf(k)
  return rows.map(r => ({ name: (r[ix('name')] ?? '').trim(), slot: (r[ix('slot')] ?? '').trim(), primary: (r[ix('primary')] ?? '').trim() === '1', icon: (r[ix('icon')] ?? '').trim() }))
}
