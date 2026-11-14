import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Menu, Settings, Swords, Hexagon } from 'lucide-react'
import { db } from './db'
import { useUI, useIsMobile } from './store'
import { Sidebar } from './components/Sidebar'
import { EquipmentView } from './components/equipment/EquipmentView'
import { HexaView } from './components/hexa/HexaView'
import { SettingsView } from './components/SettingsView'
import { consumePairingHash, pull, schedulePush, getSyncKey } from './api/sync'

export default function App() {
  const { selectedCharacterId, view, setView, drawerOpen, setDrawer } = useUI()
  const mobile = useIsMobile()
  const character = useLiveQuery(() => selectedCharacterId ? db.characters.get(selectedCharacterId) : undefined, [selectedCharacterId])
  useSync()

  const main = view === 'settings' ? <SettingsView /> : !character ? <Empty /> : view === 'hexa' ? <HexaView character={character} /> : <EquipmentView character={character} />

  if (!mobile) {
    return (
      <div className="flex h-full">
        <Sidebar />
        <main className="min-w-0 flex-1">{main}</main>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <button className="btn btn-ghost" onClick={() => setDrawer(true)} aria-label="Characters"><Menu size={18} /></button>
        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setDrawer(true)}>
          {character?.imageUrl && <img src={character.imageUrl} alt="" className="pixel h-8 w-8 rounded bg-panel-2 object-contain" />}
          <span className="truncate text-sm font-semibold">{character?.name ?? 'Maple Helper'}</span>
          {character?.level ? <span className="text-xs text-muted">Lv. {character.level}</span> : null}
        </button>
        <button className="btn btn-ghost" onClick={() => setView('settings')} aria-label="Settings"><Settings size={18} /></button>
      </header>
      <main className="min-w-0 flex-1 overflow-hidden">{main}</main>
      <nav className="flex shrink-0 border-t border-line bg-panel" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <Tab active={view === 'equipment'} onClick={() => setView('equipment')} icon={<Swords size={18} />} label="Gear" />
        <Tab active={view === 'hexa'} onClick={() => setView('hexa')} icon={<Hexagon size={18} />} label="HEXA" />
      </nav>
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setDrawer(false)}>
          <div className="h-full w-72 max-w-[85vw] shadow-2xl" onClick={e => e.stopPropagation()} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <Sidebar />
          </div>
        </div>
      )}
    </div>
  )
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? 'text-accent' : 'text-muted'}`}>{icon}{label}</button>
  )
}

function Empty() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
      <div>
        <div className="mb-1 text-base text-text">No character selected</div>
        Add one from the character list (+) to start tracking gear and HEXA.
      </div>
    </div>
  )
}

/** pairing link → key; pull on start and when the tab becomes visible; push (debounced) after local changes */
function useSync() {
  const stamp = useLiveQuery(async () => {
    const [c, h, t] = await Promise.all([db.characters.toArray(), db.hexa.toArray(), db.templates.toArray()])
    return Math.max(0, ...c.map(x => x.updatedAt ?? 0), ...h.map(x => x.updatedAt ?? 0), ...t.map(x => x.createdAt ?? 0))
  }, [])
  const first = useRef(true)
  useEffect(() => {
    consumePairingHash()
    if (getSyncKey()) pull().catch(e => console.warn('sync pull', e))
    const onVis = () => { if (document.visibilityState === 'visible' && getSyncKey()) pull().catch(() => {}) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  useEffect(() => {
    if (stamp === undefined) return
    if (first.current) { first.current = false; return }
    schedulePush()
  }, [stamp])
}
