/**
 * All GMS classes, following the official Classes & Jobs page
 * (nexon.com/maplestory/game/classes-and-jobs): name, class type and faction.
 * `key`s are stable ids stored on characters and shared templates; don't rename them.
 * `match` holds extra spellings the rankings API / users may use (e.g. "Arch Mage (F/P)").
 */
export type ClassType = 'Warrior' | 'Magician' | 'Bowman' | 'Thief' | 'Pirate' | 'Thief/Pirate'
export interface GmsClass { key: string; name: string; type: ClassType; group: string; match?: string[] }

export const GMS_CLASSES: GmsClass[] = [
  { key: 'erel-light', name: 'Erel Light', type: 'Warrior', group: 'Shine' },
  { key: 'hero', name: 'Hero', type: 'Warrior', group: 'Explorer' },
  { key: 'paladin', name: 'Paladin', type: 'Warrior', group: 'Explorer' },
  { key: 'dark-knight', name: 'Dark Knight', type: 'Warrior', group: 'Explorer' },
  { key: 'dawn-warrior', name: 'Dawn Warrior', type: 'Warrior', group: 'Cygnus Knight' },
  { key: 'mihile', name: 'Mihile', type: 'Warrior', group: 'Cygnus Knight' },
  { key: 'blaster', name: 'Blaster', type: 'Warrior', group: 'Resistance' },
  { key: 'demon-slayer', name: 'Demon Slayer', type: 'Warrior', group: 'Demon' },
  { key: 'demon-avenger', name: 'Demon Avenger', type: 'Warrior', group: 'Demon' },
  { key: 'aran', name: 'Aran', type: 'Warrior', group: 'Hero' },
  { key: 'kaiser', name: 'Kaiser', type: 'Warrior', group: 'Nova' },
  { key: 'adele', name: 'Adele', type: 'Warrior', group: 'Flora' },
  { key: 'ren', name: 'Ren', type: 'Warrior', group: 'Anima' },
  { key: 'zero', name: 'Zero', type: 'Warrior', group: 'Transcendent' },
  { key: 'hayato', name: 'Hayato', type: 'Warrior', group: 'Sengoku' },
  { key: 'lethe', name: 'Lethe', type: 'Magician', group: 'Demon' },
  { key: 'fp-mage', name: 'Arch Mage (Fire/Poison)', type: 'Magician', group: 'Explorer', match: ["Fire, Poison", "F/P", "Fire/Poison"] },
  { key: 'il-mage', name: 'Arch Mage (Ice/Lightning)', type: 'Magician', group: 'Explorer', match: ["Ice, Lightning", "I/L", "Ice/Lightning"] },
  { key: 'bishop', name: 'Bishop', type: 'Magician', group: 'Explorer' },
  { key: 'blaze-wizard', name: 'Blaze Wizard', type: 'Magician', group: 'Cygnus Knight' },
  { key: 'battle-mage', name: 'Battle Mage', type: 'Magician', group: 'Resistance' },
  { key: 'evan', name: 'Evan', type: 'Magician', group: 'Hero' },
  { key: 'luminous', name: 'Luminous', type: 'Magician', group: 'Hero' },
  { key: 'illium', name: 'Illium', type: 'Magician', group: 'Flora' },
  { key: 'lara', name: 'Lara', type: 'Magician', group: 'Anima' },
  { key: 'kinesis', name: 'Kinesis', type: 'Magician', group: 'Friends World' },
  { key: 'kanna', name: 'Kanna', type: 'Magician', group: 'Sengoku' },
  { key: 'lynn', name: 'Lynn', type: 'Magician', group: 'Jianghu', match: ["Beast Tamer"] },
  { key: 'sia-astelle', name: 'Sia Astelle', type: 'Magician', group: 'Shine' },
  { key: 'bowmaster', name: 'Bow Master', type: 'Bowman', group: 'Explorer', match: ["Bowmaster"] },
  { key: 'marksman', name: 'Marksman', type: 'Bowman', group: 'Explorer' },
  { key: 'pathfinder', name: 'Pathfinder', type: 'Bowman', group: 'Explorer' },
  { key: 'wind-archer', name: 'Wind Archer', type: 'Bowman', group: 'Cygnus Knight' },
  { key: 'wild-hunter', name: 'Wild Hunter', type: 'Bowman', group: 'Resistance' },
  { key: 'mercedes', name: 'Mercedes', type: 'Bowman', group: 'Hero' },
  { key: 'kain', name: 'Kain', type: 'Bowman', group: 'Nova' },
  { key: 'night-lord', name: 'Night Lord', type: 'Thief', group: 'Explorer' },
  { key: 'shadower', name: 'Shadower', type: 'Thief', group: 'Explorer' },
  { key: 'dual-blade', name: 'Dual Blade', type: 'Thief', group: 'Explorer', match: ["Blade Master"] },
  { key: 'night-walker', name: 'Night Walker', type: 'Thief', group: 'Cygnus Knight' },
  { key: 'xenon', name: 'Xenon', type: 'Thief/Pirate', group: 'Resistance' },
  { key: 'phantom', name: 'Phantom', type: 'Thief', group: 'Hero' },
  { key: 'cadena', name: 'Cadena', type: 'Thief', group: 'Nova' },
  { key: 'khali', name: 'Khali', type: 'Thief', group: 'Flora' },
  { key: 'hoyoung', name: 'Hoyoung', type: 'Thief', group: 'Anima' },
  { key: 'buccaneer', name: 'Buccaneer', type: 'Pirate', group: 'Explorer' },
  { key: 'corsair', name: 'Corsair', type: 'Pirate', group: 'Explorer' },
  { key: 'cannoneer', name: 'Cannoneer', type: 'Pirate', group: 'Explorer', match: ["Cannon Master"] },
  { key: 'thunder-breaker', name: 'Thunder Breaker', type: 'Pirate', group: 'Cygnus Knight' },
  { key: 'mechanic', name: 'Mechanic', type: 'Pirate', group: 'Resistance' },
  { key: 'shade', name: 'Shade', type: 'Pirate', group: 'Hero' },
  { key: 'angelic-buster', name: 'Angelic Buster', type: 'Pirate', group: 'Nova' },
  { key: 'ark', name: 'Ark', type: 'Pirate', group: 'Flora' },
  { key: 'mo-xuan', name: 'Mo Xuan', type: 'Pirate', group: 'Jianghu' },
]

