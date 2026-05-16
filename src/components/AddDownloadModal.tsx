import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { RootState, AppDispatch } from '../store'
import { closeAddModal, openSettings } from '../store/uiSlice'
import { upsertDownload } from '../store/downloadsSlice'
import type { Download } from '../types'

export function AddDownloadModal() {
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">New Download</h2>

        <label className="block text-sm text-gray-600 mb-1">URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/file.zip"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
          autoFocus
        />

        <label className="block text-sm text-gray-600 mb-1">Destination Folder</label>
        <div className="flex gap-2 mb-5">
          <input
            type="text"
            value={destFolder}
            onChange={(e) => setDestFolder(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={pickFolder}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            Browse
          </button>
        </div>

        <div className="flex gap-3">
          <button
            onClick={startDownload}
            disabled={loading || !url.trim()}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Starting...' : 'Download Now'}
          </button>
          <button
            disabled
            title={!config.ai_enabled ? 'Configure uma API key de IA nas Configurações para usar esta função' : undefined}
            className="flex-1 flex items-center justify-center gap-1 border border-gray-300 rounded-lg py-2 text-sm opacity-40 cursor-not-allowed bg-gray-50 text-gray-400"
          >
            Analyze First
            {!config.ai_enabled && <span className="text-amber-500 font-bold">!</span>}
          </button>
          <button
            onClick={() => dispatch(closeAddModal())}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-700 mt-3 bg-red-50 border-l-4 border-red-400 px-3 py-2 rounded">
            <strong>Error:</strong> {error}
          </p>
        )}

        {!config.ai_enabled && (
          <p className="text-xs text-amber-700 mt-3 bg-amber-50 border-l-4 border-amber-400 px-3 py-2 rounded">
            <strong>!</strong> AI analysis not configured.{' '}
            <button onClick={() => dispatch(openSettings())} className="underline text-blue-600">Configure credentials</button>
          </p>
        )}
      </div>
    </div>
  )
}
