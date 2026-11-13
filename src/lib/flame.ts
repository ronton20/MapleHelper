import type { Flame, FlameWeights } from '../types'

export function flameScore(f: Flame, w: FlameWeights): number {
  const main = f[w.mainStat]
  const sec = w.secondaryStat === 'none' ? 0 : f[w.secondaryStat] * w.secondaryWeight
  const att = (w.useMatt ? f.matt : f.att) * w.attWeight
  return Math.round((main + sec + att + f.allStat * w.allStatWeight) * 10) / 10
}

export const RANK_COLOR: Record<string, string> = {
  none: 'var(--color-line-2)', rare: 'var(--color-rare)', epic: 'var(--color-epic)', unique: 'var(--color-unique)', legendary: 'var(--color-legendary)',
}
export const RANK_LABEL: Record<string, string> = { none: '—', rare: 'Rare', epic: 'Epic', unique: 'Unique', legendary: 'Legendary' }
