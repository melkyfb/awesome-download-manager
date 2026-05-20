import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useDispatch } from 'react-redux'
import { store } from '../store'
import type { AppDispatch } from '../store'
import { updateProgress, updateFilename, completeDownload, setDownloadError } from '../store/downloadsSlice'
import { openCloseDialog, openAddModal, openSettings, setPrefillUrl, clearPlaylistGroup, showSnackbar } from '../store/uiSlice'

interface ProgressPayload {
  id: string
  downloaded_bytes: number
  total_bytes: number | null
  speed_bps: number
  eta_seconds: number | null
  chunk_speeds: number[]
  percent?: number
  step?: string
}

interface MetadataPayload {
  id: string
  title: string
}

interface CompletePayload {
  id: string
  sha256: string
  bytes?: number | null
}

interface ErrorPayload {
  id: string
  error: string
}

async function checkPlaylistCompletion(dispatch: AppDispatch) {
  const state = store.getState()
  const { playlistGroups } = state.ui
  const { items } = state.downloads

  for (const [groupId, group] of Object.entries(playlistGroups)) {
    if (!group.generateFile) continue
    const allDone = group.ids.every(id => items[id]?.status === 'complete')
    if (!allDone) continue

    const paths = group.ids.map(id => items[id]?.dest_path ?? '').filter(Boolean)
    const titles = group.ids.map(id => items[id]?.filename ?? 'video')

    try {
      const filePath = await invoke<string>('generate_playlist_file', {
        paths,
        titles,
        format: group.fileFormat,
        destFolder: group.destFolder,
        name: group.name,
      })
      dispatch(showSnackbar(`Playlist salva: ${filePath}`))
    } catch (e) {
      dispatch(showSnackbar(`Erro ao gerar playlist: ${String(e)}`))
    } finally {
      dispatch(clearPlaylistGroup({ groupId }))
    }
  }
}

export function useTauriEvents() {
  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      listen<ProgressPayload>('download:progress', (event) => {
        dispatch(updateProgress({
          id: event.payload.id,
          downloaded_bytes: event.payload.downloaded_bytes,
          total_bytes: event.payload.total_bytes,
          speed_bps: event.payload.speed_bps,
          eta_seconds: event.payload.eta_seconds,
          chunk_speeds: event.payload.chunk_speeds,
          percent: event.payload.percent,
          step: event.payload.step,
        }))
      }),
      listen<MetadataPayload>('download:metadata', (event) => {
        dispatch(updateFilename({ id: event.payload.id, title: event.payload.title }))
      }),
      listen<CompletePayload>('download:complete', (event) => {
        dispatch(completeDownload({
          id: event.payload.id,
          sha256: event.payload.sha256,
          bytes: event.payload.bytes,
        }))
        setTimeout(() => checkPlaylistCompletion(dispatch), 0)
      }),
      listen<ErrorPayload>('download:error', (event) => {
        dispatch(setDownloadError({
          id: event.payload.id,
          error: event.payload.error,
        }))
      }),
      listen('window:close-requested', () => {
        dispatch(openCloseDialog())
      }),
      listen('tray:new-download', () => {
        dispatch(openAddModal())
      }),
      listen('tray:open-settings', () => {
        dispatch(openSettings())
      }),
      listen<string>('clipboard:download-url', (event) => {
        dispatch(setPrefillUrl(event.payload))
        dispatch(openAddModal())
      }),
      listen('tray:resume-all', async () => {
        await invoke('restart_active_downloads')
      }),
    ]

    const win = getCurrentWebviewWindow()
    const unlistenFocus = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        invoke<string | null>('get_pending_clipboard_url').then((url) => {
          if (url) {
            dispatch(setPrefillUrl(url))
            dispatch(openAddModal())
          }
        })
      }
    })

    return () => {
      unlisteners.forEach(p => p.then(fn => fn()))
      unlistenFocus.then(fn => fn())
    }
  }, [dispatch])
}
