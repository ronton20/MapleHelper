import { useEffect, useState } from 'react'
import { X, Trash2, Replace, Star } from 'lucide-react'
import type { Character, ItemInstance, SlotKey, PotentialRank, Flame } from '../../types'
import { SLOT_BY_KEY, SLOT_CAPS, capOn, type SlotCaps } from '../../data/slots'
import { type PotentialOptionGroup, potentialOptionGroups } from '../../data/potentials'
import { flameTarget, hasFlameTarget } from '../../data/flameTargets'
import { maxStarForce, starGoalPresets, defaultStarGoal } from '../../data/starforce'
import { newItem } from '../../db'
import { flameScore, flameInputKeys, describeWeights, RANK_COLOR, RANK_LABEL } from '../../lib/flame'
import { ItemSearch } from './ItemSearch'

export function Inspector({ slot, item, character, version, onChange, onClose, mobile = false }: {
  slot: SlotKey | null; item: ItemInstance | null; character: Character; version: string
  onChange: (it: ItemInstance | null) => void; onClose: () => void; mobile?: boolean
}) {
  const [replacing, setReplacing] = useState(false)
  // desktop: fixed side panel; mobile: bottom sheet
  const shell = mobile
    ? 'fixed inset-x-0 bottom-0 z-40 max-h-[88vh] rounded-t-2xl border-t border-line bg-panel shadow-2xl'
    : 'w-[360px] shrink-0 border-l border-line bg-panel'

  if (!slot) {
    if (mobile) return null
    return (
      <aside className={`${shell} flex items-center justify-center p-6 text-center text-sm text-muted`}>
        Select a slot to view or edit the item.
      </aside>
    )
  }
  const def = SLOT_BY_KEY[slot]

  if (!item || replacing) {
    return (
      <aside className={`${shell} overflow-y-auto p-4`} style={mobile ? { paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' } : undefined}>
        <Header title={`${item ? 'Replace' : 'Add'} · ${def.label}`} onClose={() => { if (replacing) setReplacing(false); else onClose() }} />
        <ItemSearch slot={slot} version={version}
          onPick={(p) => { onChange(newItem({ ...(item ?? {}), ...p, starForceGoal: SLOT_CAPS[slot].stars === true ? defaultStarGoal(maxStarForce(p.reqLevel, p.name)) : 0, ...(SLOT_CAPS[slot].flames === true && hasFlameTarget(slot) && !item ? { flameScoreGoal: flameTarget(p.reqLevel, true).mid } : {}) })); setReplacing(false) }}
          onManual={(name) => { onChange(newItem({ ...(item ?? {}), itemId: null, name, iconUrl: '', starForceGoal: SLOT_CAPS[slot].stars === true ? defaultStarGoal(maxStarForce(0, name)) : 0, ...(SLOT_CAPS[slot].flames === true && hasFlameTarget(slot) && !item ? { flameScoreGoal: flameTarget(0, true).mid } : {}) })); setReplacing(false) }} />
      </aside>
    )
  }

  const upd = (patch: Partial<ItemInstance>) => onChange({ ...item, ...patch })
  const score = flameScore(item.flame, character.flameWeights)
  // weapons keep every flame field; other gear only shows what the class's flame score uses
  // (plus any other field that already holds a value, so nothing is hidden)
  const flameKeys: (keyof Flame)[] = slot === 'weapon' ? ALL_FLAME_KEYS
    : [...flameInputKeys(character.flameWeights), ...ALL_FLAME_KEYS.filter(k => item.flame[k] && !flameInputKeys(character.flameWeights).includes(k))]
  const caps = SLOT_CAPS[slot]
  const on = (c: keyof SlotCaps) => capOn(slot, c, item.enabled)
  const optional = (Object.keys(caps) as (keyof SlotCaps)[]).filter(c => caps[c] === 'opt')
  const nothing = !on('stars') && !on('potential') && !on('flames')
  const autoMax = maxStarForce(item.reqLevel, item.name)
  const maxStars = item.maxStarsOverride ?? autoMax
  /** level change: keep goals that the user set, but move goals that were still on an automatic value */
  function onLevel(lv: number) {
    const oldMax = item!.maxStarsOverride ?? maxStarForce(item!.reqLevel, item!.name)
    const newMax = item!.maxStarsOverride ?? maxStarForce(lv, item!.name)
    const autoStar = item!.starForceGoal === 0 || item!.starForceGoal === oldMax || item!.starForceGoal === defaultStarGoal(oldMax)
    const starGoal = SLOT_CAPS[slot!].stars === true || item!.enabled?.stars ? (autoStar ? defaultStarGoal(newMax) : Math.min(item!.starForceGoal, newMax)) : item!.starForceGoal
    let flameGoal = item!.flameScoreGoal
    if (hasFlameTarget(slot!)) {
      const adv = item!.flameAdvantaged ?? true
      const o = flameTarget(item!.reqLevel, adv), n = flameTarget(lv, adv)
      if (flameGoal === o.early) flameGoal = n.early
      else if (flameGoal === o.mid) flameGoal = n.mid
      else if (flameGoal === o.late) flameGoal = n.late
    }
    upd({ reqLevel: lv, starForce: Math.min(item!.starForce, newMax), starForceGoal: starGoal, flameScoreGoal: flameGoal })
  }

  return (
    <aside className={`${shell} overflow-y-auto`} style={mobile ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}>
      {mobile && <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-2" />}
      <div className="sticky top-0 z-10 border-b border-line bg-panel p-4">
        <Header title={def.label} onClose={onClose} />
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg border-2 bg-panel-2" style={{ borderColor: RANK_COLOR[item.potential.rank] }}>
            {item.iconUrl ? <img src={item.iconUrl} alt="" className="pixel max-h-12 max-w-12 object-contain" /> : <span className="text-[10px] text-muted">no icon</span>}
          </div>
          <div className="min-w-0 flex-1">
            <input value={item.name} onChange={e => upd({ name: e.target.value })} className="mb-1 border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold hover:border-line" />
            <div className="flex items-center gap-2 px-1 text-[11px] text-muted">
              <span>Lv.</span><input type="number" value={item.reqLevel || ''} onChange={e => onLevel(Number(e.target.value))} className="w-16 py-0 text-[11px]" />
              {item.starForce > 0 && <span className="flex items-center gap-0.5 text-accent"><Star size={10} fill="currentColor" />{item.starForce}</span>}
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-sm" onClick={() => setReplacing(true)}><Replace size={12} />Change item</button>
          <button className="btn btn-sm btn-danger" onClick={() => { if (confirm('Remove this item from the slot?')) onChange(null) }}><Trash2 size={12} />Remove</button>
        </div>
        {optional.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
            <span className="label self-center">This item can be</span>
            {optional.map(c => (
              <label key={c} className="flex items-center gap-1.5"><input type="checkbox" className="w-auto" checked={on(c)} onChange={e => upd({ enabled: { ...item.enabled, [c]: e.target.checked }, ...(c === 'stars' ? { starForceGoal: e.target.checked ? Math.min(item.starForceGoal || defaultStarGoal(maxStars), maxStars) : 0 } : {}) })} />{c === 'stars' ? 'Star Forced' : c === 'flames' ? 'Flamed' : 'Cubed (potential)'}</label>
            ))}
          </div>
        )}
      </div>

      <ClampStars item={item} maxStars={maxStars} enabled={on('stars')} onChange={onChange} />
      <div className="space-y-5 p-4">
        {on('stars') && (
          <Section title="Star Force" right={<Goal value={item.starForce} goal={item.starForceGoal} />}>
            <div className="flex items-center gap-3">
              <input type="range" min={0} max={maxStars} value={Math.min(item.starForce, maxStars)} onChange={e => upd({ starForce: Number(e.target.value) })} />
              <input type="number" min={0} max={maxStars} value={item.starForce} onChange={e => upd({ starForce: clamp(Number(e.target.value), 0, maxStars) })} className="w-16 text-center" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Goal</span>
              <input type="number" min={0} max={maxStars} value={item.starForceGoal} onChange={e => upd({ starForceGoal: clamp(Number(e.target.value), 0, maxStars) })} className="w-16 text-center" />
              <div className="flex gap-1">{starGoalPresets(maxStars).map(n => <button key={n} className={`btn btn-sm ${item.starForceGoal === n ? 'btn-primary' : ''}`} onClick={() => upd({ starForceGoal: n })}>{n}</button>)}</div>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
              <span>Max {maxStars}★{item.maxStarsOverride !== undefined ? ' (manual)' : ` for lvl ${item.reqLevel || '?'}`}</span>
              <span>·</span>
              <label className="flex items-center gap-1">override
                <input type="number" min={0} max={30} value={item.maxStarsOverride ?? ''} placeholder={String(autoMax)} className="w-12 py-0 text-center text-[10px]"
                  onChange={e => { const v = e.target.value === '' ? undefined : clamp(Number(e.target.value), 0, 30); upd({ maxStarsOverride: v, starForceGoal: Math.min(item.starForceGoal, v ?? autoMax), starForce: Math.min(item.starForce, v ?? autoMax) }) }} />
              </label>
            </div>
          </Section>
        )}

        {on('potential') && (
          <Section title="Potential">
            <div className="mb-2 flex gap-1">
              {(['none', 'rare', 'epic', 'unique', 'legendary'] as PotentialRank[]).map(r => (
                <button key={r} onClick={() => upd({ potential: { ...item.potential, rank: r } })}
                  className={`flex-1 rounded-md border px-1 py-1 text-[11px] transition-colors ${item.potential.rank === r ? 'bg-panel-2' : 'border-line text-muted hover:text-text'}`}
                  style={item.potential.rank === r ? { borderColor: RANK_COLOR[r], color: r === 'none' ? undefined : RANK_COLOR[r] } : {}}>
                  {RANK_LABEL[r]}
                </button>
              ))}
            </div>
            {item.potential.lines.map((l, i) => (
              <PotentialPicker key={i} index={i} value={l} disabled={item.potential.rank === 'none'}
                groups={potentialOptionGroups(slot, item.potential.rank, item.reqLevel, i + 1)}
                onChange={v => { const lines = [...item.potential.lines] as [string, string, string]; lines[i] = v; upd({ potential: { ...item.potential, lines } }) }} />
            ))}
            <div className="text-[10px] text-muted">{item.potential.rank === 'none' ? 'Pick a rank first.' : `Options for this slot at item level ${item.reqLevel >= 151 ? '151+' : '71–150'}; line 1 is always the item’s tier; lines 2–3 can be the same tier or one lower (the badge shows which). "Other…" lets you type any line.`}</div>
          </Section>
        )}

        {on('flames') && (
          <Section title="Flame" right={<Goal value={score} goal={item.flameScoreGoal} label="score" />}>
            <div className="grid grid-cols-4 gap-1.5">
              {flameKeys.map(k => (
                <label key={k} className="text-[10px] text-muted">
                  <span className="block px-0.5 uppercase">{FLAME_LABEL[k]}</span>
                  <input type="number" value={item.flame[k] || ''} placeholder="0" onChange={e => upd({ flame: { ...item.flame, [k]: Number(e.target.value) } })} className="px-1.5 py-1 text-center text-xs text-text" />
                </label>
              ))}
            </div>
            {hasFlameTarget(slot) ? (() => { const t = flameTarget(item.reqLevel, item.flameAdvantaged ?? true); return (
              <div className="mt-2 space-y-1.5 text-xs text-muted">
                <div className="flex items-center gap-2">
                  <span>Score goal</span>
                  <input type="number" value={item.flameScoreGoal || ''} placeholder="0" onChange={e => upd({ flameScoreGoal: Number(e.target.value) })} className="w-20 text-center" />
                  <div className="flex gap-1">
                    {([['Early', t.early], ['Mid', t.mid], ['Late', t.late]] as const).map(([k, v]) => (
                      <button key={k} className={`btn btn-sm ${item.flameScoreGoal === v ? 'btn-primary' : ''}`} title={`${k} game target for ${t.label}`} onClick={() => upd({ flameScoreGoal: v })}>{k} {v}</button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2"><input type="checkbox" className="w-auto" checked={item.flameAdvantaged ?? true} onChange={e => { const adv = e.target.checked; const nt = flameTarget(item.reqLevel, adv); upd({ flameAdvantaged: adv, flameScoreGoal: nt.mid }) }} />Flame-advantaged item <span className="text-muted/70">(uncheck for Superior Gollux, Sweetwater, Meister…)</span></label>
              </div>
            ) })() : null}
            <div className="mt-1 text-[10px] text-muted">Score = {describeWeights(character.flameWeights)} (change in Settings) · targets: Early ≈ 1b avg flames, Mid ≈ 10b, Late = triple T6</div>
          </Section>
        )}

        {slot === 'weapon' && (
          <Section title="Soul">
            <input value={item.soul.name} placeholder="e.g. Magnificent Lucid Soul" className="mb-1.5" onChange={e => upd({ soul: { ...item.soul, name: e.target.value } })} />
            <input value={item.soul.option} placeholder="e.g. ATT +3%" onChange={e => upd({ soul: { ...item.soul, option: e.target.value } })} />
          </Section>
        )}

        {nothing && <div className="text-xs text-muted">Nothing to enhance in this slot — just tracking what's equipped.</div>}

        <Section title="Notes">
          <textarea rows={3} value={item.notes} placeholder="Anything else (source, upgrade plan…)" onChange={e => upd({ notes: e.target.value })} />
        </Section>
      </div>
    </aside>
  )
}

/** keeps star force + goal within the item's cap whenever the cap changes (level edit, override, legacy items) */
function ClampStars({ item, maxStars, enabled, onChange }: { item: ItemInstance; maxStars: number; enabled: boolean; onChange: (it: ItemInstance) => void }) {
  useEffect(() => {
    if (!enabled) return
    const goal = item.starForceGoal > maxStars ? maxStars : item.starForceGoal
    const sf = item.starForce > maxStars ? maxStars : item.starForce
    if (goal !== item.starForceGoal || sf !== item.starForce) onChange({ ...item, starForceGoal: goal, starForce: sf })
  }, [maxStars, enabled, item, onChange])
  return null
}

/** native dropdown (wheel picker on iPhone) with an "Other…" escape hatch for free text */
function PotentialPicker({ index, value, groups, disabled, onChange }: { index: number; value: string; groups: PotentialOptionGroup[]; disabled: boolean; onChange: (v: string) => void }) {
  const known = groups.some(g => g.options.includes(value))
  const [custom, setCustom] = useState(!!value && !known)
  const selectValue = custom ? '__other__' : known ? value : ''
  const lineRank = groups.find(g => g.options.includes(value))?.rank
  return (
    <div className="mb-1.5 space-y-1">
      <div className="flex items-center gap-1.5">
        <span title={lineRank ? RANK_LABEL[lineRank] : 'No line chosen'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold"
          style={lineRank ? { borderColor: RANK_COLOR[lineRank], color: RANK_COLOR[lineRank] } : { borderColor: 'var(--color-line)', color: 'var(--color-muted)' }}>
          {lineRank ? RANK_LABEL[lineRank][0] : index + 1}
        </span>
        <select value={selectValue} disabled={disabled} className={`min-w-0 flex-1 ${value ? '' : 'text-muted'}`}
          onChange={e => { const v = e.target.value; if (v === '__other__') { setCustom(true) } else { setCustom(false); onChange(v) } }}>
          <option value="">{`Line ${index + 1}…`}</option>
          {groups.map(g => <optgroup key={g.label} label={g.label}>{g.options.map(o => <option key={o} value={o}>{o}</option>)}</optgroup>)}
          <option value="__other__">Other (type it)…</option>
        </select>
      </div>
      {custom && <input value={value} autoFocus placeholder="e.g. Boss Damage +35%" className="ml-[34px] w-[calc(100%-34px)]" onChange={e => onChange(e.target.value)} />}
    </div>
  )
}

const ALL_FLAME_KEYS: (keyof Flame)[] = ['str', 'dex', 'int', 'luk', 'att', 'matt', 'allStat', 'bossDmg', 'dmg', 'hp', 'def', 'level']
const FLAME_LABEL: Record<keyof Flame, string> = { str: 'STR', dex: 'DEX', int: 'INT', luk: 'LUK', att: 'ATT', matt: 'MATT', allStat: 'All %', bossDmg: 'Boss %', dmg: 'Dmg %', hp: 'HP', mp: 'MP', def: 'DEF', speed: 'Spd', jump: 'Jump', level: '-Lv' }

function clamp(n: number, a: number, b: number) { return Math.min(b, Math.max(a, isNaN(n) ? 0 : n)) }

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <span className="label">{title}</span>
      <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
    </div>
  )
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between"><span className="label">{title}</span>{right}</div>
      {children}
    </section>
  )
}

function Goal({ value, goal, label }: { value: number; goal: number; label?: string }) {
  if (!goal) return <span className="text-xs text-muted">{label ? `${label} ${value}` : ''}</span>
  const ok = value >= goal
  return <span className={`text-xs font-medium ${ok ? 'text-legendary' : 'text-accent'}`}>{value} / {goal}{ok ? ' ✓' : ''}</span>
}
