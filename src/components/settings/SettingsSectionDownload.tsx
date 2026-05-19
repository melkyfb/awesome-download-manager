import { useState } from 'react'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from '../../store'
import { setConfig } from '../../store/configSlice'

export function SettingsSectionDownload() {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const [destFolder, setDestFolder] = useState(config.dest_folder)
  const [maxSpeedKbps, setMaxSpeedKbps] = useState(String(Math.round(config.max_speed / 1024)))
  const [chunks, setChunks] = useState(String(config.chunks))

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function saveAll() {
    const newConfig = {
      ...config,
      dest_folder: destFolder,
      max_speed: Number(maxSpeedKbps) * 1024,
      chunks: Math.min(16, Math.max(1, Number(chunks))),
    }
    await invoke('save_settings_cmd', { settings: newConfig }).catch(console.error)
    dispatch(setConfig(newConfig))
  }

  return (
    <Paper sx={{ borderRadius: 3.5, overflow: 'hidden', mb: 2 }}>
      <List subheader={<ListSubheader>{t('settings.download.destFolder')}</ListSubheader>}>
        <ListItem>
          <ListItemText primary={t('settings.download.destFolder')} />
          <Box sx={{ display: 'flex', gap: 1, ml: 1 }}>
            <TextField
              size="small"
              value={destFolder}
              onChange={e => setDestFolder(e.target.value)}
              onBlur={saveAll}
              sx={{ width: 220 }}
            />
            <Button variant="outlined" size="small" onClick={pickFolder} sx={{ minWidth: 0, px: 1 }}>
              <FolderOpenRoundedIcon fontSize="small" />
            </Button>
          </Box>
        </ListItem>

        <ListItem>
          <ListItemText primary={t('settings.download.maxSpeed')} />
          <TextField
            size="small"
            value={maxSpeedKbps}
            onChange={e => setMaxSpeedKbps(e.target.value)}
            onBlur={saveAll}
            onKeyDown={e => { if (e.key === 'Enter') saveAll() }}
            sx={{ width: 100, ml: 1 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            slotProps={{ input: { inputMode: 'numeric' } as any }}
          />
        </ListItem>

        <ListItem>
          <ListItemText primary={t('settings.download.chunks')} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1 }}>
            <Button size="small" variant="outlined" onClick={() => { const v = String(Math.max(1, Number(chunks) - 1)); setChunks(v); saveAll() }}>−</Button>
            <TextField
              size="small"
              value={chunks}
              onChange={e => setChunks(e.target.value)}
              onBlur={saveAll}
              sx={{ width: 60 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              slotProps={{ input: { inputMode: 'numeric', style: { textAlign: 'center' } } as any }}
            />
            <Button size="small" variant="outlined" onClick={() => { const v = String(Math.min(16, Number(chunks) + 1)); setChunks(v); saveAll() }}>+</Button>
          </Box>
        </ListItem>
      </List>
    </Paper>
  )
}
