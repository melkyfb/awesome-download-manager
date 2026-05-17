import { describe, it, expect } from 'vitest'
import { THEMES, getTheme } from './index'

describe('THEMES catalog', () => {
  it('has at least 35 themes', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(35)
  })

  it('all themes have required fields', () => {
    for (const t of THEMES) {
      expect(t.id).toBeTruthy()
      expect(t.gradient).toBeTruthy()
      expect(t.accentColor).toBeTruthy()
    }
  })

  it('getTheme returns correct theme', () => {
    expect(getTheme('dark-glass').name).toBe('Dark Glass')
  })

  it('getTheme falls back to first theme on unknown id', () => {
    expect(getTheme('nonexistent').id).toBe('dark-glass')
  })
})
