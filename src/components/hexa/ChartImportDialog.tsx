import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, Trash2, Merge, ArrowUp, ArrowDown, Plus, Upload, Library, BadgeCheck } from 'lucide-react'
import { nanoid } from 'nanoid'
import { Modal } from '../Sidebar'
import { loadImage, analyzeInWorker, cropDataUrl, type ChartResult } from '../../lib/chart/importChart'
import { GROUPS, GROUP_LABEL, GROUP_TYPES, NODE_TYPE_LABEL, maxLevel, STAT_MAX_LEVEL } from '../../data/hexaCosts'
import type { HexaNodeDef, HexaNodeType, HexaOrderStep } from '../../types'
import { db, getSettings } from '../../db'
import { publishTemplate, getAdminKey } from '../../api/library'
import { loadBanks, adminSaveBank } from '../../api/bank'
import { bankRefs, matchTile, canvasPixels } from '../../lib/chart/bankMatch'
import { COMMON_BANK, SLOTS, SLOT_BY_KEY, coreEntry, coreName, slotRank, type SkillBank } from '../../data/skillBank'
import { CLASS_BY_KEY } from '../../data/gmsClasses'
import { ClassOptions } from '../ClassOptions'

export interface ImportOutcome { nodes: HexaNodeDef[]; order: HexaOrderStep[]; imageDataUrl: string; templateId?: string; classKey?: string }

interface SkillRow { id: string; name: string; type: HexaNodeType | ''; icon: string; count: number; mergedInto: string | null; slot: string; matched: boolean; plainStat?: boolean; box: { x: number; y: number; w: number; h: number } }
interface StepRow { index: number; skillId: string; level: number | null; conf: number; icon: string }

