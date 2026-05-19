import Fab from '@mui/material/Fab'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import { useDispatch } from 'react-redux'
import type { AppDispatch } from '../../store'
import { openAddModal } from '../../store/uiSlice'

export function AddDownloadFAB() {
  const dispatch = useDispatch<AppDispatch>()
  return (
    <Fab
      color="primary"
      aria-label="new download"
      onClick={() => dispatch(openAddModal())}
      sx={{
        position: 'fixed',
        bottom: `calc(16px + env(safe-area-inset-bottom))`,
        right: 16,
        borderRadius: 4,
      }}
    >
      <AddRoundedIcon />
    </Fab>
  )
}
