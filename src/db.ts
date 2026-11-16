import Dexie, { type EntityTable } from 'dexie'
import { nanoid } from 'nanoid'
import type { SkillBank } from './data/skillBank'
import type { Character, HexaProfile, Settings, Preset, ItemInstance, Flame, FlameWeights, HexaNodeDef, HexaOrderStep, ClassTemplate, Region } from './types'
import { GENERIC_NODES, weightsForClass } from './data/classes'

export const db = new Dexie('maple-helper') as Dexie & {
  characters: EntityTable<Character, 'id'>
  hexa: EntityTable<HexaProfile, 'characterId'>
  settings: EntityTable<Settings, 'id'>
  templates: EntityTable<ClassTemplate, 'id'>
  /** local cache of the shared skill bank (one row per class + 'common') */
  banks: EntityTable<SkillBank, 'classKey'>
}

db.version(1).stores({
  characters: 'id, name, updatedAt',
  hexa: 'characterId',
  settings: 'id',
})
db.version(2).stores({
  characters: 'id, name, updatedAt',
  hexa: 'characterId',
  settings: 'id',
  templates: 'id, name',
})
// v3: the app no longer ships built-in HEXA data (Hero / Ren / Night Walker). Characters that used it
// get a template saved on the device, made from their own current nodes and order, so nothing is lost.
const FORMER_BUILTINS: Record<string, { name: string; classKey: string }> = {
  hero: { name: 'Hero', classKey: 'hero' }, ren: { name: 'Ren', classKey: 'ren' }, nightwalker: { name: 'Night Walker', classKey: 'night-walker' },
}
db.version(3).stores({
  characters: 'id, name, updatedAt',
  hexa: 'characterId',
  settings: 'id',
  templates: 'id, name',
}).upgrade(async tx => {
  const chars = await tx.table('characters').toArray() as Character[]
  for (const c of chars) {
    const b = c.classId ? FORMER_BUILTINS[c.classId] : undefined
    if (!b) continue
    const prof = await tx.table('hexa').get(c.id) as HexaProfile | undefined
    const tplId = `former-${c.classId}-${c.id}`
    await tx.table('templates').put({ id: tplId, name: `${b.name} (former built-in)`, classKey: b.classKey, nodes: prof?.nodes ?? GENERIC_NODES, order: prof?.order ?? [], source: 'former built-in data', createdAt: Date.now() } satisfies ClassTemplate)
    await tx.table('characters').update(c.id, { classId: `tpl:${tplId}`, classKey: c.classKey || b.classKey })
  }
})
// v5: local cache of the shared skill bank
db.version(5).stores({
  characters: 'id, name, updatedAt',
  hexa: 'characterId',
  settings: 'id',
  templates: 'id, name',
  banks: 'classKey',
})

/** built-in class or stored template, by id ('tpl:<id>' for templates) */
// v4: Xenon (STR+DEX+LUK) and Demon Avenger (HP) get their own flame-score modes
db.version(4).stores({
  characters: 'id, name, updatedAt',
  hexa: 'characterId',
  settings: 'id',
  templates: 'id, name',
}).upgrade(async tx => {
  await tx.table('characters').toCollection().modify((c: Character) => {
    if (c.classKey === 'xenon' || c.classKey === 'demon-avenger') c.flameWeights = weightsForClass(c.classKey)
  })
})

export async function resolveClass(classId: string | null): Promise<{ id: string; name: string; nodes: HexaNodeDef[]; order?: HexaOrderStep[]; orderSource?: string; flameWeights?: FlameWeights } | undefined> {
  if (!classId) return undefined
  if (classId.startsWith('tpl:')) {
    const t = await db.templates.get(classId.slice(4))
    return t ? { id: classId, name: t.name, nodes: t.nodes, order: t.order, orderSource: t.source } : undefined
  }
  return undefined
}

/** build-time default for the worker URL (VITE_PROXY_URL in .env or CI env) – the Settings field overrides it */
export const BUILD_PROXY_URL: string = (import.meta.env.VITE_PROXY_URL as string | undefined)?.trim() ?? ''
export const DEFAULT_SETTINGS: Settings = { id: 'settings', msioVersion: '270', proxyUrl: BUILD_PROXY_URL, publishKey: '' }

export async function getSettings(): Promise<Settings> {
  const s = { ...DEFAULT_SETTINGS, ...(await db.settings.get('settings')) }
  if (s.msioVersion === '262') s.msioVersion = '270'   // 262 never existed on maplestory.io
  s.proxyUrl = BUILD_PROXY_URL                          // internal: always the build-time worker URL
  return s
}

export function emptyFlame(): Flame {
  return { str: 0, dex: 0, int: 0, luk: 0, att: 0, matt: 0, allStat: 0, bossDmg: 0, dmg: 0, hp: 0, mp: 0, def: 0, speed: 0, jump: 0, level: 0 }
}