export function ChartImportDialog({ file, className, classKey: initialClassKey = '', onClose, onApply }: { file: File; className: string; classKey?: string; onClose: () => void; onApply: (o: ImportOutcome) => void }) {
  const [phase, setPhase] = useState<'analyzing' | 'review' | 'error'>('analyzing')
  const [progress, setProgress] = useState({ msg: 'Loading image…', frac: 0 })
  const [err, setErr] = useState('')
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [dataUrl, setDataUrl] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [skills, setSkills] = useState<SkillRow[]>([])
  const baseSkills = useRef<SkillRow[]>([])
  const baseSteps = useRef<StepRow[]>([])
  const [badges, setBadges] = useState(false)
  const [banks, setBanks] = useState<{ cls: SkillBank | null; common: SkillBank | null }>({ cls: null, common: null })
  const [bankMsg, setBankMsg] = useState('')
  const [steps, setSteps] = useState<StepRow[]>([])
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [saveTemplate, setSaveTemplate] = useState(true)
  const [classKey, setClassKey] = useState(initialClassKey)
  const [templateName, setTemplateName] = useState(() => `${CLASS_BY_KEY[initialClassKey]?.name ?? className} – ${new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`)
  const [publish, setPublish] = useState(false)
  const [libraryOn, setLibraryOn] = useState(false)
  useEffect(() => { getSettings().then(s => setLibraryOn(!!s.proxyUrl)) }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { canvas, dataUrl } = await loadImage(file)
        if (cancelled) return
        setCanvas(canvas); setDataUrl(dataUrl)
        const r: ChartResult = await analyzeInWorker(canvas, (msg, frac) => !cancelled && setProgress({ msg, frac }))
        if (cancelled) return
        setWarnings(r.warnings)
        baseSkills.current = r.skills.map(s => ({ id: s.id, name: s.name, type: s.type ?? '', icon: cropDataUrl(canvas, s.iconBox), count: s.count, mergedInto: null, slot: '', matched: false, box: s.iconBox }))
        setBadges(!!r.detection.badges)
        setSkills(baseSkills.current)
        baseSteps.current = r.steps.map(st => ({ index: st.index, skillId: st.skillId, level: st.level, conf: st.confidence, icon: cropDataUrl(canvas, st.tile, 32) }))
        setSteps(baseSteps.current)
        setPhase('review')
      } catch (e) { setErr((e as Error).message); setPhase('error') }
    })()
    return () => { cancelled = true }
  }, [file])

  // ---- skill bank: name / type / core for every chart icon the bank knows -------------------------------
  useEffect(() => {
    if (phase !== 'review' || !canvas) return
    let cancelled = false
    ;(async () => {
      setBankMsg('Matching icons with the skill bank…')
      const b = await loadBanks(classKey || undefined)
      if (cancelled) return
      setBanks(b)
      const entries = [...(b.cls?.entries ?? []), ...(b.common?.entries ?? [])]
      if (!entries.length) { setBankMsg(classKey ? 'No skill bank for this class yet — name and type the skills by hand.' : ''); setSkills(baseSkills.current); setSteps(baseSteps.current); return }
      const refs = await bankRefs(entries, badges)
      const px = canvasPixels(canvas)
      // match, then fold rows that landed on the same core into the most frequent one
      const rows = baseSkills.current.map(s => {
        const hit = matchTile(px, s.box, badges, refs)
        if (!hit) return { ...s }
        const def = SLOT_BY_KEY[hit.slot]
        // the plain HEXA Stat icon doesn't say which stat it is → keep the chart's numbering
        if (hit.slot === 'stat') return { ...s, type: 'stat' as HexaNodeType, matched: true, plainStat: true, slot: '' }
        return { ...s, slot: hit.slot, type: def.type, name: coreName(hit.slot, b.cls, b.common), matched: true }
      })
      const target = new Map<string, SkillRow>()
      for (const r of [...rows].sort((a, c) => c.count - a.count)) {
        if (!r.slot) continue
        const t = target.get(r.slot)
        if (t) { r.mergedInto = t.id; t.count += r.count } else target.set(r.slot, r)
      }
      // the plain HEXA Stat icon (no numeral) is drawn once per stat core with the core's number (1-3) as its
      // label → split it into HEXA Stat I / II / III, each unlocked straight to level 20
      let stepRows = baseSteps.current.map(st => ({ ...st }))
      const plainIds = new Set(rows.filter(r => r.plainStat).map(r => r.id))
      if (plainIds.size) {
        const live = (id: string): SkillRow => { const r = rows.find(x => x.id === id)!; return r.mergedInto ? live(r.mergedInto) : r }
        const statRow = (k: number): SkillRow => {
          const slot = `stat${k}`
          const have = rows.find(r => r.slot === slot && !r.mergedInto)
          if (have) return have
          const fresh: SkillRow = { id: `STAT${k}`, name: coreName(slot, b.cls, b.common), type: 'stat', icon: coreEntry(slot, b.cls, b.common)?.icon ?? rows.find(r => r.plainStat)!.icon, count: 0, mergedInto: null, slot, matched: true, box: rows.find(r => r.plainStat)!.box }
          rows.push(fresh); return fresh
        }
        let seq = 0
        stepRows = stepRows.map(st => {
          if (!plainIds.has(live(st.skillId).id)) return st
          seq++
          const k = st.level !== null && st.level >= 1 && st.level <= 3 ? st.level : Math.min(seq, 3)
          const r = statRow(k); r.count++
          return { ...st, skillId: r.id, level: 20, conf: 1 }
        })
        for (const r of rows) if (r.plainStat) r.mergedInto = statRow(1).id   // the plain row itself disappears
      }
      if (cancelled) return
      setSkills(rows)
      setSteps(stepRows)
      const n = rows.filter(r => r.matched && !r.mergedInto).length
      setBankMsg(`${n} of ${rows.filter(r => !r.mergedInto).length} skills recognised from the skill bank${b.cls ? '' : ' (no bank for this class yet – only common icons)'}.`)
    })()
    return () => { cancelled = true }
  }, [phase, canvas, classKey, badges])

  const liveSkills = skills.filter(s => !s.mergedInto)
  const resolve = (id: string): string => { const s = skills.find(x => x.id === id); return s?.mergedInto ? resolve(s.mergedInto) : id }
  const flagged = useMemo(() => steps.filter(s => s.level === null || s.conf < 0.5).length, [steps])
  const untyped = liveSkills.filter(s => !s.type).length
  const unnamed = liveSkills.filter(s => !s.name.trim()).length

  function updSkill(id: string, patch: Partial<SkillRow>) { setSkills(ss => ss.map(s => s.id === id ? { ...s, ...patch } : s)) }
  /** core picker: "slot:<key>" (a bank core) or "type:<type>" (no core) */
  function pickCore(s: SkillRow, v: string) {
    if (v.startsWith('slot:')) {
      const slot = v.slice(5); const def = SLOT_BY_KEY[slot]
      const wasDefault = !s.name.trim() || (!!s.slot && s.name === coreName(s.slot, banks.cls, banks.common))
      updSkill(s.id, { slot, type: def.type, ...(wasDefault || !s.name.trim() ? { name: coreName(slot, banks.cls, banks.common) } : {}) })
    } else updSkill(s.id, { slot: '', type: v.slice(5) as HexaNodeType | '' })
  }
  const isAdmin = !!getAdminKey()
  /** icon shown for a skill row: the bank's icon for its core, else the crop from the chart */
  const rowIcon = (r?: SkillRow) => (r?.slot && coreEntry(r.slot, banks.cls, banks.common)?.icon) || r?.icon || ''
  /** admin: add this chart icon to the bank core picked for it (for icons the bank doesn't know yet) */
  async function addToBank(s: SkillRow) {
    const def = SLOT_BY_KEY[s.slot]; if (!def) return
    const key = def.bank === 'common' ? COMMON_BANK : classKey
    if (!key) { alert('Pick the class first.'); return }
    const cur = (def.bank === 'common' ? banks.common : banks.cls) ?? { classKey: key, entries: [], updatedAt: 0 }
    const c = document.createElement('canvas'); c.width = 32; c.height = 32
    const img = new Image(); img.src = s.icon; await img.decode(); c.getContext('2d')!.drawImage(img, 0, 0, 32, 32)
    const hasCore = cur.entries.some(e => e.slot === s.slot)
    try {
      const saved = await adminSaveBank({ ...cur, entries: [...cur.entries, { slot: s.slot, name: s.name.trim() || coreName(s.slot, banks.cls, banks.common), primary: !hasCore, icon: c.toDataURL('image/png') }] })
      setBanks(b => def.bank === 'common' ? { ...b, common: saved } : { ...b, cls: saved })
      updSkill(s.id, { matched: true })
    } catch (e) { alert((e as Error).message) }
  }
  function removeSkill(id: string) { setSkills(ss => ss.filter(s => s.id !== id)); setSteps(st => st.filter(s => resolve(s.skillId) !== id)) }
  function updStep(index: number, patch: Partial<StepRow>) { setSteps(ss => ss.map(s => s.index === index ? { ...s, ...patch, conf: 1 } : s)) }
  function removeStep(index: number) { setSteps(ss => ss.filter(s => s.index !== index)) }
  function moveStep(index: number, d: -1 | 1) {
    setSteps(ss => { const i = ss.findIndex(s => s.index === index); const j = i + d; if (i < 0 || j < 0 || j >= ss.length) return ss; const c = [...ss]; [c[i], c[j]] = [c[j], c[i]]; return c })
  }
  function addStep(after?: number) {
    const sk = liveSkills[0]; if (!sk) return
    const row: StepRow = { index: Date.now() % 1e9 + Math.floor(Math.random() * 1000), skillId: sk.id, level: null, conf: 1, icon: sk.icon }
    setSteps(ss => { if (after === undefined) return [...ss, row]; const i = ss.findIndex(s => s.index === after); const c = [...ss]; c.splice(i + 1, 0, row); return c })
  }
  function removeFlaggedRow() { setSteps(ss => ss.filter(s => !(s.level === null))) }

  async function apply() {
    // nodes: one per live skill, ids by type counters; order from steps (skipping removed)
    const counters: Record<string, number> = {}
    const idOf = new Map<string, string>()
    const nodes: HexaNodeDef[] = []
    // rows on a bank core → one node per core (id = slot key); the bank supplies the icon
    for (const s of liveSkills) {
      if (!s.slot) continue
      const existing = nodes.find(n => n.id === s.slot)
      if (existing) { idOf.set(s.id, existing.id); continue }
      const def = SLOT_BY_KEY[s.slot]
      const node: HexaNodeDef = { id: s.slot, slot: s.slot, name: s.name.trim() || coreName(s.slot, banks.cls, banks.common), type: def.type }
      if (!coreEntry(s.slot, banks.cls, banks.common)) node.icon = s.icon   // bank has no icon for it yet → keep the chart's
      if (def.unlockFrags) { node.unlockFrags = def.unlockFrags; node.unlockErda = def.unlockErda }
      nodes.push(node); idOf.set(s.id, node.id)
    }
    for (const s of liveSkills) {
      if (s.slot) continue
      const t = (s.type || 'mastery') as HexaNodeType
      const prefix = ({ origin: 'o', ascent: 'a', skill3: 'k', mastery: 'm', boost: 'b', common: 'c', commonBoost: 'c', stat: 'stat' } as Record<HexaNodeType, string>)[t]
      counters[prefix] = (counters[prefix] ?? 0) + 1
      let id = `${prefix}${counters[prefix]}`
      while (nodes.some(n => n.id === id)) { counters[prefix]++; id = `${prefix}${counters[prefix]}` }
      idOf.set(s.id, id)
      const def: HexaNodeDef = { id, name: s.name.trim() || `${NODE_TYPE_LABEL[t]} ${counters[prefix]}`, type: t, icon: s.icon }
      if (t === 'stat') { const n = counters[prefix]; def.unlockFrags = [10, 200, 350][n - 1] ?? 350; def.unlockErda = [5, 10, 15][n - 1] ?? 15 }
      nodes.push(def)
    }
    nodes.sort((a, b) => slotRank(a.slot) - slotRank(b.slot))
    const order: HexaOrderStep[] = steps.filter(s => s.level !== null).map(s => ({ nodeId: idOf.get(resolve(s.skillId))!, level: Math.max(1, Math.min(maxLevel(nodes.find(n => n.id === idOf.get(resolve(s.skillId)))!.type), s.level!)) }))
    let templateId: string | undefined
    if ((saveTemplate || publish) && templateName.trim()) {
      templateId = nanoid(8)
      const tpl = { id: templateId, name: templateName.trim(), classKey, nodes, order, source: `imported chart (${file.name})`, createdAt: Date.now() }
      await db.templates.put(tpl)
      if (publish) { try { const s = await getSettings(); await publishTemplate(tpl, s.publishKey) } catch (e) { alert(`Saved locally, but publishing failed: ${(e as Error).message}`) } }
    }
    onApply({ nodes, order, imageDataUrl: dataUrl, templateId, classKey })
  }

  return (
    <Modal title="Import HEXA chart" onClose={onClose} xwide>
      {phase === 'analyzing' && (
        <div className="py-8 text-center">
          <div className="mb-2 text-sm">{progress.msg}</div>
          <div className="mx-auto h-2 w-64 overflow-hidden rounded bg-panel-2"><div className="h-full bg-accent transition-all" style={{ width: `${progress.frac * 100}%` }} /></div>
          <div className="mt-3 text-[11px] text-muted">Finding tiles, matching icons and reading labels — usually 10–40 s.</div>
        </div>
      )}
      {phase === 'error' && <div className="py-6 text-sm text-red-400">{err}</div>}
      {phase === 'review' && canvas && (
        <div className="max-h-[78vh] space-y-4 overflow-y-auto pr-1">
          <div className="rounded-md border border-accent/40 bg-accent/5 p-2 text-xs">
            <div>⚠ Levels are read by OCR and digits get confused (1↔4, 20↔2, 29↔23) — please skim all levels against the chart, not only the flagged ones. Use ↑/↓ (or Enter) to jump between levels; a flagged level counts as checked once you've been in it and moved on.</div>
            {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            {bankMsg && <div className="flex items-center gap-1"><Library size={11} />{bankMsg}</div>}
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <span className="label">Skills found · {liveSkills.length}{untyped ? ` · ${untyped} without a type` : ''}{unnamed ? ` · ${unnamed} unnamed` : ''}</span>
            </div>
            <div className="grid grid-cols-1 gap-1 xl:grid-cols-2">
              {skills.map(s => s.mergedInto ? null : (
                <div key={s.id} className="flex items-center gap-2 rounded-md border border-line px-2 py-1">
                  <img src={rowIcon(s)} alt="" title={rowIcon(s) !== s.icon ? 'Skill bank icon' : 'Icon from the chart (not in the skill bank)'} className="pixel h-8 w-8 rounded" />
                  <input value={s.name} placeholder="name…" onChange={e => updSkill(s.id, { name: e.target.value })} className={`w-40 min-w-[8rem] flex-1 py-1 text-xs ${!s.name.trim() ? 'border-accent/60' : ''}`} />
                  <select value={s.slot ? `slot:${s.slot}` : `type:${s.type}`} onChange={e => pickCore(s, e.target.value)} className={`w-44 shrink-0 py-1 text-xs ${!s.type ? 'border-accent/60' : ''}`} title="HEXA core (from the skill bank)">
                    <option value="type:">core…</option>
                    <optgroup label="HEXA cores">
                      {SLOTS.filter(d => d.key !== 'stat').map(d => <option key={d.key} value={`slot:${d.key}`}>{d.label}{coreEntry(d.key, banks.cls, banks.common) ? ` · ${coreName(d.key, banks.cls, banks.common)}` : ''}</option>)}
                    </optgroup>
                    <optgroup label="Not a bank core (type only)">
                      {GROUPS.flatMap(g => GROUP_TYPES[g].map(t => <option key={t} value={`type:${t}`}>{GROUP_LABEL[g]} · {NODE_TYPE_LABEL[t]}</option>))}
                    </optgroup>
                  </select>
                  {s.matched
                    ? <span title="Recognised from the skill bank" className="text-accent"><BadgeCheck size={14} /></span>
                    : isAdmin && s.slot
                      ? <button className="btn btn-ghost btn-sm" title="Admin: add this icon to the skill bank under the picked core" onClick={() => addToBank(s)}><Library size={12} /></button>
                      : <span title="Not in the skill bank" className="w-[14px]" />}
                  <span className="w-8 text-right text-[10px] text-muted">×{s.count}</span>
                  <select value="" onChange={e => { if (e.target.value) { updSkill(s.id, { mergedInto: e.target.value }); setSkills(ss => ss.map(x => x.id === e.target.value ? { ...x, count: x.count + s.count } : x)) } }} className="w-9 shrink-0 py-1 text-xs" title="Merge into…">
                    <option value="">⇢</option>
                    {liveSkills.filter(o => o.id !== s.id).map(o => <option key={o.id} value={o.id}>→ {o.name || o.id}</option>)}
                  </select>
                  <button className="btn btn-ghost btn-sm" title="Remove skill and its steps" onClick={() => removeSkill(s.id)}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-muted"><Merge size={10} className="inline" /> Use ⇢ to merge an icon variant (e.g. a level-20 Hecate icon) into its skill.</div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <span className="label">Steps · {steps.length}{flagged ? <span className="text-accent"> · {flagged} to check</span> : ''}</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" className="w-auto" checked={onlyFlagged} onChange={e => setOnlyFlagged(e.target.checked)} />only flagged</label>
                <button className="btn btn-sm" onClick={() => addStep()}><Plus size={12} />Add step</button>
                {steps.some(s => s.level === null) && <button className="btn btn-sm" title="Remove every step that has no level" onClick={removeFlaggedRow}><Trash2 size={12} />Drop unreadable</button>}
              </div>
            </div>
            <div data-step-list className="max-h-72 overflow-y-auto rounded-md border border-line">
              {steps.map((s, pos) => ({ s, pos })).filter(({ s }) => !onlyFlagged || s.level === null || s.conf < 0.5).map(({ s, pos }) => {
                const bad = s.level === null || s.conf < 0.5
                const sk = liveSkills.find(x => x.id === resolve(s.skillId))
                const max = sk?.type === 'stat' ? STAT_MAX_LEVEL : 30
                return (
                  <div key={s.index} className={`flex items-center gap-2 border-b border-line px-2 py-0.5 text-xs last:border-0 ${bad ? 'bg-accent/5' : ''}`}>
                    <span className="w-7 text-right text-muted">{pos + 1}</span>
                    <img src={rowIcon(sk) || s.icon} alt="" className="pixel h-5 w-5 rounded" />
                    <select value={resolve(s.skillId)} onChange={e => updStep(s.index, { skillId: e.target.value })} className="min-w-0 flex-1 py-0.5 text-xs">
                      {liveSkills.map(o => <option key={o.id} value={o.id}>{o.name || o.id}</option>)}
                    </select>
                    <input type="number" min={1} max={max} value={s.level ?? ''} placeholder="?" data-level-input
                      onChange={e => updStep(s.index, { level: e.target.value === '' ? null : Math.max(1, Math.min(max, Number(e.target.value))) })}
                      onFocus={e => e.currentTarget.select()}
                      onBlur={() => { if (s.level !== null && s.conf < 0.5) updStep(s.index, {}) }}   // looked at it and left it → verified
                      onKeyDown={e => {
                        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter') return
                        e.preventDefault()   // arrows move between rows instead of changing the number
                        const all = Array.from(e.currentTarget.closest('[data-step-list]')!.querySelectorAll<HTMLInputElement>('input[data-level-input]'))
                        const i = all.indexOf(e.currentTarget)
                        all[i + (e.key === 'ArrowUp' ? -1 : 1)]?.focus()
                      }}
                      className={`w-14 py-0.5 text-center text-xs ${bad ? 'border-accent' : ''}`} />
                    {bad ? <AlertTriangle size={12} className="text-accent" /> : <Check size={12} className="text-muted/40" />}
                    <button className="btn btn-ghost btn-sm" title="Move up" onClick={() => moveStep(s.index, -1)}><ArrowUp size={11} /></button>
                    <button className="btn btn-ghost btn-sm" title="Move down" onClick={() => moveStep(s.index, 1)}><ArrowDown size={11} /></button>
                    <button className="btn btn-ghost btn-sm" title="Insert step after" onClick={() => addStep(s.index)}><Plus size={11} /></button>
                    <button className="btn btn-ghost btn-sm" title="Remove step" onClick={() => removeStep(s.index)}><Trash2 size={11} /></button>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="space-y-2 border-t border-line pt-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr]">
              <label className="text-xs"><span className="label mb-1 block">Class</span>
                <select value={classKey} onChange={e => setClassKey(e.target.value)} className="text-xs">
                  <option value="">Select a class…</option>
                  <ClassOptions />
                </select>
                <span className="mt-0.5 block text-[10px] text-muted">Changing the class re-matches the icons (skill and step edits above are reset).</span>
              </label>
              <label className="text-xs"><span className="label mb-1 block">Save name</span>
                <input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. Fragment-limited order (Nov 2026)" className="text-xs" />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="w-auto" checked={saveTemplate} onChange={e => setSaveTemplate(e.target.checked)} />Save on this device</label>
              {libraryOn && <label className="flex items-center gap-2 text-xs" title="Upload to the shared library so other players of this class can start from it"><input type="checkbox" className="w-auto" checked={publish} onChange={e => setPublish(e.target.checked)} /><Upload size={12} />Share with other {CLASS_BY_KEY[classKey]?.name ?? ''} players</label>}
              <div className="ml-auto flex gap-2">
                <button className="btn" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" onClick={apply} disabled={liveSkills.length === 0 || ((saveTemplate || publish) && (!templateName.trim() || !classKey))}>Apply to character</button>
              </div>
            </div>
            {(saveTemplate || publish) && (!templateName.trim() || !classKey) && <div className="text-[11px] text-accent">Pick a class and a save name to save or share this data.</div>}
          </section>
          <div className="text-[11px] text-muted">Applying replaces this character's node list and leveling order (current levels are kept where names match). Steps without a level are skipped.</div>
        </div>
      )}
    </Modal>
  )
}
