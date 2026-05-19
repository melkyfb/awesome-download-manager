import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Box from '@mui/material/Box'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { closeChangelog } from '../store/uiSlice'

interface Props {
  currentVersion: string
  hasUpdate: boolean
  latestVersion?: string
  releaseNotes?: string
  onUpdate?: () => void
}

export function ChangelogModal({ currentVersion, hasUpdate, latestVersion, releaseNotes, onUpdate }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const open = useSelector((s: RootState) => s.ui.changelogOpen)

  return (
    <Dialog open={open} onClose={() => dispatch(closeChangelog())} maxWidth="sm" fullWidth>
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
        {releaseNotes ? (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{releaseNotes}</Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">Nenhuma nota de versão disponível.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => dispatch(closeChangelog())}>Fechar</Button>
        {hasUpdate && onUpdate && (
          <Button variant="contained" onClick={onUpdate}>Atualizar</Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
