import { describe, it, expect } from 'vitest'
import { THEMES, getTheme } from './index'

describe('THEMES', () => {
  it('exports exactly 10 themes', () => {
    expect(THEMES).toHaveLength(10)
  })

  it('every theme has an id, name, and MUI theme with palette', () => {
    for (const t of THEMES) {
      expect(t.id).toBeTruthy()
      expect(t.name).toBeTruthy()
      expect(t.theme.palette.primary.main).toBeTruthy()
      expect(t.theme.palette.background?.default).toBeTruthy()
    }
  })

  it('getTheme returns cosmos for unknown id', () => {
    const t = getTheme('old-dark-glass')
    expect(t.palette.primary.main).toBe('#BB86FC') // cosmos primary
  })

  it('getTheme returns correct theme by id', () => {
    const t = getTheme('arctic')
    expect(t.palette.mode).toBe('light')
  })
})
