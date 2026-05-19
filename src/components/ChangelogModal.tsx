import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { closeChangelog } from '../store/uiSlice'

interface Props {
  currentVersion: string
  hasUpdate: boolean
  latestVersion?: string
  releaseNotes?: string
  isUpdating?: boolean
  updateProgress?: number
  updateError?: string | null
  onUpdate?: () => void
}

export function ChangelogModal({ currentVersion, hasUpdate, latestVersion, releaseNotes, isUpdating, updateProgress = 0, updateError, onUpdate }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const open = useSelector((s: RootState) => s.ui.changelogOpen)

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
            <LinearProgress variant="determinate" value={updateProgress} />
          </Box>
        )}
        {updateError && (
          <Typography variant="body2" color="error" sx={{ mb: 2 }}>{updateError}</Typography>
        )}
        {releaseNotes ? (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{releaseNotes}</Typography>
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
