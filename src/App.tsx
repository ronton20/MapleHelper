import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useUI } from './store'
import { Sidebar } from './components/Sidebar'
import { EquipmentView } from './components/equipment/EquipmentView'
import { HexaView } from './components/hexa/HexaView'
import { SettingsView } from './components/SettingsView'

export default function App() {
  const { selectedCharacterId, view } = useUI()
  const character = useLiveQuery(() => selectedCharacterId ? db.characters.get(selectedCharacterId) : undefined, [selectedCharacterId])

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1">
        {view === 'settings' ? <SettingsView /> :
          !character ? <Empty /> :
            view === 'hexa' ? <HexaView character={character} /> : <EquipmentView character={character} />}
      </main>
    </div>
  )
}

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-center text-sm text-muted">
      <div>
        <div className="mb-1 text-base text-text">No character selected</div>
        Add one from the sidebar (+) to start tracking gear and HEXA.
      </div>
    </div>
  )
}
