import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import type { AppDispatch, RootState } from '../store'
import { closeCloseDialog } from '../store/uiSlice'

export function CloseDialog() {
  const dispatch = useDispatch<AppDispatch>()
  const open = useSelector((s: RootState) => s.ui.closeDialogOpen)

  function minimize() {
    dispatch(closeCloseDialog())
    invoke('hide_window').catch(console.error)
  }

  function quit() {
    invoke('force_quit')
  }

  return (
    <Dialog open={open} onClose={minimize}>
      <DialogTitle>Downloads em andamento</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Há downloads ativos. O que deseja fazer?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={minimize}>Minimizar</Button>
        <Button onClick={quit} color="error" variant="contained">Sair</Button>
      </DialogActions>
    </Dialog>
  )
}
