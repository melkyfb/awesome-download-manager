import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import { useDispatch, useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import type { AppDispatch, RootState } from '../../store'
import { openSettings, closeSettings, setDownloadFilter } from '../../store/uiSlice'
import { GlobalSpeedWidget } from '../common/GlobalSpeedWidget'
import { APP_VERSION } from '../../version'

interface Props {
  onNavigate?: () => void
}

export function DrawerContent({ onNavigate }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const settingsOpen = useSelector((s: RootState) => s.ui.settingsOpen)
  const { t } = useTranslation()

  function goDownloads() {
    dispatch(closeSettings())
    dispatch(setDownloadFilter('all'))
    onNavigate?.()
  }

  function goHistory() {
    dispatch(closeSettings())
    dispatch(setDownloadFilter('complete'))
    onNavigate?.()
  }

  function goSettings() {
    dispatch(openSettings())
    onNavigate?.()
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
        <ListItemButton selected={!settingsOpen} onClick={goDownloads}>
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
      </List>

      <Divider />
      <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 1 }}>
        v{APP_VERSION}
      </Typography>
    </Box>
  )
}
