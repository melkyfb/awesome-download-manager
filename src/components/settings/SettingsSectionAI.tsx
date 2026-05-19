import { useState } from 'react'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Typography from '@mui/material/Typography'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from '../../store'
import { setAiEnabled, setConfig } from '../../store/configSlice'

export function SettingsSectionAI() {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const [aiProvider, setAiProvider] = useState(config.ai_provider ?? '')
  const [aiKey, setAiKey] = useState('')
  const [searchProvider, setSearchProvider] = useState(config.search_provider ?? '')
  const [keyStatus, setKeyStatus] = useState<'idle' | 'saved' | 'deleted'>('idle')

  async function saveProvider() {
    const newConfig = { ...config, ai_provider: aiProvider || null, search_provider: searchProvider || null }
    await invoke('save_settings_cmd', { settings: newConfig }).catch(console.error)
    dispatch(setConfig(newConfig))
  }

  async function saveKey() {
    if (!aiKey.trim()) return
    try {
      await invoke('save_ai_key_cmd', { apiKey: aiKey.trim() })
      dispatch(setAiEnabled(true))
      setAiKey('')
      setKeyStatus('saved')
    } catch (e) { console.error(e) }
  }

  async function deleteKey() {
    try {
      await invoke('delete_ai_key_cmd')
      dispatch(setAiEnabled(false))
      setKeyStatus('deleted')
    } catch (e) { console.error(e) }
  }

  return (
    <Paper sx={{ borderRadius: 3.5, overflow: 'hidden', mb: 2 }}>
      <List subheader={<ListSubheader>{t('settings.ai.provider')}</ListSubheader>}>
        <ListItem
          secondaryAction={
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>{t('settings.ai.provider')}</InputLabel>
              <Select
                label={t('settings.ai.provider')}
                value={aiProvider}
                onChange={e => setAiProvider(e.target.value)}
                onBlur={saveProvider}
              >
                <MenuItem value="">—</MenuItem>
                <MenuItem value="claude">Claude (Anthropic)</MenuItem>
                <MenuItem value="openai">OpenAI</MenuItem>
              </Select>
            </FormControl>
          }
        >
          <ListItemText primary={t('settings.ai.provider')} />
        </ListItem>

        <ListItem sx={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
          <Typography variant="body2">
            {t('settings.ai.apiKey')}
            {config.ai_enabled && (
              <Typography component="span" variant="caption" color="success.main" sx={{ ml: 1 }}>
                {t('settings.ai.configured')}
              </Typography>
            )}
          </Typography>
          <TextField
            type="password"
            size="small"
            fullWidth
            placeholder="sk-…"
            value={aiKey}
            onChange={e => setAiKey(e.target.value)}
          />
          {keyStatus === 'saved' && <Typography variant="caption" color="success.main">Saved!</Typography>}
          {keyStatus === 'deleted' && <Typography variant="caption" color="text.secondary">Deleted.</Typography>}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="contained" onClick={saveKey} disabled={!aiKey.trim()}>
              {t('settings.ai.saveKey')}
            </Button>
            {config.ai_enabled && (
              <Button size="small" variant="outlined" color="error" onClick={deleteKey}>
                {t('settings.ai.deleteKey')}
              </Button>
            )}
          </Box>
        </ListItem>

        <ListItem
          secondaryAction={
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>{t('settings.ai.searchProvider')}</InputLabel>
              <Select
                label={t('settings.ai.searchProvider')}
                value={searchProvider}
                onChange={e => setSearchProvider(e.target.value)}
                onBlur={saveProvider}
              >
                <MenuItem value="">—</MenuItem>
                <MenuItem value="brave">Brave Search</MenuItem>
                <MenuItem value="serpapi">SerpAPI</MenuItem>
              </Select>
            </FormControl>
          }
        >
          <ListItemText primary={t('settings.ai.searchProvider')} />
        </ListItem>
      </List>
    </Paper>
  )
}
