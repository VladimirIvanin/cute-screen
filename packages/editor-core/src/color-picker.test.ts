import { describe, expect, it } from 'vitest'
import {
  colorPalette,
  colorSuggestions,
  hexToSrgb,
  hsvToSrgb,
  normalizeHex,
  srgbToHex,
} from './color-picker'

describe('colour picker primitives', () => {
  it('normalizes short and long hexadecimal colours without alpha', () => {
    expect(normalizeHex(' d14b7c ')).toBe('#D14B7C')
    expect(normalizeHex('#abc')).toBe('#AABBCC')
    expect(normalizeHex('#12345g')).toBeUndefined()
    expect(srgbToHex(hexToSrgb('#D14B7C')!)).toBe('#D14B7C')
  })

  it('keeps an explicit hue while building a palette from an achromatic colour', () => {
    expect(srgbToHex(colorPalette(hexToSrgb('#FFFFFF')!, 120)[11]!)).toBe(
      '#B0F5B0',
    )
  })

  it('provides 32 palette options with a complete neutral row', () => {
    const palette = colorPalette(hexToSrgb('#D14B7C')!)
    expect(palette).toHaveLength(32)
    expect(palette.slice(0, 8).map(srgbToHex)).toEqual([
      '#FFFFFF',
      '#E7E7E8',
      '#C7C7CA',
      '#9A9A9F',
      '#68686E',
      '#414146',
      '#202024',
      '#000000',
    ])
  })

  it('returns contrast, complementary and analogous suggestions deterministically', () => {
    const suggestions = colorSuggestions(hexToSrgb('#D14B7C')!)
    expect(suggestions.map(({ id }) => id)).toEqual([
      'contrast',
      'complementary',
      'analogous',
    ])
    expect(srgbToHex(suggestions[0]!.color)).toBe('#171719')
    expect(srgbToHex(hsvToSrgb({ hue: 0, saturation: 100, value: 100 }))).toBe(
      '#FF0000',
    )
  })
})
