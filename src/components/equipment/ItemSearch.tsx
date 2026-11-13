import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { searchItems, iconUrl, type MsioItem } from '../../api/maplestoryio'
import type { SlotKey } from '../../types'
import { SLOT_BY_KEY } from '../../data/slots'

export function ItemSearch({ slot, version, onPick, onManual }: {
  slot: SlotKey; version: string
  onPick: (it: { itemId: number; name: string; reqLevel: number; iconUrl: string }) => void
  onManual: (name: string) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<MsioItem[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const abort = useRef<AbortController | null>(null)
  const def = SLOT_BY_KEY[slot]

  useEffect(() => {
    abort.current?.abort()
    if (q.trim().length < 2) { setResults([]); setErr(''); return }
    const ctl = new AbortController(); abort.current = ctl
    const t = setTimeout(async () => {
      setBusy(true); setErr('')
      try {
        const r = await searchItems(version, q, def.simple ? [] : def.categories, ctl.signal)
        if (!ctl.signal.aborted) setResults(r)
      } catch (e) {
        if (!ctl.signal.aborted) setErr(`Search failed: ${(e as Error).message}`)
      } finally { if (!ctl.signal.aborted) setBusy(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [q, version, def])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-2.5 text-muted" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${def.label.toLowerCase()}…`} className="pl-8"
          onKeyDown={e => { if (e.key === 'Enter' && results[0]) pick(results[0]) }} />
      </div>
      {busy && <div className="text-xs text-muted">Searching…</div>}
      {err && <div className="text-xs text-red-400">{err}</div>}
      <div className="max-h-80 overflow-y-auto rounded-md border border-line">
        {results.map(r => (
          <button key={r.id} onClick={() => pick(r)} className="flex w-full items-center gap-3 border-b border-line px-2 py-1.5 text-left last:border-0 hover:bg-panel-2">
            <img src={iconUrl(version, r.id)} alt="" className="pixel h-8 w-8 object-contain" loading="lazy" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{r.name}</div>
              <div className="text-[11px] text-muted">Lv. {r.requiredLevel ?? '?'} · {r.typeInfo?.subCategory ?? ''}</div>
            </div>
          </button>
        ))}
        {!busy && q.trim().length >= 2 && results.length === 0 && !err && <div className="px-3 py-3 text-xs text-muted">No results.</div>}
      </div>
      {q.trim() && (
        <button className="btn w-full justify-center" onClick={() => onManual(q.trim())}>Add "{q.trim()}" as a manual item (no icon)</button>
      )}
    </div>
  )

  function pick(r: MsioItem) {
    onPick({ itemId: r.id, name: r.name, reqLevel: r.requiredLevel ?? 0, iconUrl: iconUrl(version, r.id) })
  }
}
