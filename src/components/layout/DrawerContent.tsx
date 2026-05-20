import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import UpdateRoundedIcon from '@mui/icons-material/UpdateRounded'
import InfoRoundedIcon from '@mui/icons-material/InfoRounded'
import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { getVersion } from '@tauri-apps/api/app'
import type { AppDispatch, RootState } from '../../store'
import { openSettings, closeSettings, openChangelog, openAbout, closeAbout, setDownloadFilter } from '../../store/uiSlice'
import { GlobalSpeedWidget } from '../common/GlobalSpeedWidget'

interface Props {
  onNavigate?: () => void
  hasUpdate?: boolean
  loadingUpdate?: boolean
  onCheckForUpdate?: () => void
}

export function DrawerContent({ onNavigate, hasUpdate, loadingUpdate, onCheckForUpdate }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const settingsOpen = useSelector((s: RootState) => s.ui.settingsOpen)
  const aboutOpen = useSelector((s: RootState) => s.ui.aboutOpen)
  const { t } = useTranslation()
  const [version, setVersion] = useState('')

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {})
  }, [])

  function goDownloads() {
    dispatch(closeSettings())
    dispatch(closeAbout())
    dispatch(setDownloadFilter('all'))
    onNavigate?.()
  }

  function goHistory() {
    dispatch(closeSettings())
    dispatch(closeAbout())
    dispatch(setDownloadFilter('complete'))
    onNavigate?.()
  }

  function goSettings() {
    dispatch(openSettings())
    dispatch(closeAbout())
    onNavigate?.()
  }

  function goAbout() {
    dispatch(closeSettings())
    dispatch(openAbout())
    onNavigate?.()
  }

  function goUpdate() {
    dispatch(openChangelog())
    onNavigate?.()
  }

  function handleUpdateButton() {
    if (hasUpdate) {
      goUpdate()
    } else {
      onCheckForUpdate?.()
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', pt: 2 }}>
      <Typography variant="subtitle1" sx={{ px: 2, mb: 1, fontWeight: 700 }}>
        Awesome DM v2
      </Typography>

      <Box sx={{ px: 2, mb: 2 }}>
        <GlobalSpeedWidget compact />
      </Box>

      <Divider />

      <List sx={{ flex: 1 }}>
        <ListItemButton selected={!settingsOpen && !aboutOpen} onClick={goDownloads}>
          <ListItemIcon><DownloadRoundedIcon /></ListItemIcon>
          <ListItemText primary={t('nav.downloads')} />
        </ListItemButton>
        <ListItemButton selected={false} onClick={goHistory}>
          <ListItemIcon><TableChartRoundedIcon /></ListItemIcon>
          <ListItemText primary={t('nav.history')} />
        </ListItemButton>
        <ListItemButton selected={settingsOpen} onClick={goSettings}>
          <ListItemIcon><SettingsRoundedIcon /></ListItemIcon>
          <ListItemText primary={t('nav.settings')} />
        </ListItemButton>

        <Divider sx={{ my: 1 }} />

        <ListItemButton onClick={handleUpdateButton} disabled={loadingUpdate && !hasUpdate}>
          <ListItemIcon>
            {loadingUpdate && !hasUpdate
              ? <CircularProgress size={20} />
              : <UpdateRoundedIcon color={hasUpdate ? 'primary' : 'inherit'} />
            }
          </ListItemIcon>
          <ListItemText
            primary={hasUpdate ? 'Atualizar' : 'Buscar atualização'}
            slotProps={hasUpdate ? { primary: { color: 'primary', sx: { fontWeight: 600 } } } : undefined}
          />
        </ListItemButton>

        <ListItemButton selected={aboutOpen} onClick={goAbout}>
          <ListItemIcon><InfoRoundedIcon /></ListItemIcon>
          <ListItemText primary="Sobre" />
        </ListItemButton>
      </List>

      <Divider />
      <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1 }}>
        {version ? `v${version}` : ''}
      </Typography>
    </Box>
  )
}
