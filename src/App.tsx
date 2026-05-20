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
import { openChangelog, closeChangelog, showSnackbar, hideSnackbar } from './store/uiSlice'
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
  const [updateTotalBytes, setUpdateTotalBytes] = useState(0)
  const [updateDownloadedBytes, setUpdateDownloadedBytes] = useState(0)
  const [updateSpeedBps, setUpdateSpeedBps] = useState(0)
  const [updateEtaSeconds, setUpdateEtaSeconds] = useState<number | null>(null)

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

  async function handleCheckForUpdate() {
    const result = await updateState.checkNow()
    if (result.hasUpdate) {
      dispatch(openChangelog())
    } else {
      dispatch(showSnackbar('Você já tem a versão mais recente.'))
    }
  }

  const title = settingsOpen ? 'Configurações' : aboutOpen ? 'Sobre' : 'Downloads'
  const desktopActions = !settingsOpen && !aboutOpen && !isMobile ? <AddDownloadButton /> : undefined

  return (
    <AppShell
      title={title}
      topBarActions={desktopActions}
      hasUpdate={updateState.hasUpdate}
      loadingUpdate={updateState.loading}
      onCheckForUpdate={handleCheckForUpdate}
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
          releases={updateState.releases}
          isUpdating={isUpdating}
          updateError={updateError}
          updateProgress={updateProgress}
          totalBytes={updateTotalBytes}
          downloadedBytes={updateDownloadedBytes}
          speedBps={updateSpeedBps}
          etaSeconds={updateEtaSeconds}
          onUpdate={updateState.update ? async () => {
            setIsUpdating(true)
            setUpdateError(null)
            setUpdateProgress(0)
            setUpdateTotalBytes(0)
            setUpdateDownloadedBytes(0)
            setUpdateSpeedBps(0)
            setUpdateEtaSeconds(null)
            let totalBytes = 0
            let downloadedBytes = 0
            const startTime = Date.now()
            try {
              await updateState.update!.downloadAndInstall((event) => {
                if (event.event === 'Started') {
                  totalBytes = event.data.contentLength ?? 0
                  setUpdateTotalBytes(totalBytes)
                } else if (event.event === 'Progress') {
                  downloadedBytes += event.data.chunkLength
                  const elapsed = (Date.now() - startTime) / 1000
                  const speed = elapsed > 0 ? Math.round(downloadedBytes / elapsed) : 0
                  const remaining = totalBytes > 0 ? totalBytes - downloadedBytes : 0
                  const eta = speed > 0 && remaining > 0 ? Math.round(remaining / speed) : null
                  setUpdateDownloadedBytes(downloadedBytes)
                  setUpdateSpeedBps(speed)
                  setUpdateEtaSeconds(eta)
                  if (totalBytes > 0) {
                    setUpdateProgress(Math.round(downloadedBytes / totalBytes * 100))
                  }
                } else if (event.event === 'Finished') {
                  setUpdateProgress(100)
                  setUpdateEtaSeconds(null)
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
