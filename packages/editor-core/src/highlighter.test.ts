import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  classifyHighlighterBackground,
  resolveHighlighterBlend,
  normalizeHighlighterDefaults,
} from './highlighter'
import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
} from './drawing'
import { parseDrawingToolPreferences } from './drawing-preferences'
import {
  extractLayerStyle,
  applyLayerStyle,
} from './styles'
import { parseSampledPayload } from './document/codec/paint'

function pixels(values: readonly number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values.flatMap((value) => [value, value, value, 255]))
}

describe('highlighter', () => {
  it('persists automatic intent through the document payload codec and validates new values', () => {
    const layer = createDrawingLayer({ id: 'marker', tool: 'marker', start: { x: 0, y: 0 }, end: { x: 20, y: 0 } })!
    expect(parseSampledPayload(layer.payload, 'marker.payload', true)).toMatchObject({ highlighterMode: 'auto' })
    expect(() => parseSampledPayload({ ...layer.payload, highlighterMode: 'invalid' }, 'marker.payload', true)).toThrow('highlighterMode')
  })
  it('carries automatic intent through style copy without recomputing saved appearance', () => {
    const layer = createDrawingLayer({ id: 'marker', tool: 'marker', start: { x: 0, y: 0 }, end: { x: 20, y: 0 }, highlighterEffect: 'illuminate' })!
    const style = extractLayerStyle(layer)
    expect(style).toMatchObject({ highlighterMode: 'auto', blendMode: 'screen' })
    expect(applyLayerStyle(layer, { ...style, width: 25 })).toMatchObject({ blendMode: 'screen', payload: { highlighterMode: 'auto', width: 25 } })
  })
  it('classifies dominant background rather than average brightness', () => {
    expect(classifyHighlighterBackground(pixels([0, 0, 0, 255, 255]))).toBe('illuminate')
    expect(classifyHighlighterBackground(pixels([255, 255, 255, 0, 0]))).toBe('highlight')
    expect(classifyHighlighterBackground(pixels([0, 0, 255, 255]))).toBe('veil')
    expect(classifyHighlighterBackground(pixels([135, 135]))).toBe('veil')
  })
  it('ignores transparency and safely handles empty images', () => {
    expect(classifyHighlighterBackground(new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 255]))).toBe('highlight')
    expect(classifyHighlighterBackground(new Uint8ClampedArray(16))).toBe('highlight')
  })
  it('uses weighted sRGB brightness and inclusive boundaries', () => {
    expect(classifyHighlighterBackground(new Uint8ClampedArray([255, 0, 0, 255]))).toBe('illuminate')
    expect(classifyHighlighterBackground(pixels([102]))).toBe('illuminate')
    expect(classifyHighlighterBackground(pixels([166]))).toBe('highlight')
  })
  it('resolves three effects and defaults pending auto to highlight', () => {
    expect(resolveHighlighterBlend('auto')).toBe('multiply')
    expect(resolveHighlighterBlend('auto', 'illuminate')).toBe('screen')
    expect(resolveHighlighterBlend('auto', 'veil')).toBe('normal')
    expect(resolveHighlighterBlend('highlight', 'illuminate')).toBe('multiply')
    expect(resolveHighlighterBlend('illuminate')).toBe('screen')
    expect(resolveHighlighterBlend('veil')).toBe('normal')
  })
  it('preserves legacy effective darken instead of trusting the conflicting Blend control', () => {
    expect(normalizeHighlighterDefaults({ mode: 'darken', blendMode: 'screen', width: 21 })).toEqual({ highlighterMode: 'highlight', blendMode: 'darken', width: 21 })
    const prefs = parseDrawingToolPreferences({ schemaVersion: 2, defaults: { marker: { mode: 'highlight', blendMode: 'screen', width: 18 } } })
    expect(prefs.defaults.marker).toMatchObject({ highlighterMode: 'highlight', blendMode: 'multiply' })
  })
  it('keeps explicit modern intent independent from an automatic recommendation', () => {
    const marker = normalizeHighlighterDefaults({ highlighterMode: 'auto', mode: 'darken', blendMode: 'screen' })
    expect(marker).toEqual({ highlighterMode: 'auto' })
    const layer = createDrawingLayer({ id: 'marker', tool: 'marker', start: { x: 0, y: 0 }, end: { x: 20, y: 0 }, defaults: { ...DEFAULT_DRAWING_DEFAULTS, marker: { ...DEFAULT_DRAWING_DEFAULTS.marker, ...marker } }, highlighterEffect: 'illuminate' })
    expect(layer).toMatchObject({ blendMode: 'screen', opacity: 0.35, payload: { highlighterMode: 'auto', width: 18 } })
  })
})
