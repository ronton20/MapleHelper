import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Settings, Swords, Hexagon, Trash2, RefreshCw } from 'lucide-react'
import { listTemplates, fetchTemplate, type LibraryEntry } from '../api/library'
import { GMS_CLASSES, CLASS_GROUPS, CLASS_BY_KEY, classKeyForJob, BUILTIN_TO_KEY } from '../data/gmsClasses'
import { db, createCharacter, deleteCharacter, updateCharacter, getSettings } from '../db'
import { useUI } from '../store'
import { lookupCharacter } from '../api/nexon'
import { CLASSES, classForJob } from '../data/classes'
import type { Character, Region } from '../types'

export function Sidebar() {
  const characters = useLiveQuery(() => db.characters.orderBy('updatedAt').reverse().toArray(), []) ?? []
  const { selectedCharacterId, setCharacter, view, setView } = useUI()
  const [adding, setAdding] = useState(false)

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-panel max-[900px]:w-full">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-sm font-semibold tracking-wide">Maple Helper</div>
        <button className="btn btn-ghost btn-sm" title="Settings" onClick={() => setView('settings')}><Settings size={16} /></button>
      </div>

      <div className="px-3 pb-2">
        <div className="flex gap-1 rounded-md border border-line bg-panel-2 p-1">
          <TabBtn active={view === 'equipment'} onClick={() => setView('equipment')} icon={<Swords size={14} />} label="Gear" />
          <TabBtn active={view === 'hexa'} onClick={() => setView('hexa')} icon={<Hexagon size={14} />} label="HEXA" />
        </div>
      </div>

      <div className="flex items-center justify-between px-4 pt-2 pb-1">
        <span className="label">Characters</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)} title="Add character"><Plus size={14} /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {characters.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-muted">No characters yet.<br />Click + to add one.</div>
        )}
        {characters.map(c => (
          <CharRow key={c.id} c={c} active={c.id === selectedCharacterId} onClick={() => { setCharacter(c.id); if (view === 'settings') setView('equipment') }} />
        ))}
      </div>

      {adding && <AddCharacterDialog onClose={() => setAdding(false)} onCreated={(id) => { setCharacter(id); setAdding(false) }} />}
    </aside>
  )
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs transition-colors ${active ? 'bg-accent/15 text-accent' : 'text-muted hover:text-text'}`}>
      {icon}{label}
    </button>
  )
}

function CharRow({ c, active, onClick }: { c: Character; active: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} className={`group mb-1 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors ${active ? 'bg-accent/10 ring-1 ring-accent/40' : 'hover:bg-panel-2'}`}>
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-panel-2">
        {c.imageUrl ? <img src={c.imageUrl} alt="" className="pixel h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-xs text-muted">{c.name.slice(0, 2)}</div>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{c.name}</div>
        <div className="truncate text-[11px] text-muted">{c.job || 'Unknown job'}{c.level ? ` · Lv. ${c.level}` : ''}</div>
      </div>
      <button className="btn btn-ghost btn-sm opacity-0 group-hover:opacity-100" title="Delete character"
        onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${c.name} and all its gear/HEXA data?`)) deleteCharacter(c.id) }}>
        <Trash2 size={13} />
      </button>
    </div>
  )
}

