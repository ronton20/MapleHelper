import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, Upload } from 'lucide-react'
import { db, getSettings, DEFAULT_SETTINGS, BUILD_PROXY_URL, exportAll, importAll, updateCharacter } from '../db'
import { useUI } from '../store'
import type { FlameWeights } from '../types'

export function SettingsView() {
  const settings = useLiveQuery(() => getSettings(), [])
  const [proxyUrl, setProxyUrl] = useState('')
  const [version, setVersion] = useState('')
  const [publishKey, setPublishKey] = useState('')
  const { selectedCharacterId } = useUI()
  const character = useLiveQuery(() => selectedCharacterId ? db.characters.get(selectedCharacterId) : undefined, [selectedCharacterId])

  useEffect(() => { if (settings) { setProxyUrl(settings.proxyUrl); setVersion(settings.msioVersion); setPublishKey(settings.publishKey ?? '') } }, [settings])
  if (!settings) return null

  const save = () => db.settings.put({ ...DEFAULT_SETTINGS, ...settings, proxyUrl: proxyUrl.trim(), msioVersion: version.trim() || DEFAULT_SETTINGS.msioVersion, publishKey: publishKey.trim() })

  async function doExport() {
    const blob = new Blob([await exportAll()], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `maple-helper-${new Date().toISOString().slice(0, 10)}.json`; a.click()
  }
  async function doImport(file: File | undefined, mode: 'merge' | 'replace') {
    if (!file) return
    try { await importAll(await file.text(), mode); alert('Imported.') } catch (e) { alert((e as Error).message) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      <section className="card space-y-3 p-4">
        <div className="label">APIs</div>
        <div>
          <div className="mb-1 text-sm">Nexon rankings proxy URL</div>
          <input value={proxyUrl} onChange={e => setProxyUrl(e.target.value)} placeholder={BUILD_PROXY_URL || 'https://maple-proxy.<you>.workers.dev'} onBlur={save} />
          {BUILD_PROXY_URL && <div className="mt-1 text-[11px] text-muted">Default from this build: <code>{BUILD_PROXY_URL}</code> — leave empty to use it.</div>}
          <div className="mt-1 text-[11px] text-muted">Deploy <code>worker/proxy.js</code> to Cloudflare Workers (free) and paste its URL. Used for "Fetch" / re-sync of characters, and — with a KV namespace bound as <code>TEMPLATES</code> — for the shared HEXA template library.</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 text-sm">Rankings region</div>
            <select value={settings.region} onChange={e => db.settings.put({ ...DEFAULT_SETTINGS, ...settings, region: e.target.value as 'na' | 'eu' })}>
              <option value="na">North America</option>
              <option value="eu">Europe</option>
            </select>
          </div>
          <div>
            <div className="mb-1 text-sm">World type</div>
            <select value={settings.heroic ? '1' : '0'} onChange={e => db.settings.put({ ...DEFAULT_SETTINGS, ...settings, heroic: e.target.value === '1' })}>
              <option value="1">Heroic (Reboot)</option>
              <option value="0">Regular</option>
            </select>
          </div>
        </div>
        <div>
          <div className="mb-1 text-sm">Library publish key <span className="text-muted">(optional)</span></div>
          <input value={publishKey} onChange={e => setPublishKey(e.target.value)} placeholder="only if the worker has PUBLISH_KEY set" onBlur={save} className="w-80" />
        </div>
        <div>
          <div className="mb-1 text-sm">maplestory.io GMS version</div>
          <input value={version} onChange={e => setVersion(e.target.value)} placeholder="262" onBlur={save} className="w-32" />
          <div className="mt-1 text-[11px] text-muted">Used for item search and icons. Bump it when new items are missing.</div>
        </div>
      </section>

      {character && (
        <section className="card space-y-3 p-4">
          <div className="label">Flame score weights · {character.name}</div>
          <WeightsEditor w={character.flameWeights} onChange={w => updateCharacter(character.id, { flameWeights: w })} />
        </section>
      )}

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
  )
}

function WeightsEditor({ w, onChange }: { w: FlameWeights; onChange: (w: FlameWeights) => void }) {
  const stats = ['str', 'dex', 'int', 'luk'] as const
  return (
    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
      <label><div className="label mb-1">Main stat</div><select value={w.mainStat} onChange={e => onChange({ ...w, mainStat: e.target.value as FlameWeights['mainStat'] })}>{stats.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}</select></label>
      <label><div className="label mb-1">Secondary stat</div><select value={w.secondaryStat} onChange={e => onChange({ ...w, secondaryStat: e.target.value as FlameWeights['secondaryStat'] })}><option value="none">none</option>{stats.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}</select></label>
      <label><div className="label mb-1">Secondary weight</div><input type="number" step="0.01" value={w.secondaryWeight} onChange={e => onChange({ ...w, secondaryWeight: Number(e.target.value) })} /></label>
      <label><div className="label mb-1">ATT weight</div><input type="number" step="0.1" value={w.attWeight} onChange={e => onChange({ ...w, attWeight: Number(e.target.value) })} /></label>
      <label><div className="label mb-1">All stat % weight</div><input type="number" step="0.1" value={w.allStatWeight} onChange={e => onChange({ ...w, allStatWeight: Number(e.target.value) })} /></label>
      <label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={w.useMatt} onChange={e => onChange({ ...w, useMatt: e.target.checked })} className="w-auto" />Use MATT instead of ATT</label>
    </div>
  )
}
