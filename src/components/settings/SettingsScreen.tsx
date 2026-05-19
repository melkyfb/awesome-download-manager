import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { SettingsSectionGeneral } from './SettingsSectionGeneral'
import { SettingsSectionDownload } from './SettingsSectionDownload'
import { SettingsSectionAppearance } from './SettingsSectionAppearance'
import { SettingsSectionAI } from './SettingsSectionAI'

export function SettingsScreen() {
  const { t } = useTranslation()
  return (
    <Box sx={{ p: 2, overflowY: 'auto', maxWidth: 680, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        {t('settings.title')}
      </Typography>
      <SettingsSectionGeneral />
      <SettingsSectionDownload />
      <SettingsSectionAppearance />
      <SettingsSectionAI />
    </Box>
  )
}
