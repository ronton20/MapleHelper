import type { SlotKey } from '../types'

/**
 * Flame score targets for armor & accessories (Early / Mid / Late-End), by item level,
 * from the community "Flame Score Targets" table (flame-advantaged vs non-flame-advantaged gear).
 * Rule of thumb used for the score: 1 main stat = 1, 12 secondary stat = 1, 1 ATT = 3, 1% all stat = 10.
 */
export interface FlameTarget { early: number; mid: number; late: number; label: string }

const ADV: [number, FlameTarget][] = [
  [135, { early: 95, mid: 115, late: 126, label: 'lvl 130' }],
  [155, { early: 100, mid: 120, late: 132, label: 'lvl 140–150' }],
  [199, { early: 110, mid: 130, late: 144, label: 'lvl 160' }],
  [249, { early: 120, mid: 150, late: 162, label: 'lvl 200' }],
  [Infinity, { early: 135, mid: 160, late: 174, label: 'lvl 250' }],
]
const NON_ADV: [number, FlameTarget][] = [
  [155, { early: 45, mid: 60, late: 70, label: 'lvl 140–150 (non-flame-adv.)' }],
  [Infinity, { early: 50, mid: 65, late: 75, label: 'lvl 160 (non-flame-adv.)' }],
]

export function flameTarget(reqLevel: number, flameAdvantaged: boolean): FlameTarget {
  const table = flameAdvantaged ? ADV : NON_ADV
  return table.find(([max]) => reqLevel <= max)![1]
}

/** flame *score* targets apply to flameable armor/accessories – not to weapons (ATT flames) */
export function hasFlameTarget(slot: SlotKey): boolean {
  return slot !== 'weapon' && slot !== 'secondary'
}
