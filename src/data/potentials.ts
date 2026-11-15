import type { PotentialRank, SlotKey } from '../types'

/**
 * Potential line suggestions with values, by slot group, item level tier and rank.
 * Percent values: lvl 71-150 → Rare 3 / Epic 6 / Unique 9 / Legendary 12; lvl 151+ → 4 / 7 / 10 / 13.
 * All Stats: Epic 3(4) / Unique 6(7) / Legendary 9(10). Non-prime lines (2nd/3rd) are one rank lower.
 */
const RANKS: PotentialRank[] = ['rare', 'epic', 'unique', 'legendary']
const STAT = { rare: [3, 4], epic: [6, 7], unique: [9, 10], legendary: [12, 13] } as const
const ALL = { rare: [0, 0], epic: [3, 4], unique: [6, 7], legendary: [9, 10] } as const

type Group = 'weapon' | 'secondary' | 'emblem' | 'hat' | 'gloves' | 'armor' | 'accessory' | 'heart' | 'none'
function groupOf(slot: SlotKey): Group {
  if (slot === 'weapon') return 'weapon'
  if (slot === 'secondary') return 'secondary'
  if (slot === 'emblem') return 'emblem'
  if (slot === 'hat') return 'hat'
  if (slot === 'gloves') return 'gloves'
  if (['top', 'bottom', 'shoes', 'cape', 'belt', 'shoulder'].includes(slot)) return 'armor'
  if (['face', 'eye', 'earrings', 'ring1', 'ring2', 'ring3', 'ring4', 'pendant1', 'pendant2', 'pocket'].includes(slot)) return 'accessory'
  if (slot === 'heart') return 'heart'
  return 'none'
}

function linesFor(group: Group, rank: PotentialRank, highTier: boolean): string[] {
  if (rank === 'none' || group === 'none') return []
  const t = highTier ? 1 : 0
  const st = STAT[rank][t], all = ALL[rank][t]
  const stats = ['STR', 'DEX', 'INT', 'LUK'].map(s => `${s} +${st}%`)
  const allLine = all ? [`All Stats +${all}%`] : []
  const hp = [`Max HP +${st}%`]
  if (group === 'weapon' || group === 'secondary' || group === 'emblem') {
    const att = [`ATT +${st}%`, `MATT +${st}%`]
    const extra: string[] = []
    if (rank === 'epic') extra.push('Ignore Enemy DEF +15%')
    if (rank === 'unique') extra.push('Ignore Enemy DEF +30%', ...(group !== 'emblem' ? ['Boss Damage +30%'] : []))
    if (rank === 'legendary') extra.push(`Ignore Enemy DEF +${highTier ? 40 : 35}%`, ...(group !== 'emblem' ? [`Boss Damage +${highTier ? 40 : 35}%`] : []))
    const dmg = rank === 'rare' || rank === 'epic' ? [`Damage +${st}%`] : []
    return [...att, ...extra, ...stats, ...allLine, ...dmg]
  }
  const base = [...stats, ...allLine, ...hp]
  if (group === 'hat' && rank === 'legendary') base.push('Skill Cooldown -2s', 'Skill Cooldown -1s')
  if (group === 'gloves' && rank === 'legendary') base.unshift('Critical Damage +8%')
  if (group === 'accessory' && rank === 'legendary') base.push('Mesos Obtained +20%', 'Item Drop Rate +20%')
  if (group === 'heart') return [...stats, ...allLine]
  return base
}

/** suggestions for line n (1-based) of an item with `rank` at `reqLevel` in `slot` */
export function potentialOptions(slot: SlotKey, rank: PotentialRank, reqLevel: number, line: number): string[] {
  if (rank === 'none') return []
  const g = groupOf(slot)
  const high = reqLevel >= 151
  const ri = RANKS.indexOf(rank)
  const prime = linesFor(g, rank, high)
  if (line === 1 || ri === 0) return prime
  const lower = linesFor(g, RANKS[ri - 1], high)
  return [...prime, ...lower.filter(l => !prime.includes(l))]
}

