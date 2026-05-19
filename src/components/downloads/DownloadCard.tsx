import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded'
import FolderZipRoundedIcon from '@mui/icons-material/FolderZipRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import MovieRoundedIcon from '@mui/icons-material/MovieRounded'
import AlbumRoundedIcon from '@mui/icons-material/AlbumRounded'
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded'
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from '../../store'
import { setExpandedCard } from '../../store/uiSlice'
import { upsertDownload, removeDownload } from '../../store/downloadsSlice'
import type { Download, DownloadStatus } from '../../types'
import { DownloadCardExpanded } from './DownloadCardExpanded'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function fileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (['zip', 'tar', '7z', 'rar', 'gz', 'bz2'].includes(ext)) return <FolderZipRoundedIcon />
  if (ext === 'pdf') return <PictureAsPdfRoundedIcon />
  if (['mp4', 'mkv', 'avi', 'mov'].includes(ext)) return <MovieRoundedIcon />
  if (['mp3', 'flac', 'wav', 'ogg'].includes(ext)) return <AlbumRoundedIcon />
  if (['iso', 'dmg', 'img'].includes(ext)) return <AlbumRoundedIcon />
  if (['exe', 'msi', 'deb', 'rpm', 'apk', 'appimage'].includes(ext)) return <TerminalRoundedIcon />
  return <InsertDriveFileRoundedIcon />
}

const STATUS_COLORS: Record<DownloadStatus, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  active: 'primary',
  paused: 'warning',
  complete: 'success',
  error: 'error',
  cancelled: 'default',
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
    } catch (e) { console.error('pause_download failed', e) }
  }

  async function handleResume() {
    try {
      await invoke('resume_download', { id: download.id })
      dispatch(upsertDownload({ ...download, status: 'active', speed_bps: 0, eta_seconds: null, chunk_speeds: [] }))
    } catch (e) { console.error('resume_download failed', e) }
  }

  async function handleDelete() {
    try {
      await invoke('delete_download', { id: download.id })
      dispatch(removeDownload(download.id))
    } catch (e) { console.error('delete_download failed', e) }
  }

  async function handleRetry() {
    try {
      await invoke('resume_download', { id: download.id })
      dispatch(upsertDownload({ ...download, status: 'active', speed_bps: 0, eta_seconds: null, chunk_speeds: [] }))
    } catch (e) { console.error('resume_download failed', e) }
  }

  return (
    <Card
      sx={{ mb: 1.5, cursor: 'pointer' }}
      onClick={() => dispatch(setExpandedCard(isExpanded ? null : download.id))}
    >
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1 }}>
          <Box sx={{ color: 'primary.main', mt: 0.25, flexShrink: 0 }}>
            {fileIcon(download.filename)}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: 600 }}>
                {download.filename}
              </Typography>
              <Chip
                label={t(`status.${download.status}`)}
                color={STATUS_COLORS[download.status]}
                size="small"
                sx={{ height: 20, fontSize: '0.7rem', flexShrink: 0 }}
              />
            </Box>
            {download.total_bytes && (
              <Typography variant="caption" color="text.secondary">
                {formatBytes(download.total_bytes)}
                {download.chunk_speeds && download.chunk_speeds.length > 1
                  ? ` · ${download.chunk_speeds.length} chunks`
                  : ''}
              </Typography>
            )}
          </Box>
        </Box>

        <LinearProgress
          variant={download.status === 'active' && !download.total_bytes ? 'indeterminate' : 'determinate'}
          value={percent}
          sx={{ borderRadius: 2, height: 6, mb: 1 }}
          color={download.status === 'error' ? 'error' : download.status === 'complete' ? 'success' : 'primary'}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.secondary">
            {percent}% · {formatBytes(download.downloaded_bytes)}
            {download.speed_bps ? ` · ${formatBytes(download.speed_bps)}/s` : ''}
            {download.eta_seconds ? ` · ETA ${formatEta(download.eta_seconds)}` : ''}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }} onClick={e => e.stopPropagation()}>
            {download.status === 'active' && (
              <IconButton size="small" onClick={handlePause} aria-label={t('card.pause')}>
                <PauseRoundedIcon fontSize="small" />
              </IconButton>
            )}
            {download.status === 'paused' && (
              <IconButton size="small" onClick={handleResume} color="success" aria-label={t('card.resume')}>
                <PlayArrowRoundedIcon fontSize="small" />
              </IconButton>
            )}
            {download.status === 'error' && (
              <IconButton size="small" onClick={handleRetry} color="warning" aria-label="Retry">
                <ReplayRoundedIcon fontSize="small" />
              </IconButton>
            )}
            <IconButton size="small" onClick={handleDelete} color="error" aria-label={t('card.delete')}>
              <DeleteRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        <Collapse in={isExpanded} onClick={e => e.stopPropagation()}>
          <DownloadCardExpanded download={download} />
        </Collapse>
      </CardContent>
    </Card>
  )
}