export function AddCharacterDialog({ onClose, onCreated, existing }: { onClose: () => void; onCreated: (id: string) => void; existing?: Character }) {
  const [name, setName] = useState(existing?.name ?? '')
  const [job, setJob] = useState(existing?.job ?? '')
  const [level, setLevel] = useState(existing?.level ?? 0)
  const [world, setWorld] = useState(existing?.world ?? '')
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? '')
  const [classId, setClassId] = useState<string>(existing?.classId ?? '')
  const [region, setRegion] = useState<Region>(existing?.region ?? (localStorage.getItem('maple-helper.lastRegion') as Region) ?? 'eu')
  const [heroic, setHeroic] = useState<boolean>(existing?.heroic ?? (localStorage.getItem('maple-helper.lastHeroic') ?? '1') === '1')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [classKey, setClassKey] = useState<string>(existing?.classKey || classKeyForJob(existing?.job) || '')
  const allTemplates = useLiveQuery(() => db.templates.orderBy('name').toArray(), []) ?? []
  // only data for the chosen class: built-in seed, local templates of that class, shared templates of that class
  const builtins = CLASSES.filter(c => BUILTIN_TO_KEY[c.id] === classKey)
  const localTemplates = allTemplates.filter(t => t.classKey === classKey)
  const [lib, setLib] = useState<LibraryEntry[]>([])
  const [libState, setLibState] = useState<'idle' | 'loading' | 'error'>('idle')
  useEffect(() => {
    if (!classKey) { setLib([]); return }
    let cancelled = false
    setLibState('loading')
    listTemplates(classKey).then(l => { if (!cancelled) { setLib(l.filter(e => !allTemplates.some(t => t.id === e.id))); setLibState('idle') } })
      .catch(() => { if (!cancelled) { setLib([]); setLibState('error') } })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classKey])
  // when the class changes, drop a data choice that belongs to another class
  useEffect(() => {
    if (!classId || classId.startsWith('lib:')) return
    const ok = builtins.some(b => b.id === classId) || localTemplates.some(t => `tpl:${t.id}` === classId)
    if (!ok && (existing?.classId !== classId)) setClassId(builtins[0]?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classKey])

  async function fetchFromNexon() {
    setErr(''); setBusy(true)
    try {
      const s = await getSettings()
      const r = await lookupCharacter(name, s.proxyUrl, heroic, region)
      setJob(r.job); setLevel(r.level); setWorld(r.world); setImageUrl(r.imageUrl); setName(r.name)
      const key = classKeyForJob(r.job); if (key) setClassKey(key)
      const cls = classForJob(r.job); if (cls) setClassId(cls.id)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function save() {
    if (!name.trim()) return
    let dataId = classId
    if (dataId.startsWith('lib:')) {
      try {
        const t = await fetchTemplate(dataId.slice(4))
        await db.templates.put({ ...t, classKey: t.classKey || classKey, source: t.source?.includes('shared') ? t.source : `${t.source ?? 'chart'} · shared library` })
        dataId = `tpl:${t.id}`
      } catch (e) { setErr(`Couldn't download the shared data: ${(e as Error).message}`); return }
    }
    localStorage.setItem('maple-helper.lastRegion', region); localStorage.setItem('maple-helper.lastHeroic', heroic ? '1' : '0')
    if (existing) {
      await updateCharacter(existing.id, { name: name.trim(), job, level, world, imageUrl, classId: dataId || null, classKey, region, heroic })
      onCreated(existing.id)
    } else {
      const c = await createCharacter({ name: name.trim(), job, level, world, imageUrl, classId: dataId || null, classKey, region, heroic })
      onCreated(c.id)
    }
  }

  return (
    <Modal title={existing ? 'Edit character' : 'Add character'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="label mb-1">Region</div>
            <select value={region} onChange={e => setRegion(e.target.value as Region)}>
              <option value="eu">Europe</option>
              <option value="na">North America</option>
            </select>
          </div>
          <div>
            <div className="label mb-1">World type</div>
            <select value={heroic ? '1' : '0'} onChange={e => setHeroic(e.target.value === '1')}>
              <option value="1">Heroic (Reboot)</option>
              <option value="0">Regular</option>
            </select>
          </div>
        </div>
        <div>
          <div className="label mb-1">Character name</div>
          <div className="flex gap-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="IGN" autoFocus onKeyDown={e => e.key === 'Enter' && fetchFromNexon()} />
            <button className="btn whitespace-nowrap" onClick={fetchFromNexon} disabled={busy || !name.trim()}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />Fetch</button>
          </div>
          <div className="mt-1 text-[11px] text-muted">Pulls job, level, world and image from the GMS rankings for the region / world type above. Or fill in manually.</div>
          {err && <div className="mt-1 text-xs text-red-400">{err}</div>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><div className="label mb-1">Job</div><input value={job} onChange={e => setJob(e.target.value)} /></div>
          <div><div className="label mb-1">Level</div><input type="number" value={level || ''} onChange={e => setLevel(Number(e.target.value))} /></div>
          <div><div className="label mb-1">World</div><input value={world} onChange={e => setWorld(e.target.value)} placeholder="Kronos" /></div>
        </div>
        <div><div className="label mb-1">Image URL</div><input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://msavatar1.nexon.net/Character/....png" /></div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <div className="label mb-1">Class</div>
            <select value={classKey} onChange={e => setClassKey(e.target.value)}>
              <option value="">Select a class…</option>
              {CLASS_GROUPS.map(g => (
                <optgroup key={g} label={g}>
                  {GMS_CLASSES.filter(c => c.group === g).map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <div className="label mb-1">HEXA data</div>
            <select value={classId} onChange={e => setClassId(e.target.value)} disabled={!classKey}>
              <option value="">Generic (rename nodes yourself)</option>
              {builtins.length > 0 && <optgroup label="Built-in">{builtins.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
              {localTemplates.length > 0 && <optgroup label="Saved on this device">{localTemplates.map(t => <option key={t.id} value={`tpl:${t.id}`}>{t.name}</option>)}</optgroup>}
              {lib.length > 0 && <optgroup label="Shared library">{lib.map(e => <option key={e.id} value={`lib:${e.id}`}>{e.name} · {e.steps} steps</option>)}</optgroup>}
            </select>
          </div>
        </div>
        <div className="text-[11px] text-muted">
          {!classKey ? 'Pick the class (Fetch fills it in) to see HEXA data made for it.'
            : libState === 'loading' ? `Looking for shared ${CLASS_BY_KEY[classKey]?.name ?? ''} data…`
            : libState === 'error' ? 'Shared library unavailable right now — built-in and saved data still work.'
            : `${builtins.length + localTemplates.length + lib.length} option(s) for ${CLASS_BY_KEY[classKey]?.name ?? classKey}. Shared data is downloaded when you save.`}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>{existing ? 'Save' : 'Add'}</button>
        </div>
      </div>
    </Modal>
  )
}

export function Modal({ title, onClose, children, wide, xwide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; xwide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 max-[900px]:p-0" onMouseDown={onClose}>
      <div className={`card w-full ${xwide ? 'max-w-5xl' : wide ? 'max-w-2xl' : 'max-w-md'} max-h-[92vh] overflow-y-auto p-5 shadow-2xl max-[900px]:h-full max-[900px]:max-h-none max-[900px]:max-w-none max-[900px]:rounded-none`} style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))', paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }} onMouseDown={e => e.stopPropagation()}>
        <div className="mb-4 text-sm font-semibold">{title}</div>
        {children}
      </div>
    </div>
  )
}
