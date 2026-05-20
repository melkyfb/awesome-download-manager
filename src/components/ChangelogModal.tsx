import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { closeChangelog } from '../store/uiSlice'
import type { GithubRelease } from '../hooks/useUpdateCheck'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

interface Props {
  currentVersion: string
  hasUpdate: boolean
  latestVersion?: string
  releases?: GithubRelease[]
  isUpdating?: boolean
  updateProgress?: number
  totalBytes?: number
  downloadedBytes?: number
  speedBps?: number
  etaSeconds?: number | null
  updateError?: string | null
  onUpdate?: () => void
}

export function ChangelogModal({
  currentVersion,
  hasUpdate,
  latestVersion,
  releases = [],
  isUpdating,
  updateProgress = 0,
  totalBytes = 0,
  downloadedBytes = 0,
  speedBps = 0,
  etaSeconds,
  updateError,
  onUpdate,
}: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const open = useSelector((s: RootState) => s.ui.changelogOpen)

  const progressLabel = (() => {
    const parts: string[] = []
    if (downloadedBytes > 0 && totalBytes > 0) {
      parts.push(`${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`)
    } else if (downloadedBytes > 0) {
      parts.push(formatBytes(downloadedBytes))
    }
    if (speedBps > 0) parts.push(`${formatBytes(speedBps)}/s`)
    if (etaSeconds != null && etaSeconds > 0) parts.push(`ETA ${formatEta(etaSeconds)}`)
    return parts.join(' · ')
  })()

  return (
    <Dialog open={open} onClose={() => !isUpdating && dispatch(closeChangelog())} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          Awesome Download Manager
          <Chip label={`v${currentVersion}`} size="small" variant="outlined" />
          {hasUpdate && latestVersion && (
            <Chip label={`v${latestVersion} disponível`} size="small" color="primary" />
          )}
        </Box>
      </DialogTitle>
      <DialogContent>
        {isUpdating && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2">Baixando atualização...</Typography>
              <Typography variant="body2">{updateProgress}%</Typography>
            </Box>
            <LinearProgress variant="determinate" value={updateProgress} sx={{ mb: 0.5 }} />
            {progressLabel && (
              <Typography variant="caption" color="text.secondary">{progressLabel}</Typography>
            )}
          </Box>
        )}
        {updateError && (
          <Typography variant="body2" color="error" sx={{ mb: 2 }}>{updateError}</Typography>
        )}
        {releases.length > 0 ? (
          releases.map((release, i) => (
            <Box key={release.tag_name}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  {release.name || release.tag_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(release.published_at).toLocaleDateString()}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {release.body || 'Sem notas de versão.'}
              </Typography>
              {i < releases.length - 1 && <Divider sx={{ my: 1.5 }} />}
            </Box>
          ))
        ) : (
          <Typography variant="body2" color="text.secondary">Nenhuma nota de versão disponível.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => dispatch(closeChangelog())} disabled={isUpdating}>Fechar</Button>
        {hasUpdate && onUpdate && (
          <Button variant="contained" onClick={onUpdate} disabled={isUpdating}>
            {isUpdating ? `Atualizando... ${updateProgress}%` : 'Atualizar'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
