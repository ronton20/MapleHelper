import { useEffect, useMemo, useState } from 'react'
import { FolderUp, Pencil, Plus, Save, Star, Trash2, Upload, Download } from 'lucide-react'
import { listBanks, fetchBank, adminSaveBank, adminDeleteBank } from '../../api/bank'
import { CLASS_BY_KEY, GMS_CLASSES } from '../../data/gmsClasses'
import { ClassOptions } from '../ClassOptions'
import { Modal } from '../Sidebar'
import { COMMON_BANK, CLASS_SLOTS, COMMON_SLOTS, parseBankCsv, slotKeyFromLabel, slotRank, type BankEntry, type BankMeta, type SkillBank } from '../../data/skillBank'

const bankLabel = (k: string) => k === COMMON_BANK ? 'Common (Sol Janus / Hecate / HEXA Stat)' : CLASS_BY_KEY[k]?.name ?? k

/** file → PNG data URL (re-encoded through a canvas so every icon is a plain PNG) */
async function toPngDataUrl(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close()
  return c.toDataURL('image/png')
}

/** Admin: the shared skill bank (icons, names and HEXA cores per class) */
export function SkillBankAdmin({ reload = 0 }: { reload?: number }) {
  const [metas, setMetas] = useState<BankMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [pick, setPick] = useState('')
  const [upload, setUpload] = useState<PendingUpload | null>(null)

  async function load() {
    setLoading(true); setErr('')
    try { setMetas(await listBanks()) } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [reload])
  const byKey = new Map(metas.map(m => [m.classKey, m]))
  const missing = GMS_CLASSES.filter(c => !byKey.has(c.key))

  async function readFolder(files: FileList | null) {
    if (!files?.length) return
    try { setUpload(await parseFolder(Array.from(files))) } catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label flex-1">Skill bank · {metas.length} banks{missing.length ? ` · ${missing.length} classes without one` : ''}</span>
          <label className="btn btn-sm btn-primary cursor-pointer" title="Pick the hexa-skills folder (one sub-folder per class with skills.csv + icons)">
            <FolderUp size={12} />Upload folder
            <input type="file" className="hidden" multiple {...{ webkitdirectory: '', directory: '' } as Record<string, string>} onChange={e => { readFolder(e.target.files); e.target.value = '' }} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={pick} onChange={e => setPick(e.target.value)} className="w-auto min-w-[14rem]">
            <option value="">Edit a class…</option>
            <option value={COMMON_BANK}>Common (Sol Janus / Hecate / Stats)</option>
            <ClassOptions suffix={c => byKey.has(c.key) ? ` (${byKey.get(c.key)!.count})` : ' (empty)'} />
          </select>
          <button className="btn btn-sm" disabled={!pick} onClick={() => setEditing(pick)}><Pencil size={12} />Edit</button>
          <span className="text-[11px] text-muted">Use this when new skills come out: add icons to a core, rename skills, or change which icon a core shows.</span>
        </div>
        {err && <div className="text-xs text-red-400">{err}</div>}
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {[...metas].sort((a, b) => bankLabel(a.classKey).localeCompare(bankLabel(b.classKey))).map(m => (
            <button key={m.classKey} onClick={() => setEditing(m.classKey)} className="flex items-center gap-2 rounded-md border border-line px-2 py-1 text-left text-xs hover:bg-panel-2">
              <span className="min-w-0 flex-1 truncate">{bankLabel(m.classKey)}</span>
              <span className="text-muted">{m.slots} cores · {m.count} icons</span>
            </button>
          ))}
        </div>
        {!!missing.length && !loading && <div className="text-[11px] text-muted">No bank yet: {missing.map(c => c.name).join(', ')}</div>}
      </section>
      {editing && <BankEditor classKey={editing} onClose={() => setEditing(null)} onSaved={load} />}
      {upload && <UploadDialog pending={upload} onClose={() => setUpload(null)} onDone={() => { setUpload(null); load() }} />}
    </div>
  )
}

// ---- folder upload ---------------------------------------------------------------------------------
interface PendingUpload { banks: SkillBank[]; problems: string[] }

