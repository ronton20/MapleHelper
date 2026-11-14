import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, RefreshCw, Star } from 'lucide-react'
import { updateCharacter, getSettings } from '../../db'
import { useUI } from '../../store'
import { SLOTS, capOn } from '../../data/slots'
import type { Character, ItemInstance, Preset, SlotKey } from '../../types'
import { RANK_COLOR } from '../../lib/flame'
import { potentialSummary } from '../../data/potentials'
import { Inspector } from './Inspector'
import { PresetBar } from './PresetBar'
import { AddCharacterDialog } from '../Sidebar'
import { lookupCharacter } from '../../api/nexon'
import { classForJob } from '../../data/classes'

export function EquipmentView({ character }: { character: Character }) {
  const { selectedSlot, setSlot } = useUI()
  const settings = useLiveQuery(() => getSettings(), [])
  const [editing, setEditing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const preset = character.presets.find(p => p.id === character.activePresetId) ?? character.presets[0]

  async function resync() {
    setSyncing(true)
    try {
      const s = await getSettings()
      const r = await lookupCharacter(character.name, s.proxyUrl, character.heroic ?? true, character.region ?? 'eu')
      await updateCharacter(character.id, { job: r.job, level: r.level, world: r.world, imageUrl: r.imageUrl, classId: character.classId ?? classForJob(r.job)?.id ?? null })
    } catch (e) { alert((e as Error).message) } finally { setSyncing(false) }
  }

  function setPreset(updater: (p: Preset) => Preset) {
    updateCharacter(character.id, c => ({ ...c, presets: c.presets.map(p => p.id === preset.id ? updater(p) : p) }))
  }
  function setItem(slot: SlotKey, item: ItemInstance | null) {
    setPreset(p => {
      const slots = { ...p.slots }
      if (item) slots[slot] = item; else delete slots[slot]
      return { ...p, slots }
    })
  }

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {/* header */}
        <div className="flex items-center gap-4 border-b border-line px-6 py-4">
          <div className="h-14 w-14 overflow-hidden rounded-lg bg-panel-2">
            {character.imageUrl && <img src={character.imageUrl} alt="" className="pixel h-full w-full object-contain" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{character.name}</h1>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} title="Edit"><Pencil size={13} /></button>
              <button className="btn btn-ghost btn-sm" onClick={resync} title="Re-sync from rankings" disabled={syncing}><RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /></button>
            </div>
            <div className="text-xs text-muted">{character.job || '—'}{character.level ? ` · Lv. ${character.level}` : ''}{character.world ? ` · ${character.world}` : ''}</div>
          </div>
          <Summary preset={preset} />
        </div>

        <PresetBar character={character} />

        <div className="flex flex-1 items-start justify-center p-6">
          <EquipGrid character={character} preset={preset} selected={selectedSlot} onSelect={setSlot} />
        </div>
      </div>

      <Inspector
        key={`${preset.id}:${selectedSlot ?? ''}`}
        slot={selectedSlot}
        item={selectedSlot ? preset.slots[selectedSlot] ?? null : null}
        character={character}
        version={settings?.msioVersion ?? '262'}
        onChange={(it) => selectedSlot && setItem(selectedSlot, it)}
        onClose={() => setSlot(null)}
      />

      {editing && <AddCharacterDialog existing={character} onClose={() => setEditing(false)} onCreated={() => setEditing(false)} />}
    </div>
  )
}

function Summary({ preset }: { preset: Preset }) {
  const entries = (Object.entries(preset.slots) as [SlotKey, ItemInstance][]).filter(([k, i]) => capOn(k, 'stars', i.enabled))
  const items = Object.values(preset.slots)
  const stars = entries.reduce((a, [, i]) => a + i.starForce, 0)
  const starGoal = entries.reduce((a, [, i]) => a + Math.max(i.starForce, i.starForceGoal), 0)
  const below = entries.filter(([, i]) => i.starForce < i.starForceGoal).length
  return (
    <div className="flex gap-6 text-right">
      <Stat label="Items" value={`${items.length}/${SLOTS.length}`} />
      <Stat label="Stars" value={`${stars}/${starGoal}`} />
      <Stat label="Below goal" value={String(below)} warn={below > 0} />
    </div>
  )
}
function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return <div><div className="label">{label}</div><div className={`text-base font-semibold ${warn ? 'text-accent' : ''}`}>{value}</div></div>
}

function EquipGrid({ character, preset, selected, onSelect }: { character: Character; preset: Preset; selected: SlotKey | null; onSelect: (s: SlotKey) => void }) {
  const CELL = 72, GAP = 8
  return (
    <div className="card p-4" style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${CELL}px)`, gridTemplateRows: `repeat(6, ${CELL}px)`, gap: GAP }}>
      {/* character portrait – center block rows 1-4 */}
      <div style={{ gridColumn: '3 / span 3', gridRow: '1 / span 4' }} className="flex items-center justify-center rounded-lg border border-line bg-panel-2/60">
        {character.imageUrl
          ? <img src={character.imageUrl} alt="" className="pixel object-contain" style={{ imageRendering: 'pixelated', height: '82%', width: 'auto', maxWidth: '92%' }} />
          : <div className="text-xs text-muted">no image</div>}
      </div>
      {SLOTS.map(s => (
        <SlotCell key={s.key} label={s.label} item={preset.slots[s.key] ?? null} summary={preset.slots[s.key] && capOn(s.key, 'potential', preset.slots[s.key]!.enabled) ? potentialSummary(preset.slots[s.key]!.potential.lines, character.flameWeights.mainStat, s.key, character.flameWeights.useMatt || character.flameWeights.mainStat === 'int') : ''} selected={selected === s.key} onClick={() => onSelect(s.key)} style={{ gridColumn: s.col, gridRow: s.row }} />
      ))}
    </div>
  )
}

function SlotCell({ label, item, summary, selected, onClick, style }: { label: string; item: ItemInstance | null; summary: string; selected: boolean; onClick: () => void; style: React.CSSProperties }) {
  const border = item ? RANK_COLOR[item.potential.rank] : 'var(--color-line)'
  const starWarn = item && item.starForce < item.starForceGoal
  return (
    <button onClick={onClick} title={item ? item.name : label} style={{ ...style, borderColor: selected ? 'var(--color-accent)' : border }}
      className={`group relative flex items-center justify-center rounded-lg border-2 bg-panel-2 transition-colors hover:bg-[#232732] ${selected ? 'ring-2 ring-accent/40' : ''}`}>
      {item ? (
        <>
          {item.iconUrl ? <img src={item.iconUrl} alt="" className={`pixel object-contain ${summary ? 'max-h-10 max-w-10 -mt-2' : 'max-h-12 max-w-12'}`} loading="lazy" /> : <span className={`px-1 text-[9px] leading-tight text-text ${summary ? '-mt-3' : ''}`}>{item.name.slice(0, 16)}</span>}
          {summary && <span className="absolute inset-x-0.5 bottom-0.5 truncate text-center text-[9px] leading-tight" style={{ color: RANK_COLOR[item.potential.rank] }}>{summary}</span>}
          {item.starForce > 0 && (
            <span className={`absolute left-1 top-0.5 flex items-center gap-0.5 text-[10px] font-semibold ${starWarn ? 'text-muted' : 'text-accent'}`}>
              <Star size={9} fill="currentColor" />{item.starForce}
            </span>
          )}
        </>
      ) : (
        <span className="text-[10px] text-muted/70 group-hover:text-muted">{label}</span>
      )}
    </button>
  )
}
