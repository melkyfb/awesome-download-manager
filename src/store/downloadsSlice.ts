import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { Download } from '../types'

interface DownloadsState {
  items: Record<string, Download>
}

const initialState: DownloadsState = {
  items: {},
}

export const downloadsSlice = createSlice({
  name: 'downloads',
  initialState,
  reducers: {
    upsertDownload: (state, action: PayloadAction<Download>) => {
      state.items[action.payload.id] = action.payload
    },
    updateProgress: (
      state,
      action: PayloadAction<{
        id: string
        downloaded_bytes?: number
        speed_bps?: number
        eta_seconds?: number | null
        chunk_speeds?: number[]
      }>
    ) => {
      const download = state.items[action.payload.id]
      if (download) {
        if (action.payload.downloaded_bytes !== undefined) {
          download.downloaded_bytes = action.payload.downloaded_bytes
        }
        if (action.payload.speed_bps !== undefined) {
          download.speed_bps = action.payload.speed_bps
        }
        if (action.payload.eta_seconds !== undefined) {
          download.eta_seconds = action.payload.eta_seconds
        }
        if (action.payload.chunk_speeds !== undefined) {
          download.chunk_speeds = action.payload.chunk_speeds
        }
      }
    },
    completeDownload: (state, action: PayloadAction<{ id: string; sha256: string }>) => {
      const download = state.items[action.payload.id]
      if (download) {
        download.status = 'complete'
        download.sha256 = action.payload.sha256
        download.completed_at = new Date().toISOString()
      }
    },
    setDownloadError: (state, action: PayloadAction<{ id: string; error: string }>) => {
      const download = state.items[action.payload.id]
      if (download) {
        download.status = 'error'
        download.speed_bps = undefined
        download.eta_seconds = null
      }
    },
    removeDownload: (state, action: PayloadAction<string>) => {
      delete state.items[action.payload]
    },
  },
})

export const {
  upsertDownload,
  updateProgress,
  completeDownload,
  setDownloadError,
  removeDownload,
} = downloadsSlice.actions

export default downloadsSlice.reducer
