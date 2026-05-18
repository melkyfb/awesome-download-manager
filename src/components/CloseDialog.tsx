import { useDispatch } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import type { AppDispatch } from '../store'
import { closeCloseDialog } from '../store/uiSlice'

export function CloseDialog() {
  const dispatch = useDispatch<AppDispatch>()

  function minimize() {
    dispatch(closeCloseDialog())
    invoke('hide_window').catch(console.error)
  }

  function quit() {
    invoke('force_quit')
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--glass-border)',
          borderRadius: '16px',
          padding: '28px 32px',
          maxWidth: '360px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
        <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', marginBottom: '8px' }}>
          Downloads em andamento
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>
          Há downloads ativos. O que deseja fazer?
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={minimize}
            style={{
              flex: 1,
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 0',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🗂 Minimizar para o tray
          </button>
          <button
            onClick={quit}
            style={{
              flex: 1,
              background: 'rgba(255,80,80,0.15)',
              color: '#ff6060',
              border: '1px solid rgba(255,80,80,0.3)',
              borderRadius: '10px',
              padding: '10px 0',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ✕ Fechar mesmo
          </button>
        </div>
      </div>
    </div>
  )
}
