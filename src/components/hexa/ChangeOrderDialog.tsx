import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Download, RefreshCw } from 'lucide-react'
import { Modal } from '../Sidebar'
import { db, updateCharacter } from '../../db'
import { listTemplates, fetchTemplate, type LibraryEntry } from '../../api/library'
import { loadBanks } from '../../api/bank'
import { linkNodesToBank } from '../../lib/chart/bankMatch'
import { CLASS_BY_KEY } from '../../data/gmsClasses'
import type { Character, ClassTemplate, HexaNodeDef, HexaProfile } from '../../types'

interface Option { id: string; name: string; steps: number; source: string; local?: ClassTemplate; shared?: LibraryEntry; newer: boolean }

/**
 * Switch a character to another (or a newer) leveling order for its class – from data saved on this device or the
 * shared library – without importing a chart or remaking the character. Current levels are kept.
 */
export function ChangeOrderDialog({ character, profile, onClose }: { character: Character; profile: HexaProfile; onClose: () => void }) {
  const classKey = character.classKey ?? ''
  const local = useLiveQuery(() => db.templates.filter(t => t.classKey === classKey).toArray(), [classKey]) ?? []
  const [lib, setLib] = useState<LibraryEntry[]>([])
  const [libState, setLibState] = useState<'loading' | 'idle' | 'error'>('loading')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const currentId = character.classId?.startsWith('tpl:') ? character.classId.slice(4) : ''

  async function loadLib() {
    if (!classKey) { setLibState('idle'); return }
    setLibState('loading')
    try { setLib(await listTemplates(classKey)); setLibState('idle') } catch { setLib([]); setLibState('error') }
  }
  useEffect(() => { loadLib() }, [classKey])

  const options: Option[] = [
    ...local.map(t => {
      const sh = lib.find(e => e.id === t.id)
      return { id: t.id, name: t.name, steps: t.order.length, source: sh ? 'shared · on this device' : 'on this device', local: t, shared: sh, newer: !!sh && sh.updatedAt > (t.updatedAt ?? t.createdAt) + 5 * 60_000 }   // (own publishes land a few seconds after saving)
    }),
    ...lib.filter(e => !local.some(t => t.id === e.id)).map(e => ({ id: e.id, name: e.name, steps: e.steps, source: 'shared library', shared: e, newer: false })),
  ].sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId) || a.name.localeCompare(b.name))

  async function use(o: Option, refresh = false) {
    setBusy(o.id); setErr('')
    try {
      let tpl = o.local
      if (!tpl || refresh) {
        const t = await fetchTemplate(o.id)
        tpl = { ...t, classKey: t.classKey || classKey, updatedAt: o.shared?.updatedAt ?? Date.now(), source: t.source?.includes('shared') ? t.source : `${t.source ?? 'chart'} · shared library` }
        await db.templates.put(tpl)
      }
      // older data has no skill-bank cores yet → link it (by icon, then name) so icons/names come from the bank
      const banks = await loadBanks(classKey || undefined)
      const linked = await linkNodesToBank(tpl.nodes, banks.cls, banks.common)
      if (linked) { tpl = { ...tpl, nodes: linked.nodes }; await db.templates.put(tpl) }
      // new node list from the data; keep current levels (same skill-bank core, else same name);
      // nodes the new data doesn't have but that already have levels are kept so no progress is lost
      const used = new Set<string>()
      const levels: Record<string, number> = {}
      const nodes: HexaNodeDef[] = tpl.nodes.map(n => ({ ...n }))
      for (const n of nodes) {
        const old = profile.nodes.find(x => !used.has(x.id) && ((n.slot && x.slot === n.slot) || x.name.trim().toLowerCase() === n.name.trim().toLowerCase()))
        if (old) used.add(old.id)
        levels[n.id] = old ? (profile.levels[old.id] ?? 0) : (n.type === 'origin' ? 1 : 0)
      }
      for (const x of profile.nodes) {
        if (used.has(x.id) || !(profile.levels[x.id] > 0) || nodes.some(n => n.id === x.id)) continue
        nodes.push({ ...x }); levels[x.id] = profile.levels[x.id]
      }
      await db.hexa.put({ ...profile, nodes, levels, order: tpl.order.map(s => ({ ...s })), autoPath: tpl.order.length > 0, path: [], updatedAt: Date.now() })
      await updateCharacter(character.id, { classId: `tpl:${tpl.id}` })
      onClose()
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }

  const cls = CLASS_BY_KEY[classKey]?.name ?? 'this class'
  return (
    <Modal title="Change leveling order" onClose={onClose} wide>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-xs text-muted">Pick the HEXA data for {cls} to follow. Your current levels stay as they are; only the node list and the leveling order are replaced.</p>
          <button className="btn btn-sm" onClick={loadLib} disabled={libState === 'loading'}><RefreshCw size={12} className={libState === 'loading' ? 'animate-spin' : ''} />Refresh</button>
        </div>
        {!classKey && <div className="text-xs text-accent">Set the character's class first (Edit character).</div>}
        {libState === 'error' && <div className="text-xs text-muted">Shared library unavailable right now — data saved on this device still works.</div>}
        <div className="max-h-[55vh] divide-y divide-line overflow-y-auto rounded-md border border-line">
          {options.length === 0 && <div className="p-4 text-center text-xs text-muted">{libState === 'loading' ? 'Looking for HEXA data…' : `No HEXA data for ${cls} yet.`}</div>}
          {options.map(o => (
            <div key={o.id} className={`flex flex-wrap items-center gap-2 px-2 py-1.5 ${o.id === currentId ? 'bg-accent/5' : ''}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate">{o.name}{o.id === currentId && <span className="ml-2 text-[11px] text-accent">current</span>}{o.newer && <span className="ml-2 text-[11px] text-legendary">update available</span>}</div>
                <div className="truncate text-[11px] text-muted">{o.steps} steps · {o.source}{o.shared ? ` · updated ${new Date(o.shared.updatedAt).toLocaleDateString()}` : ''}</div>
              </div>
              {o.newer && <button className="btn btn-sm btn-primary" disabled={!!busy} onClick={() => use(o, true)}><Download size={12} />Update</button>}
              <button className={`btn btn-sm ${o.id === currentId || o.newer ? '' : 'btn-primary'}`} disabled={!!busy} onClick={() => use(o)}>
                {busy === o.id ? 'Applying…' : o.id === currentId ? <><RefreshCw size={12} />Re-apply</> : <><Check size={12} />Use</>}
              </button>
            </div>
          ))}
        </div>
        {err && <div className="text-xs text-red-400">{err}</div>}
        <div className="flex justify-end"><button className="btn" onClick={onClose}>Close</button></div>
      </div>
    </Modal>
  )
}
