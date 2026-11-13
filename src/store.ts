import { create } from 'zustand'
import type { SlotKey } from './types'

export type View = 'equipment' | 'hexa' | 'settings'

interface UIState {
  selectedCharacterId: string | null
  view: View
  selectedSlot: SlotKey | null
  setCharacter: (id: string | null) => void
  setView: (v: View) => void
  setSlot: (s: SlotKey | null) => void
}

const LS_KEY = 'maple-helper.ui'
const saved = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') } catch { return {} } })()

export const useUI = create<UIState>((set) => ({
  selectedCharacterId: saved.selectedCharacterId ?? null,
  view: saved.view ?? 'equipment',
  selectedSlot: null,
  setCharacter: (id) => set({ selectedCharacterId: id, selectedSlot: null }),
  setView: (view) => set({ view }),
  setSlot: (selectedSlot) => set({ selectedSlot }),
}))

useUI.subscribe((s) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ selectedCharacterId: s.selectedCharacterId, view: s.view })) } catch { /* ignore */ }
})
