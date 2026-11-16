/**
 * Shared skill bank – lives in the worker's KV ("bank:<classKey>"), cached in IndexedDB (db.banks) so icons
 * keep working offline. Reading is open; writing needs the ADMIN_KEY (Admin page).
 */
import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, BUILD_PROXY_URL } from '../db'
import { getAdminKey } from './library'
import { COMMON_BANK, type BankMeta, type SkillBank } from '../data/skillBank'

const base = () => {
  if (!BUILD_PROXY_URL) throw new Error('The shared skill bank is not configured in this build.')
  return BUILD_PROXY_URL.replace(/\/$/, '')
}

export async function listBanks(): Promise<BankMeta[]> {
  const res = await fetch(`${base()}/bank`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Skill bank unavailable (${res.status})`)
  return (await res.json()).banks ?? []
}

/** network fetch; null when the class has no bank yet */
export async function fetchBank(classKey: string): Promise<SkillBank | null> {
  const res = await fetch(`${base()}/bank/${encodeURIComponent(classKey)}`, { cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Skill bank unavailable (${res.status})`)
  return await res.json()
}

const refreshed = new Map<string, Promise<SkillBank | null>>()
/** fetch once per session and cache; falls back to the cached copy when offline */
export function refreshBank(classKey: string, force = false): Promise<SkillBank | null> {
  if (!classKey || !BUILD_PROXY_URL) return db.banks.get(classKey || '_').then(b => b ?? null)
  if (!force && refreshed.has(classKey)) return refreshed.get(classKey)!
  const p = fetchBank(classKey)
    .then(async b => { if (b) await db.banks.put(b); else await db.banks.delete(classKey); return b })
    .catch(async () => (await db.banks.get(classKey)) ?? null)
  refreshed.set(classKey, p)
  return p
}

/** banks for one class + the common bank (Sol Janus/Hecate/HEXA Stat), from the local cache, refreshed in the background */
export function useBanks(classKey: string | undefined): { cls: SkillBank | null; common: SkillBank | null; loaded: boolean } {
  useEffect(() => { if (classKey) refreshBank(classKey); refreshBank(COMMON_BANK) }, [classKey])
  const r = useLiveQuery(async () => ({ cls: classKey ? (await db.banks.get(classKey)) ?? null : null, common: (await db.banks.get(COMMON_BANK)) ?? null }), [classKey])
  return { cls: r?.cls ?? null, common: r?.common ?? null, loaded: !!r }
}

/** both banks, awaiting the network (used by the chart importer) */
export async function loadBanks(classKey: string | undefined): Promise<{ cls: SkillBank | null; common: SkillBank | null }> {
  const [cls, common] = await Promise.all([classKey ? refreshBank(classKey) : Promise.resolve(null), refreshBank(COMMON_BANK)])
  return { cls, common }
}

// ---- admin ----------------------------------------------------------------------------------
export async function adminSaveBank(bank: SkillBank): Promise<SkillBank> {
  const res = await fetch(`${base()}/bank/${encodeURIComponent(bank.classKey)}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-key': getAdminKey() }, body: JSON.stringify(bank) })
  if (!res.ok) throw new Error(`Save failed (${res.status}): ${await res.text()}`)
  const r = await res.json()
  const saved = { ...bank, updatedAt: r.updatedAt ?? Date.now() }
  await db.banks.put(saved); refreshed.set(bank.classKey, Promise.resolve(saved))
  return saved
}

export async function adminDeleteBank(classKey: string): Promise<void> {
  const res = await fetch(`${base()}/bank/${encodeURIComponent(classKey)}`, { method: 'DELETE', headers: { 'x-admin-key': getAdminKey() } })
  if (!res.ok) throw new Error(`Delete failed (${res.status}): ${await res.text()}`)
  await db.banks.delete(classKey); refreshed.delete(classKey)
}
