import SwipeableDrawer from '@mui/material/SwipeableDrawer'
import Box from '@mui/material/Box'
import { useSelector, useDispatch } from 'react-redux'
import type { RootState, AppDispatch } from '../../store'
import { closeAddModal, openAddModal } from '../../store/uiSlice'
import { AddDownloadForm } from './AddDownloadForm'

export function AddDownloadSheet() {
  const dispatch = useDispatch<AppDispatch>()
  const open = useSelector((s: RootState) => s.ui.addModalOpen)

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={() => dispatch(closeAddModal())}
      onOpen={() => dispatch(openAddModal())}
      slotProps={{
        paper: {
          sx: {
            borderRadius: '20px 20px 0 0',
            maxHeight: '85vh',
          },
        },
      }}
    >
      <Box sx={{ width: 40, height: 4, bgcolor: 'divider', borderRadius: 2, mx: 'auto', mt: 1.5, mb: 1 }} />
      <AddDownloadForm onClose={() => dispatch(closeAddModal())} />
    </SwipeableDrawer>
  )
}
