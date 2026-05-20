import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { Config } from '../types'

const initialState: Config = {
  dest_folder: '',
  max_speed: 0,
  chunks: 8,
  ai_provider: null,
  search_provider: null,
  ai_enabled: false,
  theme_id: 'cosmos',
  font_id: 'inter',
  language: 'pt',
  start_minimized: false,
  clipboard_monitor_enabled: true,
  use_last_folder: false,
  last_used_folder: '',
}

const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {
    setConfig(_state, action: PayloadAction<Config>) {
      return action.payload
    },
    setAiEnabled(state, action: PayloadAction<boolean>) {
      state.ai_enabled = action.payload
    },
    setMaxSpeed(state, action: PayloadAction<number>) {
      state.max_speed = action.payload
    },
    setLastUsedFolder(state, action: PayloadAction<string>) {
      state.last_used_folder = action.payload
    },
  },
})

export const { setConfig, setAiEnabled, setMaxSpeed, setLastUsedFolder } = configSlice.actions
export default configSlice.reducer
