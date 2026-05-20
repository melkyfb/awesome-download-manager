import { useState, useEffect } from 'react'
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
import Tooltip from '@mui/material/Tooltip'
import RadioGroup from '@mui/material/RadioGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import VideoLibraryRoundedIcon from '@mui/icons-material/VideoLibraryRounded'
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { RootState, AppDispatch } from '../../store'
import { closeAddModal, setPrefillUrl, registerPlaylistGroup } from '../../store/uiSlice'
import { upsertDownload } from '../../store/downloadsSlice'
import { setLastUsedFolder } from '../../store/configSlice'
import { VIDEO_QUALITY_OPTIONS, isPlaylistUrl } from '../../utils/videoUrls'
import type { VideoQuality } from '../../utils/videoUrls'
import type { Download } from '../../types'

interface Props {
  url: string
  onClose: () => void
  onSwitchToHttp: () => void
}

interface PlaylistEntry {
  download_id: string
  title: string
  url: string
}

export function VideoDownloadForm({ url, onClose, onSwitchToHttp }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const initialFolder = config.use_last_folder && config.last_used_folder
    ? config.last_used_folder
    : config.dest_folder
  const [destFolder, setDestFolder] = useState(initialFolder)
  const [quality, setQuality] = useState<VideoQuality>('best')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableHeights, setAvailableHeights] = useState<string[] | null>(null)
  const [formatsLoading, setFormatsLoading] = useState(true)

  const isPlaylist = isPlaylistUrl(url)
  const [downloadMode, setDownloadMode] = useState<'all' | 'single'>('all')
  const [generateFile, setGenerateFile] = useState(false)
  const [fileFormat, setFileFormat] = useState<'m3u' | 'pls'>('m3u')

  useEffect(() => {
    setFormatsLoading(true)
    invoke<string[]>('get_video_formats', { url })
      .then(heights => setAvailableHeights(heights))
      .catch(() => setAvailableHeights(null))
      .finally(() => setFormatsLoading(false))
  }, [url])

  const filteredOptions = VIDEO_QUALITY_OPTIONS.filter(opt => {
    if (opt.value === 'best' || opt.value === 'audio') return true
    if (!availableHeights) return true
    return availableHeights.includes(opt.value.replace('p', ''))
  })

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function persistLastFolder() {
    if (config.use_last_folder) {
      await invoke('save_last_folder_cmd', { folder: destFolder }).catch(() => {})
      dispatch(setLastUsedFolder(destFolder))
    }
  }

  async function startSingleDownload() {
    const id = await invoke<string>('start_video_download', { url, destFolder, quality })
    const dl: Download = {
      id, url, filename: 'video', dest_path: destFolder,
      total_bytes: null, downloaded_bytes: 0, status: 'active',
      sha256: null, chunks_json: null,
      created_at: new Date().toISOString(), completed_at: null,
      download_type: 'video', video_quality: quality,
    }
    dispatch(upsertDownload(dl))
  }

  async function startPlaylistDownload() {
    const groupId = crypto.randomUUID()
    const entries = await invoke<PlaylistEntry[]>('start_playlist_download', {
      url, destFolder, quality, playlistGroupId: groupId,
    })
    const now = new Date().toISOString()
    entries.forEach(entry => {
      const dl: Download = {
        id: entry.download_id,
        url: entry.url,
        filename: entry.title,
        dest_path: destFolder,
        total_bytes: null, downloaded_bytes: 0, status: 'active',
        sha256: null, chunks_json: null,
        created_at: now, completed_at: null,
        download_type: 'video', video_quality: quality,
        playlist_group_id: groupId,
      }
      dispatch(upsertDownload(dl))
    })
    if (generateFile && entries.length > 0) {
      const playlistName = (() => {
        try { return new URL(url).searchParams.get('list') ?? 'playlist' }
        catch { return 'playlist' }
      })()
      dispatch(registerPlaylistGroup({
        groupId,
        ids: entries.map(e => e.download_id),
        generateFile: true,
        fileFormat,
        name: playlistName,
        destFolder,
      }))
    }
  }

  async function startDownload() {
    setLoading(true)
    setError(null)
    try {
      if (isPlaylist && downloadMode === 'all') {
        await startPlaylistDownload()
      } else {
        await startSingleDownload()
      }
      await persistLastFolder()
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

      <TextField label="URL" value={url} fullWidth size="small" slotProps={{ input: { readOnly: true } }} />

      {isPlaylist && (
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            URL de playlist detectada
          </Typography>
          <RadioGroup value={downloadMode} onChange={e => setDownloadMode(e.target.value as 'all' | 'single')} row>
            <FormControlLabel value="all" control={<Radio size="small" />} label="Baixar toda a playlist" />
            <FormControlLabel value="single" control={<Radio size="small" />} label="Apenas este vídeo" />
          </RadioGroup>
          {downloadMode === 'all' && (
            <>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Checkbox
                  checked={generateFile}
                  onChange={e => setGenerateFile(e.target.checked)}
                  size="small"
                />
                <Typography variant="body2">Gerar arquivo de playlist</Typography>
                {generateFile && (
                  <FormControl size="small" sx={{ ml: 1, minWidth: 80 }}>
                    <Select
                      value={fileFormat}
                      onChange={e => setFileFormat(e.target.value as 'm3u' | 'pls')}
                    >
                      <MenuItem value="m3u">.m3u</MenuItem>
                      <MenuItem value="pls">.pls</MenuItem>
                    </Select>
                  </FormControl>
                )}
              </Box>
            </>
          )}
        </Box>
      )}

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
          disabled={formatsLoading}
          startAdornment={formatsLoading ? <CircularProgress size={14} sx={{ mr: 1 }} /> : undefined}
        >
          {filteredOptions.map(opt => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {error && <Typography variant="caption" color="error">{error}</Typography>}

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', alignItems: 'center' }}>
        <Tooltip title="Faz download direto por HTTP, sem extração de vídeo. Use para arquivos normais (zip, exe, pdf...)." arrow>
          <Button size="small" onClick={onSwitchToHttp} disabled={loading} startIcon={<HelpOutlineRoundedIcon fontSize="small" />}>
            Baixar como arquivo
          </Button>
        </Tooltip>
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
