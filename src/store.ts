import { create } from 'zustand'
import type { SlotKey } from './types'

export type View = 'equipment' | 'hexa' | 'settings' | 'admin'

interface UIState {
  selectedCharacterId: string | null
  view: View
  selectedSlot: SlotKey | null
  drawerOpen: boolean
  setDrawer: (open: boolean) => void
  setCharacter: (id: string | null) => void
  setView: (v: View) => void
  setSlot: (s: SlotKey | null) => void
}

const LS_KEY = 'maple-helper.ui'
const saved = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') } catch { return {} } })()

export const useUI = create<UIState>((set) => ({
  selectedCharacterId: saved.selectedCharacterId ?? null,
  view: saved.view === 'admin' ? 'settings' : (saved.view ?? 'equipment'),
  selectedSlot: null,
  drawerOpen: false,
  setDrawer: (drawerOpen) => set({ drawerOpen }),
  setCharacter: (id) => set({ selectedCharacterId: id, selectedSlot: null, drawerOpen: false }),
  setView: (view) => set({ view, drawerOpen: false }),
  setSlot: (selectedSlot) => set({ selectedSlot }),
}))

useUI.subscribe((s) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ selectedCharacterId: s.selectedCharacterId, view: s.view })) } catch { /* ignore */ }
})

import { useEffect, useState } from 'react'
/** true below the desktop breakpoint (phones / small tablets) */
export function useIsMobile(maxWidth = 900) {
  const q = `(max-width: ${maxWidth}px)`
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => { const mq = window.matchMedia(q); const h = () => setM(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h) }, [q])
  return m
}
