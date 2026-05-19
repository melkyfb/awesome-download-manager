import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import { useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import type { RootState } from '../../store'
import type { Download } from '../../types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`
}

export function DownloadCardExpanded({ download }: { download: Download }) {
  const { t } = useTranslation()
  const aiEnabled = useSelector((s: RootState) => s.config.ai_enabled)
  const [copied, setCopied] = useState(false)

  function copyHash() {
    if (!download.sha256) return
    navigator.clipboard.writeText(download.sha256).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
      {download.sha256 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="overline" color="text.secondary">{t('card.sha256')}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {download.sha256}
            </Typography>
            <Button size="small" variant="outlined" onClick={copyHash} sx={{ minWidth: 0, px: 1 }}>
              {copied ? '✓' : t('card.copy')}
            </Button>
            <Link
              href={`https://www.virustotal.com/gui/file/${download.sha256}`}
              target="_blank" rel="noopener noreferrer"
              variant="caption"
            >
              {t('card.virustotal')}
            </Link>
          </Box>
        </Box>
      )}

      {download.chunk_speeds && download.chunk_speeds.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="overline" color="text.secondary">{t('card.chunkSpeeds')}</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
            {download.chunk_speeds.map((spd, i) => (
              <Chip key={i} label={`#${i + 1} ${formatBytes(spd)}/s`} size="small" variant="outlined" />
            ))}
          </Box>
        </Box>
      )}

      <Divider sx={{ mb: 1.5 }} />

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {(['summary', 'malware', 'mirrors'] as const).map(action => (
          <Button
            key={action}
            size="small"
            variant="outlined"
            disabled={!aiEnabled}
            title={!aiEnabled ? t('aiButtons.disabled') : undefined}
            sx={{ opacity: aiEnabled ? 1 : 0.4, cursor: aiEnabled ? 'pointer' : 'not-allowed' }}
          >
            {t(`aiButtons.${action}`)}
            {!aiEnabled && ' !'}
          </Button>
        ))}
      </Box>

      {!aiEnabled && (
        <Typography variant="caption" color="warning.main" sx={{ mt: 1, display: 'block' }}>
          {t('aiButtons.banner')}
        </Typography>
      )}

      <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block', wordBreak: 'break-all' }}>
        {download.url}
      </Typography>
    </Box>
  )
}
