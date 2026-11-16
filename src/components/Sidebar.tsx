import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Settings, Swords, Hexagon, Trash2, RefreshCw, GripVertical } from 'lucide-react'
import { listTemplates, fetchTemplate, type LibraryEntry } from '../api/library'
import { CLASS_BY_KEY, classKeyForJob } from '../data/gmsClasses'
import { ClassOptions } from './ClassOptions'
import { SidebarFooter } from './SidebarFooter'
import { weightsForClass } from '../data/classes'
import { db, createCharacter, deleteCharacter, updateCharacter, getSettings, sortCharacters, reorderCharacters } from '../db'
import { useUI } from '../store'
import { lookupCharacter } from '../api/nexon'
import type { Character, Region } from '../types'

export function Sidebar() {
  const stored = useLiveQuery(async () => sortCharacters(await db.characters.toArray()), []) ?? []
  const { selectedCharacterId, setCharacter, view, setView } = useUI()
  const [adding, setAdding] = useState(false)

  // ---- drag & drop reordering (pointer events: mouse + touch, via the grip handle) ----
  // The dragged row follows the pointer, the rows it passes slide out of the way, and on release it glides into
  // its new place. The new order is shown immediately (optimistic) so nothing jumps back while it is saved.
  const listRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; from: number; to: number; dy: number; rowH: number; top: number; dropping: boolean } | null>(null)
  const dragStart = useRef({ y: 0, scroll: 0 })
  const [optimistic, setOptimistic] = useState<string[] | null>(null)
  const storedIds = stored.map(c => c.id)
  useEffect(() => { if (optimistic && optimistic.join() === storedIds.join()) setOptimistic(null) }, [optimistic, storedIds.join()])
  const characters = optimistic ? optimistic.map(id => stored.find(c => c.id === id)).filter((c): c is Character => !!c).concat(stored.filter(c => !optimistic.includes(c.id))) : stored
  const ids = characters.map(c => c.id)

  function startDrag(e: React.PointerEvent, id: string) {
    e.preventDefault(); e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const row = listRef.current?.querySelector<HTMLElement>(`[data-char-row="${id}"]`)
    const rowH = row ? row.getBoundingClientRect().height + parseFloat(getComputedStyle(row).marginBottom || '0') : 60
    dragStart.current = { y: e.clientY, scroll: listRef.current?.scrollTop ?? 0 }
    const from = ids.indexOf(id)
    setDrag({ id, from, to: from, dy: 0, rowH, top: row?.offsetTop ?? 0, dropping: false })
  }
  function moveDrag(e: React.PointerEvent) {
    if (!drag || drag.dropping) return
    const list = listRef.current
    if (list) {   // auto-scroll near the edges
      const r = list.getBoundingClientRect()
      if (e.clientY < r.top + 28) list.scrollTop -= 8
      else if (e.clientY > r.bottom - 28) list.scrollTop += 8
    }
    const dy = e.clientY - dragStart.current.y + ((list?.scrollTop ?? 0) - dragStart.current.scroll)
    const to = Math.max(0, Math.min(ids.length - 1, drag.from + Math.round(dy / drag.rowH)))
    setDrag({ ...drag, dy, to })
  }
  function endDrag() {
    if (!drag || drag.dropping) return
    const d = drag
    const order = [...ids]; order.splice(d.from, 1); order.splice(d.to, 0, d.id)
    // glide into the target slot, then commit
    setDrag({ ...d, dy: (d.to - d.from) * d.rowH, dropping: true })
    window.setTimeout(() => {
      setDrag(null)
      if (order.join() !== storedIds.join() || stored.some(c => c.sortOrder === undefined)) { setOptimistic(order); reorderCharacters(order) }
    }, 160)
  }
  /** visual offset of a row while dragging: the dragged one follows the pointer, the ones it passed make room */
  function rowShift(i: number, id: string): number {
    if (!drag) return 0
    if (id === drag.id) return drag.dy
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -drag.rowH
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return drag.rowH
    return 0
  }


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

      <div ref={listRef} className="relative flex-1 overflow-y-auto px-2 pt-1.5 pb-1">
        {/* drop target outline */}
        {drag && <div className="pointer-events-none absolute right-2 left-2 rounded-md border-2 border-dashed border-accent/50 bg-accent/5 transition-[top] duration-150 ease-out" style={{ top: drag.top + (drag.to - drag.from) * drag.rowH, height: drag.rowH - 4 }} />}
        {characters.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-muted">No characters yet.<br />Click + to add one.</div>
        )}
        {characters.map((c, i) => (
          <CharRow key={c.id} c={c} active={c.id === selectedCharacterId} dragging={drag?.id === c.id}
            style={drag ? { transform: `translateY(${rowShift(i, c.id)}px)${drag.id === c.id && !drag.dropping ? ' scale(1.03)' : ''}`, transition: drag.id === c.id && !drag.dropping ? 'none' : 'transform 160ms ease' } : undefined}
            onClick={() => { setCharacter(c.id); if (view === 'settings') setView('equipment') }}
            grip={characters.length > 1 ? { onPointerDown: e => startDrag(e, c.id), onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag } : undefined} />
        ))}
      </div>

      <SidebarFooter />

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

