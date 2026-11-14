import type { SlotKey } from '../types'

export interface SlotDef {
  key: SlotKey
  label: string
  /** maplestory.io subCategory names that fit this slot */
  categories: string[]
  /** grid position: col 1..7, row 1..6 (cols 3-5 are the center block) */
  col: number
  row: number
  /** slots with no upgrades (title/medal etc.) */
  simple?: boolean
}

/** what can be enhanced in a slot: true = always, false = never, 'opt' = depends on the item/class (checkbox on the item) */
export type Cap = boolean | 'opt'
export interface SlotCaps { stars: Cap; potential: Cap; flames: Cap }
export const SLOT_CAPS: Record<SlotKey, SlotCaps> = {
  ring1: { stars: true, potential: true, flames: false },
  ring2: { stars: true, potential: true, flames: false },
  ring3: { stars: true, potential: true, flames: false },
  ring4: { stars: true, potential: true, flames: false },
  belt: { stars: true, potential: true, flames: true },
  pocket: { stars: false, potential: false, flames: true },
  face: { stars: true, potential: true, flames: true },
  eye: { stars: true, potential: true, flames: true },
  earrings: { stars: true, potential: true, flames: true },
  pendant1: { stars: true, potential: true, flames: true },
  pendant2: { stars: true, potential: true, flames: true },
  hat: { stars: true, potential: true, flames: true },
  top: { stars: true, potential: true, flames: true },
  bottom: { stars: true, potential: true, flames: true },
  shoulder: { stars: true, potential: true, flames: false },
  android: { stars: false, potential: false, flames: false },
  title: { stars: false, potential: false, flames: false },
  cape: { stars: true, potential: true, flames: true },
  gloves: { stars: true, potential: true, flames: true },
  shoes: { stars: true, potential: true, flames: true },
  medal: { stars: false, potential: false, flames: false },
  heart: { stars: true, potential: true, flames: false },
  badge: { stars: 'opt', potential: 'opt', flames: false },
  weapon: { stars: true, potential: true, flames: true },
  secondary: { stars: 'opt', potential: true, flames: 'opt' },
  emblem: { stars: false, potential: true, flames: false },
}
export const CAP_LABEL: Record<keyof SlotCaps, string> = { stars: 'Star Force', potential: 'Potential', flames: 'Flames' }

/** resolve a capability for a concrete item (optional caps default to off) */
export function capOn(slot: SlotKey, cap: keyof SlotCaps, enabled?: Partial<Record<keyof SlotCaps, boolean>>): boolean {
  const c = SLOT_CAPS[slot][cap]
  return c === 'opt' ? !!enabled?.[cap] : c
}

// Layout mirrors the in-game Equipment window:
// col1: Ring1-4, Belt, Pocket | col2: Face, Eye, Earrings, Pendant1-2
// center: character (rows1-4), Weapon / Sub Weapon / Emblem (row5)
// col6: Hat, Top, Bottom, Shoulder, Android, Title | col7: Cape, Gloves, Shoes, Medal, Mech Heart, Badge
export const SLOTS: SlotDef[] = [
  { key: 'ring1', label: 'Ring 1', categories: ['Ring'], col: 1, row: 1 },
  { key: 'ring2', label: 'Ring 2', categories: ['Ring'], col: 1, row: 2 },
  { key: 'ring3', label: 'Ring 3', categories: ['Ring'], col: 1, row: 3 },
  { key: 'ring4', label: 'Ring 4', categories: ['Ring'], col: 1, row: 4 },
  { key: 'belt', label: 'Belt', categories: ['Belt'], col: 1, row: 5 },
  { key: 'pocket', label: 'Pocket', categories: ['Pocket Item'], col: 1, row: 6 },

  { key: 'face', label: 'Face Acc', categories: ['Face Accessory'], col: 2, row: 1 },
  { key: 'eye', label: 'Eye Acc', categories: ['Eye Decoration'], col: 2, row: 2 },
  { key: 'earrings', label: 'Earrings', categories: ['Earrings'], col: 2, row: 3 },
  { key: 'pendant1', label: 'Pendant 1', categories: ['Pendant'], col: 2, row: 4 },
  { key: 'pendant2', label: 'Pendant 2', categories: ['Pendant'], col: 2, row: 5 },

  { key: 'weapon', label: 'Weapon', categories: ['One-Handed Weapon', 'Two-Handed Weapon', 'Weapon'], col: 3, row: 5 },
  { key: 'secondary', label: 'Sub Weapon', categories: ['Secondary Weapon', 'Shield', 'Sub Weapon'], col: 4, row: 5 },
  { key: 'emblem', label: 'Emblem', categories: ['Emblem'], col: 5, row: 5 },

  { key: 'hat', label: 'Hat', categories: ['Hat'], col: 6, row: 1 },
  { key: 'top', label: 'Top', categories: ['Top', 'Overall'], col: 6, row: 2 },
  { key: 'bottom', label: 'Bottom', categories: ['Bottom'], col: 6, row: 3 },
  { key: 'shoulder', label: 'Shoulder', categories: ['Shoulder Accessory'], col: 6, row: 4 },
  { key: 'android', label: 'Android', categories: ['Android'], col: 6, row: 5, simple: true },
  { key: 'title', label: 'Title', categories: ['Title', 'Medal'], col: 6, row: 6, simple: true },

  { key: 'cape', label: 'Cape', categories: ['Cape'], col: 7, row: 1 },
  { key: 'gloves', label: 'Gloves', categories: ['Glove'], col: 7, row: 2 },
  { key: 'shoes', label: 'Shoes', categories: ['Shoes'], col: 7, row: 3 },
  { key: 'medal', label: 'Medal', categories: ['Medal'], col: 7, row: 4, simple: true },
  { key: 'heart', label: 'Mech Heart', categories: ['Mechanical Heart'], col: 7, row: 5 },
  { key: 'badge', label: 'Badge', categories: ['Badge'], col: 7, row: 6, simple: true },
]

export const SLOT_BY_KEY: Record<SlotKey, SlotDef> = Object.fromEntries(SLOTS.map(s => [s.key, s])) as Record<SlotKey, SlotDef>

