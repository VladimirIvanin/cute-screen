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
  shapeGeometry,
  SHAPE_CATALOG,
  flattenShapePath,
} from './shapes'
import { createDocumentRenderScene } from './document/scene'
import { documentFixture } from './document/scene/test-kit'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from './document/codec'
import {
  applyLayerStyle,
  extractLayerStyle,
} from './styles'
import {
  arrowBodyGeometry,
  arrowPathPoints,
  arrowEndpointAngles,
  rebaseArrowLayer,
  updateArrowHandle,
} from './arrow-geometry'
import {
  transformPoint,
  transformToMatrix,
} from './geometry'
import {
  applyEditorCommand,
  revertEditorCommand,
} from './commands/operations'
import { resizeLayerGeometry } from './layer-resize'
import { ARROW_CAPS } from './document/types'
import { hitTestDocument } from './hit-test'
import type {
  ArrowLayer,
  ShapeLayer,
  JsonObject,
} from './document/types'

function drawing(
  tool: 'shape' | 'arrow',
  id = '019c1f62-058e-7000-8000-000000000004',
) {
  return createDrawingLayer({
    id, tool, sketchSequence: id.endsWith('005') ? 1 : 0, start: { x: 20, y: 30 }, end: { x: 300, y: 180 },
    defaults: { ...DEFAULT_DRAWING_DEFAULTS,
      shape: { ...DEFAULT_DRAWING_DEFAULTS.shape, shape: 'circling' },
      arrow: { ...DEFAULT_DRAWING_DEFAULTS.arrow, appearance: 'handDrawn' },
    },
  })! as ArrowLayer | ShapeLayer
}