type GripHandlers = { onPointerDown: (e: React.PointerEvent) => void; onPointerMove: (e: React.PointerEvent) => void; onPointerUp: () => void; onPointerCancel: () => void }
function CharRow({ c, active, onClick, grip, dragging, style }: { c: Character; active: boolean; onClick: () => void; grip?: GripHandlers; dragging?: boolean; style?: React.CSSProperties }) {
  return (
    <div data-char-row={c.id} onClick={onClick} style={style} className={`group relative mb-1 flex cursor-pointer items-center gap-3 rounded-md py-2 pr-2 pl-1 ${active ? 'bg-accent/10 ring-1 ring-accent/40' : 'hover:bg-panel-2'} ${dragging ? 'z-20 bg-panel shadow-xl shadow-black/40 ring-2 ring-accent/70' : ''}`}>
      {grip
        ? <span {...grip} onClick={e => e.stopPropagation()} title="Drag to reorder" className={`-mr-2 flex h-10 w-4 shrink-0 cursor-grab touch-none items-center justify-center text-muted/40 hover:text-muted active:cursor-grabbing ${dragging ? 'text-muted' : ''}`}><GripVertical size={14} /></span>
        : <span className="-mr-2 w-4 shrink-0" />}
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-panel-2">
        {c.imageUrl ? <img src={c.imageUrl} alt="" className="pixel h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-xs text-muted">{c.name.slice(0, 2)}</div>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{c.name}</div>
        <div className="truncate text-[11px] text-muted">{c.job || 'No class set'}{c.level ? ` · Lv. ${c.level}` : ''}</div>
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
  const [level, setLevel] = useState(existing?.level ?? 0)
  const [world, setWorld] = useState(existing?.world ?? '')
  const [imageUrl, setImageUrl] = useState(existing?.imageUrl ?? '')
  const [classId, setClassId] = useState<string>(existing?.classId ?? '')
  const [region, setRegion] = useState<Region>(existing?.region ?? (localStorage.getItem('maple-helper.lastRegion') as Region) ?? 'eu')
  const [heroic, setHeroic] = useState<boolean>(existing?.heroic ?? (localStorage.getItem('maple-helper.lastHeroic') ?? '1') === '1')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [classKey, setClassKey] = useState<string>(existing?.classKey || classKeyForJob(existing?.job) || '')
  const allTemplates = useLiveQuery(() => db.templates.orderBy('name').toArray(), []) ?? []
  // only data for the chosen class: templates saved on this device and shared templates of that class
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
    if (!localTemplates.some(t => `tpl:${t.id}` === classId) && existing?.classId !== classId) setClassId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classKey])

  async function fetchFromNexon() {
    setErr(''); setBusy(true)
    try {
      const s = await getSettings()
      const r = await lookupCharacter(name, s.proxyUrl, heroic, region)
      setLevel(r.level); setWorld(r.world); setImageUrl(r.imageUrl); setName(r.name)
      const key = classKeyForJob(r.job)
      if (key) { setClassKey(key); setNote('') } else setNote(r.job ? `Rankings say "${r.job}" — pick the matching class.` : 'Pick the class.')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function save() {
    if (!name.trim()) return
    const job = CLASS_BY_KEY[classKey]?.name ?? existing?.job ?? ''
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
      await updateCharacter(existing.id, { name: name.trim(), job, level, world, imageUrl, classId: dataId || null, classKey, region, heroic, ...(classKey !== existing.classKey ? { flameWeights: weightsForClass(classKey) } : {}) })
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
          <div className="mt-1 text-[11px] text-muted">Pulls class, level, world and image from the GMS rankings for the region / world type above. Or fill in manually.</div>
          {err && <div className="mt-1 text-xs text-red-400">{err}</div>}
        </div>
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
          <div>
            <div className="label mb-1">Class</div>
            <select value={classKey} onChange={e => { setClassKey(e.target.value); setNote('') }} className={classKey ? '' : 'text-muted'}>
              <option value="">Select a class…</option>
              <ClassOptions />
            </select>
          </div>
          <div><div className="label mb-1">Level</div><input type="number" value={level || ''} onChange={e => setLevel(Number(e.target.value))} /></div>
          <div><div className="label mb-1">World</div><input value={world} onChange={e => setWorld(e.target.value)} placeholder="Kronos" /></div>
        </div>
        {note && <div className="-mt-1 text-[11px] text-accent">{note}</div>}
        <div><div className="label mb-1">Image URL</div><input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://msavatar1.nexon.net/Character/....png" /></div>
        <div>
          <div className="label mb-1">HEXA data</div>
          <select value={classId} onChange={e => setClassId(e.target.value)} disabled={!classKey}>
            <option value="">Generic (rename nodes yourself)</option>
            {localTemplates.length > 0 && <optgroup label="Saved on this device">{localTemplates.map(t => <option key={t.id} value={`tpl:${t.id}`}>{t.name}</option>)}</optgroup>}
            {lib.length > 0 && <optgroup label="Shared library">{lib.map(e => <option key={e.id} value={`lib:${e.id}`}>{e.name} · {e.steps} steps</option>)}</optgroup>}
          </select>
        </div>
        <div className="text-[11px] text-muted">
          {!classKey ? 'Pick the class (Fetch fills it in) to see HEXA data made for it.'
            : libState === 'loading' ? `Looking for shared ${CLASS_BY_KEY[classKey]?.name ?? ''} data…`
            : libState === 'error' ? 'Shared library unavailable right now — data saved on this device still works.'
            : `${localTemplates.length + lib.length} option(s) for ${CLASS_BY_KEY[classKey]?.name ?? classKey}. Shared data is downloaded when you save.`}
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