/** factions in the order the dropdowns show them */
export const CLASS_GROUPS = ['Explorer', 'Cygnus Knight', 'Hero', 'Resistance', 'Demon', 'Nova', 'Flora', 'Anima', 'Sengoku', 'Jianghu', 'Shine', 'Transcendent', 'Friends World']
export const CLASS_BY_KEY: Record<string, GmsClass> = Object.fromEntries(GMS_CLASSES.map(c => [c.key, c]))
const TYPE_ORDER: ClassType[] = ['Warrior', 'Magician', 'Bowman', 'Thief', 'Thief/Pirate', 'Pirate']
/** classes of one faction, warriors first (same order as the official page) */
export function classesInGroup(group: string): GmsClass[] {
  return GMS_CLASSES.filter(c => c.group === group).sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
}

/** best class for a job string from the rankings API or typed by the user ("" when unknown) */
export function classKeyForJob(job: string | undefined | null): string {
  const j = (job ?? '').toLowerCase().trim()
  if (!j) return ''
  if (CLASS_BY_KEY[j]) return j
  // longest name first so "Night Walker" wins over shorter partials
  const sorted = [...GMS_CLASSES].sort((a, b) => b.name.length - a.name.length)
  for (const c of sorted) {
    if (j === c.name.toLowerCase() || j.includes(c.name.toLowerCase())) return c.key
    if (c.match?.some(m => j.includes(m.toLowerCase()))) return c.key
  }
  return ''
}

/** built-in seeded class ids → GMS class keys */
export const BUILTIN_TO_KEY: Record<string, string> = { hero: 'hero', ren: 'ren', nightwalker: 'night-walker' }
