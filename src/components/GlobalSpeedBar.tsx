import { useSelector, useDispatch } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from '../store'
import { setMaxSpeed } from '../store/configSlice'
import { openAddModal, openSettings } from '../store/uiSlice'

export function GlobalSpeedBar() {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const downloads = useSelector((s: RootState) => s.downloads.items)
  const activeCount = Object.values(downloads).filter(d => d.status === 'active').length

  async function handleSpeedChange(e: React.ChangeEvent<HTMLInputElement>) {
    const kbps = Number(e.target.value)
    const bps = kbps * 1024
    dispatch(setMaxSpeed(bps))
    const newConfig = { ...config, max_speed: bps }
    try {
      await invoke('save_settings_cmd', { settings: newConfig })
    } catch (err) {
      console.error('save_settings_cmd failed', err)
    }
  }

  const kbps = Math.round(config.max_speed / 1024)

  return (
    <div style={{
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--glass-border)',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    }}>
      <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
        ADM
      </span>

      <button
        onClick={() => dispatch(openAddModal())}
        style={{
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          padding: '6px 14px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {t('nav.newDownload')}
      </button>

      <div className="flex items-center gap-2 ml-auto">
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{activeCount} active</span>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Max speed:</label>
        <input
          type="number"
          value={kbps}
          min={0}
          onChange={handleSpeedChange}
          style={{
            width: '80px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid var(--glass-border)',
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '12px',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>KB/s</span>
      </div>

      <button
        onClick={() => dispatch(openSettings())}
        style={{
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid var(--glass-border)',
          borderRadius: '8px',
          padding: '6px 14px',
          fontSize: '12px',
          color: 'var(--text-primary)',
          cursor: 'pointer',
        }}
      >
        {t('nav.settings')}
      </button>
    </div>
  )
}
