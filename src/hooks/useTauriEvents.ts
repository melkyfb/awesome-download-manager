import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useDispatch } from 'react-redux'
import type { AppDispatch } from '../store'
import { updateProgress, completeDownload, setDownloadError } from '../store/downloadsSlice'

interface ProgressPayload {
  id: string
  downloaded_bytes: number
  total_bytes: number | null
  speed_bps: number
  eta_seconds: number | null
  chunk_speeds: number[]
}

interface CompletePayload {
  id: string
  sha256: string
}

interface ErrorPayload {
  id: string
  error: string
}

export function useTauriEvents() {
  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      listen<ProgressPayload>('download:progress', (event) => {
        dispatch(updateProgress({
          id: event.payload.id,
          downloaded_bytes: event.payload.downloaded_bytes,
          speed_bps: event.payload.speed_bps,
          eta_seconds: event.payload.eta_seconds,
          chunk_speeds: event.payload.chunk_speeds,
        }))
      }),
      listen<CompletePayload>('download:complete', (event) => {
        dispatch(completeDownload({
          id: event.payload.id,
          sha256: event.payload.sha256,
        }))
      }),
      listen<ErrorPayload>('download:error', (event) => {
        dispatch(setDownloadError({
          id: event.payload.id,
          error: event.payload.error,
        }))
      }),
    ]

    return () => {
      unlisteners.forEach(p => p.then(fn => fn()))
    }
  }, [dispatch])
}
