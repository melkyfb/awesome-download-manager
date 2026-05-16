import { useSelector, useDispatch } from 'react-redux'
import { invoke } from '@tauri-apps/api/core'
import type { RootState, AppDispatch } from '../store'
import { setMaxSpeed } from '../store/configSlice'
import { openAddModal, openSettings } from '../store/uiSlice'

export function GlobalSpeedBar() {
  const dispatch = useDispatch<AppDispatch>()
  const config = useSelector((s: RootState) => s.config)
  const downloads = useSelector((s: RootState) => s.downloads.items)
  const activeCount = Object.values(downloads).filter(d => d.status === 'active').length

  async function handleSpeedChange(e: React.ChangeEvent<HTMLInputElement>) {
    const kbps = Number(e.target.value)
    const bps = kbps * 1024
    dispatch(setMaxSpeed(bps))
    const newConfig = { ...config, max_speed: bps }
    await invoke('save_settings_cmd', { settings: newConfig })
  }

  const kbps = Math.round(config.max_speed / 1024)

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gray-900 text-white text-sm">
      <span className="font-semibold text-blue-400">ADM</span>

      <button
        onClick={() => dispatch(openAddModal())}
        className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-xs font-medium"
      >
        + New Download
      </button>

      <div className="flex items-center gap-2 ml-auto">
        <span className="text-gray-400 text-xs">{activeCount} active</span>
        <label className="text-gray-400 text-xs">Max speed:</label>
        <input
          type="number"
          value={kbps}
          min={0}
          onChange={handleSpeedChange}
          className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white"
        />
        <span className="text-gray-400 text-xs">KB/s (0=unlimited)</span>
      </div>

      <button
        onClick={() => dispatch(openSettings())}
        className="text-gray-400 hover:text-white text-xs"
      >
        Settings
      </button>
    </div>
  )
}