async function parseFolder(files: File[]): Promise<PendingUpload> {
  const byDir = new Map<string, Map<string, File>>()
  for (const f of files) {
    const parts = (f.webkitRelativePath || f.name).split('/')
    if (parts.length < 2) continue
    const dir = parts[parts.length - 2]
    if (!byDir.has(dir)) byDir.set(dir, new Map())
    byDir.get(dir)!.set(parts[parts.length - 1], f)
  }
  const banks: SkillBank[] = [], problems: string[] = []
  for (const [dir, fm] of byDir) {
    const csv = fm.get('skills.csv'); if (!csv) continue
    if (dir !== COMMON_BANK && !CLASS_BY_KEY[dir]) { problems.push(`${dir}: not a class key – skipped`); continue }
    const entries: BankEntry[] = []
    for (const r of parseBankCsv(await csv.text())) {
      const slot = slotKeyFromLabel(r.slot, dir)
      if (!slot) { problems.push(`${dir}: "${r.name}" has no/unknown slot "${r.slot}" – skipped`); continue }
      const img = fm.get(r.icon)
      if (!img) { problems.push(`${dir}: icon ${r.icon} missing – skipped`); continue }
      entries.push({ slot, name: r.name, primary: r.primary, icon: await toPngDataUrl(img) })
    }
    // Sol Janus: Dawn / Dusk are skills inside the Sol Janus core → only one primary per slot
    const seen = new Set<string>()
    for (const e of entries.sort((a, b) => slotRank(a.slot) - slotRank(b.slot) || Number(b.primary) - Number(a.primary))) { if (e.primary && seen.has(e.slot)) e.primary = false; if (e.primary) seen.add(e.slot) }
    banks.push({ classKey: dir, entries, updatedAt: 0 })
  }
  if (!banks.length) throw new Error('No <class>/skills.csv found in that folder.')
  return { banks: banks.sort((a, b) => bankLabel(a.classKey).localeCompare(bankLabel(b.classKey))), problems }
}

