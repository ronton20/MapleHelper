import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, Upload, RefreshCw, Link2, Copy, Unlink } from 'lucide-react'
import QRCode from 'qrcode'
import { syncAvailable, getSyncKey, setSyncKey, newSyncKey, pairingUrl, pull, push, lastSync } from '../api/sync'
import { db, getSettings, DEFAULT_SETTINGS, BUILD_PROXY_URL, exportAll, importAll, updateCharacter } from '../db'
import { useUI } from '../store'
import { CLASSES, DEFAULT_WEIGHTS } from '../data/classes'
import type { FlameWeights } from '../types'

export function SettingsView() {
  const settings = useLiveQuery(() => getSettings(), [])
  const [version, setVersion] = useState('')
  const [publishKey, setPublishKey] = useState('')
  const { selectedCharacterId } = useUI()
  const character = useLiveQuery(() => selectedCharacterId ? db.characters.get(selectedCharacterId) : undefined, [selectedCharacterId])

  useEffect(() => { if (settings) { setVersion(settings.msioVersion); setPublishKey(settings.publishKey ?? '') } }, [settings])
  if (!settings) return null

  const save = () => db.settings.put({ ...DEFAULT_SETTINGS, ...settings, msioVersion: version.trim() || DEFAULT_SETTINGS.msioVersion, publishKey: publishKey.trim() })

  async function doExport() {
    const blob = new Blob([await exportAll()], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `maple-helper-${new Date().toISOString().slice(0, 10)}.json`; a.click()
  }
  async function doImport(file: File | undefined, mode: 'merge' | 'replace') {
    if (!file) return
    try { await importAll(await file.text(), mode); alert('Imported.') } catch (e) { alert((e as Error).message) }
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="mx-auto max-w-2xl space-y-6 p-6" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
      <h1 className="text-lg font-semibold">Settings</h1>

      <section className="card space-y-3 p-4">
        <div className="label">APIs</div>
        <div>
          <div className="mb-1 text-sm">maplestory.io GMS version</div>
          <input value={version} onChange={e => setVersion(e.target.value)} placeholder="270" onBlur={save} className="w-32" />
          <div className="mt-1 text-[11px] text-muted">Used for item search and icons. Bump it when new items are missing.</div>
        </div>
        <div>
          <div className="mb-1 text-sm">Library publish key <span className="text-muted">(optional)</span></div>
          <input value={publishKey} onChange={e => setPublishKey(e.target.value)} placeholder="only if the worker has PUBLISH_KEY set" onBlur={save} className="w-80" />
          <div className="mt-1 text-[11px] text-muted">Character fetch and the shared template library go through the app's built-in worker{BUILD_PROXY_URL ? '' : ' (not configured in this build)'}.</div>
        </div>
      </section>

      {character && (
        <section className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="label">Flame score weights · {character.name}</div>
            <button className="btn btn-sm" onClick={() => updateCharacter(character.id, { flameWeights: CLASSES.find(c => c.id === character.classId)?.flameWeights ?? DEFAULT_WEIGHTS })}>Reset to defaults</button>
          </div>
          <WeightsEditor w={character.flameWeights} onChange={w => updateCharacter(character.id, { flameWeights: w })} />
          <div className="text-[11px] text-muted">Defaults follow the community rule of thumb: 1 main stat = 1, 12 secondary = 1, 1 ATT = 3, 1% all stat = 10.</div>
        </section>
      )}

      {syncAvailable() && <SyncSection />}

      <section className="card space-y-3 p-4">
        <div className="label">Backup</div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={doExport}><Download size={14} />Export JSON</button>
          <label className="btn cursor-pointer"><Upload size={14} />Import (merge)<input type="file" accept="application/json" className="hidden" onChange={e => doImport(e.target.files?.[0], 'merge')} /></label>
          <label className="btn btn-danger cursor-pointer"><Upload size={14} />Import (replace all)<input type="file" accept="application/json" className="hidden" onChange={e => doImport(e.target.files?.[0], 'replace')} /></label>
        </div>
        <div className="text-[11px] text-muted">All data lives in this browser (IndexedDB). Export regularly, or to move to another device.</div>
      </section>
    </div>
    </div>
  )
}

function WeightsEditor({ w, onChange }: { w: FlameWeights; onChange: (w: FlameWeights) => void }) {
  const stats = ['str', 'dex', 'int', 'luk'] as const
  return (
    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
      <label><div className="label mb-1">Main stat</div><select value={w.mainStat} onChange={e => onChange({ ...w, mainStat: e.target.value as FlameWeights['mainStat'] })}>{stats.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}</select></label>
      <label><div className="label mb-1">Secondary stat</div><select value={w.secondaryStat} onChange={e => onChange({ ...w, secondaryStat: e.target.value as FlameWeights['secondaryStat'] })}><option value="none">none</option>{stats.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}</select></label>
      <label><div className="label mb-1">Secondary weight</div><input type="number" step="0.01" value={Number(w.secondaryWeight.toFixed(3))} onChange={e => onChange({ ...w, secondaryWeight: Number(e.target.value) })} /></label>
      <label><div className="label mb-1">ATT weight</div><input type="number" step="0.1" value={w.attWeight} onChange={e => onChange({ ...w, attWeight: Number(e.target.value) })} /></label>
      <label><div className="label mb-1">All stat % weight</div><input type="number" step="0.1" value={w.allStatWeight} onChange={e => onChange({ ...w, allStatWeight: Number(e.target.value) })} /></label>
      <label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={w.useMatt} onChange={e => onChange({ ...w, useMatt: e.target.checked })} className="w-auto" />Use MATT instead of ATT</label>
    </div>
  )
}

function SyncSection() {
  const [key, setKey] = useState(getSyncKey())
  const [qr, setQr] = useState('')
  const [pairInput, setPairInput] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => { if (key) QRCode.toDataURL(pairingUrl(key), { margin: 1, width: 220, color: { dark: '#e6e8ee', light: '#14161b' } }).then(setQr); else setQr('') }, [key])

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label); setMsg('')
    try { const r = await fn(); setMsg(typeof r === 'object' && r && 'changed' in r ? `Pulled · ${(r as { changed: number }).changed} item(s) updated` : `${label} done`) }
    catch (e) { setMsg((e as Error).message) } finally { setBusy('') }
  }
  function enable() { const k = newSyncKey(); setSyncKey(k); setKey(k); run('Push', () => push(k)) }
  function pair() { const k = pairInput.trim().match(/([A-Za-z0-9_-]{16,64})\s*$/)?.[1]; if (!k) { setMsg('That does not look like a sync key or link.'); return } setSyncKey(k); setKey(k); setPairInput(''); run('Pull', () => pull(k)) }
  function disable() { if (!confirm('Stop syncing this device? Data stays on the device.')) return; setSyncKey(''); setKey(''); setMsg('') }
  const last = lastSync()

  return (
    <section className="card space-y-3 p-4">
      <div className="label">Sync between devices</div>
      {!key ? (
        <>
          <div className="text-sm">Keep your PC and phone on the same data. No account: a long random key identifies your data on the shared worker — anyone with the key can read it, so treat it like a password.</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={enable}><Link2 size={14} />Enable sync on this device</button>
          </div>
          <div className="text-xs text-muted">Already syncing on another device? Paste its key or pairing link:</div>
          <div className="flex gap-2">
            <input value={pairInput} onChange={e => setPairInput(e.target.value)} placeholder="sync key or https://…#sync=…" />
            <button className="btn" onClick={pair} disabled={!pairInput.trim()}>Pair</button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-4">
            {qr && <img src={qr} alt="Pairing QR code" className="h-[160px] w-[160px] rounded-md border border-line" />}
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <div>Scan this with the other device's camera (or open the link there) to pair it. Changes sync automatically a few seconds after you make them, and on opening the app.</div>
              <div className="flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded bg-panel-2 px-2 py-1 text-xs">{key}</code><button className="btn btn-sm" title="Copy key" onClick={() => navigator.clipboard?.writeText(key)}><Copy size={12} /></button></div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(pairingUrl(key))}><Link2 size={12} />Copy pairing link</button>
                <button className="btn btn-sm" disabled={!!busy} onClick={() => run('Push', () => push())}><Upload size={12} />Push now</button>
                <button className="btn btn-sm" disabled={!!busy} onClick={() => run('Pull', () => pull())}><RefreshCw size={12} className={busy === 'Pull' ? 'animate-spin' : ''} />Pull now</button>
                <button className="btn btn-sm btn-danger" onClick={disable}><Unlink size={12} />Stop syncing</button>
              </div>
              <div className="text-[11px] text-muted">{last ? `Last sync: ${new Date(last).toLocaleString()}` : 'Not synced yet'}{msg ? ` · ${msg}` : ''}</div>
            </div>
          </div>
          <div className="text-[11px] text-muted">Merging is per character: the newer version wins. Deleting a character on one device does not delete it on the other (re-import if needed).</div>
        </>
      )}
    </section>
  )
}
