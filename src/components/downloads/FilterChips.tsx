import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import { useDispatch, useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import type { AppDispatch, RootState } from '../../store'
import { setDownloadFilter } from '../../store/uiSlice'

type Filter = 'all' | 'active' | 'paused' | 'complete'

const FILTER_IDS: Filter[] = ['all', 'active', 'paused', 'complete']

export function FilterChips() {
  const dispatch = useDispatch<AppDispatch>()
  const activeFilter = useSelector((s: RootState) => s.ui.downloadFilter)
  const { t } = useTranslation()

  return (
    <Box sx={{ display: 'flex', gap: 1, px: 2, py: 1.5, overflowX: 'auto', flexShrink: 0 }}>
      {FILTER_IDS.map(id => (
        <Chip
          key={id}
          label={t(`filter.${id}`)}
          clickable
          color={activeFilter === id ? 'primary' : 'default'}
          variant={activeFilter === id ? 'filled' : 'outlined'}
          onClick={() => dispatch(setDownloadFilter(id))}
        />
      ))}
    </Box>
  )
}
