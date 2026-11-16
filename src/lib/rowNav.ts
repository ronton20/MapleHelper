import type { FocusEvent, KeyboardEvent } from 'react'

/**
 * Spreadsheet-style number inputs: ↑/↓ (and Enter) jump to the same input on the previous / next row instead of
 * changing the value, and focusing an input selects its value so typing replaces it.
 * Give every input of one list the same `data-nav` value and spread `rowNav` onto it.
 */
export function rowNavProps(group: string) {
  return {
    'data-nav': group,
    onFocus: (e: FocusEvent<HTMLInputElement>) => e.currentTarget.select(),
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter') return
      e.preventDefault()
      const all = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-nav="${group}"]`))
      const next = all[all.indexOf(e.currentTarget) + (e.key === 'ArrowUp' ? -1 : 1)]
      if (next) { next.focus(); next.scrollIntoView({ block: 'nearest' }) }
    },
  }
}
