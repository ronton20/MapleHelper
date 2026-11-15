import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, Lock, Pencil, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react'
import { listTemplates, fetchTemplate, adminSave, adminDelete, getAdminKey, clearAdminKey, type LibraryEntry } from '../api/library'
import { CLASS_BY_KEY } from '../data/gmsClasses'
import { ClassOptions } from './ClassOptions'
import { GROUPS, GROUP_LABEL, GROUP_TYPES, NODE_TYPE_LABEL, maxLevel } from '../data/hexaCosts'
import { useUI } from '../store'
import { Modal } from './Sidebar'
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
          <button className="btn btn-sm" onClick={load} disabled={loading}><RefreshCw size={12} className={loading ? 'animate-spin' : ''} />Refresh</button>
          <button className="btn btn-sm" onClick={() => { clearAdminKey(); setView('settings') }}><Lock size={12} />Lock</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)} className="w-auto min-w-[12rem]">
            <option value="">All classes ({entries.length})</option>
            <ClassOptions suffix={c => { const n = entries.filter(e => e.classKey === c.key).length; return n ? ` (${n})` : '' }} />
          </select>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name…" className="w-auto min-w-[12rem] flex-1" />
        </div>
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
      </div>
      {editing && <TemplateEditor tpl={editing} onClose={() => setEditing(null)} onSaved={t => { setEditing(null); setEntries(es => es.map(x => x.id === t.id ? { ...x, name: t.name, classKey: t.classKey ?? '', nodes: t.nodes.length, steps: t.order.length, updatedAt: Date.now() } : x)) }} />}
    </div>
  )
}

function TemplateEditor({ tpl, onClose, onSaved }: { tpl: ClassTemplate; onClose: () => void; onSaved: (t: ClassTemplate) => void }) {
  const [name, setName] = useState(tpl.name)
  const [classKey, setClassKey] = useState(tpl.classKey ?? '')
  const [nodes, setNodes] = useState<HexaNodeDef[]>(tpl.nodes)
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
          <div className="label mb-1">Nodes · {nodes.length}</div>
          <div className="grid grid-cols-1 gap-1 lg:grid-cols-2">
            {nodes.map(n => (
              <div key={n.id} className="flex items-center gap-2 rounded-md border border-line px-2 py-1">
                {n.icon ? <img src={n.icon} alt="" className="pixel h-7 w-7 rounded" /> : <span className="h-7 w-7 rounded bg-panel-2" />}
                <input value={n.name} onChange={e => updNode(n.id, { name: e.target.value })} className="min-w-0 flex-1 py-1 text-xs" />
                <select value={n.type} onChange={e => updNode(n.id, { type: e.target.value as HexaNodeType })} className="w-36 shrink-0 py-1 text-xs">
                  {GROUPS.flatMap(g => GROUP_TYPES[g].map(t => <option key={t} value={t}>{GROUP_LABEL[g]} · {NODE_TYPE_LABEL[t]}</option>))}
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
