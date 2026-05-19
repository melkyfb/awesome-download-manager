import Button from '@mui/material/Button'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import { useDispatch } from 'react-redux'
import type { AppDispatch } from '../../store'
import { openAddModal } from '../../store/uiSlice'

export function AddDownloadButton() {
  const dispatch = useDispatch<AppDispatch>()
  return (
    <Button
      variant="contained"
      startIcon={<AddRoundedIcon />}
      onClick={() => dispatch(openAddModal())}
      size="small"
    >
      Download
    </Button>
  )
}
