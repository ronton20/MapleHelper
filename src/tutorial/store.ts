import { useEffect } from 'react'
import { create } from 'zustand'
import type { GuideStep } from './guides'

/**
 * Tutorial state. A page / dialog "registers" its guided tour while it is on screen (useTour); the overlay runs the
 * first registered tour (in TOUR_ORDER) that hasn't been seen yet. Seen tours and "skip tutorial" are remembered.
 * The same store opens the "?" help panel and runs one-step "Show me" spotlights from it.
 */
const LS = 'maple-helper.tutorial'
const saved: { seen?: string[]; skipped?: boolean } = (() => { try { return JSON.parse(localStorage.getItem(LS) ?? '{}') } catch { return {} } })()

export interface ActiveTour { id: string; step: number; dir: 1 | -1; single?: GuideStep }

interface TutorialState {
  seen: string[]
  skipped: boolean
  registered: string[]
  active: ActiveTour | null
  paused: ActiveTour | null      // a page tour put aside while a dialog's own tour runs
  help: string | null
  modals: number                 // dialogs open right now (page tours wait / pause while one is open)
  modalOpened: () => void
  modalClosed: () => void
  register: (id: string) => void
  unregister: (id: string) => void
  start: (id: string, single?: GuideStep) => void
  go: (step: number, dir: 1 | -1) => void
  finish: (markSeen: boolean) => void
  suspend: () => void
  resume: () => void
  skipAll: () => void
  reset: () => void
  openHelp: (id: string | null) => void
}

export const useTutorial = create<TutorialState>((set) => ({
  seen: saved.seen ?? [],
  skipped: saved.skipped ?? false,
  registered: [],
  active: null,
  paused: null,
  help: null,
  modals: 0,
  modalOpened: () => set(s => ({ modals: s.modals + 1 })),
  modalClosed: () => set(s => ({ modals: Math.max(0, s.modals - 1) })),
  register: (id) => set(s => s.registered.includes(id) ? s : { registered: [...s.registered, id] }),
  unregister: (id) => set(s => ({ registered: s.registered.filter(x => x !== id) })),
  start: (id, single) => set({ active: { id, step: 0, dir: 1, single }, help: null }),
  go: (step, dir) => set(s => s.active ? { active: { ...s.active, step, dir } } : s),
  finish: (markSeen) => set(s => ({ active: null, seen: markSeen && s.active && !s.seen.includes(s.active.id) ? [...s.seen, s.active.id] : s.seen })),
  suspend: () => set(s => ({ paused: s.active, active: null })),
  resume: () => set(s => ({ active: s.registered.includes(s.paused?.id ?? '') ? s.paused : null, paused: null })),
  skipAll: () => set({ skipped: true, active: null, paused: null }),
  reset: () => set({ seen: [], skipped: false, active: null, paused: null }),
  openHelp: (help) => set({ help }),
}))

useTutorial.subscribe(s => {
  try { localStorage.setItem(LS, JSON.stringify({ seen: s.seen, skipped: s.skipped })) } catch { /* ignore */ }
})

/** offer the guided tour `id` while this component is on screen (and `enabled`) */
export function useTour(id: string, enabled = true) {
  const register = useTutorial(s => s.register), unregister = useTutorial(s => s.unregister)
  useEffect(() => {
    if (!enabled) return
    register(id)
    return () => unregister(id)
  }, [id, enabled, register, unregister])
}

/** call in a dialog: page tours don't start (or pause) while it is open */
export function useModalOpen() {
  const opened = useTutorial(s => s.modalOpened), closed = useTutorial(s => s.modalClosed)
  useEffect(() => { opened(); return () => closed() }, [opened, closed])
}

/** first visible element with this data-tour name (ignores copies inside the tutorial's own UI) */
export function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    if (el.closest('[data-tutorial-ui]')) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}
