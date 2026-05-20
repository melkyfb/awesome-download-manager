export type DownloadStatus = 'active' | 'paused' | 'complete' | 'error' | 'cancelled'

export interface Download {
  id: string
  url: string
  filename: string
  dest_path: string
  total_bytes: number | null
  downloaded_bytes: number
  status: DownloadStatus
  sha256: string | null
  chunks_json: string | null
  created_at: string
  completed_at: string | null
  speed_bps?: number
  eta_seconds?: number | null
  chunk_speeds?: number[]
  download_type?: 'http' | 'video'
  video_quality?: string
  percent?: number
  playlist_group_id?: string
}

export interface AiResult {
  file_type: string
  description: string
  risk_level: 'low' | 'medium' | 'high'
  risk_explanation: string
}

export interface MirrorResult {
  url: string
  source: string
  confidence: number
}

export interface Config {
  dest_folder: string
  max_speed: number
  chunks: number
  ai_provider: string | null
  search_provider: string | null
  ai_enabled: boolean
  theme_id: string
  font_id: string
  language: string
  start_minimized: boolean
  clipboard_monitor_enabled: boolean
  use_last_folder: boolean
  last_used_folder: string
}
