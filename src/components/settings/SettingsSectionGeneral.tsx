import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Paper from '@mui/material/Paper'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Switch from '@mui/material/Switch'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from '../../store'
import { setLanguage } from '../../store/appearanceSlice'
import { setConfig } from '../../store/configSlice'

const LANGUAGES = [
  { code: 'pt', label: '🇧🇷 Português' },
  { code: 'en', label: '🇬🇧 English' },
  { code: 'zh', label: '🇨🇳 中文' },
  { code: 'es', label: '🇪🇸 Español' },
  { code: 'fr', label: '🇫🇷 Français' },
  { code: 'ar', label: '🇸🇦 العربية' },
  { code: 'hi', label: '🇮🇳 हिन्दी' },
  { code: 'ru', label: '🇷🇺 Русский' },
  { code: 'bn', label: '🇧🇩 বাংলা' },
  { code: 'id', label: '🇮🇩 Indonesia' },
]

export function SettingsSectionGeneral() {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const language = useSelector((s: RootState) => s.appearance.language)

  async function setSetting(key: string, value: string | boolean | number) {
    const newConfig = { ...config, [key]: value }
    await invoke('save_settings_cmd', { settings: newConfig }).catch(console.error)
    dispatch(setConfig(newConfig))
  }

  return (
    <Paper sx={{ borderRadius: 3.5, overflow: 'hidden', mb: 2 }}>
      <List subheader={<ListSubheader>{t('settings.general.language')}</ListSubheader>}>
        <ListItem
          secondaryAction={
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>{t('settings.general.language')}</InputLabel>
              <Select
                label={t('settings.general.language')}
                value={language}
                onChange={e => {
                  dispatch(setLanguage(e.target.value))
                  setSetting('language', e.target.value)
                }}
              >
                {LANGUAGES.map(l => <MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}
              </Select>
            </FormControl>
          }
        >
          <ListItemText primary={t('settings.general.language')} />
        </ListItem>

        <ListItem secondaryAction={
          <Switch
            checked={config.start_minimized}
            onChange={e => setSetting('start_minimized', e.target.checked)}
          />
        }>
          <ListItemText primary={t('settings.general.startWithSystem')} />
        </ListItem>

        <ListItem secondaryAction={
          <Switch
            checked={config.clipboard_monitor_enabled}
            onChange={e => setSetting('clipboard_monitor_enabled', e.target.checked)}
          />
        }>
          <ListItemText primary="Monitorar área de transferência" />
        </ListItem>
      </List>
    </Paper>
  )
}
