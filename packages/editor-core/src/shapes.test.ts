import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  SHAPE_CATALOG,
  shapeGeometry,
  shapePathSvg,
} from './shapes'
import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
} from './drawing'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from './document/codec'
import { createDocumentRenderScene } from './document/scene'
import { documentFixture } from './document/scene/test-kit'
import { hitTestDocument } from './hit-test'
import { resizeLayerGeometry } from './layer-resize'
import {
  applyEditorCommand,
  revertEditorCommand,
} from './commands/operations'
import type { ShapeLayer } from './document/types'

function layer(shape: string): ShapeLayer {
  return createDrawingLayer({
    id: '019c1f62-058e-7000-8000-000000000004', tool: 'shape',
    start: { x: 0, y: 0 }, end: { x: 100, y: 100 },
    defaults: { ...DEFAULT_DRAWING_DEFAULTS, shape: { ...DEFAULT_DRAWING_DEFAULTS.shape, shape,
      fill: { kind: 'solid', opacity: 1, color: { red: 1, green: 0, blue: 0, alpha: 1 } } } },
  }) as ShapeLayer
}

describe('shared shape catalogue', () => {
  it('covers the complete palette with one rounded rectangle preset', () => {
    expect(SHAPE_CATALOG).toHaveLength(31)
    expect(new Set(SHAPE_CATALOG.map((entry) => entry.id)).size).toBe(31)
    expect(SHAPE_CATALOG.find((entry) => entry.id === 'roundedRectangle')).toMatchObject({ shape: 'rectangle', cornerRadius: 12 })
  })
  it.each(['triangle', 'roundedDiamond', 'parallelogram', 'trapezoid', 'pentagon', 'hexagon', 'octagon',
    'cross', 'arrowLeft', 'arrowRight', 'arrowBoth', 'chevron', 'pentagonRight', 'speechBubble', 'cloud',
    'braceLeft', 'braceRight', 'cylinder', 'cube', 'foldedDocument', 'ticket', 'shield', 'predefinedProcess',
    'internalStorage', 'stackedCards', 'rectangle', 'circle', 'oval', 'diamond', 'star'])('%s survives codec, commands and scene projection', (kind) => {
    const before = { ...documentFixture, layers: [layer(kind)] }
    const parsed = parseEditorDocument(JSON.parse(serializeEditorDocument(before)))
    expect(parsed.kind).toBe('editable')
    const scene = createDocumentRenderScene(before)
    expect(scene.nodes).toHaveLength(1)
    const shape = before.layers[0]!
    const resized = resizeLayerGeometry(shape, 'se', { x: 170, y: 120 })
    if (resized.kind !== 'shape') throw new Error('shape resize changed the layer kind')
    const after = { ...resized, payload: { ...shape.payload, shape: 'star' as const } }
    const command = { type: 'updateLayer' as const, before: shape, after }
    const changed = applyEditorCommand(before, command)
    const result = changed.layers[0]!
    expect(result.transform.translateX + result.localBounds.x + result.localBounds.width).toBe(170)
    expect((changed.layers[0] as ShapeLayer).payload.stroke).toEqual(shape.payload.stroke)
    expect(revertEditorCommand(changed, command)).toEqual(before)
    expect(applyEditorCommand(revertEditorCommand(changed, command), command)).toEqual(changed)
  })
  it('shares curved and open geometry with thumbnails', () => {
    expect(shapePathSvg(shapeGeometry('cloud').outline)).toContain('C')
    expect(shapePathSvg(shapeGeometry('braceLeft').outline)).not.toContain('Z')
    expect(shapeGeometry('cylinder').details.length).toBeGreaterThan(0)
  })
  it('hits the real filled contour and only the stroke of open braces', () => {
    const triangle = { ...documentFixture, layers: [layer('triangle')] }
    expect(hitTestDocument(triangle, { x: 5, y: 5 })).toBeUndefined()
    expect(hitTestDocument(triangle, { x: 50, y: 65 })).toBeDefined()
    const brace = { ...documentFixture, layers: [layer('braceLeft')] }
    expect(hitTestDocument(brace, { x: 75, y: 50 })).toBeUndefined()
    expect(hitTestDocument(brace, { x: 3, y: 50 })).toBeDefined()
  })
})
