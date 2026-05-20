import { describe, it, expect } from 'vitest'
import downloadsReducer, {
  upsertDownload,
  updateProgress,
  removeDownload,
  setDownloadError,
  completeDownload,
  downloadsSlice,
} from './downloadsSlice'
import type { Download } from '../types'

const makeDownload = (overrides: Partial<Download> = {}): Download => ({
  id: 'dl-1',
  url: 'https://example.com/file.zip',
  filename: 'file.zip',
  dest_path: '/tmp/file.zip',
  total_bytes: 1000,
  downloaded_bytes: 0,
  status: 'active',
  sha256: null,
  chunks_json: null,
  created_at: '2026-01-01T00:00:00',
  completed_at: null,
  ...overrides,
})

describe('downloadsSlice', () => {
  it('starts with empty items', () => {
    const state = downloadsReducer(undefined, { type: '@@INIT' })
    expect(state.items).toEqual({})
  })

  it('upserts a download', () => {
    const dl = makeDownload()
    const state = downloadsReducer(undefined, upsertDownload(dl))
    expect(state.items['dl-1']).toEqual(dl)
  })

  it('updates progress', () => {
    const dl = makeDownload()
    let state = downloadsReducer(undefined, upsertDownload(dl))
    state = downloadsReducer(state, updateProgress({ id: 'dl-1', downloaded_bytes: 500, speed_bps: 1000 }))
    expect(state.items['dl-1'].downloaded_bytes).toBe(500)
    expect(state.items['dl-1'].speed_bps).toBe(1000)
  })

  it('completes download with sha256', () => {
    const dl = makeDownload()
    let state = downloadsReducer(undefined, upsertDownload(dl))
    state = downloadsReducer(state, completeDownload({ id: 'dl-1', sha256: 'abc123' }))
    expect(state.items['dl-1'].status).toBe('complete')
    expect(state.items['dl-1'].sha256).toBe('abc123')
  })

  it('removes a download', () => {
    const dl = makeDownload()
    let state = downloadsReducer(undefined, upsertDownload(dl))
    state = downloadsReducer(state, removeDownload('dl-1'))
    expect(state.items['dl-1']).toBeUndefined()
  })

  it('sets error status', () => {
    const dl = makeDownload()
    let state = downloadsReducer(undefined, upsertDownload(dl))
    state = downloadsReducer(state, setDownloadError({ id: 'dl-1', error: 'timeout' }))
    expect(state.items['dl-1'].status).toBe('error')
  })

  it('ignores updateProgress for unknown id', () => {
    const state = downloadsReducer(undefined, updateProgress({ id: 'unknown', downloaded_bytes: 100 }))
    expect(state.items).toEqual({})
  })

  it('completeDownload updates bytes when provided', () => {
    const state = { items: { 'dl-1': { id: 'dl-1', status: 'active' as const, total_bytes: null, downloaded_bytes: 0, url: '', filename: '', dest_path: '', sha256: null, chunks_json: null, created_at: '', completed_at: null } } }
    const action = completeDownload({ id: 'dl-1', sha256: '', bytes: 5_000_000 })
    const next = downloadsSlice.reducer(state, action)
    expect(next.items['dl-1'].status).toBe('complete')
    expect(next.items['dl-1'].total_bytes).toBe(5_000_000)
    expect(next.items['dl-1'].downloaded_bytes).toBe(5_000_000)
  })
})
