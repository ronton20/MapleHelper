import type { FlameWeights, ItemInstance, Preset, SlotKey } from '../types'
import { capOn } from '../data/slots'
import { mainStatKeys } from './flame'

/** potential line → [key, value]; e.g. "Boss Damage +40%" → ['boss', 40]. Unknown lines → ['other:<label>', n] */
export function parsePotentialLine(line: string): [string, number] | null {
  const m = line.trim().match(/^(.*?)\s*([+-])\s*(\d+(?:\.\d+)?)\s*(%|s|sec)?\s*$/i)
  if (!m) return null
  const label = m[1].trim(); const u = label.toUpperCase(); const n = Number(m[3])
  if (/ALL STAT/.test(u)) return ['allStat%', n]
  if (/BOSS/.test(u)) return ['boss', n]
  if (/IGNORE|IED/.test(u)) return ['ied', n]
  if (/CRIT\w* DAMAGE|CRIT\w* DMG/.test(u)) return ['critDmg', n]
  if (/CRIT\w* RATE/.test(u)) return ['critRate', n]
  if (/COOLDOWN/.test(u)) return ['cooldown', n]
  if (/MESO/.test(u)) return ['meso', n]
  if (/DROP/.test(u)) return ['drop', n]
  if (/^MATT|MAGIC ATT/.test(u)) return ['matt%', n]
  if (/^ATT|ATTACK POWER/.test(u)) return ['att%', n]
  if (/^DAMAGE|^DMG/.test(u)) return ['dmg', n]
  if (/MAX ?HP|^HP/.test(u)) return ['hp%', n]
  for (const s of ['STR', 'DEX', 'INT', 'LUK']) if (new RegExp(`^${s}\\b`).test(u)) return [`${s.toLowerCase()}%`, n]
  return [`other:${label}`, n]
}

export interface GearTotals {
  flat: Record<'str' | 'dex' | 'int' | 'luk' | 'att' | 'matt' | 'hp', number>
  pct: Record<string, number>          // potential + flame % values by key (allStat% = flame + potential All Stat %)
  ied: number                          // combined multiplicatively
  stars: number; starGoal: number
}

export function gearTotals(preset: Preset): GearTotals {
  const t: GearTotals = { flat: { str: 0, dex: 0, int: 0, luk: 0, att: 0, matt: 0, hp: 0 }, pct: {}, ied: 0, stars: 0, starGoal: 0 }
  const add = (k: string, n: number) => { t.pct[k] = (t.pct[k] ?? 0) + n }
  let iedLeft = 1
  for (const [slot, it] of Object.entries(preset.slots) as [SlotKey, ItemInstance][]) {
    if (capOn(slot, 'stars', it.enabled)) { t.stars += it.starForce; t.starGoal += Math.max(it.starForce, it.starForceGoal) }
    if (capOn(slot, 'flames', it.enabled)) {
      const f = it.flame
      for (const k of ['str', 'dex', 'int', 'luk', 'att', 'matt', 'hp'] as const) t.flat[k] += f[k] || 0
      if (f.allStat) add('allStat%', f.allStat)
      if (f.bossDmg) add('boss', f.bossDmg)
      if (f.dmg) add('dmg', f.dmg)
    }
    if (capOn(slot, 'potential', it.enabled) && it.potential.rank !== 'none') {
      for (const line of it.potential.lines) {
        const p = line ? parsePotentialLine(line) : null
        if (!p) continue
        if (p[0] === 'ied') iedLeft *= 1 - p[1] / 100
        else add(p[0], p[1])
      }
    }
  }
  t.ied = Math.round((1 - iedLeft) * 1000) / 10
  return t
}

export interface TotalRow { label: string; flat?: number; pct?: number; text?: string }

/** the rows worth showing for this class (only non-zero ones) */
export function relevantRows(t: GearTotals, w: FlameWeights): TotalRow[] {
  const rows: TotalRow[] = []
  const stat = (k: 'str' | 'dex' | 'int' | 'luk') => rows.push({ label: k.toUpperCase(), flat: t.flat[k], pct: t.pct[`${k}%`] ?? 0 })
  if (w.mainStat === 'hp') rows.push({ label: 'HP', flat: t.flat.hp, pct: t.pct['hp%'] ?? 0 })
  else for (const k of mainStatKeys(w) as ('str' | 'dex' | 'int' | 'luk')[]) stat(k)
  if (w.secondaryStat !== 'none' && !mainStatKeys(w).includes(w.secondaryStat)) stat(w.secondaryStat)
  if (w.mainStat !== 'hp' && t.pct['allStat%']) rows.push({ label: 'All Stat', pct: t.pct['allStat%'] })
  const a = w.useMatt ? 'matt' : 'att'
  rows.push({ label: w.useMatt ? 'MATT' : 'ATT', flat: t.flat[a], pct: t.pct[`${a}%`] ?? 0 })
  if (t.pct.boss) rows.push({ label: 'Boss Damage', pct: t.pct.boss })
  if (t.ied) rows.push({ label: 'Ignore DEF', pct: t.ied })
  if (t.pct.dmg) rows.push({ label: 'Damage', pct: t.pct.dmg })
  if (t.pct.critDmg) rows.push({ label: 'Crit Damage', pct: t.pct.critDmg })
  if (t.pct.critRate) rows.push({ label: 'Crit Rate', pct: t.pct.critRate })
  if (t.pct.cooldown) rows.push({ label: 'Cooldown', text: `−${t.pct.cooldown}s` })
  if (t.pct.meso) rows.push({ label: 'Meso', pct: t.pct.meso })
  if (t.pct.drop) rows.push({ label: 'Drop Rate', pct: t.pct.drop })
  for (const [k, v] of Object.entries(t.pct)) if (k.startsWith('other:') && v) rows.push({ label: k.slice(6), pct: v })
  return rows.filter(r => r.text || r.flat || r.pct)
}
