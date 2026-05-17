import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from '../store'
import { closeAddModal, openSettings } from '../store/uiSlice'
import { upsertDownload } from '../store/downloadsSlice'
import type { Download } from '../types'

export function AddDownloadModal() {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const [url, setUrl] = useState('')
  const [destFolder, setDestFolder] = useState(config.dest_folder)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function startDownload() {
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    try {
      const id = await invoke<string>('start_download', {
        url: url.trim(),
        destFolder,
        chunks: config.chunks,
      })
      const dl: Download = {
        id,
        url: url.trim(),
        filename: url.split('/').pop()?.split('?')[0] ?? 'download',
        dest_path: destFolder,
        total_bytes: null,
        downloaded_bytes: 0,
        status: 'active',
        sha256: null, chunks_json: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      }
      dispatch(upsertDownload(dl))
      dispatch(closeAddModal())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--glass-border)',
        borderRadius: '16px',
        padding: '24px',
        width: '100%',
        maxWidth: '480px',
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
          {t('modal.title')}
        </h2>

        <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
          {t('modal.urlLabel')}
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('modal.urlPlaceholder')}
          autoFocus
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', width: '100%', outline: 'none', fontSize: '14px', marginBottom: '16px', boxSizing: 'border-box' }}
        />

        <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
          {t('modal.destLabel')}
        </label>
        <div className="flex gap-2 mb-5">
          <input
            type="text"
            value={destFolder}
            onChange={(e) => setDestFolder(e.target.value)}
            style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', outline: 'none', fontSize: '14px' }}
          />
          <button
            onClick={pickFolder}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            {t('modal.browse')}
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={startDownload}
            disabled={loading || !url.trim()}
            style={{ flex: 1, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', fontWeight: 600, cursor: loading || !url.trim() ? 'not-allowed' : 'pointer', opacity: loading || !url.trim() ? 0.5 : 1, fontSize: '14px' }}
          >
            {loading ? '...' : t('modal.start')}
          </button>
          <button
            onClick={() => dispatch(closeAddModal())}
            style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '9px 18px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}
          >
            {t('modal.cancel')}
          </button>
        </div>

        {error && (
          <p style={{ fontSize: '12px', color: '#f87171', marginTop: '12px', background: 'rgba(248,113,113,0.1)', borderLeft: '3px solid #f87171', padding: '8px 12px', borderRadius: '6px' }}>
            <strong>Error:</strong> {error}
          </p>
        )}

        {!config.ai_enabled && (
          <p style={{ fontSize: '12px', color: '#fbbf24', marginTop: '12px', background: 'rgba(251,191,36,0.1)', borderLeft: '3px solid #fbbf24', padding: '8px 12px', borderRadius: '6px' }}>
            <strong>!</strong> {t('aiButtons.banner')}{' '}
            <button onClick={() => dispatch(openSettings())} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: '12px' }}>
              {t('aiButtons.configure')}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