export function newItem(partial: Partial<ItemInstance>): ItemInstance {
  return {
    itemId: null, name: 'Item', reqLevel: 0, iconUrl: '',
    starForce: 0, starForceGoal: 22,
    potential: { rank: 'none', lines: ['', '', ''] },
    flame: emptyFlame(), flameScoreGoal: 0, flameAdvantaged: true,
    soul: { name: '', option: '' },
    notes: '',
    ...partial,
  }
}

export function newPreset(name = 'Main'): Preset {
  return { id: nanoid(8), name, slots: {} }
}

export async function createCharacter(input: { name: string; world?: string; job?: string; level?: number; imageUrl?: string; classId?: string | null; classKey?: string; region?: Region; heroic?: boolean }): Promise<Character> {
  const preset = newPreset()
  const cls = await resolveClass(input.classId ?? null)
  const weights: FlameWeights = weightsForClass(input.classKey)
  const c: Character = {
    id: nanoid(10),
    name: input.name,
    world: input.world ?? '',
    region: input.region ?? 'eu',
    heroic: input.heroic ?? true,
    job: input.job ?? '',
    level: input.level ?? 0,
    imageUrl: input.imageUrl ?? '',
    classId: input.classId ?? null,
    classKey: input.classKey ?? '',
    presets: [preset],
    activePresetId: preset.id,
    flameWeights: weights,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.characters.add(c)
  await db.hexa.add(defaultHexaProfile(c.id, cls?.nodes ?? GENERIC_NODES, cls?.order ?? []))
  return c
}

export function defaultHexaProfile(characterId: string, nodes: HexaNodeDef[], order: HexaOrderStep[] = []): HexaProfile {
  const levels: Record<string, number> = {}
  for (const n of nodes) levels[n.id] = n.type === 'origin' ? 1 : 0
  return { characterId, nodes: nodes.map(n => ({ ...n })), levels, path: [], order: [...order], autoPath: order.length > 0, fragmentsOwned: 0, fragsPerDay: 87, pathImage: null, updatedAt: Date.now() }
}

/** fill in fields added after v1 for profiles stored by older versions */
export function migrateHexaProfile(p: HexaProfile): HexaProfile {
  return { ...p, order: p.order ?? [], autoPath: p.autoPath ?? false }
}

export async function updateCharacter(id: string, patch: Partial<Character> | ((c: Character) => Character)) {
  const c = await db.characters.get(id)
  if (!c) return
  const next = typeof patch === 'function' ? patch(c) : { ...c, ...patch }
  next.updatedAt = Date.now()
  await db.characters.put(next)
}

export async function deleteCharacter(id: string) {
  await db.transaction('rw', db.characters, db.hexa, async () => {
    await db.characters.delete(id)
    await db.hexa.delete(id)
  })
}

export async function exportAll(): Promise<string> {
  const data = {
    app: 'maple-helper', version: 1, exportedAt: new Date().toISOString(),
    characters: await db.characters.toArray(),
    hexa: await db.hexa.toArray(),
    settings: await db.settings.toArray(),
    templates: await db.templates.toArray(),
  }
  return JSON.stringify(data, null, 2)
}

/** merge a snapshot from another device: newer `updatedAt` wins per character / HEXA profile; templates union */
export async function mergeSnapshot(data: { characters?: Character[]; hexa?: HexaProfile[]; templates?: ClassTemplate[] }): Promise<{ changed: number }> {
  let changed = 0
  await db.transaction('rw', db.characters, db.hexa, db.templates, async () => {
    for (const c of data.characters ?? []) {
      const local = await db.characters.get(c.id)
      if (!local || (c.updatedAt ?? 0) > (local.updatedAt ?? 0)) { await db.characters.put(c); changed++ }
    }
    for (const h of data.hexa ?? []) {
      const local = await db.hexa.get(h.characterId)
      if (!local || (h.updatedAt ?? 0) > (local.updatedAt ?? 0)) { await db.hexa.put(h); changed++ }
    }
    for (const t of data.templates ?? []) { if (!(await db.templates.get(t.id))) { await db.templates.put(t); changed++ } }
  })
  return { changed }
}

/** everything that should travel between devices (settings stay local) */
export async function snapshot() {
  return { app: 'maple-helper', version: 1, exportedAt: new Date().toISOString(), characters: await db.characters.toArray(), hexa: await db.hexa.toArray(), templates: await db.templates.toArray() }
}

export async function importAll(json: string, mode: 'merge' | 'replace') {
  const data = JSON.parse(json)
  if (data.app !== 'maple-helper') throw new Error('Not a maple-helper export')
  await db.transaction('rw', db.characters, db.hexa, db.settings, db.templates, async () => {
    if (mode === 'replace') { await db.characters.clear(); await db.hexa.clear(); await db.templates.clear() }
    await db.characters.bulkPut(data.characters ?? [])
    await db.hexa.bulkPut(data.hexa ?? [])
    await db.templates.bulkPut(data.templates ?? [])
    if (data.settings?.length) await db.settings.bulkPut(data.settings)
  })
}
