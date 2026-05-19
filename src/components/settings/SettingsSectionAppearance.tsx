import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Tooltip from '@mui/material/Tooltip'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from '../../store'
import { setTheme, setFont } from '../../store/appearanceSlice'
import { setConfig } from '../../store/configSlice'
import { THEMES } from '../../themes'

const FONTS = [
  { id: 'inter', name: 'Inter' },
  { id: 'roboto', name: 'Roboto' },
  { id: 'nunito', name: 'Nunito' },
  { id: 'fira-sans', name: 'Fira Sans' },
]

export function SettingsSectionAppearance() {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const appearance = useSelector((s: RootState) => s.appearance)

  async function applyTheme(id: string) {
    dispatch(setTheme(id))
    const newConfig = { ...config, theme_id: id }
    await invoke('save_settings_cmd', { settings: newConfig }).catch(console.error)
    dispatch(setConfig(newConfig))
  }

  async function applyFont(id: string) {
    dispatch(setFont(id))
    const newConfig = { ...config, font_id: id }
    await invoke('save_settings_cmd', { settings: newConfig }).catch(console.error)
    dispatch(setConfig(newConfig))
  }

  return (
    <Paper sx={{ borderRadius: 3.5, overflow: 'hidden', mb: 2 }}>
      <List subheader={<ListSubheader>{t('settings.appearance.theme')}</ListSubheader>}>
        <ListItem sx={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">{t('settings.appearance.theme')}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {THEMES.map(th => (
              <Tooltip key={th.id} title={th.name}>
                <Box
                  onClick={() => applyTheme(th.id)}
                  sx={{
                    width: 32, height: 32, borderRadius: 2, cursor: 'pointer',
                    bgcolor: th.theme.palette.primary.main,
                    border: appearance.themeId === th.id ? '3px solid' : '2px solid transparent',
                    borderColor: appearance.themeId === th.id ? 'text.primary' : 'transparent',
                    transition: 'border-color 0.15s',
                  }}
                />
              </Tooltip>
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {THEMES.find(th => th.id === appearance.themeId)?.name}
          </Typography>
        </ListItem>

        <ListItem
          secondaryAction={
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>{t('settings.appearance.font')}</InputLabel>
              <Select
                label={t('settings.appearance.font')}
                value={appearance.fontId}
                onChange={e => applyFont(e.target.value)}
              >
                {FONTS.map(f => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
              </Select>
            </FormControl>
          }
        >
          <ListItemText primary={t('settings.appearance.font')} />
        </ListItem>
      </List>
    </Paper>
  )
}
