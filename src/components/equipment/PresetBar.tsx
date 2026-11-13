import { useState } from 'react'
import { Plus, Copy, Trash2, Pencil, Check } from 'lucide-react'
import { nanoid } from 'nanoid'
import { updateCharacter, newPreset } from '../../db'
import type { Character } from '../../types'

export function PresetBar({ character }: { character: Character }) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const active = character.activePresetId
  const set = (fn: (c: Character) => Character) => updateCharacter(character.id, fn)

  function add() {
    const p = newPreset(`Preset ${character.presets.length + 1}`)
    set(c => ({ ...c, presets: [...c.presets, p], activePresetId: p.id }))
  }
  function duplicate() {
    const src = character.presets.find(p => p.id === active)!
    const p = { ...structuredClone(src), id: nanoid(8), name: `${src.name} copy` }
    set(c => ({ ...c, presets: [...c.presets, p], activePresetId: p.id }))
  }
  function remove() {
    if (character.presets.length <= 1) return
    const src = character.presets.find(p => p.id === active)!
    if (!confirm(`Delete preset "${src.name}"?`)) return
    set(c => { const presets = c.presets.filter(p => p.id !== active); return { ...c, presets, activePresetId: presets[0].id } })
  }
  function startRename(id: string, name: string) { setRenaming(id); setDraft(name) }
  function commitRename() {
    const name = draft.trim(); const id = renaming
    setRenaming(null)
    if (!id || !name) return
    set(c => ({ ...c, presets: c.presets.map(p => p.id === id ? { ...p, name } : p) }))
  }

  return (
    <div className="flex items-center gap-1 border-b border-line px-6 py-2">
      <span className="label mr-2">Presets</span>
      {character.presets.map(p => (
        <div key={p.id} className={`flex items-center rounded-md border text-xs transition-colors ${p.id === active ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line bg-panel-2 text-muted hover:text-text'}`}>
          {renaming === p.id ? (
            <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={commitRename} onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null) }}
              className="h-7 w-32 rounded-md border-0 bg-transparent px-2 py-0 text-xs" />
          ) : (
            <button className="px-3 py-1.5" onClick={() => set(c => ({ ...c, activePresetId: p.id }))} onDoubleClick={() => startRename(p.id, p.name)}>{p.name}</button>
          )}
          {p.id === active && renaming !== p.id && (
            <button className="pr-2 opacity-60 hover:opacity-100" title="Rename" onClick={() => startRename(p.id, p.name)}><Pencil size={11} /></button>
          )}
          {renaming === p.id && <button className="pr-2" onMouseDown={commitRename}><Check size={11} /></button>}
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={add} title="New preset"><Plus size={14} /></button>
      <button className="btn btn-ghost btn-sm" onClick={duplicate} title="Duplicate preset"><Copy size={13} /></button>
      <button className="btn btn-ghost btn-sm" onClick={remove} title="Delete preset" disabled={character.presets.length <= 1}><Trash2 size={13} /></button>
    </div>
  )
}
