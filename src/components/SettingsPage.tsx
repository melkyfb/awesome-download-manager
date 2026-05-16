import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { RootState, AppDispatch } from '../store'
import { setConfig, setAiEnabled } from '../store/configSlice'
import { closeSettings } from '../store/uiSlice'

export function SettingsPage() {
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)

  const [destFolder, setDestFolder] = useState(config.dest_folder)
  const [maxSpeedKbps, setMaxSpeedKbps] = useState(Math.round(config.max_speed / 1024))
  const [chunks, setChunks] = useState(config.chunks)
  const [aiProvider, setAiProvider] = useState(config.ai_provider ?? '')
  const [aiKey, setAiKey] = useState('')
  const [searchProvider, setSearchProvider] = useState(config.search_provider ?? '')
  const [vtKey, setVtKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [aiKeyStatus, setAiKeyStatus] = useState<'idle' | 'saving' | 'saved' | 'deleted'>('idle')

  async function pickFolder() {
    const selected = await open({ directory: true, defaultPath: destFolder })
    if (selected && typeof selected === 'string') setDestFolder(selected)
  }

  async function saveAll() {
    setSaving(true)
    try {
      const newConfig = {
        ...config,
        dest_folder: destFolder,
        max_speed: maxSpeedKbps * 1024,
        chunks: Math.min(16, Math.max(1, chunks)),
        ai_provider: aiProvider || null,
        search_provider: searchProvider || null,
      }
      await invoke('save_settings_cmd', { settings: newConfig })
      dispatch(setConfig({ ...newConfig, ai_enabled: config.ai_enabled }))
    } catch (e) {
      console.error('save_settings_cmd failed', e)
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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          <button onClick={() => dispatch(closeSettings())} className="text-gray-400 hover:text-gray-600">X</button>
        </div>

        <section className="mb-5">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-3">Downloads</h3>

          <label className="block text-sm text-gray-600 mb-1">Default Destination Folder</label>
          <div className="flex gap-2 mb-3">
            <input type="text" value={destFolder} onChange={(e) => setDestFolder(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <button onClick={pickFolder} className="px-3 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Browse</button>
          </div>

          <label className="block text-sm text-gray-600 mb-1">Max Speed (KB/s, 0 = unlimited)</label>
          <input type="number" value={maxSpeedKbps} min={0}
            onChange={(e) => setMaxSpeedKbps(Number(e.target.value))}
            className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3" />

          <label className="block text-sm text-gray-600 mb-1">Parallel Chunks (1-16)</label>
          <input type="number" value={chunks} min={1} max={16}
            onChange={(e) => setChunks(Number(e.target.value))}
            className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </section>

        <section className="mb-5 border-t pt-4">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-3">AI Configuration</h3>

          <label className="block text-sm text-gray-600 mb-1">AI Provider</label>
          <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3">
            <option value="">Select provider</option>
            <option value="claude">Claude (Anthropic)</option>
            <option value="openai">OpenAI (GPT-4o)</option>
            <option value="openai-compatible">OpenAI-compatible</option>
          </select>

          <label className="block text-sm text-gray-600 mb-1">
            API Key {config.ai_enabled && <span className="text-green-600 ml-1">(configured)</span>}
          </label>
          <div className="flex gap-2 mb-2">
            <input type="password" value={aiKey} onChange={(e) => setAiKey(e.target.value)}
              placeholder={config.ai_enabled ? '(already set)' : 'sk-...'}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <button onClick={saveAiKey} disabled={!aiKey.trim() || !aiProvider}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40">
              {aiKeyStatus === 'saving' ? 'Saving...' : 'Save'}
            </button>
            {config.ai_enabled && (
              <button onClick={deleteAiKey}
                className="px-3 py-2 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50">
                Delete
              </button>
            )}
          </div>

          <label className="block text-sm text-gray-600 mb-1">Search API Provider</label>
          <select value={searchProvider} onChange={(e) => setSearchProvider(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3">
            <option value="">Select provider</option>
            <option value="brave">Brave Search</option>
            <option value="serpapi">SerpAPI</option>
          </select>

          <label className="block text-sm text-gray-600 mb-1">VirusTotal API Key (optional)</label>
          <input type="password" value={vtKey} onChange={(e) => setVtKey(e.target.value)}
            placeholder="Optional - enables automatic submission"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </section>

        <div className="flex gap-3 justify-end pt-2">
          <button onClick={() => dispatch(closeSettings())}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={saveAll} disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
