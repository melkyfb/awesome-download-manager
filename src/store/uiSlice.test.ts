import { describe, it, expect } from 'vitest'
import uiReducer, { openCloseDialog, closeCloseDialog, setDownloadFilter, registerPlaylistGroup, clearPlaylistGroup, uiSlice } from './uiSlice'

describe('uiSlice', () => {
  it('starts with closeDialogOpen false', () => {
    const state = uiReducer(undefined, { type: '@@INIT' })
    expect(state.closeDialogOpen).toBe(false)
  })

  it('openCloseDialog sets closeDialogOpen true', () => {
    const state = uiReducer(undefined, openCloseDialog())
    expect(state.closeDialogOpen).toBe(true)
  })

  it('closeCloseDialog sets closeDialogOpen false', () => {
    let state = uiReducer(undefined, openCloseDialog())
    state = uiReducer(state, closeCloseDialog())
    expect(state.closeDialogOpen).toBe(false)
  })
})

it('setDownloadFilter changes filter', () => {
  const state = uiReducer(undefined, setDownloadFilter('active'))
  expect(state.downloadFilter).toBe('active')
})

it('registerPlaylistGroup stores group', () => {
  const state = uiSlice.reducer(undefined, registerPlaylistGroup({
    groupId: 'g1',
    ids: ['a', 'b'],
    generateFile: true,
    fileFormat: 'm3u',
    name: 'MyPlaylist',
    destFolder: '/tmp',
  }))
  expect(state.playlistGroups['g1'].ids).toEqual(['a', 'b'])
})

it('clearPlaylistGroup removes group', () => {
  let state = uiSlice.reducer(undefined, registerPlaylistGroup({
    groupId: 'g1', ids: ['a'], generateFile: false,
    fileFormat: 'm3u', name: 'P', destFolder: '/tmp',
  }))
  state = uiSlice.reducer(state, clearPlaylistGroup({ groupId: 'g1' }))
  expect(state.playlistGroups['g1']).toBeUndefined()
})
