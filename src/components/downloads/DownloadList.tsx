import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store'
import { DownloadCard } from './DownloadCard'
import { FilterChips } from './FilterChips'

export function DownloadList() {
  const filter = useSelector((s: RootState) => s.ui.downloadFilter)
  const allDownloads = useSelector((s: RootState) => Object.values(s.downloads.items))

  const filtered = allDownloads
    .filter(d => filter === 'all' || d.status === filter)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <FilterChips />
      <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pb: 10 }}>
        {filtered.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 1 }}>
            <Typography variant="body1" color="text.secondary">
              {filter === 'all' ? 'Nenhum download ainda' : `Nenhum download ${filter}`}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {filter === 'all' ? 'Toque em + para começar' : ''}
            </Typography>
          </Box>
        ) : (
          filtered.map(dl => <DownloadCard key={dl.id} download={dl} />)
        )}
      </Box>
    </Box>
  )
}
