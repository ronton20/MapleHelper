/**
 * GMS character lookup via the nexon.com rankings JSON (the data behind maplestory.nexon.net/rankings).
 * This endpoint is unofficial and blocks browser CORS, so requests go through a tiny proxy
 * (see worker/proxy.js). Set the proxy base URL in Settings.
 */
export interface LookupResult {
  name: string
  world: string
  job: string
  level: number
  imageUrl: string
  raw: unknown
}

export type Region = 'na' | 'eu'
const NEXON = 'https://www.nexon.com/api/maplestory/no-auth/ranking/v2'

/** worldID → name (GMS). Unknown ids fall back to "World N" — tell me the id and I'll add it. */
const WORLD_NAMES: Record<number, string> = {
  0: 'Scania', 1: 'Bera', 17: 'Aurora', 30: 'Luna', 45: 'Kronos', 46: 'Solis', 70: 'Hyperion',
}

export async function lookupCharacter(name: string, proxyUrl: string, heroic = true, region: Region = 'na'): Promise<LookupResult> {
  if (!proxyUrl) throw new Error('No proxy URL configured (Settings → Nexon proxy).')
  const params = new URLSearchParams({
    type: 'overall', id: 'weekly', reboot_index: heroic ? '1' : '0', page_index: '1', character_name: name.trim(),
  })
  const target = `${NEXON}/${region}?${params}`
  const url = `${proxyUrl.replace(/\/$/, '')}/?url=${encodeURIComponent(target)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`)
  const data = await res.json()
  const ranks: Record<string, unknown>[] = data?.ranks ?? data?.Ranks ?? []
  const r = ranks.find(x => String(x.characterName ?? x.CharacterName ?? '').toLowerCase() === name.trim().toLowerCase()) ?? ranks[0]
  if (!r) throw new Error('Character not found in rankings (name/server mismatch, or under level 200?).')
  const pick = (...keys: string[]) => { for (const k of keys) { const v = r[k]; if (v !== undefined && v !== null && v !== '') return String(v) } return '' }
  const worldId = Number(r.worldID ?? r.worldId ?? NaN)
  return {
    name: pick('characterName', 'CharacterName'),
    world: pick('worldName', 'WorldName') || WORLD_NAMES[worldId] || (isNaN(worldId) ? '' : `World ${worldId}`),
    job: pick('jobName', 'JobName', 'jobDetail', 'JobDetail'),
    level: Number(r.level ?? r.Level ?? 0),
    imageUrl: pick('characterImgURL', 'characterImgUrl', 'CharacterImgUrl', 'characterImageUrl'),
    raw: r,
  }
}
