import { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import type { RootState } from '../store'

export function useForegroundService() {
  const items = useSelector((s: RootState) => s.downloads.items)
  const serviceStarted = useRef(false)

  useEffect(() => {
    const activeDownloads = Object.values(items).filter(d => d.status === 'active')
    const count = activeDownloads.length

    if (count > 0) {
      const first = activeDownloads[0]
      const progress = first.total_bytes
        ? Math.round((first.downloaded_bytes / first.total_bytes) * 100)
        : 0
      serviceStarted.current = true
      invoke('plugin:foreground-service|start', {
        filename: first.filename,
        progress,
      }).catch(() => {})
    } else if (serviceStarted.current) {
      serviceStarted.current = false
      invoke('plugin:foreground-service|stop', undefined).catch(() => {})
    }
  }, [items])
}
