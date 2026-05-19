import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { setDownloadFilter } from '../../store/uiSlice'

type Filter = 'all' | 'active' | 'paused' | 'complete'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Ativos' },
  { id: 'paused', label: 'Pausados' },
  { id: 'complete', label: 'Concluídos' },
]

export function FilterChips() {
  const dispatch = useDispatch<AppDispatch>()
  const activeFilter = useSelector((s: RootState) => s.ui.downloadFilter)

  return (
    <Box sx={{ display: 'flex', gap: 1, px: 2, py: 1.5, overflowX: 'auto', flexShrink: 0 }}>
      {FILTERS.map(f => (
        <Chip
          key={f.id}
          label={f.label}
          clickable
          color={activeFilter === f.id ? 'primary' : 'default'}
          variant={activeFilter === f.id ? 'filled' : 'outlined'}
          onClick={() => dispatch(setDownloadFilter(f.id))}
        />
      ))}
    </Box>
  )
}
