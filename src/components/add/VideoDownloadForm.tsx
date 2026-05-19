import { useState } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import CircularProgress from '@mui/material/CircularProgress'
import Chip from '@mui/material/Chip'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { RootState, AppDispatch } from '../../store'
import { closeAddModal, setPrefillUrl } from '../../store/uiSlice'
import { upsertDownload } from '../../store/downloadsSlice'
import { VIDEO_QUALITY_OPTIONS } from '../../utils/videoUrls'
import type { VideoQuality } from '../../utils/videoUrls'
import type { Download } from '../../types'

interface Props {
  url: string
  onClose: () => void
  onSwitchToHttp: () => void
}

export function VideoDownloadForm({ url, onClose, onSwitchToHttp }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const [destFolder, setDestFolder] = useState(config.dest_folder)
  const [quality, setQuality] = useState<VideoQuality>('best')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function startDownload() {
    setLoading(true)
    setError(null)
    try {
      const id = await invoke<string>('start_video_download', { url, destFolder, quality })
      const dl: Download = {
        id, url,
        filename: 'video',
        dest_path: destFolder,
        total_bytes: null, downloaded_bytes: 0,
        status: 'active', sha256: null, chunks_json: null,
        created_at: new Date().toISOString(), completed_at: null,
        download_type: 'video',
        video_quality: quality,
      }
      dispatch(upsertDownload(dl))
      dispatch(setPrefillUrl(''))
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>Download de Vídeo</Typography>
        <Chip icon={<VideoLibraryRoundedIcon />} label="Vídeo" size="small" color="primary" />
      </Box>

      <TextField
        label="URL"
        value={url}
        fullWidth
        size="small"
        slotProps={{ input: { readOnly: true } }}
      />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label="Pasta de destino"
          value={destFolder}
          onChange={e => setDestFolder(e.target.value)}
          fullWidth
          size="small"
        />
        <Button variant="outlined" onClick={pickFolder} sx={{ minWidth: 0, px: 1.5 }} aria-label="Escolher pasta">
          <FolderOpenRoundedIcon />
        </Button>
      </Box>

      <FormControl fullWidth size="small">
        <InputLabel>Qualidade</InputLabel>
        <Select
          value={quality}
          label="Qualidade"
          onChange={e => setQuality(e.target.value as VideoQuality)}
        >
          {VIDEO_QUALITY_OPTIONS.map(opt => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {error && (
        <Typography variant="caption" color="error">{error}</Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', alignItems: 'center' }}>
        <Button size="small" onClick={onSwitchToHttp} disabled={loading}>
          Baixar como arquivo
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={startDownload}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} /> : undefined}
          >
            {loading ? '…' : 'Baixar'}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
