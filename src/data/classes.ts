import type { HexaNodeDef, FlameWeights, HexaOrderStep } from '../types'

export interface ClassDef {
  id: string
  name: string
  /** substrings of the job name returned by the rankings API that map to this class */
  jobMatch: string[]
  flameWeights: FlameWeights
  nodes: HexaNodeDef[]
  /** full leveling order (node → level checkpoints), e.g. transcribed from a community chart */
  order?: HexaOrderStep[]
  orderSource?: string
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')
export const STAT_NODES: HexaNodeDef[] = [
  { id: 'stat1', name: 'HEXA Stat I', type: 'stat', unlockFrags: 10, unlockErda: 5, icon: `${BASE}/icons/stat.png` },
  { id: 'stat2', name: 'HEXA Stat II', type: 'stat', unlockFrags: 200, unlockErda: 10, icon: `${BASE}/icons/stat.png` },
  { id: 'stat3', name: 'HEXA Stat III', type: 'stat', unlockFrags: 350, unlockErda: 15, icon: `${BASE}/icons/stat.png` },
]
const nwIcon = (id: string) => `${BASE}/icons/nightwalker/${id}.png`

/** Night Walker "Fragment Limited" order (HEXA Common Core, Oct 2026 chart). Format: [nodeId, level] */
const NW_ORDER: [string, number][] = [
  ['o1',1],['m2',1],['m4',1],['m1',2],['c2',1],['m1',4],['c3',1],['m1',5],['stat1',20],['m3',2],['m1',6],['m3',3],['m1',7],['m3',4],['m1',9],['m3',6],['b4',1],['a1',1],['m3',7],['m4',2],['m3',8],['m2',2],['b3',1],['b1',1],
  ['m3',9],['m4',3],['m2',3],['m4',4],['m1',15],['m2',4],['c3',2],['m4',5],['m1',17],['m2',5],['m4',6],['m1',18],['a1',2],['o1',2],['m2',6],['stat2',20],['c3',3],['c2',2],['m4',7],['m1',19],['m4',8],['m2',7],['m3',14],['a1',3],
  ['o1',3],['m3',15],['c2',3],['c3',4],['m2',8],['m4',9],['m3',16],['a1',4],['o1',4],['m2',9],['c2',4],['c3',5],['m3',17],['m1',26],['m3',18],['a1',5],['o1',5],['m1',27],['c3',6],['c2',5],['m3',19],['stat3',20],['m1',29],['a1',6],
  ['o1',6],['b4',2],['c3',7],['c2',6],['a1',7],['o1',7],['c2',7],['c3',8],['b3',7],['b4',3],['a1',8],['o1',8],['c2',8],['c3',9],['m3',25],['a1',9],['m3',26],['o1',9],['m4',14],['b1',2],['b4',4],['c2',9],['m4',15],['m3',27],
  ['m2',14],['b4',10],['m3',29],['m4',16],['m2',15],['b1',3],['m4',17],['m2',16],['b2',6],['m4',18],['m2',17],['b1',4],['m4',19],['b2',7],['m2',18],['b1',10],['b2',8],['m2',19],['m1',30],['b2',9],['b3',19],['o1',13],['c3',14],['a1',14],
  ['o1',14],['c3',16],['a1',15],['o1',15],['m4',25],['c2',15],['m4',26],['c3',17],['a1',16],['o1',16],['m4',27],['b4',11],['m2',26],['c3',18],['a1',17],['m4',29],['o1',17],['m2',27],['c2',16],['c3',19],['b4',12],['a1',18],['m3',30],['o1',18],
  ['m2',29],['c2',17],['a1',19],['b4',20],['o1',21],['c2',18],['b1',11],['b3',30],['o1',22],['c2',19],['b2',14],['c2',30],['o1',30],['b2',15],['b4',30],['b2',16],['b1',12],['a1',25],['c3',26],['b2',17],['b1',20],['a1',26],['c3',27],['a1',27],
  ['b2',18],['c3',29],['b2',19],['a1',29],['b1',30],['m4',30],['m2',30],['b2',28],['a1',30],['b2',29],['c3',30],['b2',30],
]


const STR_WARRIOR: FlameWeights = { mainStat: 'str', secondaryStat: 'dex', secondaryWeight: 1 / 12, attWeight: 3, allStatWeight: 10, useMatt: false }
const LUK_THIEF: FlameWeights = { mainStat: 'luk', secondaryStat: 'dex', secondaryWeight: 1 / 12, attWeight: 3, allStatWeight: 10, useMatt: false }

const COMMON_NODES = (thirdName: string): HexaNodeDef[] => [
  { id: 'c1', name: 'Sol Janus', type: 'common' },
  { id: 'c2', name: 'Sol Hecate', type: 'common' },
  { id: 'c3', name: thirdName, type: 'commonBoost' },
]

export const CLASSES: ClassDef[] = [
  {
    id: 'hero', name: 'Hero', jobMatch: ['Hero'], flameWeights: STR_WARRIOR,
    nodes: [
      { id: 'o1', name: 'Spirit Calibur', type: 'origin' },
      { id: 'a1', name: 'Ultrasonic Slash', type: 'ascent' },
      { id: 'm1', name: 'HEXA Raging Blow', type: 'mastery' },
      { id: 'm2', name: 'HEXA Rising Rage', type: 'mastery' },
      { id: 'm3', name: 'Rending Edge / HEXA Beam Blade', type: 'mastery' },
      { id: 'm4', name: 'HEXA Cry Valhalla / Puncture / Final Attack', type: 'mastery' },
      { id: 'b1', name: 'Instinctual Combo Boost', type: 'boost' },
      { id: 'b2', name: 'Burning Soul Blade Boost', type: 'boost' },
      { id: 'b3', name: 'Sword Illusion Boost', type: 'boost' },
      { id: 'b4', name: 'Worldreaver Boost', type: 'boost' },
      ...COMMON_NODES('HEXA Blitz Shield / Blitz Burst'),
      ...STAT_NODES,
    ],
  },
  {
    id: 'ren', name: 'Ren', jobMatch: ['Ren'], flameWeights: STR_WARRIOR,
    nodes: [
      { id: 'o1', name: 'Rising Azure Dragon: Divided Heavens', type: 'origin' },
      { id: 'a1', name: 'Ascent skill', type: 'ascent', note: 'rename to the GMS name once released' },
      { id: 'm1', name: 'HEXA Plum Blossom Sword: Storm', type: 'mastery' },
      { id: 'm2', name: 'HEXA Imugi Spirit Sword: Spirit Strike / Serpent\'s Fang', type: 'mastery' },
      { id: 'm3', name: 'HEXA Wish Unending / Final Imugi Spirit Sword', type: 'mastery' },
      { id: 'm4', name: 'HEXA Raining Blossoms / Riotous Heart', type: 'mastery' },
      { id: 'b1', name: 'Thousand Blossom Flurry Boost', type: 'boost' },
      { id: 'b2', name: 'Soul Immeasurable Boost', type: 'boost' },
      { id: 'b3', name: 'Dancing Annihilation Boost', type: 'boost' },
      { id: 'b4', name: 'Blade of the Unbound Heart Boost', type: 'boost' },
      ...COMMON_NODES('HEXA Common Boost'),
      ...STAT_NODES,
    ],
  },
  {
    id: 'nightwalker', name: 'Night Walker', jobMatch: ['Night Walker'], flameWeights: LUK_THIEF,
    nodes: [
      { id: 'o1', name: 'Silence', type: 'origin', icon: nwIcon('o1') },
      { id: 'a1', name: 'Stygian Command', type: 'ascent', icon: nwIcon('a1') },
      { id: 'm1', name: 'HEXA Quintuple Star', type: 'mastery', icon: nwIcon('m1') },
      { id: 'm2', name: 'HEXA Shadow Bat / Ravenous Bat', type: 'mastery', icon: nwIcon('m2') },
      { id: 'm3', name: 'HEXA Dark Omen', type: 'mastery', icon: nwIcon('m3') },
      { id: 'm4', name: 'HEXA Dominion / Abyssal Darkness', type: 'mastery', icon: nwIcon('m4') },
      { id: 'b1', name: 'Shadow Spear', type: 'boost', icon: nwIcon('b1') },
      { id: 'b2', name: 'Greater Dark Servant / Shadow Slide', type: 'boost', icon: nwIcon('b2') },
      { id: 'b3', name: 'Shadow Bite', type: 'boost', icon: nwIcon('b3') },
      { id: 'b4', name: 'Rapid Throw', type: 'boost', icon: nwIcon('b4') },
      { id: 'c1', name: 'Sol Janus', type: 'common' },
      { id: 'c2', name: 'Sol Hecate', type: 'common', icon: nwIcon('c2') },
      { id: 'c3', name: 'HEXA Phalanx Charge', type: 'commonBoost', icon: nwIcon('c3') },
      ...STAT_NODES,
    ],
    order: NW_ORDER.map(([nodeId, level]) => ({ nodeId, level })),
    orderSource: 'Fragment Limited chart (HEXA Common Core, Oct 2026)',
  },
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

export function classForJob(job: string): ClassDef | undefined {
  const j = job.toLowerCase()
  return CLASSES.find(c => c.jobMatch.some(m => j.includes(m.toLowerCase())))
}
