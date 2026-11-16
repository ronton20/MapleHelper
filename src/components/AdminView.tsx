import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, Lock, Pencil, RefreshCw, RotateCcw, Save, Trash2, Upload, X } from 'lucide-react'
import { listTemplates, fetchTemplate, adminSave, adminDelete, getAdminKey, clearAdminKey, type LibraryEntry } from '../api/library'
import { CLASS_BY_KEY } from '../data/gmsClasses'
import { ClassOptions } from './ClassOptions'
import { GROUPS, GROUP_LABEL, GROUP_TYPES, NODE_TYPE_LABEL, maxLevel } from '../data/hexaCosts'
import { useUI } from '../store'
import { Modal } from './Sidebar'
import { SkillBankAdmin } from './admin/SkillBankAdmin'
import { useBanks, loadBanks } from '../api/bank'
import { linkNodesToBank } from '../lib/chart/bankMatch'
import { nodeIcon, SLOT_BY_KEY, SLOTS, coreName } from '../data/skillBank'
import type { ClassTemplate, HexaNodeDef, HexaNodeType, HexaOrderStep } from '../types'

/** Admin panel for the shared template library. Unlocked with the worker's ADMIN_KEY (Settings → Admin). */
export function AdminView() {
  const { setView } = useUI()
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<ClassTemplate | null>(null)
  const [section, setSection] = useState<'templates' | 'bank'>('templates')
  const [bankReload, setBankReload] = useState(0)

  async function load() {
    setLoading(true); setErr('')
    try { setEntries(await listTemplates()) } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }
  useEffect(() => { if (getAdminKey()) load() }, [])

  if (!getAdminKey()) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
        <div>Admin is locked. Unlock it from Settings → Admin.<div className="mt-3"><button className="btn" onClick={() => setView('settings')}>Go to Settings</button></div></div>
      </div>
    )
  }

  const shown = entries.filter(e => (!filter || e.classKey === filter) && (!q || e.name.toLowerCase().includes(q.toLowerCase())))
  const byClass = new Map<string, LibraryEntry[]>()
  for (const e of shown) { const k = e.classKey || ''; byClass.set(k, [...(byClass.get(k) ?? []), e]) }
  const classOrder = [...byClass.keys()].sort((a, b) => (CLASS_BY_KEY[a]?.name ?? 'zzz' + a).localeCompare(CLASS_BY_KEY[b]?.name ?? 'zzz' + b))

  async function remove(e: LibraryEntry) {
    if (!confirm(`Delete "${e.name}" (${CLASS_BY_KEY[e.classKey]?.name ?? 'no class'}) from the shared library? This can't be undone.`)) return
    try { await adminDelete(e.id); setEntries(es => es.filter(x => x.id !== e.id)) } catch (er) { alert((er as Error).message) }
  }
  const [linkMsg, setLinkMsg] = useState('')
  /** older shared data has chart crops as icons and no skill-bank cores → link every node to its bank core */
  async function linkAll() {
    if (!confirm(`Link all ${shown.length} shown saves to the skill bank? Nodes are matched by icon, then by name; icons the bank has are removed from the saves.`)) return
    let changed = 0, failed = 0, unlinked = 0
    for (const [i, e] of shown.entries()) {
      setLinkMsg(`Linking ${i + 1}/${shown.length}…`)
      try {
        if (!e.classKey) continue
        const t = await fetchTemplate(e.id)
        const banks = await loadBanks(e.classKey)
        const r = await linkNodesToBank(t.nodes, banks.cls, banks.common)
        if (!r) continue
        await adminSave({ ...t, nodes: r.nodes }); changed++; unlinked += r.unlinked
      } catch { failed++ }
    }
    setLinkMsg(`Linked ${changed} save(s)${unlinked ? ` · ${unlinked} node(s) still without a core – open the save to pick it` : ''}${failed ? ` · ${failed} failed` : ''}.`)
    load()
  }
  async function open(e: LibraryEntry) {
    try { setEditing(await fetchTemplate(e.id)) } catch (er) { alert((er as Error).message) }
  }
  async function download(e: LibraryEntry) {
    const t = await fetchTemplate(e.id)
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' })); a.download = `${e.classKey || 'template'}-${e.name.replace(/[^\w-]+/g, '_')}.json`; a.click()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => setView('settings')}><ArrowLeft size={14} /></button>
          <h1 className="flex-1 text-lg font-semibold">Shared library · admin</h1>
          <div className="flex gap-0.5">
            <button className={`btn btn-sm ${section === 'templates' ? 'btn-primary' : ''}`} onClick={() => setSection('templates')}>HEXA data</button>
            <button className={`btn btn-sm ${section === 'bank' ? 'btn-primary' : ''}`} onClick={() => setSection('bank')}>Skill bank</button>
          </div>
          <button className="btn btn-sm" onClick={() => section === 'templates' ? load() : setBankReload(n => n + 1)} disabled={section === 'templates' && loading}><RefreshCw size={12} className={section === 'templates' && loading ? 'animate-spin' : ''} />Refresh</button>
          <button className="btn btn-sm" onClick={() => { clearAdminKey(); setView('settings') }}><Lock size={12} />Lock</button>
        </div>
        {section === 'bank' ? <SkillBankAdmin reload={bankReload} /> : <>
        <div className="flex flex-wrap gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)} className="w-auto min-w-[12rem]">
            <option value="">All classes ({entries.length})</option>
            <ClassOptions suffix={c => { const n = entries.filter(e => e.classKey === c.key).length; return n ? ` (${n})` : '' }} />
          </select>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name…" className="w-auto min-w-[12rem] flex-1" />
          <button className="btn" onClick={linkAll} disabled={!shown.length} title="Match every node of the shown saves to its skill-bank core (Mastery 1-4, Boost 1-4 …)">Link to skill bank</button>
        </div>
        {linkMsg && <div className="text-xs text-muted">{linkMsg}</div>}
        {err && <div className="text-sm text-red-400">{err}</div>}
        {!loading && shown.length === 0 && <div className="py-8 text-center text-sm text-muted">Nothing here.</div>}
        {classOrder.map(k => (
          <section key={k || 'none'} className="card p-3">
            <div className="label mb-2">{CLASS_BY_KEY[k]?.name ?? (k ? k : 'No class (legacy)')} · {byClass.get(k)!.length}</div>
            <div className="divide-y divide-line">
              {byClass.get(k)!.map(e => (
                <div key={e.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{e.name}</div>
                    <div className="truncate text-[11px] text-muted">{e.nodes} nodes · {e.steps} steps · updated {new Date(e.updatedAt).toLocaleDateString()} · {e.source}</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => open(e)}><Pencil size={12} />Edit</button>
                  <button className="btn btn-sm" title="Download JSON" onClick={() => download(e)}><Download size={12} /></button>
                  <button className="btn btn-sm btn-danger" title="Delete" onClick={() => remove(e)}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </section>
        ))}
        </>}
      </div>
      {editing && <TemplateEditor tpl={editing} onClose={() => setEditing(null)} onSaved={t => { setEditing(null); setEntries(es => es.map(x => x.id === t.id ? { ...x, name: t.name, classKey: t.classKey ?? '', nodes: t.nodes.length, steps: t.order.length, updatedAt: Date.now() } : x)) }} />}
    </div>
  )
}

function TemplateEditor({ tpl, onClose, onSaved }: { tpl: ClassTemplate; onClose: () => void; onSaved: (t: ClassTemplate) => void }) {
  const [name, setName] = useState(tpl.name)
  const [classKey, setClassKey] = useState(tpl.classKey ?? '')
  const [nodes, setNodes] = useState<HexaNodeDef[]>(tpl.nodes)
  const banks = useBanks(classKey || undefined)
  const nameOf = (id: string) => tpl.nodes.find(n => n.id === id)?.name ?? id
  const [orderText, setOrderText] = useState(tpl.order.map(o => `${nameOf(o.nodeId)} → ${o.level}`).join('\n'))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const parsed = useMemo(() => parseOrder(orderText, nodes), [orderText, nodes])

  function updNode(id: string, patch: Partial<HexaNodeDef>) {
    // keep order text in sync when a node is renamed
    if (patch.name !== undefined) {
      const old = nodes.find(n => n.id === id)?.name
      if (old) setOrderText(t => t.split('\n').map(l => l.replace(new RegExp(`^${escapeRe(old)}(?=\\s*(→|->|:|,|\\s)\\s*\\d{1,2}\\s*$)`), patch.name!)).join('\n'))
    }
    setNodes(ns => ns.map(n => n.id === id ? { ...n, ...patch } : n))
  }

  async function save() {
    if (parsed.bad.length) { setErr(`Fix ${parsed.bad.length} order line(s) first: ${parsed.bad.slice(0, 3).join(' | ')}`); return }
    if (!classKey) { setErr('Pick a class.'); return }
    setBusy(true); setErr('')
    const next: ClassTemplate = { ...tpl, name: name.trim() || tpl.name, classKey, nodes, order: parsed.order }
    try { await adminSave(next); onSaved(next) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  async function replaceFromFile(f: File | undefined) {
    if (!f) return
    try {
      const t = JSON.parse(await f.text()) as ClassTemplate
      if (!Array.isArray(t.nodes) || !Array.isArray(t.order)) throw new Error('Not a template file')
      setName(t.name ?? name); setClassKey(t.classKey ?? classKey); setNodes(t.nodes)
      setOrderText(t.order.map(o => `${t.nodes.find(n => n.id === o.nodeId)?.name ?? o.nodeId} → ${o.level}`).join('\n'))
    } catch (e) { setErr((e as Error).message) }
  }

  return (
    <Modal title="Edit shared template" onClose={onClose} xwide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1fr]">
          <label className="text-xs"><span className="label mb-1 block">Save name</span><input value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="text-xs"><span className="label mb-1 block">Class</span>
            <select value={classKey} onChange={e => setClassKey(e.target.value)}>
              <option value="">Select a class…</option>
              <ClassOptions />
            </select>
          </label>
        </div>

        <section>
          <div className="mb-1 flex items-center gap-2">
            <span className="label flex-1">Nodes · {nodes.length}{nodes.some(n => !n.slot) ? ` · ${nodes.filter(n => !n.slot).length} without a skill-bank core` : ''}</span>
            {nodes.some(n => !n.slot) && <button className="btn btn-sm" onClick={async () => { const r = await linkNodesToBank(nodes, banks.cls, banks.common); if (r) setNodes(r.nodes) }}>Link to skill bank</button>}
            {nodes.some(n => n.slot && coreName(n.slot, banks.cls, banks.common) !== n.name) && <button className="btn btn-sm" title="Rename every linked node to its skill bank name" onClick={() => { for (const n of nodes) if (n.slot && coreName(n.slot, banks.cls, banks.common) !== n.name) updNode(n.id, { name: coreName(n.slot, banks.cls, banks.common) }) }}><RotateCcw size={12} />Reset all names</button>}
          </div>
          <div className="grid grid-cols-1 gap-1 lg:grid-cols-2">
            {nodes.map(n => (
              <div key={n.id} className="flex items-center gap-2 rounded-md border border-line px-2 py-1">
                {nodeIcon(n, banks.cls, banks.common) ? <img src={nodeIcon(n, banks.cls, banks.common)} alt="" title={n.slot ? SLOT_BY_KEY[n.slot]?.label : 'not linked to the skill bank'} className="pixel h-7 w-7 rounded" /> : <span className="h-7 w-7 rounded bg-panel-2" />}
                <input value={n.name} onChange={e => updNode(n.id, { name: e.target.value })} className="min-w-0 flex-1 py-1 text-xs" />
                {n.slot && coreName(n.slot, banks.cls, banks.common) !== n.name && <button className="btn btn-ghost btn-sm" title={`Reset to the skill bank name: ${coreName(n.slot, banks.cls, banks.common)}`} onClick={() => updNode(n.id, { name: coreName(n.slot!, banks.cls, banks.common) })}><RotateCcw size={12} /></button>}
                <select value={n.slot ? `slot:${n.slot}` : `type:${n.type}`} title="Skill-bank core" onChange={e => {
                  const v = e.target.value
                  if (v.startsWith('slot:')) { const d = SLOT_BY_KEY[v.slice(5)]; const { icon: _i, ...rest } = n; setNodes(ns => ns.map(x => x.id === n.id ? { ...rest, slot: d.key, type: d.type, ...(d.unlockFrags ? { unlockFrags: d.unlockFrags, unlockErda: d.unlockErda } : {}) } : x)) }
                  else updNode(n.id, { slot: undefined, type: v.slice(5) as HexaNodeType })
                }} className={`w-48 shrink-0 py-1 text-xs ${n.slot ? '' : 'border-accent/60'}`}>
                  <optgroup label="Skill-bank cores">
                    {SLOTS.filter(d => d.key !== 'stat').map(d => <option key={d.key} value={`slot:${d.key}`} disabled={d.key !== n.slot && nodes.some(x => x.slot === d.key)}>{d.label}{coreName(d.key, banks.cls, banks.common) !== d.label ? ` · ${coreName(d.key, banks.cls, banks.common)}` : ''}</option>)}
                  </optgroup>
                  <optgroup label="No core (type only)">
                    {GROUPS.flatMap(g => GROUP_TYPES[g].map(t => <option key={t} value={`type:${t}`}>{GROUP_LABEL[g]} · {NODE_TYPE_LABEL[t]}</option>))}
                  </optgroup>
                </select>
                <button className="btn btn-ghost btn-sm" title="Remove node" onClick={() => { if (confirm(`Remove ${n.name}? Its order lines will need fixing.`)) setNodes(ns => ns.filter(x => x.id !== n.id)) }}><X size={12} /></button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-1 flex items-center justify-between">
            <span className="label">Leveling order · {parsed.order.length} steps{parsed.bad.length ? <span className="text-red-400"> · {parsed.bad.length} unmatched</span> : ''}</span>
            <span className="text-[11px] text-muted">one "node name → level" per line</span>
          </div>
          <textarea rows={12} value={orderText} onChange={e => setOrderText(e.target.value)} className="font-mono text-xs" spellCheck={false} />
        </section>

        {err && <div className="text-xs text-red-400">{err}</div>}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <label className="btn btn-sm cursor-pointer"><Upload size={12} />Replace from JSON<input type="file" accept="application/json" className="hidden" onChange={e => replaceFromFile(e.target.files?.[0])} /></label>
          <div className="ml-auto flex gap-2">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}><Save size={14} />Save to library</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function parseOrder(text: string, nodes: HexaNodeDef[]): { order: HexaOrderStep[]; bad: string[] } {
  const order: HexaOrderStep[] = []; const bad: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim(); if (!line) continue
    const m = line.match(/^(.*?)\s*(?:→|->|:|,|\s)\s*(\d{1,2})$/)
    if (!m) { bad.push(line); continue }
    const nm = m[1].trim().toLowerCase()
    const node = nodes.find(n => n.name.trim().toLowerCase() === nm || n.id.toLowerCase() === nm)
    if (!node) { bad.push(line); continue }
    order.push({ nodeId: node.id, level: Math.max(1, Math.min(maxLevel(node.type), Number(m[2]))) })
  }
  return { order, bad }
}
