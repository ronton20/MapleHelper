/**
 * Maximum Star Force by equipment level (MapleStory Wiki – Star Force Enhancement):
 *   0–94: 5★ · 95–107: 8★ · 108–117: 10★ · 118–127: 15★ · 128–137: 20★ · 138+: 30★
 * Special cases that ignore the level rule: Sweetwater shoes/gloves/cape 15★, Ghost Ship Exorcist and
 * Sengoku Hakase badges 22★, Superior gear (Tyrant 15★, Nova 8★, Elite Heliseum 3★).
 */
const LEVEL_TABLE: [number, number][] = [[94, 5], [107, 8], [117, 10], [127, 15], [137, 20], [Infinity, 30]]

const SPECIAL: [RegExp, number][] = [
  [/sweetwater.*(shoes|gloves?|cape)/i, 15],
  [/ghost ship exorcist/i, 22],
  [/sengoku hakase/i, 22],
  [/\btyrant\b/i, 15],
  [/\bnova\b.*(?:hat|cape|gloves?|shoes|belt|shoulder)/i, 8],
  [/elite heliseum/i, 3],
]

export function maxStarForce(reqLevel: number, name = ''): number {
  for (const [re, max] of SPECIAL) if (re.test(name)) return max
  return LEVEL_TABLE.find(([lvl]) => reqLevel <= lvl)![1]
}

/** sensible goal presets for a given cap */
export function starGoalPresets(max: number): number[] {
  return [...new Set([17, 22, 30].filter(n => n < max).concat(max))].sort((a, b) => a - b)
}

/** default goal when an item is added: 22★ when possible, else the cap */
export function defaultStarGoal(max: number): number { return Math.min(22, max) }
