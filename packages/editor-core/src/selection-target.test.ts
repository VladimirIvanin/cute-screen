import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
} from './drawing'
import { arrowPathPoints } from './arrow-geometry'
import {
  transformPoint,
  transformToMatrix,
} from './geometry'
import { createCalloutLayer } from './tools/content/callout'
import { createSpotlightLayer } from './tools/precision/spotlight'
import { createRulerLayer } from './tools/precision/ruler'
import {
  LAYER_KINDS,
  type EditorDocumentV1,
  type LayerNode,
} from './document/types'
import {
  DocumentSpatialIndex,
  hitTestDocument,
} from './hit-test'
import {
  LAYER_INTERACTION_POLICIES,
  resolveSelectionTarget,
  selectionFrame,
} from './selection-target'

const arrow = createDrawingLayer({ id: 'arrow', tool: 'arrow', start: { x: 50, y: 50 }, end: { x: 250, y: 150 } })!
function document(layers: readonly LayerNode[] = [arrow]): EditorDocumentV1 {
  return { schemaVersion: 7, id: 'selection-test', canvas: { width: 1000, height: 700 }, crop: null,
    source: { blobHash: 'a'.repeat(64), format: 'png', mimeType: 'image/png', width: 1000, height: 700,
      orientationApplied: true, color: { colorSpace: 'srgb', hasIccProfile: false } },
    layers, presentation: { beautify: { enabled: false }, watermark: { enabled: false } },
    createdAt: '2026-10-17T00:00:00Z', updatedAt: '2026-10-17T00:00:00Z' }
}
describe('selection interaction contract', () => {
  it('queries spatial candidates without walking the scene array on pointermove', () => {
    let reads = 0
    const layers = new Proxy(Array.from({ length: 1000 }, (_, index) => ({
      ...arrow,
      id: String(index),
      transform: { ...arrow.transform, translateX: arrow.transform.translateX + index * 1000 },
    })), { get(
      target,
      key,
      receiver,
    ) {
      if (typeof key === 'string' && /^\d+$/u.test(key)) reads += 1
      return Reflect.get(target, key, receiver)
    } })
    const index = new DocumentSpatialIndex(document(layers))
    reads = 0
    expect(index.hitAll({ x: 100, y: 75 })).toHaveLength(1)
    expect(reads).toBe(0)
  })
  it.each(['straight', 'quadratic', 'elbow'] as const)('expands the shared %s arrow path, without expanding its whole frame', (path) => {
    const layer = createDrawingLayer({ id: path, tool: 'arrow', start: { x: 100, y: 100 }, end: { x: 500, y: 300 },
      defaults: { ...DEFAULT_DRAWING_DEFAULTS, arrow: { ...DEFAULT_DRAWING_DEFAULTS.arrow, path, endCap: 'none' } } })!
    if (layer.kind !== 'arrow') throw new Error('Expected arrow')
    const points = arrowPathPoints(layer.payload)
    const index = Math.max(1, Math.floor(points.length / 2))
    const a = points[index - 1]!
    const b = points[index]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const offset = layer.payload.stroke.width / 2 + 3
    const local = { x: (a.x + b.x) / 2 - (b.y - a.y) / length * offset,
      y: (a.y + b.y) / 2 + (b.x - a.x) / length * offset }
    const point = transformPoint(transformToMatrix(layer.transform), local)
    expect(hitTestDocument(document([layer]), point)).toBeUndefined()
    expect(resolveSelectionTarget({ document: document([layer]), selectedIds: [], point })).toMatchObject({ kind: 'object', nodeId: path })
  })
  it.each(['pencil', 'marker'] as const)('pads %s ink beyond its spatial bounds', (tool) => {
    const layer = createDrawingLayer({ id: tool, tool, start: { x: 100, y: 100 }, end: { x: 500, y: 100 },
      points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 500, y: 100 }],
      defaults: { ...DEFAULT_DRAWING_DEFAULTS, pencil: { ...DEFAULT_DRAWING_DEFAULTS.pencil, brush: 'pen', smoothing: 0 } } })!
    const width = tool === 'pencil' ? 3 : 18
    const point = { x: 300, y: 100 + width / 2 + 5 }
    const doc = document([layer])
    const options = { useInteractionPolicy: true }
    expect(hitTestDocument(doc, point)).toBeUndefined()
    expect(new DocumentSpatialIndex(doc).hitAll(point, options)).toEqual([hitTestDocument(doc, point, {}, options)])
    expect(resolveSelectionTarget({ document: doc, selectedIds: [], point })).toMatchObject({ kind: 'object', nodeId: tool })
  })
  it('pads callout connectors and keeps spotlight dimming out of primary selection', () => {
    const callout = createCalloutLayer({ id: 'callout', text: 'Label', target: { x: 100, y: 100 }, label: { x: 300, y: 100 } })!
    const point = { x: 200, y: 105 }
    expect(resolveSelectionTarget({ document: document([callout]), selectedIds: [], point })).toMatchObject({ kind: 'object', nodeId: 'callout' })
    const spotlight = createSpotlightLayer({ id: 'spotlight', bounds: { x: 100, y: 100, width: 300, height: 200 } })
    expect(resolveSelectionTarget({ document: document([spotlight]), selectedIds: [], point: { x: 50, y: 50 } }).kind).toBe('empty')
    expect(resolveSelectionTarget({ document: document([spotlight]), selectedIds: [], point: { x: 200, y: 150 } }).kind).toBe('object')
  })
  it.each([0.25, 4])('uses visible ruler thickness rather than the legacy document padding at scale %s', (scale) => {
    const ruler = createRulerLayer({ id: 'ruler', start: { x: 100, y: 100 }, end: { x: 500, y: 100 }, canvas: { width: 1000, height: 700 }, thickness: 2 })
    const doc = document([ruler])
    const point = { x: 200, y: 101 + 6.1 / scale }
    expect(resolveSelectionTarget({ document: doc, selectedIds: [], point, screenScale: { x: scale, y: scale } }).kind).toBe('empty')
  })
  it('measures padding using the actual canvas scale on each axis', () => {
    const vertical = createDrawingLayer({ id: 'vertical', tool: 'arrow', start: { x: 100, y: 100 }, end: { x: 100, y: 500 } })!
    const options = { margin: 6, screenScale: { x: 4, y: 1 } }
    expect(hitTestDocument(document([vertical]), { x: 105.5, y: 300 }, {}, options)?.nodeId).toBe('vertical')
    expect(hitTestDocument(document([vertical]), { x: 105.6, y: 300 }, {}, options)).toBeUndefined()
  })
  it('requires an explicit policy for every persisted layer kind', () => {
    expect(Object.keys(LAYER_INTERACTION_POLICIES).sort()).toEqual([...LAYER_KINDS].sort())
  })
  it('does not turn the future arrow frame into a primary hit area', () => {
    expect(resolveSelectionTarget({ document: document(), selectedIds: [], point: { x: 100, y: 125 } }).kind).toBe('empty')
    expect(resolveSelectionTarget({ document: document(), selectedIds: ['arrow'], point: { x: 100, y: 125 } }).kind).toBe('selection')
  })
  it.each([0.25, 1, 4])('keeps the contour margin in CSS pixels at scale %s', (scale) => {
    const horizontal = createDrawingLayer({ id: 'line', tool: 'arrow', start: { x: 100, y: 100 }, end: { x: 500, y: 100 } })!
    const doc = document([horizontal])
    const width = 8 / 2
    const point = { x: 300, y: 100 + width + 5.9 / scale }
    expect(hitTestDocument(doc, point)).toBeUndefined()
    const options = { margin: 6, screenScale: { x: scale, y: scale } }
    expect(hitTestDocument(doc, point, {}, options)?.nodeId).toBe('line')
    expect(hitTestDocument(doc, { ...point, y: 100 + width + 6.1 / scale }, {}, options)).toBeUndefined()
    expect(new DocumentSpatialIndex(doc).hitAll(point, options)).toEqual([hitTestDocument(doc, point, {}, options)])
  })
  it('prefers another direct hit over selection, but selection over another padded hit', () => {
    const line = createDrawingLayer({ id: 'other', tool: 'arrow', start: { x: 70, y: 120 }, end: { x: 180, y: 120 } })!
    const doc = document([arrow, line])
    expect(resolveSelectionTarget({ document: doc, selectedIds: ['arrow'], point: { x: 110, y: 120 } })).toMatchObject({ kind: 'object', nodeId: 'other' })
    expect(resolveSelectionTarget({ document: doc, selectedIds: ['arrow'], point: { x: 110, y: 125 } }).kind).toBe('selection')
  })
  it('hits outside original bounds and respects rotation and reflection', () => {
    const shape = createDrawingLayer({ id: 'shape', tool: 'shape', start: { x: 100, y: 100 }, end: { x: 200, y: 200 } })!
    const reflected = {
      ...shape,
      transform: { ...shape.transform, translateX: 300, translateY: 100, scaleX: -1, rotation: 90 },
    }
    expect(hitTestDocument(document([reflected]), { x: 305, y: 50 }, {}, { margin: 6 })?.nodeId).toBe('shape')
  })
  it('resolves the nearest visible handle before geometry and ignores unselected handles', () => {
    const handles = [
      { kind: 'arrow' as const, nodeId: 'arrow', handle: 'start' as const, point: { x: 50, y: 50 }, radius: 9 },
      { kind: 'arrow' as const, nodeId: 'arrow', handle: 'end' as const, point: { x: 58, y: 50 }, radius: 9 },
    ]
    expect(resolveSelectionTarget({ document: document(), selectedIds: ['arrow'], point: { x: 57, y: 50 }, handles })).toMatchObject({ kind: 'handle', target: { handle: 'end' } })
    expect(resolveSelectionTarget({ document: document(), selectedIds: [], point: { x: 57, y: 50 }, handles }).kind).not.toBe('handle')
  })
  it('uses a combined frame and excludes hidden and locked layers from movement', () => {
    const other = { ...arrow, id: 'other', transform: { ...arrow.transform, translateX: 400 } }
    const doc = document([arrow, other, { ...arrow, id: 'locked', locked: true }])
    expect(selectionFrame(doc, ['arrow', 'other'])?.bounds.width).toBeGreaterThan(500)
    expect(resolveSelectionTarget({ document: doc, selectedIds: ['arrow', 'other'], point: { x: 350, y: 100 } })).toMatchObject({ kind: 'selection', nodeIds: ['arrow', 'other'] })
    expect(resolveSelectionTarget({ document: doc, selectedIds: ['locked'], point: { x: 100, y: 125 } }).kind).toBe('empty')
  })
})
