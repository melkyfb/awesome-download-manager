import { useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import type { RootState, AppDispatch } from './store'
import { setConfig } from './store/configSlice'
import { upsertDownload } from './store/downloadsSlice'
import { useTauriEvents } from './hooks/useTauriEvents'
import { GlobalSpeedBar } from './components/GlobalSpeedBar'
import { DownloadCard } from './components/DownloadCard'
import { AddDownloadModal } from './components/AddDownloadModal'
import { SettingsPage } from './components/SettingsPage'
import type { Config, Download } from './types'

export default function App() {
  const dispatch = useDispatch<AppDispatch>()
  const downloads = useSelector((s: RootState) => Object.values(s.downloads.items))
  const addModalOpen = useSelector((s: RootState) => s.ui.addModalOpen)
  const settingsOpen = useSelector((s: RootState) => s.ui.settingsOpen)

  useTauriEvents()

  useEffect(() => {
    async function init() {
      try {
        const [settings, existingDownloads] = await Promise.all([
          invoke<Config>('get_settings'),
          invoke<Download[]>('list_downloads'),
        ])
        dispatch(setConfig(settings))
        existingDownloads.forEach(dl => dispatch(upsertDownload(dl)))
        await invoke('restart_active_downloads')
      } catch (e) {
        console.error('App init failed', e)
      }
    }
    init()
  }, [dispatch])

  const sorted = [...downloads].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <GlobalSpeedBar />

      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-lg">No downloads yet</p>
            <p className="text-sm">Click "+ New Download" to get started</p>
          </div>
        )}
        {sorted.map(dl => <DownloadCard key={dl.id} download={dl} />)}
      </main>

      {addModalOpen && <AddDownloadModal />}
      {settingsOpen && <SettingsPage />}
    </div>
  )
}
