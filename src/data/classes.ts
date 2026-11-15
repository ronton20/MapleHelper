import type { HexaNodeDef, FlameWeights } from '../types'
import { CLASS_BY_KEY } from './gmsClasses'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')
export const STAT_NODES: HexaNodeDef[] = [
  { id: 'stat1', name: 'HEXA Stat I', type: 'stat', unlockFrags: 10, unlockErda: 5, icon: `${BASE}/icons/stat.png` },
  { id: 'stat2', name: 'HEXA Stat II', type: 'stat', unlockFrags: 200, unlockErda: 10, icon: `${BASE}/icons/stat.png` },
  { id: 'stat3', name: 'HEXA Stat III', type: 'stat', unlockFrags: 350, unlockErda: 15, icon: `${BASE}/icons/stat.png` },
]
const STR_WARRIOR: FlameWeights = { mainStat: 'str', secondaryStat: 'dex', secondaryWeight: 1 / 12, attWeight: 3, allStatWeight: 10, useMatt: false }
const LUK_THIEF: FlameWeights = { mainStat: 'luk', secondaryStat: 'dex', secondaryWeight: 1 / 12, attWeight: 3, allStatWeight: 10, useMatt: false }

const COMMON_NODES = (thirdName: string): HexaNodeDef[] => [
  { id: 'c1', name: 'Sol Janus', type: 'common' },
  { id: 'c2', name: 'Sol Hecate', type: 'common' },
  { id: 'c3', name: thirdName, type: 'commonBoost' },
]

/** Generic template for classes not seeded yet */
export const GENERIC_NODES: HexaNodeDef[] = [
  { id: 'o1', name: 'Origin skill', type: 'origin' },
  { id: 'a1', name: 'Ascent skill', type: 'ascent' },
  { id: 'm1', name: 'Mastery 1', type: 'mastery' },
  { id: 'm2', name: 'Mastery 2', type: 'mastery' },
  { id: 'm3', name: 'Mastery 3', type: 'mastery' },
  { id: 'm4', name: 'Mastery 4', type: 'mastery' },
  { id: 'b1', name: 'Boost 1', type: 'boost' },
  { id: 'b2', name: 'Boost 2', type: 'boost' },
  { id: 'b3', name: 'Boost 3', type: 'boost' },
  { id: 'b4', name: 'Boost 4', type: 'boost' },
  ...COMMON_NODES('Common Boost'),
  ...STAT_NODES,
]

export const DEFAULT_WEIGHTS: FlameWeights = STR_WARRIOR

const DEX_BOWMAN: FlameWeights = { mainStat: 'dex', secondaryStat: 'str', secondaryWeight: 1 / 12, attWeight: 3, allStatWeight: 10, useMatt: false }
const INT_MAGE: FlameWeights = { mainStat: 'int', secondaryStat: 'luk', secondaryWeight: 1 / 12, attWeight: 3, allStatWeight: 10, useMatt: true }
const DEX_PIRATES = ['corsair', 'mechanic', 'angelic-buster']

/** default flame-score weights for a GMS class (from its class type) */
export function weightsForClass(classKey: string | undefined): FlameWeights {
  const c = classKey ? CLASS_BY_KEY[classKey] : undefined
  if (!c) return DEFAULT_WEIGHTS
  if (c.type === 'Magician') return INT_MAGE
  if (c.type === 'Bowman' || DEX_PIRATES.includes(c.key)) return DEX_BOWMAN
  if (c.type === 'Thief' || c.type === 'Thief/Pirate') return LUK_THIEF
  return STR_WARRIOR
}
