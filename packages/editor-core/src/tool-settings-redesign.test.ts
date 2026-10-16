import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  resolveFreehandGeometry,
  rebaseFreehandLayer,
} from './tools/freehand'
import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
} from './drawing'
import { withLayers } from './precision-tools.test-kit'
import { hitTestDocument } from './hit-test'
import { createDocumentRenderScene } from './document'
import {
  createSpotlightLayer,
  addSpotlightAperture,
  removeSpotlightAperture,
  updateSpotlightAperture,
} from './tools/precision/spotlight'
import { resizeLayerGeometry } from './layer-resize'
import {
  parseSpotlightPayload,
  parseRulerPayload,
} from './document/codec/precision'
import {
  createRulerLayer,
  measureRuler,
} from './tools/precision/ruler'
describe('tool settings redesign contracts', () => {
  it('enforces the 1–90 degree angle-step contract in factories and codec', () => {
    const input = {
      id: 'ruler', canvas: { width: 800, height: 600 },
      start: { x: 10, y: 10 }, end: { x: 100, y: 100 },
    }
    const ruler = createRulerLayer(input)
    for (const angle of [.5, 0, 91]) {
      expect(() => createRulerLayer({ ...input, snapAngleIncrementDegrees: angle })).toThrow()
      expect(() => parseRulerPayload({ ...ruler.payload, snapAngleIncrementDegrees: angle }, 'ruler')).toThrow()
    }
    expect(createRulerLayer({ ...input, snapAngleIncrementDegrees: 1 }).payload.snapAngleIncrementDegrees).toBe(1)
  })
  it('uses the smoothed path for both scene segments and hit testing', () => {
    const layer = createDrawingLayer({
      id: 'pencil', tool: 'pencil',
      start: { x: 20, y: 20 }, end: { x: 180, y: 20 },
      points: [
        { x: 20, y: 20, pressure: 1 },
        { x: 100, y: 100, pressure: 1 },
        { x: 180, y: 20, pressure: 1 },
      ],
      defaults: {
        ...DEFAULT_DRAWING_DEFAULTS,
        pencil: { ...DEFAULT_DRAWING_DEFAULTS.pencil, width: 1, smoothing: 1 },
      },
    })!
    if (layer.kind !== 'pencil') throw new Error('pencil expected')
    const middle = resolveFreehandGeometry(layer.payload, true).points[1]!
    const point = { x: middle.x + layer.transform.translateX, y: middle.y + layer.transform.translateY }
    const document = withLayers([layer])
    expect(hitTestDocument(document, point)?.nodeId).toBe(layer.id)
    const rawLayer = { ...layer, payload: { ...layer.payload, smoothing: 0 } }
    expect(hitTestDocument(withLayers([rawLayer]), point)).toBeUndefined()
    expect(createDocumentRenderScene(document).nodes[0]).toMatchObject({ kind: 'line', x2: point.x, y2: point.y })
  })
  it('grows freehand bounds after changing brush width while preserving sampled coordinates', () => {
    const layer = createDrawingLayer({ id: 'pencil', tool: 'pencil', start: { x: 10, y: 10 }, end: { x: 20, y: 20 } })
    if (layer?.kind !== 'pencil') throw new Error('pencil expected')
    const after = rebaseFreehandLayer({ ...layer, payload: { ...layer.payload, brush: 'brush', width: 10 } })
    expect(after.localBounds.width).toBeCloseTo(25)
    expect(after.localBounds.height).toBeCloseTo(25)
    expect((after.payload as import('./document/types').JsonObject).points).toBe(layer.payload.points)
    expect(after.transform).toBe(layer.transform)
  })
  it.each(['start', 'end'] as const)('snaps the %s ruler endpoint without changing styles', (handle) => {
    const canvas = {
      width: 800, height: 600,
    }
    const layer = createRulerLayer({
      id: 'ruler', canvas, start: {
        x: 100, y: 100,
      }, end: {
        x: 200, y: 100,
      },
    })
    const after = resizeLayerGeometry(layer, handle, {
      x: 260, y: 147,
    }, {
      canvas, snapAngleIncrementDegrees: 45,
    })
    expect(after.kind).toBe('ruler')
    if (after.kind !== 'ruler')
      throw new Error('ruler expected')
    expect(measureRuler(after, canvas).angleDegrees % 45).toBeCloseTo(0)
    expect(after.payload.color).toEqual(layer.payload.color)
    expect(after.payload.fontSize).toEqual(layer.payload.fontSize)
    expect(after.payload.thickness).toEqual(layer.payload.thickness)
  })
  const points = [
    {
      x: 0, y: 0, pressure: 0.2,
    },
    {
      x: 5, y: 9, pressure: 0.8,
    },
    {
      x: 10, y: 0, pressure: 0.4,
    },
    {
      x: 15, y: 8, pressure: 1,
    },
    {
      x: 20, y: 0, pressure: 0.6,
    },
  ]
  it('smooths geometry without changing samples, pressure or endpoints', () => {
    const payload = {
      points, width: 6, brush: 'brush', smoothing: 1,
    }
    const geometry = resolveFreehandGeometry(payload, true)
    expect(geometry.points[0]).toEqual(points[0])
    expect(geometry.points.at(-1)).toEqual(points.at(-1))
    expect(geometry.points[2]!.y).toBeCloseTo(34 / 9)
    expect(geometry.points.map((p) => p.pressure)).toEqual(points.map((p) => p.pressure))
    expect(geometry.width).toBe(9)
    expect(points[2]!.y).toBe(0)
    expect(resolveFreehandGeometry({
      ...payload, smoothing: 0,
    }, true).points).toEqual(points)
    expect(resolveFreehandGeometry(payload, false).points).toEqual(points)
    expect(resolveFreehandGeometry({
      ...payload, points: points.slice(0, 2),
    }, true).points).toEqual(points.slice(0, 2))
  })
  it('adds independent apertures, round-trips codec, resizes together and deletes the last layer', () => {
    const first = createSpotlightLayer({
      id: 'spotlight', bounds: {
        x: 10, y: 20, width: 40, height: 30,
      },
    })
    const second = addSpotlightAperture(first, {
      id: 'second', shape: 'ellipse', bounds: {
        x: 50, y: 0, width: 20, height: 30,
      },
    })
    expect(second.payload.apertures).toHaveLength(2)
    expect(second.localBounds).toEqual({
      x: 0, y: 0, width: 70, height: 30,
    })
    expect(parseSpotlightPayload(second.payload, 'spotlight')).toEqual(second.payload)
    const resized = resizeLayerGeometry(second, 'se', {
      x: 150, y: 80,
    })
    expect(resized.kind === 'spotlight' && resized.payload.apertures[1]!.bounds.width).toBe(40)
    const edited = updateSpotlightAperture(second, 'second', {
      shape: 'diamond',
    })
    expect(edited.payload.apertures[0]).toEqual(second.payload.apertures[0])
    expect(edited.payload.apertures[1]!.shape).toBe('diamond')
    const single = removeSpotlightAperture(edited, 'second')!
    expect(single.payload.apertures).toHaveLength(1)
    expect(removeSpotlightAperture(single, single.payload.apertures[0]!.id)).toBeUndefined()
    expect(() => parseSpotlightPayload({
      ...second.payload, apertures: [],
    }, 'spotlight')).toThrow()
    expect(() => addSpotlightAperture(second, second.payload.apertures[0]!)).toThrow()
  })
})
