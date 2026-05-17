import { describe, it, expect } from 'vitest'
import { FONTS, getFont } from './index'

describe('FONTS catalog', () => {
  it('has at least 25 fonts', () => {
    expect(FONTS.length).toBeGreaterThanOrEqual(25)
  })

  it('all fonts have required fields', () => {
    for (const f of FONTS) {
      expect(f.id).toBeTruthy()
      expect(f.family).toBeTruthy()
      expect(f.googleParams).toBeTruthy()
    }
  })

  it('getFont returns correct font', () => {
    expect(getFont('inter').name).toBe('Inter')
  })

  it('getFont falls back to Inter on unknown id', () => {
    expect(getFont('unknown').id).toBe('inter')
  })
})
