export type SlotKey =
  | 'ring1' | 'ring2' | 'ring3' | 'ring4' | 'belt' | 'pocket'
  | 'face' | 'eye' | 'earrings' | 'pendant1' | 'pendant2'
  | 'weapon' | 'secondary' | 'emblem'
  | 'hat' | 'top' | 'bottom' | 'shoulder' | 'android' | 'title'
  | 'cape' | 'gloves' | 'shoes' | 'medal' | 'heart' | 'badge'

export type PotentialRank = 'none' | 'rare' | 'epic' | 'unique' | 'legendary'

export interface Flame {
  str: number; dex: number; int: number; luk: number
  att: number; matt: number
  allStat: number      // %
  bossDmg: number      // %
  dmg: number          // %
  hp: number; mp: number
  def: number; speed: number; jump: number
  level: number        // req level reduction
}

export interface ItemInstance {
  itemId: number | null      // maplestory.io id (null = manual)
  name: string
  reqLevel: number
  iconUrl: string            // resolved icon url (or custom)
  starForce: number
  starForceGoal: number
  maxStarsOverride?: number   // set when the automatic cap (by level/name) is wrong for this item
  potential: { rank: PotentialRank; lines: [string, string, string] }
  flame: Flame
  flameScoreGoal: number
  flameAdvantaged: boolean   // most boss gear is; e.g. Superior Gollux / Sweetwater / Meister are not
  /** per-item overrides for slots whose upgrades depend on the item/class (badge, secondary) */
  enabled?: { stars?: boolean; potential?: boolean; flames?: boolean }
  soul: { name: string; option: string }
  notes: string
}

export interface Preset {
  id: string
  name: string
  slots: Partial<Record<SlotKey, ItemInstance>>
}

export interface FlameWeights {
  mainStat: 'str' | 'dex' | 'int' | 'luk'
  secondaryStat: 'str' | 'dex' | 'int' | 'luk' | 'none'
  secondaryWeight: number
  attWeight: number        // per ATT/MATT point
  allStatWeight: number    // per 1% all stat
  useMatt: boolean
}

export type Region = 'na' | 'eu'

export interface Character {
  id: string
  name: string
  world: string
  region: Region                  // rankings region used for fetch / re-sync
  heroic: boolean                 // Heroic (Reboot) vs regular worlds
  job: string
  level: number
  imageUrl: string
  classId: string | null          // hexa class data key ('hero' built-in, 'tpl:<id>' template)
  classKey?: string               // GMS class (src/data/gmsClasses.ts), used to filter shared templates
  presets: Preset[]
  activePresetId: string
  flameWeights: FlameWeights
  createdAt: number
  updatedAt: number
}

export type HexaNodeType = 'origin' | 'ascent' | 'skill3' | 'mastery' | 'boost' | 'common' | 'commonBoost' | 'stat'

/** display groups (what the in-game HEXA window shows) */
export type HexaGroup = 'skill' | 'mastery' | 'boost' | 'common' | 'stat'

export interface HexaNodeDef {
  id: string
  name: string
  type: HexaNodeType
  icon?: string            // URL or data URL
  note?: string
  /** stat nodes only */
  unlockFrags?: number
  unlockErda?: number
}

export interface HexaOrderStep { nodeId: string; level: number }

export interface HexaCheckpoint {
  id: string
  nodeId: string
  targetLevel: number
}

export interface HexaProfile {
  characterId: string
  nodes: HexaNodeDef[]                       // copied from class data, editable
  levels: Record<string, number>             // nodeId -> current level
  path: HexaCheckpoint[]                     // manual checkpoints (used when autoPath is off)
  order: HexaOrderStep[]                     // full leveling order (e.g. transcribed from a chart)
  autoPath: boolean                          // derive checkpoints from order + current levels
  fragmentsOwned: number
  fragsPerDay: number
  pathImage: string | null                   // data URL
  updatedAt: number
}

/** A user-made class template (from a chart import), stored alongside the built-in classes */
export interface ClassTemplate {
  id: string
  name: string            // the save's name, e.g. "Fragment-limited order (Nov 2026)"
  classKey?: string       // GMS class key (src/data/gmsClasses.ts); required for shared templates
  nodes: HexaNodeDef[]
  order: HexaOrderStep[]
  source: string
  createdAt: number
  updatedAt?: number
}

export interface Settings {
  id: 'settings'
  msioVersion: string          // maplestory.io GMS version, e.g. "262"
  proxyUrl: string             // worker base URL – internal (build-time VITE_PROXY_URL), not shown in the UI
  publishKey: string           // optional key for publishing to the shared library
}
