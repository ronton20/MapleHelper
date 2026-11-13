import type { HexaNodeType, HexaNodeDef, HexaGroup } from '../types'

/**
 * Cost to go from level (i) to (i+1); index 0 = 0→1 (activation), index 29 = 29→30.
 * [solErda, fragments]
 * Source: MapleStory Wiki – HEXA Matrix cost tables.
 */
type Row = [number, number]

const ORIGIN: Row[] = [
  [0, 0], [1, 30], [1, 35], [1, 40], [2, 45], [2, 50], [2, 55], [3, 60], [3, 65], [10, 200],
  [3, 80], [3, 90], [4, 100], [4, 110], [4, 120], [4, 130], [4, 140], [4, 150], [5, 160], [15, 350],
  [5, 170], [5, 180], [5, 190], [5, 200], [5, 210], [6, 220], [6, 230], [6, 240], [7, 250], [20, 500],
]
const ASCENT: Row[] = [[5, 100], ...ORIGIN.slice(1)]

const SKILL3: Row[] = [
  [7, 140], [1, 21], [1, 26], [1, 30], [1, 34], [2, 38], [2, 43], [2, 47], [2, 51], [8, 142],
  [2, 62], [2, 69], [3, 77], [3, 83], [3, 91], [3, 98], [3, 105], [3, 112], [3, 120], [12, 252],
  [4, 128], [4, 136], [4, 145], [4, 152], [4, 161], [4, 168], [5, 177], [5, 184], [5, 193], [14, 357],
]

const MASTERY: Row[] = [
  [3, 50], [1, 15], [1, 18], [1, 20], [1, 23], [1, 25], [1, 28], [2, 30], [2, 33], [5, 100],
  [2, 40], [2, 45], [2, 50], [2, 55], [2, 60], [2, 65], [2, 70], [2, 75], [3, 80], [8, 175],
  [3, 85], [3, 90], [3, 95], [3, 100], [3, 105], [3, 110], [3, 115], [3, 120], [4, 125], [10, 250],
]

const BOOST: Row[] = [
  [4, 75], [1, 23], [1, 27], [1, 30], [2, 34], [2, 38], [2, 42], [3, 45], [3, 49], [8, 150],
  [3, 60], [3, 68], [3, 75], [3, 83], [3, 90], [3, 98], [3, 105], [3, 113], [4, 120], [12, 263],
  [4, 128], [4, 135], [4, 143], [4, 150], [4, 158], [5, 165], [5, 173], [5, 180], [6, 188], [15, 375],
]

const COMMON: Row[] = [
  [7, 125], [2, 38], [2, 44], [2, 50], [3, 57], [3, 63], [3, 69], [5, 75], [5, 82], [14, 300],
  [5, 110], [5, 124], [6, 138], [6, 152], [6, 165], [6, 179], [6, 193], [6, 207], [7, 220], [17, 525],
  [7, 234], [7, 248], [7, 262], [7, 275], [7, 289], [9, 303], [9, 317], [9, 330], [10, 344], [20, 750],
]

const COMMON_BOOST: Row[] = [
  [4, 90], [1, 25], [1, 30], [1, 35], [2, 40], [2, 45], [2, 50], [3, 55], [3, 60], [9, 180],
  [3, 73], [3, 81], [3, 90], [3, 98], [4, 107], [4, 115], [4, 124], [4, 132], [4, 141], [14, 315],
  [4, 151], [5, 160], [5, 170], [5, 179], [5, 189], [5, 198], [5, 208], [5, 217], [6, 227], [18, 450],
]

/**
 * HEXA Stat nodes: level 0→1 is the unlock cost (per node), then each level costs fragments only, and the
 * amount is random (it depends on the rolled main-stat level: 10–50 frags per attempt). We use a flat
 * estimate per level so the planner can still give a ballpark.
 */
export const STAT_FRAGS_PER_LEVEL = 20
export const STAT_MAX_LEVEL = 20

export const HEXA_COSTS: Record<Exclude<HexaNodeType, 'stat'>, Row[]> = {
  origin: ORIGIN, ascent: ASCENT, skill3: SKILL3, mastery: MASTERY, boost: BOOST, common: COMMON, commonBoost: COMMON_BOOST,
}

export const MAX_LEVEL = 30
export function maxLevel(type: HexaNodeType) { return type === 'stat' ? STAT_MAX_LEVEL : MAX_LEVEL }

export const NODE_TYPE_LABEL: Record<HexaNodeType, string> = {
  origin: 'Origin', ascent: 'Ascent', skill3: '3rd skill', mastery: 'Mastery', boost: 'Boost', common: 'Common', commonBoost: 'Common boost', stat: 'HEXA Stat',
}

export const GROUP_OF: Record<HexaNodeType, HexaGroup> = {
  origin: 'skill', ascent: 'skill', skill3: 'skill', mastery: 'mastery', boost: 'boost', common: 'common', commonBoost: 'common', stat: 'stat',
}
export const GROUPS: HexaGroup[] = ['skill', 'mastery', 'boost', 'common', 'stat']
export const GROUP_LABEL: Record<HexaGroup, string> = { skill: 'Skill nodes', mastery: 'Mastery nodes', boost: 'Boost nodes', common: 'Common nodes', stat: 'HEXA Stats' }
export const GROUP_COLOR: Record<HexaGroup, string> = { skill: '#f0b232', mastery: '#5aa9ff', boost: '#b47cff', common: '#5ee07a', stat: '#c9a2ff' }
export const GROUP_TYPES: Record<HexaGroup, HexaNodeType[]> = {
  skill: ['origin', 'ascent', 'skill3'], mastery: ['mastery'], boost: ['boost'], common: ['common', 'commonBoost'], stat: ['stat'],
}

/** fragments + erda to go from level `from` to `to` for a node */
export function costBetween(node: Pick<HexaNodeDef, 'type' | 'unlockFrags' | 'unlockErda'>, from: number, to: number): { frags: number; erda: number } {
  let frags = 0, erda = 0
  const max = maxLevel(node.type)
  for (let l = Math.max(0, from); l < Math.min(to, max); l++) {
    if (node.type === 'stat') {
      if (l === 0) { frags += node.unlockFrags ?? 0; erda += node.unlockErda ?? 0 } else frags += STAT_FRAGS_PER_LEVEL
    } else {
      const row = HEXA_COSTS[node.type][l]; erda += row[0]; frags += row[1]
    }
  }
  return { frags, erda }
}

export function totalToMax(node: Pick<HexaNodeDef, 'type' | 'unlockFrags' | 'unlockErda'>) { return costBetween(node, 0, maxLevel(node.type)) }
