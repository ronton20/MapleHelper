import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Flame, Pencil, RefreshCw, Star } from 'lucide-react'
import { updateCharacter, getSettings } from '../../db'
import { useUI, useIsMobile } from '../../store'
import { SLOTS, capOn } from '../../data/slots'
import type { Character, ItemInstance, Preset, SlotKey } from '../../types'
import { RANK_COLOR, RANK_LABEL, flameScore } from '../../lib/flame'
import { gearTotals, relevantRows } from '../../lib/gearTotals'
import { maxStarForce } from '../../data/starforce'
import { potentialSummary } from '../../data/potentials'
import { Inspector } from './Inspector'
import { classKeyForJob, CLASS_BY_KEY } from '../../data/gmsClasses'
import { PresetBar } from './PresetBar'
import { AddCharacterDialog } from '../Sidebar'
import { lookupCharacter } from '../../api/nexon'

export function EquipmentView({ character }: { character: Character }) {
  const { selectedSlot, setSlot } = useUI()
  const mobile = useIsMobile()
  const settings = useLiveQuery(() => getSettings(), [])
  const [editing, setEditing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const preset = character.presets.find(p => p.id === character.activePresetId) ?? character.presets[0]

  async function resync() {
    setSyncing(true)
    try {
      const s = await getSettings()
      const r = await lookupCharacter(character.name, s.proxyUrl, character.heroic ?? true, character.region ?? 'eu')
      const key = character.classKey || classKeyForJob(r.job)
      await updateCharacter(character.id, { job: CLASS_BY_KEY[key]?.name ?? r.job, level: r.level, world: r.world, imageUrl: r.imageUrl, classKey: key || undefined })
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
        <div className={`flex items-center gap-4 border-b border-line ${mobile ? 'px-3 py-2' : 'px-6 py-4'}`}>
          <div className={`${mobile ? 'hidden' : 'h-14 w-14'} overflow-hidden rounded-lg bg-panel-2`}>
            {character.imageUrl && <img src={character.imageUrl} alt="" className="pixel h-full w-full object-contain" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className={`truncate font-semibold ${mobile ? 'text-base' : 'text-lg'}`}>{character.name}</h1>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} title="Edit"><Pencil size={13} /></button>
              <button className="btn btn-ghost btn-sm" onClick={resync} title="Re-sync from rankings" disabled={syncing}><RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /></button>
            </div>
            <div className="text-xs text-muted">{character.job || '—'}{character.level ? ` · Lv. ${character.level}` : ''}{character.world ? ` · ${character.world}` : ''}</div>
          </div>
          <Summary preset={preset} compact={mobile} />
        </div>

        <PresetBar character={character} />

        <div className={`flex flex-1 flex-col items-center ${mobile ? 'gap-2 p-2' : 'gap-4 p-6'}`}>
          <EquipGrid character={character} preset={preset} selected={selectedSlot} onSelect={setSlot} mobile={mobile} />
          <GearTotalsCard character={character} preset={preset} mobile={mobile} />
        </div>
      </div>

      {mobile && selectedSlot && <div className="fixed inset-0 z-30 bg-black/50" onClick={() => setSlot(null)} />}
      <Inspector
        mobile={mobile}
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

function Summary({ preset, compact }: { preset: Preset; compact?: boolean }) {
  const entries = (Object.entries(preset.slots) as [SlotKey, ItemInstance][]).filter(([k, i]) => capOn(k, 'stars', i.enabled))
  const items = Object.values(preset.slots)
  const stars = entries.reduce((a, [, i]) => a + i.starForce, 0)
  const starGoal = entries.reduce((a, [, i]) => a + Math.max(i.starForce, i.starForceGoal), 0)
  const below = entries.filter(([, i]) => i.starForce < i.starForceGoal).length
  if (compact) return <div className="text-right text-xs text-muted">{items.length}/{SLOTS.length} items · ★ {stars}/{starGoal}</div>
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

function EquipGrid({ character, preset, selected, onSelect, mobile }: { character: Character; preset: Preset; selected: SlotKey | null; onSelect: (s: SlotKey) => void; mobile: boolean }) {
  // desktop: 72px cells; mobile: fit 7 columns in the viewport width (card padding + gaps accounted for)
  const CELL = mobile ? 'clamp(38px, calc((100vw - 16px - 16px - 6 * 4px) / 7), 72px)' : '72px'
  const GAP = mobile ? 4 : 8
  // hover card (desktop / mouse only)
  const [hover, setHover] = useState<{ slot: SlotKey; rect: DOMRect } | null>(null)
  const canHover = !mobile && typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches
  const hoverItem = hover ? preset.slots[hover.slot] : undefined
  return (
    <>
    <div className={`card ${mobile ? 'p-2' : 'p-4'}`} style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${CELL})`, gridTemplateRows: `repeat(6, ${CELL})`, gap: GAP }}>
      {/* character portrait – center block rows 1-4 */}
      <div style={{ gridColumn: '3 / span 3', gridRow: '1 / span 4' }} className="flex items-center justify-center rounded-lg border border-line bg-panel-2/60">
        {character.imageUrl
          ? <img src={character.imageUrl} alt="" className="pixel object-contain" style={{ imageRendering: 'pixelated', height: '82%', width: 'auto', maxWidth: '92%' }} />
          : <div className="text-xs text-muted">no image</div>}
      </div>
      {SLOTS.map(s => (
        <SlotCell key={s.key} label={s.label} item={preset.slots[s.key] ?? null} summary={preset.slots[s.key] && capOn(s.key, 'potential', preset.slots[s.key]!.enabled) ? potentialSummary(preset.slots[s.key]!.potential.lines, character.flameWeights.mainStat, s.key, character.flameWeights.useMatt || character.flameWeights.mainStat === 'int') : ''} flame={preset.slots[s.key] && capOn(s.key, 'flames', preset.slots[s.key]!.enabled) ? flameScore(preset.slots[s.key]!.flame, character.flameWeights) : 0} selected={selected === s.key} onClick={() => onSelect(s.key)} style={{ gridColumn: s.col, gridRow: s.row }}
          mobile={mobile} onHover={canHover ? (r) => setHover(r ? { slot: s.key, rect: r } : null) : undefined} />
      ))}
    </div>
    {hover && hoverItem && <ItemHoverCard slot={hover.slot} item={hoverItem} rect={hover.rect} character={character} />}
    </>
  )
}

/** in-game bonus-stat (flame) text colour */
const FLAME_TEAL = '#5ce1e6'

function SlotCell({ label, item, summary, flame, selected, onClick, style, onHover, mobile }: { mobile?: boolean; label: string; item: ItemInstance | null; summary: string; flame: number; selected: boolean; onClick: () => void; style: React.CSSProperties; onHover?: (r: DOMRect | null) => void }) {
  const border = item ? RANK_COLOR[item.potential.rank] : 'var(--color-line)'
  const starWarn = item && item.starForce < item.starForceGoal
  return (
    <button onClick={onClick} title={onHover && item ? undefined : item ? item.name : label}
      onMouseEnter={e => item && onHover?.(e.currentTarget.getBoundingClientRect())} onMouseLeave={() => onHover?.(null)} style={{ ...style, borderColor: selected ? 'var(--color-accent)' : border }}
      className={`group relative flex items-center justify-center rounded-lg border-2 bg-panel-2 transition-colors hover:bg-[#232732] ${selected ? 'ring-2 ring-accent/40' : ''}`}>
      {item ? (
        <>
          {item.iconUrl ? <img src={item.iconUrl} alt="" className={`pixel object-contain ${summary ? 'max-h-10 max-w-10 -mt-2' : 'max-h-12 max-w-12'}`} loading="lazy" /> : <span className={`px-1 leading-tight text-text ${mobile ? 'line-clamp-2 text-[8px]' : 'text-[9px]'} ${mobile && (flame > 0 || item.starForce > 0) ? 'mt-1' : summary ? '-mt-3' : ''}`}>{item.name.slice(0, 16)}</span>}
          {summary && <span className="absolute inset-x-0.5 bottom-0.5 truncate text-center text-[9px] leading-tight" style={{ color: RANK_COLOR[item.potential.rank] }}>{summary}</span>}
          {flame > 0 && (
            <span title={`Flame score ${flame}${item.flameScoreGoal ? ` / goal ${item.flameScoreGoal}` : ''}`}
              className={`absolute right-0.5 top-0.5 flex items-center gap-px font-semibold ${mobile ? 'text-[8px]' : 'text-[10px]'} ${item.flameScoreGoal && flame < item.flameScoreGoal ? 'text-muted' : ''}`}
              style={item.flameScoreGoal && flame < item.flameScoreGoal ? undefined : { color: FLAME_TEAL }}>
              <Flame size={mobile ? 7 : 9} fill="currentColor" />{Math.round(flame)}
            </span>
          )}
          {item.starForce > 0 && (
            <span className={`absolute left-0.5 top-0.5 flex items-center gap-px font-semibold ${mobile ? 'text-[8px]' : 'text-[10px]'} ${starWarn ? 'text-muted' : 'text-accent'}`}>
              <Star size={mobile ? 7 : 9} fill="currentColor" />{item.starForce}
            </span>
          )}
        </>
      ) : (
        <span className="text-[10px] text-muted/70 group-hover:text-muted">{label}</span>
      )}
    </button>
  )
}

const FLAME_SHORT: [keyof ItemInstance['flame'], string, boolean?][] = [
  ['str', 'STR'], ['dex', 'DEX'], ['int', 'INT'], ['luk', 'LUK'], ['att', 'ATT'], ['matt', 'MATT'], ['allStat', 'All', true],
  ['bossDmg', 'Boss', true], ['dmg', 'Dmg', true], ['hp', 'HP'], ['level', 'Lv −'],
]

/** compact summary of one item shown while hovering its grid cell (desktop) */
function ItemHoverCard({ slot, item, rect, character }: { slot: SlotKey; item: ItemInstance; rect: DOMRect; character: Character }) {
  const W = 240
  const left = rect.right + 8 + W > window.innerWidth ? rect.left - 8 - W : rect.right + 8
  const top = Math.max(8, Math.min(rect.top, window.innerHeight - 260))
  const stars = capOn(slot, 'stars', item.enabled)
  const flames = capOn(slot, 'flames', item.enabled)
  const pot = capOn(slot, 'potential', item.enabled) && item.potential.rank !== 'none'
  const max = item.maxStarsOverride ?? maxStarForce(item.reqLevel, item.name)
  const score = flames ? flameScore(item.flame, character.flameWeights) : 0
  const flameBits = FLAME_SHORT.filter(([k]) => item.flame[k]).map(([k, l, pct]) => k === 'level' ? `Lv −${item.flame[k]}` : `${l} +${item.flame[k]}${pct ? '%' : ''}`)
  const lines = item.potential.lines.filter(Boolean)
  return (
    <div className="pointer-events-none fixed z-50 space-y-1.5 rounded-lg border border-line-2 bg-panel/95 p-2.5 text-[11px] leading-snug shadow-2xl backdrop-blur" style={{ left, top, width: W }}>
      <div className="font-semibold text-text">{item.name}{item.reqLevel ? <span className="ml-1 font-normal text-muted">Lv. {item.reqLevel}</span> : null}</div>
      {stars && (
        <div className="flex items-center gap-1" style={{ color: item.starForce < item.starForceGoal ? undefined : 'var(--color-accent)' }}>
          <Star size={10} fill="currentColor" /><span>{item.starForce}<span className="text-muted"> / goal {item.starForceGoal} · max {max}</span></span>
        </div>
      )}
      {flames && (
        <div>
          <div className="flex items-center gap-1" style={{ color: item.flameScoreGoal && score < item.flameScoreGoal ? undefined : FLAME_TEAL }}>
            <Flame size={10} fill="currentColor" /><span>{Math.round(score)}{item.flameScoreGoal ? <span className="text-muted"> / goal {item.flameScoreGoal}</span> : null}</span>
          </div>
          {flameBits.length > 0 && <div className="text-muted">{flameBits.join(' · ')}</div>}
        </div>
      )}
      {pot && (
        <div>
          <div className="font-semibold" style={{ color: RANK_COLOR[item.potential.rank] }}>{RANK_LABEL[item.potential.rank]}</div>
          {lines.length ? lines.map((l, i) => <div key={i} className="text-text">{l}</div>) : <div className="text-muted">No lines set</div>}
        </div>
      )}
    </div>
  )
}

/** totals of the stats that matter for this class, from flames + potentials of the current preset */
function GearTotalsCard({ character, preset, mobile }: { character: Character; preset: Preset; mobile: boolean }) {
  const t = gearTotals(preset)
  const rows = relevantRows(t, character.flameWeights)
  const fmt = (n: number) => Number(n.toFixed(1)).toLocaleString()
  return (
    <div className={`card w-full ${mobile ? 'p-3' : 'max-w-[620px] p-4'}`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="label">Gear totals</span>
        <span className="text-[11px] text-muted">flames + potentials · ★ {t.stars}/{t.starGoal}</span>
      </div>
      {rows.length === 0 ? <div className="py-2 text-xs text-muted">Add flames or potential lines to see totals.</div> : (
        <div className={`grid gap-x-6 gap-y-1 text-sm ${mobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {rows.map(r => (
            <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-line/60 py-0.5">
              <span className="text-muted">{r.label}</span>
              <span className="tabular-nums">
                {r.text ?? <>{r.flat ? `+${fmt(r.flat)}` : ''}{r.flat && r.pct ? <span className="text-muted"> · </span> : ''}{r.pct ? `+${fmt(r.pct)}%` : ''}</>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