/** same options, grouped by rank for a picker: line 1 = item's rank only; lines 2–3 = item's rank + one below */
export type PotentialOptionGroup = { label: string; rank: PotentialRank; options: string[] }
/** Line 1 is always the item's own tier (prime). Lines 2-3 can be the same tier or one tier lower. */
export function potentialOptionGroups(slot: SlotKey, rank: PotentialRank, reqLevel: number, line: number): PotentialOptionGroup[] {
  if (rank === 'none') return []
  const g = groupOf(slot), high = reqLevel >= 151, ri = RANKS.indexOf(rank)
  const cap = (r: PotentialRank) => r[0].toUpperCase() + r.slice(1)
  const prime = linesFor(g, rank, high)
  const groups: PotentialOptionGroup[] = [{ label: cap(rank), rank, options: prime }]
  if (line > 1 && ri > 0) {
    const lower = linesFor(g, RANKS[ri - 1], high).filter(l => !prime.includes(l))
    if (lower.length) groups.push({ label: cap(RANKS[ri - 1]), rank: RANKS[ri - 1], options: lower })
  }
  return groups
}

/** Compact summary of a potential for the grid cell, e.g. "23% STR · 16% CD" */
export function potentialSummary(lines: string[], mainStat: 'str' | 'dex' | 'int' | 'luk', slot: SlotKey, useMatt = mainStat === 'int'): string {
  const acc = { main: 0, all: 0, att: 0, boss: 0, ied: 0, cd: 0, dmg: 0, meso: 0, drop: 0, cdr: 0, hp: 0 }
  const main = mainStat.toUpperCase()
  const isWeaponish = ['weapon', 'secondary', 'emblem'].includes(slot)
  for (const raw of lines) {
    const l = raw.trim(); if (!l) continue
    const m = l.match(/([+-]?\d+(?:\.\d+)?)\s*(%|s\b)/); const n = m ? Math.abs(parseFloat(m[1])) : 0
    const u = l.toUpperCase()
    if (/ALL STAT/.test(u)) acc.all += n
    else if (new RegExp(`\\b${main}\\b`).test(u)) acc.main += n
    else if (/\bMATT\b|MAGIC ATT/.test(u)) { if (useMatt) acc.att += n }          // MATT only matters for magic classes
    else if (/\bATT\b|ATTACK/.test(u)) { if (!useMatt) acc.att += n }           // ATT only for physical classes
    else if (/BOSS/.test(u)) acc.boss += n
    else if (/IGNORE|IED|DEF/.test(u) && !/MAX/.test(u)) acc.ied += n
    else if (/CRIT.*DMG|CRIT.*DAMAGE|\bCD\b/.test(u)) acc.cd += n
    else if (/MESO/.test(u)) acc.meso += n
    else if (/DROP/.test(u)) acc.drop += n
    else if (/COOLDOWN|CDR/.test(u)) acc.cdr += n
    else if (/DAMAGE|DMG/.test(u)) acc.dmg += n
    else if (/MAX HP|HP\b/.test(u)) acc.hp += n
  }
  const out: string[] = []
  if (isWeaponish) {
    if (acc.att) out.push(`${acc.att}% ${useMatt ? 'MATT' : 'ATT'}`)
    if (acc.boss) out.push(`${acc.boss}% Boss`)
    if (acc.ied) out.push(`${acc.ied}% IED`)
  }
  if (acc.cd) out.push(`${acc.cd}% CD`)
  const stat = acc.main + acc.all
  if (stat) out.push(`${stat}% ${main}`)
  if (acc.cdr) out.push(`-${acc.cdr}s CD`)
  if (acc.meso) out.push(`${acc.meso}% Meso`)
  if (acc.drop) out.push(`${acc.drop}% Drop`)
  if (!out.length && acc.hp) out.push(`${acc.hp}% HP`)
  return out.slice(0, 2).join(' · ')
}
