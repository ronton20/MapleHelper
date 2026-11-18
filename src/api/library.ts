/**
 * Shared template library – lives in the same Cloudflare Worker as the rankings proxy (worker/proxy.js),
 * backed by a KV namespace. Templates are categorised by GMS class (classKey).
 * Anyone can list/download; publishing is open (optionally gated by PUBLISH_KEY);
 * editing/deleting needs the ADMIN_KEY secret (Admin page).
 */
import type { ClassTemplate } from '../types'
import { BUILD_PROXY_URL } from '../db'

export interface LibraryEntry { id: string; name: string; classKey: string; nodes: number; steps: number; source: string; updatedAt: number }

const base = () => {
  if (!BUILD_PROXY_URL) throw new Error('The shared library is not configured in this build.')
  return BUILD_PROXY_URL.replace(/\/$/, '')
}

export async function listTemplates(classKey?: string): Promise<LibraryEntry[]> {
  const res = await fetch(`${base()}/templates${classKey ? `?class=${encodeURIComponent(classKey)}` : ''}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Library unavailable (${res.status})`)
  return (await res.json()).templates ?? []
}

export async function fetchTemplate(id: string): Promise<ClassTemplate> {
  const res = await fetch(`${base()}/templates/${encodeURIComponent(id)}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Template not found (${res.status})`)
  return await res.json()
}

export async function publishTemplate(tpl: ClassTemplate, key = ''): Promise<void> {
  const res = await fetch(`${base()}/templates`, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-publish-key': key } : {}) }, body: JSON.stringify(tpl) })
  if (res.ok) return
  const text = await res.text()
  let body: { error?: string; duplicate?: { id: string; name: string } } = {}
  try { body = JSON.parse(text) } catch { /* not JSON */ }
  if (res.status === 409 && body.duplicate) throw new DuplicatePathError(body.duplicate.id, body.duplicate.name)
  throw new Error(`Publish failed (${res.status}): ${body.error ?? text}`)
}

/** the class already has a shared save with exactly this leveling path (compared by skill-bank core + level) */
export class DuplicatePathError extends Error {
  id: string
  existingName: string
  constructor(id: string, existingName: string) {
    super(`Not shared: this leveling path already exists for this class as "${existingName}".`)
    this.id = id; this.existingName = existingName
  }
}

// ---- admin ----------------------------------------------------------------------------------
const ADMIN_SS = 'maple-helper.adminKey'
export const getAdminKey = () => sessionStorage.getItem(ADMIN_SS) ?? ''
export const clearAdminKey = () => sessionStorage.removeItem(ADMIN_SS)

export async function adminUnlock(key: string): Promise<void> {
  const res = await fetch(`${base()}/admin/check`, { headers: { 'x-admin-key': key }, cache: 'no-store' })
  if (res.status === 501) throw new Error('ADMIN_KEY is not set on the worker yet.')
  if (!res.ok) throw new Error('Wrong admin key.')
  sessionStorage.setItem(ADMIN_SS, key)
}

export async function adminSave(tpl: ClassTemplate): Promise<void> {
  const res = await fetch(`${base()}/templates/${encodeURIComponent(tpl.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-key': getAdminKey() }, body: JSON.stringify({ ...tpl, updatedAt: Date.now() }) })
  if (!res.ok) throw new Error(`Save failed (${res.status}): ${await res.text()}`)
}

export async function adminDelete(id: string): Promise<void> {
  const res = await fetch(`${base()}/templates/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-admin-key': getAdminKey() } })
  if (!res.ok) throw new Error(`Delete failed (${res.status}): ${await res.text()}`)
}
