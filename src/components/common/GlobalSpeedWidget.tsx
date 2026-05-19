import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import TextField from '@mui/material/TextField'
import BoltRoundedIcon from '@mui/icons-material/BoltRounded'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import type { RootState, AppDispatch } from '../../store'
import { setMaxSpeed } from '../../store/configSlice'

function formatSpeed(bps: number): string {
  if (bps < 1024) return `${bps} B/s`
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(1)} KB/s`
  return `${(bps / 1024 ** 2).toFixed(2)} MB/s`
}

interface Props {
  compact?: boolean
}

export function GlobalSpeedWidget({ compact }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const downloads = useSelector((s: RootState) => s.downloads.items)

  const totalSpeed = Object.values(downloads)
    .filter(d => d.status === 'active')
    .reduce((sum, d) => sum + (d.speed_bps ?? 0), 0)

  const limitBps = config.max_speed
  const speedPercent = limitBps > 0 ? Math.min(100, (totalSpeed / limitBps) * 100) : 0

  const [inputKbps, setInputKbps] = useState(String(Math.round(config.max_speed / 1024)))

  async function commitSpeed(value: string) {
    const kbps = Number(value)
    if (isNaN(kbps) || kbps < 0) return
    const bps = kbps * 1024
    dispatch(setMaxSpeed(bps))
    const newConfig = { ...config, max_speed: bps }
    try { await invoke('save_settings_cmd', { settings: newConfig }) } catch { /* ignore */ }
  }

  if (compact) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
          <BoltRoundedIcon fontSize="small" color="primary" />
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            {totalSpeed > 0 ? formatSpeed(totalSpeed) : '—'}
          </Typography>
        </Box>
        {limitBps > 0 && (
          <LinearProgress variant="determinate" value={speedPercent} sx={{ borderRadius: 4, height: 4 }} />
        )}
        <TextField
          size="small"
          label="Limite KB/s"
          value={inputKbps}
          onChange={e => setInputKbps(e.target.value)}
          onBlur={e => commitSpeed(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitSpeed(inputKbps) }}
          sx={{ mt: 1, width: '100%' }}
          slotProps={{ input: { inputMode: 'numeric' } }}
        />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <BoltRoundedIcon color="primary" />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {totalSpeed > 0 ? formatSpeed(totalSpeed) : '—'}
      </Typography>
      <TextField
        size="small"
        label="Limite KB/s"
        value={inputKbps}
        onChange={e => setInputKbps(e.target.value)}
        onBlur={e => commitSpeed(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commitSpeed(inputKbps) }}
        sx={{ width: 120 }}
        slotProps={{ input: { inputMode: 'numeric' } }}
      />
    </Box>
  )
}
