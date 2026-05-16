import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import React from 'react'
import { useForegroundService } from './useForegroundService'
import downloadsReducer, { completeDownload } from '../store/downloadsSlice'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

import { invoke } from '@tauri-apps/api/core'

function makeStore(items = {}) {
  return configureStore({
    reducer: { downloads: downloadsReducer },
    preloadedState: { downloads: { items } },
  })
}

function wrapper(store: ReturnType<typeof makeStore>) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, { store }, children)
}

const activeDownload = {
  id: 'dl-1',
  url: 'http://example.com/file.zip',
  filename: 'file.zip',
  dest_path: '/tmp/file.zip',
  total_bytes: 1000,
  downloaded_bytes: 100,
  status: 'active' as const,
  speed_bps: 500,
  eta_seconds: 10,
  chunk_speeds: [],
  chunks_json: null,
  sha256: null,
  created_at: new Date().toISOString(),
  completed_at: null,
}

describe('useForegroundService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls plugin start when an active download exists', () => {
    const store = makeStore({ 'dl-1': activeDownload })
    renderHook(() => useForegroundService(), { wrapper: wrapper(store) })
    expect(invoke).toHaveBeenCalledWith('plugin:foreground-service|start', {
      filename: 'file.zip',
      progress: 10,
    })
  })

  it('calls plugin stop when active download transitions to complete', () => {
    const store = makeStore({ 'dl-1': activeDownload })
    const { rerender } = renderHook(() => useForegroundService(), { wrapper: wrapper(store) })
    vi.clearAllMocks()

    act(() => {
      store.dispatch(completeDownload({ id: 'dl-1', sha256: 'abc123' }))
    })
    rerender()

    expect(invoke).toHaveBeenCalledWith('plugin:foreground-service|stop', undefined)
  })

  it('does not call invoke when there are no downloads at all', () => {
    const store = makeStore({})
    renderHook(() => useForegroundService(), { wrapper: wrapper(store) })
    expect(invoke).not.toHaveBeenCalled()
  })
})