describe('hand-drawn annotations', () => {
  it('adds an open circling figure with stable, individual seeded geometry and no fill hit area', () => {
    expect(SHAPE_CATALOG.some((entry) => entry.id === 'circling')).toBe(true)
    const first = drawing('shape') as ShapeLayer
    const second = drawing('shape', '019c1f62-058e-7000-8000-000000000005') as ShapeLayer
    expect(first.payload.sketchVersion).toBe(2)
    expect(first.payload.sketchSeed).not.toBe(second.payload.sketchSeed)
    const geometry = shapeGeometry('circling', 280, 150, { sketchSeed: Number(first.payload.sketchSeed) })
    expect(geometry.open).toBe(true)
    const contour = flattenShapePath(geometry.outline)[0]!
    const begin = contour[0]!, end = contour.at(-1)!
    expect(Math.hypot(begin.x - end.x, begin.y - end.y)).toBeGreaterThan(2)
    // The pen completes a full turn and continues beyond its starting angle.
    // Open ends overlap in angle rather than removing a wedge from the circle.
    const turn = contour.slice(1).reduce((sum, p, i) => {
      const previous = contour[i]!
      const delta = Math.atan2(p.y - 75, p.x - 140) - Math.atan2(previous.y - 75, previous.x - 140)
      return sum + Math.atan2(Math.sin(delta), Math.cos(delta))
    }, 0)
    expect(Math.abs(turn)).toBeGreaterThan(Math.PI * 2)

    expect(geometry.outline.some((command) => command[0] === 'Z')).toBe(false)
    expect(geometry).toEqual(shapeGeometry('circling', 280, 150, { sketchSeed: Number(first.payload.sketchSeed) }))
    expect(geometry).not.toEqual(shapeGeometry('circling', 280, 150, { sketchSeed: Number(second.payload.sketchSeed) }))
    const doc = { ...documentFixture, layers: [first] }
    expect(hitTestDocument(doc, { x: 160, y: 105 })).toBeUndefined()
    expect(flattenShapePath(geometry.outline)[0]!.length).toBeGreaterThan(20)
  })
  it.each(['shape', 'arrow'] as const)('persists %s seed and reproduces its render scene after reopening', (tool) => {
    const document = { ...documentFixture, layers: [drawing(tool)] }
    const parsed = parseEditorDocument(JSON.parse(serializeEditorDocument(document)))
    expect(document.layers[0]!.payload.sketchSeed).toBeGreaterThan(0)
    expect(parsed.kind).toBe('editable')
    if (parsed.kind !== 'editable') throw new Error('Document is not editable')
    expect(createDocumentRenderScene(parsed.document)).toEqual(createDocumentRenderScene(document))
  })
  it('keeps the receiving seed when transferring style and preserves it through clean/handDrawn changes', () => {
    const source = drawing('arrow') as ArrowLayer
    const target = drawing('arrow', '019c1f62-058e-7000-8000-000000000005') as ArrowLayer
    expect(extractLayerStyle(source).appearance).toBe('handDrawn')
    const clean = applyLayerStyle(target, { appearance: 'clean' })
    const restored = applyLayerStyle(clean, extractLayerStyle(source))
    expect(restored.payload.sketchSeed).toBe(target.payload.sketchSeed)
    expect(restored.payload.appearance).toBe('handDrawn')
    expect(extractLayerStyle(source)).not.toHaveProperty('sketchSeed')
  })
  it.each(['straight', 'quadratic', 'elbow'] as const)('renders %s with every cap and shares the visible body with hit testing', (path) => {
    for (const cap of ARROW_CAPS) {
      const arrow = drawing('arrow') as ArrowLayer
      const payload = { ...arrow.payload, path, startCap: cap, endCap: cap,
        ...(path === 'quadratic' ? { bend: { x: 180, y: 0 } } : {}),
        ...(path === 'elbow' ? { elbow: { axis: 'y' as const, offset: 0 } } : {}),
      }
      const layer = { ...arrow, payload }
      const body = arrowBodyGeometry(payload)
      expect(body.path.some((command) => command[0] === 'C')).toBe(true)
      expect(body.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
      const nodes = createDocumentRenderScene({ ...documentFixture, layers: [layer] }).nodes
      expect(nodes.every((node) => node.kind === 'vector')).toBe(true)
      expect(arrowEndpointAngles(arrowPathPoints(payload))).toEqual(arrowEndpointAngles(arrowPathPoints({ ...payload, appearance: 'clean' })))
      const midpoint = body.points[Math.floor(body.points.length / 2)]!
      expect(hitTestDocument({ ...documentFixture, layers: [layer] }, {
        x: midpoint.x + layer.transform.translateX, y: midpoint.y + layer.transform.translateY,
      })).toBeDefined()
    }
  })
  it('retains identity through resize, duplicate, history and immutable clean-style conversion', () => {
    const layer = drawing('shape') as ShapeLayer
    const before = { ...documentFixture, layers: [layer] }
    const resized = resizeLayerGeometry(layer, 'se', { x: 460, y: 300 })
    expect((resized.payload as JsonObject).sketchSeed).toBe(layer.payload.sketchSeed)
    const duplicate = { ...resized, id: '019c1f62-058e-7000-8000-000000000099' }
    const command = { type: 'duplicateLayer' as const, sourceId: layer.id, layer: duplicate }
    const after = applyEditorCommand(before, command)
    expect((after.layers.at(-1)!.payload as JsonObject).sketchSeed).toBe(layer.payload.sketchSeed)
    expect(revertEditorCommand(after, command)).toEqual(before)
    const arrow = drawing('arrow') as ArrowLayer
    const resizedArrow = updateArrowHandle(arrow, 'end', { x: 460, y: 300 })
    expect(resizedArrow.payload.sketchSeed).toBe(arrow.payload.sketchSeed)
    expect(resizedArrow.payload.appearance).toBe('handDrawn')
    const change = { type: 'updateLayer' as const, before: arrow, after: applyLayerStyle(arrow, { appearance: 'clean' }) }
    const arrowDoc = { ...documentFixture, layers: [arrow] }
    expect(revertEditorCommand(applyEditorCommand(arrowDoc, change), change)).toEqual(arrowDoc)
  })
  it('keeps short and long arrows finite, bounded and hittable after rotation at thin and thick widths', () => {
    const dimensions = [[8, 1], [8, 24], [1800, 1], [1800, 24]] as const
    for (const [length, width] of dimensions) for (const path of ['straight', 'quadratic', 'elbow'] as const) {
      for (const cap of ARROW_CAPS) {
        const original = drawing('arrow') as ArrowLayer
        const arrow = rebaseArrowLayer(original, {
          ...original.payload, path, start: { x: 0, y: 0 }, end: { x: length, y: length / 4 },
          stroke: { ...original.payload.stroke, width }, startCap: cap, endCap: cap,
          ...(path === 'quadratic' ? { bend: { x: length / 2, y: -length / 3 } } : {}),
          ...(path === 'elbow' ? { elbow: { axis: 'y' as const, offset: 0 } } : {}),
        })
        const rotated = { ...arrow, transform: { ...arrow.transform, rotation: 37 } }
        const body = arrowBodyGeometry(arrow.payload)
        const sample = body.points[Math.floor(body.points.length / 2)] ?? arrow.payload.start
        const document = { ...documentFixture, layers: [rotated] }
        expect(hitTestDocument(document, transformPoint(transformToMatrix(rotated.transform), sample))).toBeDefined()
        for (const node of createDocumentRenderScene({ ...document, layers: [arrow] }).nodes) {
          if (node.kind !== 'vector') throw new Error('Expected hand-drawn vector')
          for (const point of flattenShapePath(node.outline).flat()) {
            const x = point.x - arrow.transform.translateX, y = point.y - arrow.transform.translateY
            expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
            expect(x).toBeGreaterThanOrEqual(arrow.localBounds.x)
            expect(y).toBeGreaterThanOrEqual(arrow.localBounds.y)
            expect(x).toBeLessThanOrEqual(arrow.localBounds.x + arrow.localBounds.width)
            expect(y).toBeLessThanOrEqual(arrow.localBounds.y + arrow.localBounds.height)
          }
        }
      }
    }
  })
  it('rejects corrupt sketch metadata and forbids filled circling shapes', () => {
    for (const patch of [{ sketchVersion: 3 }, { sketchSeed: 0 }, { sketchSeed: 1.5 }, { fill: { kind: 'solid' } }]) {
      const shape = drawing('shape') as ShapeLayer
      const value = JSON.parse(serializeEditorDocument({ ...documentFixture, layers: [shape] }))
      Object.assign(value.layers[0].payload, patch)
      expect(() => parseEditorDocument(value)).toThrow()
    }
  })
  it('starts the independent line clean and transfers appearance without adding arrow caps', () => {
    const line = createDrawingLayer({ id: 'line', tool: 'line', start: { x: 0, y: 0 }, end: { x: 100, y: 50 } }) as ArrowLayer
    expect(applyLayerStyle(line, extractLayerStyle(drawing('arrow'))).payload).toMatchObject({
      appearance: 'handDrawn', startCap: 'none', endCap: 'none',
    })
    expect(createDocumentRenderScene({ ...documentFixture, layers: [line] }).nodes[0]!.kind).toBe('path')
  })

  it('adds a separate rectangular circling figure with open, individual geometry', () => {
    expect(SHAPE_CATALOG.some((entry) => entry.id === 'rectangularCircling')).toBe(true)
    const defaults = { ...DEFAULT_DRAWING_DEFAULTS, shape: { ...DEFAULT_DRAWING_DEFAULTS.shape, shape: 'rectangularCircling' } }
    const layer = createDrawingLayer({ id: 'rectangular-loop', tool: 'shape', start: { x: 0, y: 0 }, end: { x: 300, y: 160 }, defaults }) as ShapeLayer
    const geometry = shapeGeometry('rectangularCircling', 300, 160, { sketchSeed: Number(layer.payload.sketchSeed) })
    expect(geometry.open).toBe(true)
    const contour = flattenShapePath(geometry.outline)[0]!
    expect(contour.some((p) => p.x > 285 && p.y < 12)).toBe(true)
    expect(Math.abs(contour.at(-1)!.x - contour[0]!.x)).toBeGreaterThan(20)
    expect(Math.abs(contour[0]!.y - contour.at(-1)!.y)).toBeGreaterThan(2)
    expect(Math.hypot(contour[0]!.x - contour.at(-1)!.x, contour[0]!.y - contour.at(-1)!.y)).toBeGreaterThan(2)
    expect(hitTestDocument({ ...documentFixture, layers: [layer] }, { x: 150, y: 80 })).toBeUndefined()
    expect(layer.payload.fill).toMatchObject({ kind: 'none' })
  })

})
