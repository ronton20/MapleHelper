/**
 * Cross-device sync through the worker's /sync/:key endpoint (KV). No accounts: whoever has the key has the data,
 * so the key is long and random. The key is stored in localStorage on each device.
 */
import { nanoid } from 'nanoid'
import { mergeSnapshot, snapshot, BUILD_PROXY_URL } from '../db'

const KEY_LS = 'maple-helper.syncKey'
const LAST_LS = 'maple-helper.syncLast'

export const syncAvailable = () => !!BUILD_PROXY_URL
export const getSyncKey = () => localStorage.getItem(KEY_LS) ?? ''
export const setSyncKey = (k: string) => { if (k) localStorage.setItem(KEY_LS, k); else localStorage.removeItem(KEY_LS) }
export const newSyncKey = () => nanoid(32).replace(/[^A-Za-z0-9_-]/g, 'x')
export const lastSync = () => Number(localStorage.getItem(LAST_LS) ?? 0)
const base = () => BUILD_PROXY_URL.replace(/\/$/, '')

/** URL that pairs another device when opened (the app reads #sync=KEY on start) */
export function pairingUrl(key: string) {
  const u = new URL(location.href); u.hash = `sync=${key}`; u.search = ''
  return u.toString()
}

export async function pull(key = getSyncKey()): Promise<{ changed: number; found: boolean }> {
  if (!key || !syncAvailable()) return { changed: 0, found: false }
  const res = await fetch(`${base()}/sync/${encodeURIComponent(key)}`, { cache: 'no-store' })
  if (res.status === 404) return { changed: 0, found: false }
  if (!res.ok) throw new Error(`Sync pull failed (${res.status})`)
  const data = await res.json()
  const r = await mergeSnapshot(data)
  localStorage.setItem(LAST_LS, String(Date.now()))
  return { ...r, found: true }
}

export async function push(key = getSyncKey()): Promise<void> {
  if (!key || !syncAvailable()) return
  const body = JSON.stringify(await snapshot())
  const res = await fetch(`${base()}/sync/${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body })
  if (!res.ok) throw new Error(`Sync push failed (${res.status}): ${await res.text()}`)
  localStorage.setItem(LAST_LS, String(Date.now()))
}

let timer: number | undefined
/** debounced push, called after local changes */
export function schedulePush() {
  if (!getSyncKey() || !syncAvailable()) return
  window.clearTimeout(timer)
  timer = window.setTimeout(() => { push().catch(e => console.warn('sync push', e)) }, 3000)
}

/** consume #sync=KEY from the URL (pairing link / QR) */
export function consumePairingHash(): string | null {
  const m = location.hash.match(/sync=([A-Za-z0-9_-]{16,64})/)
  if (!m) return null
  history.replaceState(null, '', location.pathname + location.search)
  setSyncKey(m[1])
  return m[1]
}
