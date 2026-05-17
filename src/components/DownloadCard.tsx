import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from '../store'
import { setExpandedCard } from '../store/uiSlice'
import { upsertDownload, removeDownload } from '../store/downloadsSlice'
import type { Download } from '../types'
import { DownloadCardExpanded } from './DownloadCardExpanded'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`
}

function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600)
    const m = Math.round((seconds % 3600) / 60)
    return m > 0 ? `${h}h ${m}min` : `${h}h`
  }
  if (seconds < 2592000) return `${Math.round(seconds / 86400)}d`
  if (seconds < 31536000) return `${Math.round(seconds / 2592000)} meses`
  return `${(seconds / 31536000).toFixed(1)} anos`
}

export function DownloadCard({ download }: { download: Download }) {
  const dispatch = useDispatch<AppDispatch>()
  const expandedId = useSelector((s: RootState) => s.ui.expandedCardId)
  const isExpanded = expandedId === download.id
  const { t } = useTranslation()

  const percent = download.total_bytes
    ? Math.min(100, Math.round((download.downloaded_bytes / download.total_bytes) * 100))
    : 0

  async function handlePause() {
    try {
      await invoke('pause_download', { id: download.id })
      dispatch(upsertDownload({ ...download, status: 'paused', speed_bps: 0, eta_seconds: null, chunk_speeds: [] }))
    } catch (e) {
      console.error('pause_download failed', e)
    }
  }

  async function handleDelete() {
    try {
      await invoke('delete_download', { id: download.id })
      dispatch(removeDownload(download.id))
    } catch (e) {
      console.error('delete_download failed', e)
    }
  }

  async function handleResume() {
    try {
      await invoke('resume_download', { id: download.id })
      dispatch(upsertDownload({ ...download, status: 'active', speed_bps: 0, eta_seconds: null, chunk_speeds: [] }))
    } catch (e) {
      console.error('resume_download failed', e)
    }
  }

  return (
    <div
      style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: '12px',
        padding: '16px',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}
      onClick={() => dispatch(setExpandedCard(isExpanded ? null : download.id))}
    >
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }} className="truncate max-w-xs">
          {download.filename}
        </span>
        <div className="flex items-center gap-2">
          {download.total_bytes && (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {formatBytes(download.total_bytes)}
            </span>
          )}
          <span
            style={{
              background: 'color-mix(in srgb, var(--accent) 25%, transparent)',
              color: 'var(--accent)',
              fontSize: '11px',
              padding: '2px 10px',
              borderRadius: '12px',
              border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
            }}
          >
            {t(`status.${download.status}`)}
          </span>
        </div>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '4px', height: '4px', marginBottom: '8px' }}>
        <div
          style={{
            background: 'var(--accent)',
            width: `${percent}%`,
            height: '4px',
            borderRadius: '4px',
            transition: 'width 0.3s',
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {percent}% · {formatBytes(download.downloaded_bytes)}
          {download.speed_bps ? ` · ${formatSpeed(download.speed_bps)}` : ''}
          {download.eta_seconds ? ` · ${t('card.eta', { time: formatEta(download.eta_seconds) })}` : ''}
        </span>
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {download.status === 'active' && (
            <button
              onClick={handlePause}
              style={{ color: '#fbbf24', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {t('card.pause')}
            </button>
          )}
          {download.status === 'paused' && (
            <button
              onClick={handleResume}
              style={{ color: '#4ade80', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {t('card.resume')}
            </button>
          )}
          <button
            onClick={handleDelete}
            style={{ color: '#f87171', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {t('card.delete')}
          </button>
        </div>
      </div>

      {isExpanded && <DownloadCardExpanded download={download} />}
    </div>
  )
}
