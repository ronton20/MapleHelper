import type { Flame, FlameWeights } from '../types'

export const DA_HP_WEIGHT = 1 / 17.5

/** flame fields that count as main stat for these weights */
export function mainStatKeys(w: FlameWeights): (keyof Flame)[] {
  if (w.mainStat === 'xenon') return ['str', 'dex', 'luk']
  return [w.mainStat]
}

/** the flame inputs worth showing on non-weapon gear: main stat(s), sub stat, ATT or MATT, All Stat % */
export function flameInputKeys(w: FlameWeights): (keyof Flame)[] {
  const keys = [...mainStatKeys(w)]
  if (w.secondaryStat !== 'none' && !keys.includes(w.secondaryStat)) keys.push(w.secondaryStat)
  keys.push(w.useMatt ? 'matt' : 'att', 'allStat')
  return keys
}

export function flameScore(f: Flame, w: FlameWeights): number {
  const main = w.mainStat === 'xenon' ? f.str + f.dex + f.luk
    : w.mainStat === 'hp' ? f.hp * (w.hpWeight ?? DA_HP_WEIGHT)
    : f[w.mainStat]
  const sec = w.secondaryStat === 'none' || mainStatKeys(w).includes(w.secondaryStat) ? 0 : f[w.secondaryStat] * w.secondaryWeight
  const att = (w.useMatt ? f.matt : f.att) * w.attWeight
  return Math.round((main + sec + att + f.allStat * w.allStatWeight) * 10) / 10
}

const fmt = (n: number) => Number(n.toFixed(3)).toString()
/** human-readable formula, e.g. "STR + DEX×0.083 + 3×ATT + 10×All%" */
export function describeWeights(w: FlameWeights): string {
  const main = w.mainStat === 'xenon' ? 'STR + DEX + LUK' : w.mainStat === 'hp' ? `HP×${fmt(w.hpWeight ?? DA_HP_WEIGHT)}` : w.mainStat.toUpperCase()
  const sec = w.secondaryStat === 'none' || mainStatKeys(w).includes(w.secondaryStat) ? '' : ` + ${w.secondaryStat.toUpperCase()}×${fmt(w.secondaryWeight)}`
  return `${main}${sec} + ${fmt(w.attWeight)}×${w.useMatt ? 'MATT' : 'ATT'} + ${fmt(w.allStatWeight)}×All%`
}

export const RANK_COLOR: Record<string, string> = {
  none: 'var(--color-line-2)', rare: 'var(--color-rare)', epic: 'var(--color-epic)', unique: 'var(--color-unique)', legendary: 'var(--color-legendary)',
}
export const RANK_LABEL: Record<string, string> = { none: '—', rare: 'Rare', epic: 'Epic', unique: 'Unique', legendary: 'Legendary' }
