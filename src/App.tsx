import { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import type { RootState, AppDispatch } from './store'
import { setConfig } from './store/configSlice'
import { setAppearance } from './store/appearanceSlice'
import { upsertDownload } from './store/downloadsSlice'
import { openChangelog, closeChangelog } from './store/uiSlice'
import { relaunch } from '@tauri-apps/plugin-process'
import { useTauriEvents } from './hooks/useTauriEvents'
import { useForegroundService } from './hooks/useForegroundService'
import { useUpdateCheck } from './hooks/useUpdateCheck'
import { ThemeProvider } from './providers/ThemeProvider'
import { AppShell } from './components/layout/AppShell'
import { DownloadList } from './components/downloads/DownloadList'
import { SettingsScreen } from './components/settings/SettingsScreen'
import { AboutScreen } from './components/about/AboutScreen'
import { AddDownloadFAB } from './components/add/AddDownloadFAB'
import { AddDownloadButton } from './components/add/AddDownloadButton'
import { AddDownloadSheet } from './components/add/AddDownloadSheet'
import { AddDownloadDialog } from './components/add/AddDownloadDialog'
import { CloseDialog } from './components/CloseDialog'
import { ChangelogModal } from './components/ChangelogModal'
import Snackbar from '@mui/material/Snackbar'
import { hideSnackbar } from './store/uiSlice'
import type { Config, Download } from './types'

function AppContent() {
  const { i18n } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const settingsOpen = useSelector((s: RootState) => s.ui.settingsOpen)
  const changelogOpen = useSelector((s: RootState) => s.ui.changelogOpen)
  const aboutOpen = useSelector((s: RootState) => s.ui.aboutOpen)
  const closeDialogOpen = useSelector((s: RootState) => s.ui.closeDialogOpen)
  const snackbar = useSelector((s: RootState) => s.ui.snackbar)
  const language = useSelector((s: RootState) => s.appearance.language)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const updateState = useUpdateCheck()
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [updateProgress, setUpdateProgress] = useState(0)

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

  const title = settingsOpen ? 'Configurações' : aboutOpen ? 'Sobre' : 'Downloads'
  const desktopActions = !settingsOpen && !aboutOpen && !isMobile ? <AddDownloadButton /> : undefined

  return (
    <AppShell
      title={title}
      topBarActions={desktopActions}
      hasUpdate={updateState.hasUpdate}
      onUpdate={() => dispatch(openChangelog())}
    >
      {settingsOpen ? <SettingsScreen /> : aboutOpen ? <AboutScreen /> : <DownloadList />}

      {isMobile ? <AddDownloadSheet /> : <AddDownloadDialog />}
      {isMobile && !settingsOpen && !aboutOpen && <AddDownloadFAB />}

      {closeDialogOpen && <CloseDialog />}
      {changelogOpen && (
        <ChangelogModal
          currentVersion={updateState.currentVersion}
          hasUpdate={updateState.hasUpdate}
          latestVersion={updateState.latestVersion}
          releaseNotes={updateState.releases[0]?.body}
          isUpdating={isUpdating}
          updateError={updateError}
          updateProgress={updateProgress}
          onUpdate={updateState.update ? async () => {
            setIsUpdating(true)
            setUpdateError(null)
            setUpdateProgress(0)
            let totalBytes = 0
            let downloadedBytes = 0
            try {
              await updateState.update!.downloadAndInstall((event) => {
                if (event.event === 'Started') {
                  totalBytes = event.data.contentLength ?? 0
                } else if (event.event === 'Progress') {
                  downloadedBytes += event.data.chunkLength
                  if (totalBytes > 0) {
                    setUpdateProgress(Math.round(downloadedBytes / totalBytes * 100))
                  }
                } else if (event.event === 'Finished') {
                  setUpdateProgress(100)
                }
              })
              dispatch(closeChangelog())
              await relaunch()
            } catch (e) {
              setUpdateError(String(e))
            } finally {
              setIsUpdating(false)
            }
          } : undefined}
        />
      )}
      <Snackbar
        open={snackbar.open}
        message={snackbar.message}
        autoHideDuration={5000}
        onClose={() => dispatch(hideSnackbar())}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </AppShell>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}
