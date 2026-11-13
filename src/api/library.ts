/**
 * Shared template library – lives in the same Cloudflare Worker as the rankings proxy (worker/proxy.js),
 * backed by a KV namespace. Anyone with the app can list/download templates; publishing is open too
 * (optionally gated by a PUBLISH_KEY secret on the worker).
 */
import type { ClassTemplate } from '../types'

export interface LibraryEntry { id: string; name: string; nodes: number; steps: number; source: string; updatedAt: number }

const base = (proxyUrl: string) => proxyUrl.replace(/\/$/, '')

export async function listTemplates(proxyUrl: string): Promise<LibraryEntry[]> {
  if (!proxyUrl) throw new Error('No worker URL configured (Settings).')
  const res = await fetch(`${base(proxyUrl)}/templates`)
  if (!res.ok) throw new Error(`Library unavailable (${res.status}) – is the KV namespace bound?`)
  return (await res.json()).templates ?? []
}

export async function fetchTemplate(proxyUrl: string, id: string): Promise<ClassTemplate> {
  const res = await fetch(`${base(proxyUrl)}/templates/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`Template not found (${res.status})`)
  return await res.json()
}

export async function publishTemplate(proxyUrl: string, tpl: ClassTemplate, key = ''): Promise<void> {
  if (!proxyUrl) throw new Error('No worker URL configured (Settings).')
  const res = await fetch(`${base(proxyUrl)}/templates`, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-publish-key': key } : {}) }, body: JSON.stringify(tpl) })
  if (!res.ok) throw new Error(`Publish failed (${res.status}): ${await res.text()}`)
}
