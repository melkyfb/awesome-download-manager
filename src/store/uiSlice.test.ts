import { describe, it, expect } from 'vitest'
import uiReducer, { openCloseDialog, closeCloseDialog, setDownloadFilter } from './uiSlice'

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
