/**
 * All GMS classes, used to categorise shared HEXA templates. `match` holds extra substrings
 * the rankings API / users may use for the same job (e.g. "Arch Mage (F/P)").
 */
export interface GmsClass { key: string; name: string; group: string; match?: string[] }

export const GMS_CLASSES: GmsClass[] = [
  { key: 'hero', name: 'Hero', group: 'Explorer' },
  { key: 'paladin', name: 'Paladin', group: 'Explorer' },
  { key: 'dark-knight', name: 'Dark Knight', group: 'Explorer' },
  { key: 'fp-mage', name: 'Arch Mage (Fire, Poison)', group: 'Explorer', match: ['Fire, Poison', 'F/P', 'Fire/Poison'] },
  { key: 'il-mage', name: 'Arch Mage (Ice, Lightning)', group: 'Explorer', match: ['Ice, Lightning', 'I/L', 'Ice/Lightning'] },
  { key: 'bishop', name: 'Bishop', group: 'Explorer' },
  { key: 'bowmaster', name: 'Bowmaster', group: 'Explorer' },
  { key: 'marksman', name: 'Marksman', group: 'Explorer' },
  { key: 'pathfinder', name: 'Pathfinder', group: 'Explorer' },
  { key: 'night-lord', name: 'Night Lord', group: 'Explorer' },
  { key: 'shadower', name: 'Shadower', group: 'Explorer' },
  { key: 'dual-blade', name: 'Dual Blade', group: 'Explorer', match: ['Blade Master'] },
  { key: 'buccaneer', name: 'Buccaneer', group: 'Explorer' },
  { key: 'corsair', name: 'Corsair', group: 'Explorer' },
  { key: 'cannoneer', name: 'Cannoneer', group: 'Explorer', match: ['Cannon Master'] },
  { key: 'dawn-warrior', name: 'Dawn Warrior', group: 'Cygnus Knights' },
  { key: 'blaze-wizard', name: 'Blaze Wizard', group: 'Cygnus Knights' },
  { key: 'wind-archer', name: 'Wind Archer', group: 'Cygnus Knights' },
  { key: 'night-walker', name: 'Night Walker', group: 'Cygnus Knights' },
  { key: 'thunder-breaker', name: 'Thunder Breaker', group: 'Cygnus Knights' },
  { key: 'mihile', name: 'Mihile', group: 'Cygnus Knights' },
  { key: 'aran', name: 'Aran', group: 'Heroes' },
  { key: 'evan', name: 'Evan', group: 'Heroes' },
  { key: 'mercedes', name: 'Mercedes', group: 'Heroes' },
  { key: 'phantom', name: 'Phantom', group: 'Heroes' },
  { key: 'luminous', name: 'Luminous', group: 'Heroes' },
  { key: 'shade', name: 'Shade', group: 'Heroes' },
  { key: 'blaster', name: 'Blaster', group: 'Resistance' },
  { key: 'battle-mage', name: 'Battle Mage', group: 'Resistance' },
  { key: 'wild-hunter', name: 'Wild Hunter', group: 'Resistance' },
  { key: 'mechanic', name: 'Mechanic', group: 'Resistance' },
  { key: 'xenon', name: 'Xenon', group: 'Resistance' },
  { key: 'demon-slayer', name: 'Demon Slayer', group: 'Resistance' },
  { key: 'demon-avenger', name: 'Demon Avenger', group: 'Resistance' },
  { key: 'kaiser', name: 'Kaiser', group: 'Nova' },
  { key: 'kain', name: 'Kain', group: 'Nova' },
  { key: 'cadena', name: 'Cadena', group: 'Nova' },
  { key: 'angelic-buster', name: 'Angelic Buster', group: 'Nova' },
  { key: 'adele', name: 'Adele', group: 'Flora' },
  { key: 'illium', name: 'Illium', group: 'Flora' },
  { key: 'khali', name: 'Khali', group: 'Flora' },
  { key: 'ark', name: 'Ark', group: 'Flora' },
  { key: 'hoyoung', name: 'Hoyoung', group: 'Anima' },
  { key: 'lara', name: 'Lara', group: 'Anima' },
  { key: 'ren', name: 'Ren', group: 'Other' },
  { key: 'hayato', name: 'Hayato', group: 'Sengoku' },
  { key: 'kanna', name: 'Kanna', group: 'Sengoku' },
  { key: 'zero', name: 'Zero', group: 'Other' },
  { key: 'kinesis', name: 'Kinesis', group: 'Other' },
  { key: 'lynn', name: 'Lynn', group: 'Other', match: ['Beast Tamer'] },
  { key: 'mo-xuan', name: 'Mo Xuan', group: 'Other' },
  { key: 'sia-astelle', name: 'Sia Astelle', group: 'Other' },
]

export const CLASS_BY_KEY: Record<string, GmsClass> = Object.fromEntries(GMS_CLASSES.map(c => [c.key, c]))
export const CLASS_GROUPS = [...new Set(GMS_CLASSES.map(c => c.group))]

/** best class for a job string from the rankings API or typed by the user ("" when unknown) */
export function classKeyForJob(job: string | undefined | null): string {
  const j = (job ?? '').toLowerCase().trim()
  if (!j) return ''
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
