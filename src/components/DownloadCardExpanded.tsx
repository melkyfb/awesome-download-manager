import { useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import type { RootState } from '../store'
import type { Download } from '../types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`
}

function AiButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { t: tAi } = useTranslation()
  return (
    <button
      disabled={disabled}
      title={disabled ? tAi('aiButtons.disabled') : undefined}
      style={{
        fontSize: '12px',
        padding: '4px 12px',
        borderRadius: '8px',
        border: '1px solid var(--glass-border)',
        background: disabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
        color: disabled ? 'var(--text-secondary)' : 'var(--text-primary)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
      {disabled && <span style={{ color: '#fbbf24', fontWeight: 700 }}> !</span>}
    </button>
  )
}

export function DownloadCardExpanded({ download }: { download: Download }) {
  const aiEnabled = useSelector((s: RootState) => s.config.ai_enabled)
  const { t } = useTranslation()

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(console.error)
  }

  return (
    <div
      style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--glass-border)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* SHA256 */}
      {download.sha256 && (
        <div className="mb-3">
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            {t('card.sha256')}
          </span>
          <div className="flex items-center gap-2 mt-1">
            <code
              style={{
                fontSize: '11px',
                color: 'var(--text-primary)',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid var(--glass-border)',
                borderRadius: '6px',
                padding: '3px 8px',
              }}
              className="truncate max-w-xs"
            >
              {download.sha256}
            </code>
            <button
              onClick={() => copyToClipboard(download.sha256!)}
              style={{ fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {t('card.copy')}
            </button>
            <a
              href={`https://www.virustotal.com/gui/file/${download.sha256}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {t('card.virustotal')}
            </a>
          </div>
        </div>
      )}

      {/* Chunk Speeds */}
      {download.chunk_speeds && download.chunk_speeds.length > 0 && (
        <div className="mb-3">
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            {t('card.chunkSpeeds')}
          </span>
          <div className="grid grid-cols-4 gap-x-3 gap-y-1 mt-1">
            {download.chunk_speeds.map((speed, i) => (
              <span key={i} style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                #{i}: {formatBytes(speed)}/s
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI Actions */}
      <div className="flex flex-wrap gap-2 mb-3">
        <AiButton label={t('aiButtons.summary')} disabled={!aiEnabled} />
        <AiButton label={t('aiButtons.malware')} disabled={!aiEnabled} />
        <AiButton label={t('aiButtons.mirrors')} disabled={!aiEnabled} />
      </div>

      {/* AI Gate Banner */}
      {!aiEnabled && (
        <div
          style={{
            background: 'rgba(251,191,36,0.15)',
            borderLeft: '3px solid #fbbf24',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '12px',
            color: '#fbbf24',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          <span>!</span>
          <span>
            {t('aiButtons.banner')}{' '}
            <button
              style={{
                color: 'var(--accent)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {t('aiButtons.configure')}
            </button>
          </span>
        </div>
      )}

      {/* URL */}
      <div
        style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px' }}
        className="truncate"
      >
        {download.url}
      </div>
    </div>
  )
}
