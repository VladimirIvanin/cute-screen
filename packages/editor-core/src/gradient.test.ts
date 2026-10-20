import { parseStroke } from './document/codec/paint'
import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
} from './drawing'
import {
  rotateGradientFill,
  type LinearGradientPaint,
  fitGradientLayer,
  gradientFrame,
  snapGradientPoint,
  updateGradientHandle,
} from './gradient'
import { annotationTool } from './line'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from './document/codec'
import { documentFixture } from './document/scene/test-kit'
import {
  applyEditorCommand,
  revertEditorCommand,
} from './commands/operations'
import {
  parseDrawingToolPreferences,
  defaultDrawingToolPreferences,
} from './drawing-preferences'
import type { ShapeLayer } from './document/types'

const id = '019c1f62-058e-7000-8000-000000000088'
function layer(): ShapeLayer {
  return createDrawingLayer({ id, tool: 'gradient', start: { x: 20, y: 30 }, end: { x: 220, y: 130 } }) as ShapeLayer
}
describe('gradient backdrops', () => {
  it('creates a stroke-free bottom-to-top black fade independent from drag direction', () => {
    const result = layer()
    expect(result).toMatchObject({ kind: 'shape', transform: { translateX: 20, translateY: 30 },
      localBounds: { width: 200,
        height: 100 },
      payload: { annotationTool: 'gradient',
        shape: 'rectangle',
        stroke: { width: 1, color: { alpha: 0 } },
        fill: { kind: 'linearGradient', start: { x: .5, y: 1 }, end: { x: .5, y: 0 }, opacity: 1,
          stops: [{ position: 0, color: { red: 0, green: 0, blue: 0, alpha: 1 } },
            { position: 1, color: { red: 0, green: 0, blue: 0, alpha: 0 } }] } } })
    expect(createDrawingLayer({ id, tool: 'gradient', start: { x: 220, y: 130 }, end: { x: 20, y: 30 } })).toEqual(
      result)
    expect(createDrawingLayer({ id,
      tool: 'gradient',
      start: { x: 20,
        y: 30 },
      end: { x: 20,
        y: 130 } })).toBeUndefined()
  })
  it('round-trips explicit identity and commits geometry in one reversible command', () => {
    const before = { ...documentFixture, layers: [layer()] }
    const parsed = parseEditorDocument(JSON.parse(serializeEditorDocument(before)))
    expect(parsed.kind).toBe('editable')
    if (parsed.kind !== 'editable') throw new Error('Expected editable document')
    expect(annotationTool(parsed.document.layers.at(-1)!)).toBe('gradient')
    const after = fitGradientLayer(layer(), { x: 7, y: 11, width: 400, height: 300 }, 'width')
    expect(after).toMatchObject(
      { transform: { translateX: 7, translateY: 30 }, localBounds: { width: 400, height: 100 } })
    expect(after.payload).toEqual(layer().payload)
    const command = { type: 'updateLayer' as const, before: layer(), after }
    const changed = applyEditorCommand(before, command)
    expect(revertEditorCommand(changed, command)).toEqual(before)
    expect(applyEditorCommand(revertEditorCommand(changed, command), command)).toEqual(changed)
    expect(fitGradientLayer({ ...layer(),
      transform: { ...layer().transform,
        rotation: 30 } },
    gradientFrame(before),
    'width').transform.rotation).toBe(
      30)
  })
  it('updates endpoints, snaps in physical space and translates the transition without changing bounds', () => {
    const before = layer()
    const after = updateGradientHandle(before, 'end', { x: 160, y: 80 }, true)
    const fill = after.payload.fill as LinearGradientPaint
    const dx = (fill.end.x - fill.start.x) * 200
    const dy = (fill.end.y - fill.start.y) * 100
    expect(Math.abs(dx)).toBeCloseTo(Math.abs(dy))
    expect(after.localBounds).toEqual(before.localBounds)
    const translated = updateGradientHandle(before, 'line', { x: 10, y: 20 })
    expect((translated.payload.fill as LinearGradientPaint).start.x).toBeCloseTo(.55)
    expect((translated.payload.fill as LinearGradientPaint).end.y).toBeCloseTo(.2)
    expect(updateGradientHandle(before, 'end', { x: 120, y: 130 })).toBe(before)
    expect(snapGradientPoint({ x: 12, y: 298 }, { x: 10, y: 20, width: 400, height: 280 }, 2)).toEqual(
      { x: 10, y: 300 })
    expect(snapGradientPoint({ x: 14, y: 290 }, { x: 10, y: 20, width: 400, height: 280 }, 2)).toEqual(
      { x: 14, y: 290 })
    expect(gradientFrame({ ...documentFixture, crop: { x: 7, y: 11, width: 400, height: 300 } })).toEqual(
      { x: 7, y: 11, width: 400, height: 300 })
  })
  it('rejects invalid backdrop identities and zero-length transitions', () => {
    const valid = layer()
    for (const patch of [
      { annotationTool: 'other' },
      { shape: 'circle' },
      { fill: { ...valid.payload.fill as object, end: { x: .5, y: 1 } } },
      { stroke: { ...valid.payload.stroke as object, width: 2 } },
    ]) {
      const document = { ...documentFixture, layers: [{ ...valid, payload: { ...valid.payload, ...patch } }] }
      expect(() => serializeEditorDocument(document)).toThrow()
    }
  })
  it('keeps the persisted invisible stroke readable by the legacy positive-width codec', () => {
    expect(() => parseStroke(layer().payload.stroke, 'stroke')).not.toThrow()
    const document = JSON.parse(serializeEditorDocument({ ...documentFixture, layers: [layer()] }))
    delete document.layers[0].payload.annotationTool
    expect(parseEditorDocument(document).kind).toBe('editable')
  })
  it('rotates a transition about its own center without changing its pixel length', () => {
    const fill = layer().payload.fill as LinearGradientPaint
    const rotated = rotateGradientFill(fill, 90, 200, 100)
    expect(rotated.start.x).toBeCloseTo(.25)
    expect(rotated.end.x).toBeCloseTo(.75)
    expect(rotated.start.y).toBeCloseTo(.5)
    expect(rotated.end.y).toBeCloseTo(.5)
  })
  it('keeps defaults separate, validates persisted gradient settings and reads older preferences', () => {
    const preferences = defaultDrawingToolPreferences()
    const custom = { ...preferences,
      defaults: { ...preferences.defaults,
        gradient: { ...preferences.defaults.gradient,
          layerOpacity: .4 } } }
    expect(parseDrawingToolPreferences(custom).defaults.gradient.layerOpacity).toBe(.4)
    expect(parseDrawingToolPreferences(custom).defaults.shape).toEqual(DEFAULT_DRAWING_DEFAULTS.shape)
    expect(parseDrawingToolPreferences({ schemaVersion: 2,
      defaults: { shape: DEFAULT_DRAWING_DEFAULTS.shape } }).defaults.gradient).toEqual(
      DEFAULT_DRAWING_DEFAULTS.gradient)
    expect(parseDrawingToolPreferences({ ...custom,
      defaults: { ...custom.defaults,
        gradient: { fill: { kind: 'solid' } } } }).defaults.gradient).toEqual(
      DEFAULT_DRAWING_DEFAULTS.gradient)
  })
})
