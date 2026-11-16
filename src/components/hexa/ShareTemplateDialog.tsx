import { useState } from 'react'
import { nanoid } from 'nanoid'
import { Upload } from 'lucide-react'
import { Modal } from '../Sidebar'
import { ClassOptions } from '../ClassOptions'
import { CLASS_BY_KEY, classKeyForJob } from '../../data/gmsClasses'
import { db, getSettings, updateCharacter, BUILD_PROXY_URL } from '../../db'
import { publishTemplate } from '../../api/library'
import { loadBanks } from '../../api/bank'
import { coreEntry } from '../../data/skillBank'
import type { Character, ClassTemplate, HexaNodeDef, HexaProfile } from '../../types'

/** shrink an uploaded (data-URL) icon to ≤64px so shared saves stay small; URLs are kept as they are */
async function shrinkIcon(icon: string | undefined): Promise<string | undefined> {
  if (!icon?.startsWith('data:image')) return icon
  try {
    const img = new Image(); img.src = icon; await img.decode()
    const s = Math.min(1, 64 / Math.max(img.width, img.height))
    if (s === 1 && icon.length < 20_000) return icon
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/png')
  } catch { return icon }
}

/** Share the character's current HEXA setup (node names, types, icons, leveling order) to the shared library */
export function ShareTemplateDialog({ character, profile, onClose }: { character: Character; profile: HexaProfile; onClose: () => void }) {
  const [classKey, setClassKey] = useState(character.classKey || classKeyForJob(character.job))
  const month = new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' })
  const [name, setName] = useState(`${CLASS_BY_KEY[classKey]?.name ?? 'HEXA'} – ${month}`)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const linked = profile.nodes.filter(n => n.slot).length

  async function share() {
    setBusy(true); setMsg(null)
    try {
      // nodes on a skill-bank core don't carry icons – everyone gets them from the bank
      const banks = await loadBanks(classKey)
      const nodes: HexaNodeDef[] = await Promise.all(profile.nodes.map(async n => {
        const { icon, ...rest } = n
        return n.slot && coreEntry(n.slot, banks.cls, banks.common) ? rest : { ...rest, icon: await shrinkIcon(icon) }
      }))
      const tpl: ClassTemplate = { id: nanoid(8), name: name.trim(), classKey, nodes, order: profile.order, source: 'shared from a character', createdAt: Date.now() }
      await db.templates.put(tpl)
      await publishTemplate(tpl, (await getSettings()).publishKey)
      await updateCharacter(character.id, { classId: `tpl:${tpl.id}`, classKey })
      setMsg({ ok: true, text: `Shared! Other ${CLASS_BY_KEY[classKey]?.name ?? ''} players will see "${tpl.name}" when they pick their HEXA data.` })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally { setBusy(false) }
  }

  return (
    <Modal title="Share HEXA setup" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-muted">Uploads this character's HEXA nodes (names and skill-bank cores) and leveling order to the shared library. Your levels and progress are not shared.</p>
        <div className="rounded-md border border-line bg-panel-2 px-3 py-2 text-xs text-muted">
          {profile.nodes.length} nodes ({linked} linked to the skill bank) · {profile.order.length} leveling-order steps
        </div>
        {profile.order.length === 0 && <div className="text-xs text-accent">There's no leveling order yet. Add one with "Order" first so others get the upgrade path.</div>}
        <label className="block"><div className="label mb-1">Class</div>
          <select value={classKey} onChange={e => setClassKey(e.target.value)} className={classKey ? '' : 'text-muted'}>
            <option value="">Select a class…</option>
            <ClassOptions />
          </select>
        </label>
        <label className="block"><div className="label mb-1">Save name</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ren – fragment-limited order" />
        </label>
        {!BUILD_PROXY_URL && <div className="text-xs text-red-400">The shared library isn't configured in this build.</div>}
        {msg && <div className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn" onClick={onClose}>{msg?.ok ? 'Close' : 'Cancel'}</button>
          {!msg?.ok && <button className="btn btn-primary" disabled={busy || !name.trim() || !classKey || !BUILD_PROXY_URL || profile.nodes.length === 0} onClick={share}><Upload size={14} />{busy ? 'Sharing…' : 'Share'}</button>}
        </div>
      </div>
    </Modal>
  )
}