function UploadDialog({ pending, onClose, onDone }: { pending: PendingUpload; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [errs, setErrs] = useState<string[]>([])
  const icons = pending.banks.reduce((a, b) => a + b.entries.length, 0)
  async function go() {
    setBusy(true); const es: string[] = []
    for (const b of pending.banks) {
      try { await adminSaveBank(b) } catch (e) { es.push(`${bankLabel(b.classKey)}: ${(e as Error).message}`) }
      setDone(d => d + 1)
    }
    setErrs(es); setBusy(false)
    if (!es.length) onDone()
  }
  return (
    <Modal title="Upload skill bank" onClose={busy ? () => {} : onClose} wide>
      <div className="space-y-3 text-sm">
        <div>{pending.banks.length} banks · {icons} icons. Uploading replaces each listed class's bank in the shared memory.</div>
        <div className="max-h-48 overflow-y-auto rounded-md border border-line p-2 text-xs text-muted">
          {pending.banks.map(b => <div key={b.classKey}>{bankLabel(b.classKey)} · {new Set(b.entries.map(e => e.slot)).size} cores · {b.entries.length} icons</div>)}
        </div>
        {!!pending.problems.length && <div className="max-h-32 overflow-y-auto text-xs text-accent">{pending.problems.map((p, i) => <div key={i}>⚠ {p}</div>)}</div>}
        {busy && <div className="h-2 w-full overflow-hidden rounded bg-panel-2"><div className="h-full bg-accent transition-all" style={{ width: `${(done / pending.banks.length) * 100}%` }} /></div>}
        {errs.map((e, i) => <div key={i} className="text-xs text-red-400">{e}</div>)}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={go} disabled={busy}><Upload size={14} />{busy ? `Uploading ${done}/${pending.banks.length}…` : 'Upload'}</button>
        </div>
      </div>
    </Modal>
  )
}

// ---- per-class editor ------------------------------------------------------------------------------
interface Row extends BankEntry { key: number }
let rowKey = 0

export function BankEditor({ classKey, onClose, onSaved }: { classKey: string; onClose: () => void; onSaved?: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const slots = classKey === COMMON_BANK ? COMMON_SLOTS : CLASS_SLOTS
  useEffect(() => {
    fetchBank(classKey).then(b => setRows((b?.entries ?? []).map(e => ({ ...e, key: rowKey++ })))).catch(e => setErr((e as Error).message))
  }, [classKey])

  const bySlot = useMemo(() => new Map(slots.map(s => [s.key, (rows ?? []).filter(r => r.slot === s.key)])), [rows, slots])
  const upd = (key: number, patch: Partial<Row>) => setRows(rs => rs!.map(r => r.key === key ? { ...r, ...patch } : r))
  function setPrimary(r: Row) { setRows(rs => rs!.map(x => x.slot === r.slot ? { ...x, primary: x.key === r.key } : x)) }
  function move(r: Row, slot: string) {
    setRows(rs => { const hasPrimary = rs!.some(x => x.slot === slot && x.primary && x.key !== r.key); return rs!.map(x => x.key === r.key ? { ...x, slot, primary: !hasPrimary } : x) })
  }
  async function addIcons(slot: string, files: FileList | null) {
    if (!files?.length) return
    const existing = bySlot.get(slot) ?? []
    const name = (existing.find(e => e.primary) ?? existing[0])?.name ?? ''
    const add: Row[] = []
    for (const f of Array.from(files)) add.push({ key: rowKey++, slot, name: name || f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), primary: !existing.length && !add.length, icon: await toPngDataUrl(f) })
    setRows(rs => [...rs!, ...add])
  }
  async function save() {
    const bad = (rows ?? []).filter(r => !r.name.trim())
    if (bad.length) { setErr(`${bad.length} icon(s) have no name.`); return }
    for (const s of slots) { const g = bySlot.get(s.key)!; if (g.length && !g.some(r => r.primary)) g[0].primary = true }
    setBusy(true); setErr('')
    try { await adminSaveBank({ classKey, entries: rows!.map(({ key: _k, ...e }) => ({ ...e, name: e.name.trim() })), updatedAt: Date.now() }); onSaved?.(); onClose() }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  async function remove() {
    if (!confirm(`Delete the whole skill bank for ${bankLabel(classKey)}?`)) return
    try { await adminDeleteBank(classKey); onSaved?.(); onClose() } catch (e) { setErr((e as Error).message) }
  }
  function download() {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ classKey, entries: rows }, null, 1)], { type: 'application/json' })); a.download = `skill-bank-${classKey}.json`; a.click()
  }

  return (
    <Modal title={`Skill bank · ${bankLabel(classKey)}`} onClose={onClose} xwide>
      {!rows ? <div className="py-6 text-center text-sm text-muted">{err || 'Loading…'}</div> : (
        <div className="space-y-3">
          <div className="text-[11px] text-muted">Each section is one HEXA core. ★ marks the icon the game and charts show for it (its name is the core's name everywhere in the app); the other icons are the core's other skills or icon variants, used to recognise charts.</div>
          <div className="max-h-[64vh] space-y-2 overflow-y-auto pr-1">
            {slots.map(s => {
              const g = bySlot.get(s.key)!
              return (
                <section key={s.key} className="rounded-md border border-line p-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="label flex-1">{s.label}{g.length ? '' : ' · empty'}</span>
                    <label className="btn btn-sm cursor-pointer"><Plus size={12} />Add icon<input type="file" accept="image/*" multiple className="hidden" onChange={e => { addIcons(s.key, e.target.files); e.target.value = '' }} /></label>
                  </div>
                  {g.map(r => (
                    <div key={r.key} className="flex items-center gap-2 py-0.5">
                      <button title={r.primary ? 'Shown icon for this core' : 'Make this the shown icon'} onClick={() => setPrimary(r)} className={r.primary ? 'text-legendary' : 'text-muted/40 hover:text-muted'}><Star size={14} fill={r.primary ? 'currentColor' : 'none'} /></button>
                      <img src={r.icon} alt="" className="pixel h-8 w-8 rounded" />
                      <input value={r.name} onChange={e => upd(r.key, { name: e.target.value })} className="min-w-0 flex-1 py-1 text-xs" />
                      <select value={r.slot} onChange={e => move(r, e.target.value)} className="w-40 shrink-0 py-1 text-xs" title="Move to another core">
                        {slots.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </select>
                      <button className="btn btn-ghost btn-sm" title="Remove icon" onClick={() => setRows(rs => rs!.filter(x => x.key !== r.key))}><Trash2 size={12} /></button>
                    </div>
                  ))}
                </section>
              )
            })}
          </div>
          {err && <div className="text-xs text-red-400">{err}</div>}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button className="btn btn-sm btn-danger" onClick={remove}><Trash2 size={12} />Delete bank</button>
            <button className="btn btn-sm" onClick={download}><Download size={12} />JSON</button>
            <span className="text-[11px] text-muted">{rows.length} icons · {new Set(rows.map(r => r.slot)).size} cores</span>
            <div className="ml-auto flex gap-2">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={busy}><Save size={14} />Save to shared memory</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
