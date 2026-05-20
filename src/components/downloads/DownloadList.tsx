import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import type { AppDispatch, RootState } from '../../store'
import { removeDownload } from '../../store/downloadsSlice'
import { DownloadCard } from './DownloadCard'
import { FilterChips } from './FilterChips'

export function DownloadList() {
  const dispatch = useDispatch<AppDispatch>()
  const { t } = useTranslation()
  const filter = useSelector((s: RootState) => s.ui.downloadFilter)
  const allDownloads = useSelector((s: RootState) => Object.values(s.downloads.items))

  const hasFinished = allDownloads.some(d => d.status === 'complete' || d.status === 'error')

  const filtered = allDownloads
    .filter(d => filter === 'all' || d.status === filter)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  async function handleClearFinished() {
    try {
      const ids = await invoke<string[]>('delete_finished_downloads')
      ids.forEach(id => dispatch(removeDownload(id)))
    } catch (e) { console.error('delete_finished_downloads failed', e) }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 2 }}>
        <FilterChips />
        {hasFinished && (
          <Button
            size="small"
            color="error"
            variant="text"
            onClick={handleClearFinished}
            sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {t('card.clearFinished')}
          </Button>
        )}
      </Box>
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
