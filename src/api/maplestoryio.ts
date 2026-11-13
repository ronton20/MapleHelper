/**
 * maplestory.io – game asset API (icons + item search).
 * Docs pattern: /api/{region}/{version}/item?...  and /item/{id}/icon
 */
const BASE = 'https://maplestory.io/api'

export interface MsioItem {
  id: number
  name: string
  requiredLevel?: number
  isCash?: boolean
  typeInfo?: { overallCategory: string; category: string; subCategory: string }
}

export function iconUrl(version: string, itemId: number) {
  return `${BASE}/GMS/${version}/item/${itemId}/icon`
}
export function iconRawUrl(version: string, itemId: number) {
  return `${BASE}/GMS/${version}/item/${itemId}/iconRaw`
}

const cache = new Map<string, MsioItem[]>()

/** Search equips by name within a set of sub-categories. Falls back to a plain name search if the filter yields nothing. */
export async function searchItems(version: string, query: string, subCategories: string[], signal?: AbortSignal): Promise<MsioItem[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const key = `${version}|${q.toLowerCase()}|${subCategories.join(',')}`
  const hit = cache.get(key)
  if (hit) return hit

  // NOTE: the server-side filter params (overallCategoryFilter, subCategoryFilter, cashFilter, count)
  // return HTTP 500 on current versions, so we only send searchFor and filter client-side.
  const res = await fetch(`${BASE}/GMS/${version}/item?searchFor=${encodeURIComponent(q)}`, { signal })
  if (!res.ok) throw new Error(`maplestory.io ${res.status} (try another GMS version in Settings)`)
  const arr = (await res.json()) as MsioItem[]
  const subs = new Set(subCategories.map(c => c.toLowerCase()))
  const equips = arr.filter(it => it.typeInfo?.overallCategory === 'Equip' && !it.isCash)
  let results = equips.filter(it => subs.size === 0 || subs.has((it.typeInfo?.subCategory ?? '').toLowerCase()) || subs.has((it.typeInfo?.category ?? '').toLowerCase()))
  if (!results.length) results = equips   // unknown category naming → show everything rather than nothing
  // sort: exact-ish matches first, then by level desc
  const ql = q.toLowerCase()
  results.sort((a, b) => {
    const ai = a.name.toLowerCase().indexOf(ql), bi = b.name.toLowerCase().indexOf(ql)
    if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    return (b.requiredLevel ?? 0) - (a.requiredLevel ?? 0)
  })
  cache.set(key, results)
  return results
}
