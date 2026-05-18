import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import type { RootState, AppDispatch } from '../store'
import { setConfig, setAiEnabled } from '../store/configSlice'
import { setTheme, setFont, setLanguage } from '../store/appearanceSlice'
import { closeSettings } from '../store/uiSlice'
import { THEMES, type ThemeGroup } from '../themes'
import { FONTS } from '../fonts'

const LANGUAGES = [
  { code: 'pt', flag: '🇧🇷', label: 'Português' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'zh', flag: '🇨🇳', label: '中文' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'ar', flag: '🇸🇦', label: 'العربية' },
  { code: 'hi', flag: '🇮🇳', label: 'हिन्दी' },
  { code: 'ru', flag: '🇷🇺', label: 'Русский' },
  { code: 'bn', flag: '🇧🇩', label: 'বাংলা' },
  { code: 'id', flag: '🇮🇩', label: 'Indonesia' },
]

type Tab = 'general' | 'download' | 'appearance' | 'ai'

const glassInput: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid var(--glass-border)',
  borderRadius: '8px',
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  width: '100%',
}

export function SettingsPage() {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const appearance = useSelector((s: RootState) => s.appearance)

  const [activeTab, setActiveTab] = useState<Tab>('appearance')
  const [destFolder, setDestFolder] = useState(config.dest_folder)
  const [maxSpeedKbps, setMaxSpeedKbps] = useState(Math.round(config.max_speed / 1024))
  const [chunks, setChunks] = useState(config.chunks)
  const [aiProvider, setAiProvider] = useState(config.ai_provider ?? '')
  const [aiKey, setAiKey] = useState('')
  const [searchProvider, setSearchProvider] = useState(config.search_provider ?? '')
  const [vtKey, setVtKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [aiKeyStatus, setAiKeyStatus] = useState<'idle' | 'saving' | 'saved' | 'deleted'>('idle')
  const [themeGroup, setThemeGroup] = useState<ThemeGroup>(
    THEMES.find(th => th.id === appearance.themeId)?.group ?? 'dark'
  )
  const [showAllFonts, setShowAllFonts] = useState(false)

  const FONT_PREVIEW_COUNT = 6
  const visibleFonts = showAllFonts ? FONTS : FONTS.slice(0, FONT_PREVIEW_COUNT)

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function saveAll() {
    setSaving(true)
    setSaveError(null)
    try {
      const newConfig = {
        ...config,
        dest_folder: destFolder,
        max_speed: maxSpeedKbps * 1024,
        chunks: Math.min(16, Math.max(1, chunks)),
        ai_provider: aiProvider || null,
        search_provider: searchProvider || null,
        theme_id: appearance.themeId,
        font_id: appearance.fontId,
        language: appearance.language,
      }
      await invoke('save_settings_cmd', { settings: newConfig })
      dispatch(setConfig({ ...newConfig, ai_enabled: config.ai_enabled }))
      dispatch(closeSettings())
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function saveAiKey() {
    if (!aiKey.trim() || !aiProvider) return
    setAiKeyStatus('saving')
    try {
      await invoke('save_ai_key_cmd', { apiKey: aiKey })
      dispatch(setAiEnabled(true))
      setAiKey('')
      setAiKeyStatus('saved')
    } catch (e) {
      console.error('save_ai_key_cmd failed', e)
      setAiKeyStatus('idle')
    }
  }

  async function deleteAiKey() {
    try {
      await invoke('delete_ai_key_cmd')
      dispatch(setAiEnabled(false))
      setAiKeyStatus('deleted')
    } catch (e) {
      console.error('delete_ai_key_cmd failed', e)
    }
  }

  const panelStyle: React.CSSProperties = {
    background: 'var(--glass-bg)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--glass-border)',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '520px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    fontSize: '12px',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: active ? `2px solid var(--accent)` : '2px solid transparent',
    whiteSpace: 'nowrap' as const,
  })

  const sectionLabel: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    marginBottom: '8px',
    marginTop: '16px',
  }

  const groupThemes = THEMES.filter(theme => theme.group === themeGroup)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0', borderBottom: '1px solid var(--glass-border)' }}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{t('settings.title')}</span>
          <button onClick={() => dispatch(closeSettings())} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)', padding: '0 20px' }}>
          {(['general', 'download', 'appearance', 'ai'] as Tab[]).map(tab => (
            <button key={tab} style={tabStyle(activeTab === tab)} onClick={() => setActiveTab(tab)}>
              {t(`settings.tabs.${tab}`)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* GENERAL TAB */}
          {activeTab === 'general' && (
            <div>
              <div style={sectionLabel}>{t('settings.general.language')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {LANGUAGES.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => dispatch(setLanguage(lang.code))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: appearance.language === lang.code
                        ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
                        : 'rgba(255,255,255,0.06)',
                      border: appearance.language === lang.code
                        ? '1px solid color-mix(in srgb, var(--accent) 50%, transparent)'
                        : '1px solid var(--glass-border)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>{lang.flag}</span>
                    {lang.label}
                  </button>
                ))}
              </div>

              {/* Tray behavior */}
              <div style={{ marginTop: '20px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                  Tray
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={config.start_minimized}
                    onChange={async (e) => {
                      const updated = { ...config, start_minimized: e.target.checked }
                      dispatch(setConfig(updated))
                      await invoke('save_settings_cmd', { settings: updated }).catch(console.error)
                    }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Iniciar minimizado no tray</span>
                </label>
              </div>
            </div>
          )}

          {/* DOWNLOAD TAB */}
          {activeTab === 'download' && (
            <div>
              <div style={sectionLabel}>{t('settings.download.destFolder')}</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input value={destFolder} onChange={e => setDestFolder(e.target.value)} style={glassInput} />
                <button onClick={pickFolder} style={{ ...glassInput, width: 'auto', cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                  {t('settings.download.browse')}
                </button>
              </div>

              <div style={sectionLabel}>{t('settings.download.maxSpeed')}</div>
              <input
                type="number"
                value={maxSpeedKbps}
                min={0}
                onChange={e => setMaxSpeedKbps(Number(e.target.value))}
                style={{ ...glassInput, width: '120px', marginBottom: '12px' }}
              />

              <div style={sectionLabel}>{t('settings.download.chunks')}</div>
              <input
                type="number"
                value={chunks}
                min={1}
                max={16}
                onChange={e => setChunks(Number(e.target.value))}
                style={{ ...glassInput, width: '80px' }}
              />
            </div>
          )}

          {/* APPEARANCE TAB */}
          {activeTab === 'appearance' && (
            <div>
              {/* Theme group filter */}
              <div style={sectionLabel}>{t('settings.appearance.theme')}</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {(['dark', 'mid', 'light', 'country', 'special'] as ThemeGroup[]).map(g => (
                  <button
                    key={g}
                    onClick={() => setThemeGroup(g)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      background: themeGroup === g
                        ? 'color-mix(in srgb, var(--accent) 25%, transparent)'
                        : 'rgba(255,255,255,0.07)',
                      border: themeGroup === g
                        ? '1px solid color-mix(in srgb, var(--accent) 50%, transparent)'
                        : '1px solid var(--glass-border)',
                      color: themeGroup === g ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {t(`settings.appearance.groups.${g}`)}
                  </button>
                ))}
              </div>

              {/* Theme color dots */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                {groupThemes.map(theme => (
                  <button
                    key={theme.id}
                    title={theme.name}
                    onClick={() => dispatch(setTheme(theme.id))}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: `linear-gradient(${theme.gradient})`,
                      border: appearance.themeId === theme.id ? '2px solid #fff' : '2px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                      transform: appearance.themeId === theme.id ? 'scale(1.15)' : 'scale(1)',
                      transition: 'transform 0.15s, border-color 0.15s',
                    }}
                  />
                ))}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                {THEMES.find(theme => theme.id === appearance.themeId)?.name ?? ''}
              </div>

              {/* Font picker */}
              <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '14px' }}>
                <div style={sectionLabel}>{t('settings.appearance.font')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {visibleFonts.map(font => (
                    <button
                      key={font.id}
                      onClick={() => dispatch(setFont(font.id))}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        background: appearance.fontId === font.id
                          ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
                          : 'rgba(255,255,255,0.06)',
                        border: appearance.fontId === font.id
                          ? '1px solid color-mix(in srgb, var(--accent) 50%, transparent)'
                          : '1px solid var(--glass-border)',
                        fontFamily: font.family,
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{font.name}</div>
                      <div style={{ fontSize: '9px', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>{font.category}</div>
                    </button>
                  ))}
                  {!showAllFonts && (
                    <button
                      onClick={() => setShowAllFonts(true)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px dashed var(--glass-border)',
                        color: 'var(--text-secondary)',
                        fontSize: '11px',
                      }}
                    >
                      {t('settings.appearance.viewAll', { count: FONTS.length })}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* AI TAB */}
          {activeTab === 'ai' && (
            <div>
              <div style={sectionLabel}>{t('settings.ai.provider')}</div>
              <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} style={{ ...glassInput, marginBottom: '12px' }}>
                <option value="">—</option>
                <option value="claude">Claude (Anthropic)</option>
                <option value="openai">OpenAI (GPT-4o)</option>
                <option value="openai-compatible">OpenAI-compatible</option>
              </select>

              <div style={sectionLabel}>
                {t('settings.ai.apiKey')}
                {config.ai_enabled && <span style={{ color: '#4ade80', marginLeft: '4px' }}>{t('settings.ai.configured')}</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input
                  type="password"
                  value={aiKey}
                  onChange={e => setAiKey(e.target.value)}
                  placeholder={config.ai_enabled ? '(already set)' : 'sk-...'}
                  style={glassInput}
                />
                <button
                  onClick={saveAiKey}
                  disabled={!aiKey.trim() || !aiProvider}
                  style={{ ...glassInput, width: 'auto', background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' as const, opacity: !aiKey.trim() || !aiProvider ? 0.5 : 1 }}
                >
                  {aiKeyStatus === 'saving' ? '...' : t('settings.ai.saveKey')}
                </button>
                {config.ai_enabled && (
                  <button
                    onClick={deleteAiKey}
                    style={{ ...glassInput, width: 'auto', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', cursor: 'pointer', whiteSpace: 'nowrap' as const }}
                  >
                    {t('settings.ai.deleteKey')}
                  </button>
                )}
              </div>

              <div style={sectionLabel}>{t('settings.ai.searchProvider')}</div>
              <select value={searchProvider} onChange={e => setSearchProvider(e.target.value)} style={{ ...glassInput, marginBottom: '12px' }}>
                <option value="">—</option>
                <option value="brave">Brave Search</option>
                <option value="serpapi">SerpAPI</option>
              </select>

              {/* vtKey is UI-only for now; persistence needs a dedicated keyring command */}
              <div style={sectionLabel}>{t('settings.ai.vtKey')}</div>
              <input
                type="password"
                value={vtKey}
                onChange={e => setVtKey(e.target.value)}
                placeholder="Optional"
                style={glassInput}
              />
            </div>
          )}

          {saveError && (
            <div style={{ marginTop: '12px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#f87171' }}>
              {saveError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--glass-border)' }}>
          <button
            onClick={() => dispatch(closeSettings())}
            style={{ padding: '8px 18px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}
          >
            {t('settings.cancel')}
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            style={{ padding: '8px 18px', borderRadius: '8px', background: 'var(--accent)', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? '...' : t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
