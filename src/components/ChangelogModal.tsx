import { useDispatch } from 'react-redux'
import type { AppDispatch } from '../store'
import { closeChangelog } from '../store/uiSlice'
import type { GithubRelease } from '../hooks/useUpdateCheck'
import { invoke } from '@tauri-apps/api/core'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

interface Props {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releases: GithubRelease[]
  loading: boolean
}

export function ChangelogModal({ currentVersion, latestVersion, hasUpdate, releases, loading }: Props) {
  const dispatch = useDispatch<AppDispatch>()

  function openRelease(url: string) {
    invoke('open_in_browser', { url }).catch(() => window.open(url, '_blank', 'noopener'))
  }

  return (
    <div
      onClick={() => dispatch(closeChangelog())}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '560px', maxHeight: '80vh',
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--glass-border)',
          borderRadius: '16px',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--glass-border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', marginBottom: '4px' }}>
              What's New
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Current version: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>v{currentVersion}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {hasUpdate && (
              <button
                onClick={() => openRelease('https://github.com/melkyfb/awesome-download-manager/releases/latest')}
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
                ↓ v{latestVersion} available
              </button>
            )}
            <button
              onClick={() => dispatch(closeChangelog())}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '14px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px 24px' }}>
          {loading && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0', fontSize: '13px' }}>
              Loading releases…
            </div>
          )}

          {!loading && releases.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0', fontSize: '13px' }}>
              No releases found.
            </div>
          )}

          {releases.map((rel, i) => (
            <div
              key={rel.tag_name}
              style={{
                marginBottom: i < releases.length - 1 ? '24px' : 0,
                paddingBottom: i < releases.length - 1 ? '24px' : 0,
                borderBottom: i < releases.length - 1 ? '1px solid var(--glass-border)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '13px', fontWeight: 700,
                    color: rel.tag_name.replace(/^v/, '') === currentVersion ? 'var(--accent)' : 'var(--text-primary)',
                  }}
                >
                  {rel.tag_name}
                </span>
                {rel.tag_name.replace(/^v/, '') === currentVersion && (
                  <span style={{
                    fontSize: '10px', fontWeight: 600,
                    background: 'rgba(124,77,255,0.2)',
                    color: 'var(--accent)',
                    border: '1px solid rgba(124,77,255,0.35)',
                    borderRadius: '20px',
                    padding: '1px 8px',
                  }}>
                    current
                  </span>
                )}
                {i === 0 && rel.tag_name.replace(/^v/, '') !== currentVersion && (
                  <span style={{
                    fontSize: '10px', fontWeight: 600,
                    background: 'rgba(74,222,128,0.15)',
                    color: '#4ade80',
                    border: '1px solid rgba(74,222,128,0.3)',
                    borderRadius: '20px',
                    padding: '1px 8px',
                  }}>
                    latest
                  </span>
                )}
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                  {formatDate(rel.published_at)}
                </span>
              </div>

              {rel.body ? (
                <pre style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: '1.6',
                  margin: 0,
                  fontFamily: 'inherit',
                }}>
                  {rel.body.trim()}
                </pre>
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  No release notes.
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
