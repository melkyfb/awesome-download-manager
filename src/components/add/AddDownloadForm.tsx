import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from '../../store'
import { closeAddModal, setPrefillUrl } from '../../store/uiSlice'
import { upsertDownload } from '../../store/downloadsSlice'
import type { Download } from '../../types'

interface Props {
  onClose: () => void
}

export function AddDownloadForm({ onClose }: Props) {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const prefillUrl = useSelector((s: RootState) => s.ui.prefillUrl)
  const [url, setUrl] = useState(prefillUrl)
  const [destFolder, setDestFolder] = useState(config.dest_folder)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => { dispatch(setPrefillUrl('')) }, [dispatch])

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function startDownload() {
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    try {
      const id = await invoke<string>('start_download', {
        url: url.trim(), destFolder, chunks: config.chunks,
      })
      const dl: Download = {
        id, url: url.trim(),
        filename: url.split('/').pop()?.split('?')[0] ?? 'download',
        dest_path: destFolder,
        total_bytes: null, downloaded_bytes: 0,
        status: 'active', sha256: null, chunks_json: null,
        created_at: new Date().toISOString(), completed_at: null,
      }
      dispatch(upsertDownload(dl))
      dispatch(closeAddModal())
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>{t('modal.title')}</Typography>

      <TextField
        label={t('modal.urlLabel')}
        placeholder={t('modal.urlPlaceholder')}
        value={url}
        onChange={e => setUrl(e.target.value)}
        fullWidth
        autoFocus
        type="url"
        onKeyDown={e => { if (e.key === 'Enter') startDownload() }}
      />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label={t('modal.destLabel')}
          value={destFolder}
          onChange={e => setDestFolder(e.target.value)}
          fullWidth
          size="small"
        />
        <Button variant="outlined" onClick={pickFolder} sx={{ minWidth: 0, px: 1.5 }} aria-label={t('modal.browse')}>
          <FolderOpenRoundedIcon />
        </Button>
      </Box>

      {error && (
        <Typography variant="caption" color="error">{error}</Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button variant="outlined" onClick={onClose} disabled={loading}>
          {t('modal.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={startDownload}
          disabled={loading || !url.trim()}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {loading ? '…' : t('modal.start')}
        </Button>
      </Box>
    </Box>
  )
}
