import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import type { RootState, AppDispatch } from '../store'
import { setExpandedCard } from '../store/uiSlice'
import { removeDownload } from '../store/downloadsSlice'
import type { Download } from '../types'
import { DownloadCardExpanded } from './DownloadCardExpanded'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-500',
  paused: 'bg-yellow-500',
  complete: 'bg-green-500',
  error: 'bg-red-500',
  cancelled: 'bg-gray-400',
}

export function DownloadCard({ download }: { download: Download }) {
  const dispatch = useDispatch<AppDispatch>()
  const expandedId = useSelector((s: RootState) => s.ui.expandedCardId)
  const isExpanded = expandedId === download.id

  const percent = download.total_bytes
    ? Math.min(100, Math.round((download.downloaded_bytes / download.total_bytes) * 100))
    : 0

  async function handlePause() {
    await invoke('pause_download', { id: download.id })
  }

  async function handleCancel() {
    await invoke('cancel_download', { id: download.id })
    dispatch(removeDownload(download.id))
  }

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => dispatch(setExpandedCard(isExpanded ? null : download.id))}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-gray-900 truncate max-w-xs">{download.filename}</span>
        <div className="flex items-center gap-2">
          {download.total_bytes && (
            <span className="text-xs text-gray-500">{formatBytes(download.total_bytes)}</span>
          )}
          <span className={`text-xs text-white px-2 py-0.5 rounded-full ${STATUS_COLORS[download.status] ?? 'bg-gray-400'}`}>
            {download.status}
          </span>
        </div>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {percent}% · {formatBytes(download.downloaded_bytes)}
          {download.speed_bps ? ` · ${formatSpeed(download.speed_bps)}` : ''}
          {download.eta_seconds ? ` · ETA ${download.eta_seconds}s` : ''}
        </span>
        {download.status === 'active' && (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button onClick={handlePause} className="text-yellow-600 hover:text-yellow-800">Pause</button>
            <button onClick={handleCancel} className="text-red-500 hover:text-red-700">Cancel</button>
          </div>
        )}
      </div>

      {isExpanded && <DownloadCardExpanded download={download} />}
    </div>
  )
}
