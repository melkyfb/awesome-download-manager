import { describe, it, expect } from 'vitest'
import reducer, { setTheme, setFont, setLanguage, setAppearance } from './appearanceSlice'

describe('appearanceSlice', () => {
  it('has correct initial state', () => {
    const s = reducer(undefined, { type: '@@init' })
    expect(s.themeId).toBe('dark-glass')
    expect(s.fontId).toBe('inter')
    expect(s.language).toBe('pt')
  })

  it('setTheme updates themeId', () => {
    const s = reducer(undefined, setTheme('brasil'))
    expect(s.themeId).toBe('brasil')
  })

  it('setFont updates fontId', () => {
    const s = reducer(undefined, setFont('pacifico'))
    expect(s.fontId).toBe('pacifico')
  })

  it('setLanguage updates language', () => {
    const s = reducer(undefined, setLanguage('en'))
    expect(s.language).toBe('en')
  })

  it('setAppearance partial update', () => {
    const s = reducer(undefined, setAppearance({ themeId: 'poke' }))
    expect(s.themeId).toBe('poke')
    expect(s.fontId).toBe('inter') // unchanged
  })
})
