import { useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { nanoid } from 'nanoid'
import { useIsMobile } from '../../store'
import { classKeyForJob } from '../../data/gmsClasses'
import { Plus, Trash2, ArrowUp, ArrowDown, Image as ImageIcon, X, RotateCcw, ChevronRight, ListOrdered, Wand2, ScanSearch } from 'lucide-react'
import { db, defaultHexaProfile, migrateHexaProfile, resolveClass, updateCharacter } from '../../db'
import { ChartImportDialog, type ImportOutcome } from './ChartImportDialog'
import { GENERIC_NODES } from '../../data/classes'
import { costBetween, totalToMax, maxLevel, GROUPS, GROUP_LABEL, GROUP_COLOR, GROUP_OF, GROUP_TYPES, NODE_TYPE_LABEL, STAT_FRAGS_PER_LEVEL } from '../../data/hexaCosts'
import type { Character, HexaProfile, HexaNodeDef, HexaNodeType, HexaCheckpoint, HexaOrderStep } from '../../types'
import { Modal } from '../Sidebar'

export function HexaView({ character }: { character: Character }) {
  const profile = useLiveQuery(() => db.hexa.get(character.id), [character.id])
  const cls = useLiveQuery(() => resolveClass(character.classId), [character.classId])
  if (profile === undefined) return null
  if (!profile) {
    resolveClass(character.classId).then(c => db.hexa.put(defaultHexaProfile(character.id, c?.nodes ?? GENERIC_NODES, c?.order ?? [])))
    return null
  }
  return <HexaInner character={character} profile={migrateHexaProfile(profile)} cls={cls ?? undefined} />
}

type ClassLike = NonNullable<Awaited<ReturnType<typeof resolveClass>>>

interface Step extends HexaCheckpoint { node: HexaNodeDef; from: number; frags: number; erda: number; cumFrags: number; done: boolean; days: number; cumDays: number }

function HexaInner({ character, profile, cls }: { character: Character; profile: HexaProfile; cls?: ClassLike }) {
  const save = (patch: Partial<HexaProfile>) => db.hexa.put({ ...profile, ...patch, updatedAt: Date.now() })
  const setLevel = (id: string, lvl: number) => {
    const n = profile.nodes.find(n => n.id === id); if (!n) return
    save({ levels: { ...profile.levels, [id]: Math.max(0, Math.min(maxLevel(n.type), lvl)) } })
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const [showImage, setShowImage] = useState(true)
  const [editingOrder, setEditingOrder] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const mobile = useIsMobile()
  const [tab, setTab] = useState<'nodes' | 'path' | 'image'>('path')
  const [zoom, setZoom] = useState(1)
  const importRef = useRef<HTMLInputElement>(null)

  const totals = useMemo(() => {
    let spent = 0, total = 0, erdaSpent = 0, erdaTotal = 0
    for (const n of profile.nodes) {
      const s = costBetween(n, 0, profile.levels[n.id] ?? 0); const t = totalToMax(n)
      spent += s.frags; total += t.frags; erdaSpent += s.erda; erdaTotal += t.erda
    }
    return { spent, total, erdaSpent, erdaTotal, pct: total ? (spent / total) * 100 : 0 }
  }, [profile])

  /** the checkpoint list actually used: derived from the leveling order, or the manual list */
  const checkpoints: HexaCheckpoint[] = useMemo(() => {
    if (!profile.autoPath) return profile.path
    const sim: Record<string, number> = { ...profile.levels }
    const out: HexaCheckpoint[] = []
    for (const o of profile.order) {
      if ((sim[o.nodeId] ?? 0) >= o.level) continue            // already there → skip
      sim[o.nodeId] = o.level
      out.push({ id: `${o.nodeId}:${o.level}`, nodeId: o.nodeId, targetLevel: o.level })
    }
    return out
  }, [profile])

  const steps: Step[] = useMemo(() => {
    const sim: Record<string, number> = { ...profile.levels }
    let cum = 0, budget = profile.fragmentsOwned, cumDays = 0
    const perDay = Math.max(0.0001, profile.fragsPerDay)
    return checkpoints.map(cp => {
      const node = profile.nodes.find(n => n.id === cp.nodeId) ?? { id: cp.nodeId, name: '(deleted node)', type: 'mastery' as HexaNodeType }
      const from = sim[cp.nodeId] ?? 0
      const target = Math.max(from, cp.targetLevel)
      const { frags, erda } = costBetween(node, from, target)
      sim[cp.nodeId] = target
      const done = frags === 0
      const net = Math.max(0, frags - budget); budget = Math.max(0, budget - frags)
      const days = net / perDay; cum += frags; cumDays += days
      return { ...cp, node, from, frags, erda, cumFrags: cum, done, days, cumDays }
    })
  }, [checkpoints, profile])
  const nextStep = steps.find(s => !s.done)
  const remaining = steps.reduce((a, s) => a + s.frags, 0)

  // manual checkpoint ops
  function addCheckpoint() {
    const first = profile.nodes[0]; if (!first) return
    save({ path: [...profile.path, { id: nanoid(6), nodeId: first.id, targetLevel: Math.min(maxLevel(first.type), (profile.levels[first.id] ?? 0) + 1) }] })
  }
  function updCp(id: string, patch: Partial<HexaCheckpoint>) { save({ path: profile.path.map(c => c.id === id ? { ...c, ...patch } : c) }) }
  function move(i: number, d: -1 | 1) {
    const p = [...profile.path]; const j = i + d; if (j < 0 || j >= p.length) return
    ;[p[i], p[j]] = [p[j], p[i]]; save({ path: p })
  }
  function completeStep(s: Step) { setLevel(s.nodeId, Math.max(profile.levels[s.nodeId] ?? 0, s.targetLevel)) }

  // node ops
  function addNode(type: HexaNodeType) {
    const id = `${type}-${nanoid(4)}`
    save({ nodes: [...profile.nodes, { id, name: `New ${NODE_TYPE_LABEL[type]} node`, type }], levels: { ...profile.levels, [id]: 0 } })
  }
  function updNode(id: string, patch: Partial<HexaNodeDef>) { save({ nodes: profile.nodes.map(n => n.id === id ? { ...n, ...patch } : n) }) }
  function removeNode(id: string) {
    if (!confirm('Remove this node (and its checkpoints)?')) return
    const levels = { ...profile.levels }; delete levels[id]
    save({ nodes: profile.nodes.filter(n => n.id !== id), levels, path: profile.path.filter(c => c.nodeId !== id), order: profile.order.filter(o => o.nodeId !== id) })
  }
  function resetFromClass() {
    if (!confirm(`Reset nodes and leveling order to the ${cls?.name ?? 'generic'} template? Current levels are kept.`)) return
    const nodes = (cls?.nodes ?? GENERIC_NODES).map(n => ({ ...n }))
    const levels: Record<string, number> = {}
    for (const n of nodes) levels[n.id] = profile.levels[n.id] ?? (n.type === 'origin' ? 1 : 0)
    save({ nodes, levels, order: cls?.order ?? [], autoPath: !!cls?.order?.length, path: profile.path.filter(c => nodes.some(n => n.id === c.nodeId)) })
  }
  function onImage(file: File | undefined) {
    if (!file) return
    const r = new FileReader(); r.onload = () => save({ pathImage: String(r.result) }); r.readAsDataURL(file)
  }
  async function applyImport(o: ImportOutcome) {
    // keep current levels where node names match (case-insensitive)
    const levels: Record<string, number> = {}
    for (const n of o.nodes) {
      const old = profile.nodes.find(x => x.name.trim().toLowerCase() === n.name.trim().toLowerCase())
      levels[n.id] = old ? (profile.levels[old.id] ?? 0) : (n.type === 'origin' ? 1 : 0)
    }
    await save({ nodes: o.nodes, levels, order: o.order, autoPath: o.order.length > 0, path: [], pathImage: o.imageDataUrl })
    if (o.templateId) await updateCharacter(character.id, { classId: `tpl:${o.templateId}`, ...(o.classKey ? { classKey: o.classKey } : {}) })
    else if (o.classKey && !character.classKey) await updateCharacter(character.id, { classKey: o.classKey })
    setImportFile(null)
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto">
      {/* header */}
      <div className={`flex flex-wrap items-center border-b border-line ${mobile ? 'gap-3 px-3 py-2' : 'gap-6 px-6 py-4'}`}>
        <div className="min-w-0 flex-1">
          <h1 className={`font-semibold ${mobile ? 'text-base' : 'text-lg'}`}>HEXA{mobile ? '' : ` · ${character.name}`}</h1>
          <div className="text-xs text-muted">{cls?.name ?? 'Generic template'} · {profile.nodes.length} nodes{profile.autoPath && profile.order.length ? ` · path from ${cls?.orderSource ?? 'custom order'}` : ''}</div>
        </div>
        <Field label="Fragments owned"><input type="number" value={profile.fragmentsOwned || ''} placeholder="0" onChange={e => save({ fragmentsOwned: Number(e.target.value) })} className="w-24 text-center" /></Field>
        <Field label="Fragments / day"><input type="number" value={profile.fragsPerDay || ''} placeholder="0" onChange={e => save({ fragsPerDay: Number(e.target.value) })} className="w-24 text-center" /></Field>
        <div className="min-w-[240px]">
          <div className="label mb-1">Completion · {totals.pct.toFixed(2)}%</div>
          <div className="h-2 w-full overflow-hidden rounded bg-panel-2"><div className="h-full bg-accent" style={{ width: `${totals.pct}%` }} /></div>
          <div className="mt-1 text-[11px] text-muted">{fmt(totals.spent)} / {fmt(totals.total)} frags · {fmt(totals.erdaSpent)} / {fmt(totals.erdaTotal)} erda</div>
        </div>
      </div>

      {profile.order.length === 0 && !!cls?.order?.length && !profile.autoPath && (
        <div className="flex items-center gap-3 border-b border-line bg-rare/10 px-6 py-2 text-sm">
          <span className="text-muted">A leveling order for {cls.name} is available ({cls.order.length} steps, {cls.orderSource}).</span>
          <button className="btn btn-sm btn-primary" onClick={() => save({ order: cls.order!, autoPath: true, nodes: profile.nodes.map(n => ({ ...n, icon: n.icon ?? cls.nodes.find(c => c.id === n.id)?.icon })) })}>Use it</button>
        </div>
      )}

      {nextStep && (
        <div className="flex items-center gap-3 border-b border-line bg-accent/5 px-6 py-2 text-sm">
          <span className="label text-accent">Next</span>
          <NodeIcon node={nextStep.node} size={22} />
          <span className="font-medium">{nextStep.node.name}</span>
          <span className="text-muted">{nextStep.from} → {nextStep.targetLevel}</span>
          <span className="text-muted">· {fmt(nextStep.frags)} frags · {nextStep.erda} erda · {nextStep.days <= 0 ? 'affordable now' : `~${nextStep.days.toFixed(1)} days`}</span>
          <button className="btn btn-sm ml-auto" onClick={() => completeStep(nextStep)}>Mark done</button>
        </div>
      )}

      {mobile && (
        <div className="flex gap-1 border-b border-line px-3 py-2">
          {(['nodes', 'path', 'image'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-md px-2 py-1.5 text-xs capitalize ${tab === t ? 'bg-accent/15 text-accent' : 'bg-panel-2 text-muted'}`}>{t}</button>
          ))}
        </div>
      )}
      <div className={`grid flex-1 grid-cols-1 ${mobile ? 'gap-3 p-3' : 'gap-6 p-6 xl:grid-cols-[1fr_1fr]'}`}>
        {/* nodes by group */}
        <div className={`card p-4 ${mobile && tab !== 'nodes' ? 'hidden' : ''}`}>
          <div className="mb-3 flex items-center justify-between">
            <span className="label">Nodes · current levels</span>
            <div className="flex items-center gap-1">
              <select className="w-auto py-1 text-xs" value="" onChange={e => { if (e.target.value) addNode(e.target.value as HexaNodeType) }}>
                <option value="">+ add node…</option>
                {GROUPS.flatMap(g => GROUP_TYPES[g].map(t => <option key={t} value={t}>{GROUP_LABEL[g]} · {NODE_TYPE_LABEL[t]}</option>))}
              </select>
              <button className="btn btn-ghost btn-sm" title="Reset nodes + order to class template" onClick={resetFromClass}><RotateCcw size={13} /></button>
            </div>
          </div>
          {GROUPS.map(g => {
            const nodes = profile.nodes.filter(n => GROUP_OF[n.type] === g)
            if (!nodes.length) return null
            return (
              <div key={g} className="mb-4">
                <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wider" style={{ color: GROUP_COLOR[g] }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: GROUP_COLOR[g] }} />{GROUP_LABEL[g]}
                  {g === 'stat' && <span className="normal-case tracking-normal text-muted">· random cost, estimated at {STAT_FRAGS_PER_LEVEL} frags/level</span>}
                </div>
                {nodes.map(n => <NodeRow key={n.id} node={n} level={profile.levels[n.id] ?? 0} onLevel={l => setLevel(n.id, l)} onChange={p => updNode(n.id, p)} onRemove={() => removeNode(n.id)} />)}
              </div>
            )
          })}
        </div>

        {/* path */}
        <div className={mobile ? 'space-y-3' : 'space-y-6'}>
          <div className={`card p-4 ${mobile && tab !== 'path' ? 'hidden' : ''}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="label">Upgrade path · {profile.autoPath ? 'auto from leveling order' : 'manual checkpoints'}</span>
              <div className="flex items-center gap-1">
                <button className={`btn btn-sm ${profile.autoPath ? 'btn-primary' : ''}`} title="Derive checkpoints from the leveling order and current levels" onClick={() => save({ autoPath: !profile.autoPath })}><Wand2 size={12} />Auto</button>
                <button className="btn btn-sm" onClick={() => setEditingOrder(true)}><ListOrdered size={12} />Order ({profile.order.length})</button>
                {!profile.autoPath && <button className="btn btn-sm" onClick={addCheckpoint}><Plus size={12} />Checkpoint</button>}
              </div>
            </div>

            {steps.length === 0 && (
              <div className="py-6 text-center text-xs text-muted">
                {profile.autoPath
                  ? (profile.order.length ? 'Everything in the leveling order is done 🎉' : 'No leveling order yet — click "Order" and paste one (one "node → level" per line), or switch Auto off and add checkpoints by hand.')
                  : 'No checkpoints yet. Add steps like "HEXA Quintuple Star → 6" in the order you plan to upgrade.'}
              </div>
            )}

            <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
              {steps.map((s, i) => (
                <div key={s.id} style={mobile ? { whiteSpace: 'pre-line' } : undefined} className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm ${s.done ? 'border-transparent opacity-40' : s.id === nextStep?.id ? 'border-accent/50 bg-accent/5' : 'border-line'}`}>
                  <span className="w-6 text-right text-[11px] text-muted">{i + 1}</span>
                  <NodeIcon node={s.node} size={22} />
                  {profile.autoPath ? (
                    <span className={`min-w-0 flex-1 text-xs ${mobile ? 'whitespace-normal leading-tight' : 'truncate'}`}>{s.node.name}</span>
                  ) : (
                    <select value={s.nodeId} onChange={e => updCp(s.id, { nodeId: e.target.value })} className="min-w-0 flex-1 py-1 text-xs">
                      {profile.nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                  )}
                  <span className="text-[11px] text-muted">{s.from}</span><ChevronRight size={12} className="text-muted" />
                  {profile.autoPath
                    ? <span className="w-8 text-center text-xs font-medium">{s.targetLevel}</span>
                    : <input type="number" min={1} max={30} value={s.targetLevel} onChange={e => updCp(s.id, { targetLevel: Math.max(1, Math.min(30, Number(e.target.value))) })} className="w-14 py-1 text-center text-xs" />}
                  <span className={`${mobile ? 'w-16 text-[10px] leading-tight' : 'w-28 text-[11px]'} text-right text-muted`} title={`cumulative ${fmt(s.cumFrags)} frags · ${s.erda} erda`}>
                    {s.done ? 'done' : mobile ? `${fmt(s.frags)}f\n${s.cumDays < 0.05 ? 'now' : `${s.cumDays.toFixed(1)}d`}` : `${fmt(s.frags)}f · ${s.erda}e · ${s.cumDays < 0.05 ? 'now' : `${s.cumDays.toFixed(1)}d`}`}
                  </span>
                  {!profile.autoPath && <>
                    <button className="btn btn-ghost btn-sm" onClick={() => move(i, -1)}><ArrowUp size={12} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => move(i, 1)}><ArrowDown size={12} /></button>
                    <button className="btn btn-ghost btn-sm" onClick={() => save({ path: profile.path.filter(c => c.id !== s.id) })}><Trash2 size={12} /></button>
                  </>}
                  {profile.autoPath && s.id === nextStep?.id && <button className="btn btn-ghost btn-sm" title="Mark done" onClick={() => completeStep(s)}>✓</button>}
                </div>
              ))}
            </div>
            {steps.length > 0 && (
              <div className="mt-3 text-[11px] text-muted">
                {steps.length} steps left · {fmt(remaining)} frags · {fmt(steps.reduce((a, s) => a + s.erda, 0))} erda · ~{steps[steps.length - 1].cumDays.toFixed(0)} days at {profile.fragsPerDay}/day (fragments owned applied to the first steps).
              </div>
            )}
          </div>

          <div className={`card p-4 ${mobile && tab !== 'image' ? 'hidden' : ''}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="label">Leveling-order image</span>
              <div className="flex gap-1">
                {profile.pathImage && <div className="flex gap-0.5">{[1, 2, 3].map(z => <button key={z} className={`btn btn-sm ${zoom === z ? 'btn-primary' : ''}`} onClick={() => setZoom(z)}>{z}×</button>)}</div>}
                {profile.pathImage && <button className="btn btn-ghost btn-sm" onClick={() => setShowImage(v => !v)}>{showImage ? 'Hide' : 'Show'}</button>}
                {profile.pathImage && <button className="btn btn-ghost btn-sm" onClick={() => save({ pathImage: null })}><X size={12} /></button>}
                <button className="btn btn-sm" onClick={() => fileRef.current?.click()}><ImageIcon size={12} />{profile.pathImage ? 'Replace' : 'Upload'}</button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => onImage(e.target.files?.[0])} />
                <button className="btn btn-sm btn-primary" title="Read skills, icons and the leveling order from a chart image" onClick={() => importRef.current?.click()}><ScanSearch size={12} />Import chart</button>
                <input ref={importRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setImportFile(f); e.target.value = '' }} />
              </div>
            </div>
            <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setImportFile(f) }}
              className="flex min-h-[100px] items-center justify-center rounded-md border border-dashed border-line-2 bg-panel-2/40">
              {profile.pathImage && showImage
                ? <div className="w-full overflow-auto" style={{ maxHeight: '70vh', touchAction: 'pan-x pan-y' }}>
                    <img src={profile.pathImage} alt="HEXA path" className="rounded" style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} />
                  </div>
                : <span className="px-4 text-center text-xs text-muted">Drop a leveling-order chart here to import its skills, icons and order — any class, any layout (legend + rows, or labelled tiles).</span>}
            </div>
          </div>
        </div>
      </div>

      {importFile && <ChartImportDialog file={importFile} className={cls?.name ?? character.job ?? 'My class'} classKey={character.classKey || classKeyForJob(character.job)} onClose={() => setImportFile(null)} onApply={applyImport} />}
      {editingOrder && <OrderEditor profile={profile} onClose={() => setEditingOrder(false)} onSave={(order) => { save({ order, autoPath: order.length > 0 }); setEditingOrder(false) }} />}
    </div>
  )
}

/** Textarea editor: one "node name → level" per line (also accepts "name: level", "name level", "name,level"). */
function OrderEditor({ profile, onClose, onSave }: { profile: HexaProfile; onClose: () => void; onSave: (o: HexaOrderStep[]) => void }) {
  const nameOf = (id: string) => profile.nodes.find(n => n.id === id)?.name ?? id
  const [text, setText] = useState(profile.order.map(o => `${nameOf(o.nodeId)} → ${o.level}`).join('\n'))
  const [err, setErr] = useState('')

  function parse(): HexaOrderStep[] | null {
    const out: HexaOrderStep[] = []; const bad: string[] = []
    for (const raw of text.split('\n')) {
      const line = raw.trim(); if (!line) continue
      const m = line.match(/^(.*?)\s*(?:→|->|:|,|\s)\s*(\d{1,2})$/)
      if (!m) { bad.push(line); continue }
      const name = m[1].trim().toLowerCase(); const level = Number(m[2])
      const node = profile.nodes.find(n => n.name.toLowerCase() === name || n.id.toLowerCase() === name)
        ?? profile.nodes.find(n => n.name.toLowerCase().startsWith(name) || n.name.toLowerCase().includes(name))
      if (!node) { bad.push(line); continue }
      out.push({ nodeId: node.id, level })
    }
    if (bad.length) { setErr(`Couldn't match ${bad.length} line(s): ${bad.slice(0, 3).join(' | ')}${bad.length > 3 ? ' …' : ''}`); return null }
    return out
  }

  return (
    <Modal title="Leveling order" onClose={onClose} wide>
      <div className="mb-2 text-xs text-muted">One step per line: <code>node name → level</code>. Names match your node list (partial names are fine). The upgrade path is derived from this list and your current levels, so steps you've already passed disappear automatically.</div>
      <textarea rows={18} value={text} onChange={e => { setText(e.target.value); setErr('') }} className="font-mono text-xs" spellCheck={false} />
      {err && <div className="mt-1 text-xs text-red-400">{err}</div>}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-[11px] text-muted">Nodes: {profile.nodes.map(n => n.name).join(' · ')}</div>
        <div className="flex gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { const o = parse(); if (o) onSave(o) }}>Save order</button>
        </div>
      </div>
    </Modal>
  )
}

function NodeIcon({ node, size = 28 }: { node: HexaNodeDef; size?: number }) {
  const g = GROUP_OF[node.type]
  return node.icon
    ? <img src={node.icon} alt="" className="pixel shrink-0 rounded" style={{ width: size, height: size, imageRendering: 'pixelated' }} />
    : <span className="flex shrink-0 items-center justify-center rounded text-[10px] font-semibold" style={{ width: size, height: size, background: `${GROUP_COLOR[g]}22`, color: GROUP_COLOR[g] }}>{node.name.replace(/^HEXA\s+/i, '').slice(0, 2).toUpperCase()}</span>
}

function NodeRow({ node, level, onLevel, onChange, onRemove }: { node: HexaNodeDef; level: number; onLevel: (l: number) => void; onChange: (p: Partial<HexaNodeDef>) => void; onRemove: () => void }) {
  const max = maxLevel(node.type)
  const toMax = costBetween(node, level, max)
  const iconRef = useRef<HTMLInputElement>(null)
  function pickIcon(file: File | undefined) {
    if (!file) return
    const r = new FileReader(); r.onload = () => onChange({ icon: String(r.result) }); r.readAsDataURL(file)
  }
  return (
    <div className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-panel-2">
      <button title="Click to set icon (image file); right-click to paste an image URL" onClick={() => iconRef.current?.click()}
        onContextMenu={e => { e.preventDefault(); const u = prompt('Icon image URL (empty to clear):', node.icon?.startsWith('data:') ? '' : node.icon ?? ''); if (u !== null) onChange({ icon: u || undefined }) }}
        className="rounded border border-transparent hover:border-line-2">
        <NodeIcon node={node} />
      </button>
      <input ref={iconRef} type="file" accept="image/*" className="hidden" onChange={e => pickIcon(e.target.files?.[0])} />
      <input value={node.name} onChange={e => onChange({ name: e.target.value })} className="min-w-0 flex-1 border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-line" />
      <span className="w-16 text-right text-[10px] uppercase tracking-wider text-muted">{NODE_TYPE_LABEL[node.type]}</span>
      <button className="btn btn-ghost btn-sm" onClick={() => onLevel(level - 1)}>−</button>
      <input type="number" min={0} max={max} value={level} onChange={e => onLevel(Number(e.target.value))} className={`w-12 py-0.5 text-center text-sm ${level >= max ? 'text-legendary' : ''}`} />
      <button className="btn btn-ghost btn-sm" onClick={() => onLevel(level + 1)}>+</button>
      <span className="w-24 text-right text-[11px] text-muted">{level >= max ? 'MAX' : `${fmt(toMax.frags)} to max`}</span>
      <button className="btn btn-ghost btn-sm opacity-0 group-hover:opacity-100" onClick={onRemove}><Trash2 size={12} /></button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="label mb-1">{label}</div>{children}</div>
}
function fmt(n: number) { return n.toLocaleString() }
