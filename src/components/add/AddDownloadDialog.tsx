import Dialog from '@mui/material/Dialog'
import { useSelector, useDispatch } from 'react-redux'
import type { RootState, AppDispatch } from '../../store'
import { closeAddModal } from '../../store/uiSlice'
import { AddDownloadForm } from './AddDownloadForm'

export function AddDownloadDialog() {
  const dispatch = useDispatch<AppDispatch>()
  const open = useSelector((s: RootState) => s.ui.addModalOpen)

  return (
    <Dialog open={open} onClose={() => dispatch(closeAddModal())} maxWidth="sm" fullWidth>
      <AddDownloadForm onClose={() => dispatch(closeAddModal())} />
    </Dialog>
  )
}
