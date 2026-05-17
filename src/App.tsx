import { useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from './store'
import { setConfig } from './store/configSlice'
import { setAppearance } from './store/appearanceSlice'
import { upsertDownload } from './store/downloadsSlice'
import { useTauriEvents } from './hooks/useTauriEvents'
import { useForegroundService } from './hooks/useForegroundService'
import { ThemeProvider } from './providers/ThemeProvider'
import { FontProvider } from './providers/FontProvider'
import { AppBackground } from './components/AppBackground'
import { GlobalSpeedBar } from './components/GlobalSpeedBar'
import { DownloadCard } from './components/DownloadCard'
import { AddDownloadModal } from './components/AddDownloadModal'
import { SettingsPage } from './components/SettingsPage'
import type { Config, Download } from './types'

export default function App() {
  const { t, i18n } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const downloads = useSelector((s: RootState) => Object.values(s.downloads.items))
  const addModalOpen = useSelector((s: RootState) => s.ui.addModalOpen)
  const settingsOpen = useSelector((s: RootState) => s.ui.settingsOpen)
  const language = useSelector((s: RootState) => s.appearance.language)

  useTauriEvents()
  useForegroundService()

  useEffect(() => {
    i18n.changeLanguage(language)
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  }, [language, i18n])

  useEffect(() => {
    async function init() {
      try {
        const [settings, existingDownloads] = await Promise.all([
          invoke<Config>('get_settings'),
          invoke<Download[]>('list_downloads'),
        ])
        dispatch(setConfig(settings))
        dispatch(setAppearance({
          themeId: settings.theme_id,
          fontId: settings.font_id,
          language: settings.language,
        }))
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
    <ThemeProvider>
      <FontProvider>
        <AppBackground>
          <div className="h-screen flex flex-col">
            <GlobalSpeedBar />
            <main className="flex-1 overflow-y-auto p-4 space-y-3">
              {sorted.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-secondary)' }}>
                  <p className="text-lg">{t('empty.title')}</p>
                  <p className="text-sm">{t('empty.subtitle')}</p>
                </div>
              )}
              {sorted.map(dl => <DownloadCard key={dl.id} download={dl} />)}
            </main>
            {addModalOpen && <AddDownloadModal />}
            {settingsOpen && <SettingsPage />}
          </div>
        </AppBackground>
      </FontProvider>
    </ThemeProvider>
  )
}
