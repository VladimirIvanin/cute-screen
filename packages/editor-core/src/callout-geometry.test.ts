import {
  hitTestDocument,
  DocumentSpatialIndex,
} from './hit-test'
import { createDocumentRenderScene } from './document/scene'
import { documentFixture } from './document/scene/test-kit'
import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  calloutGeometryBounds,
  calloutPathPoints,
  calloutSelectionHandles,
  calloutTextRect,
  defaultCalloutRoute,
  rebaseCalloutLayer,
  updateCalloutHandle,
} from './callout-geometry'
import { createCalloutLayer } from './tools/content/callout'

const STROKE = Object.freeze({
  color: Object.freeze({ red: 0.5, green: 0.5, blue: 0.5, alpha: 1 }),
  width: 2,
  style: 'solid' as const,
  cap: 'round' as const,
  join: 'round' as const,
})

describe('callout leader-line geometry', () => {
  it('routes an elbow connector between target and label', () => {
    const route = defaultCalloutRoute({ x: 10, y: 20 }, { x: 120, y: 80 })
    expect(route.path).toBe('elbow')
    const points = calloutPathPoints({
      target: { x: 10, y: 20 },
      label: { x: 120, y: 80 },
      route,
      stroke: STROKE,
      content: {
        text: 'Label',
        wrap: 'autoSize',
        spans: [],
        paragraphs: [],
      },
      background: null,
      targetMarker: 'circle',
      labelMarker: 'circle',
    })
    expect(points).toHaveLength(4)
    expect(points[0]).toEqual({ x: 10, y: 20 })
    expect(points[3]).toEqual({ x: 120, y: 80 })
  })

  it('creates a rebased callout layer with connector handles', () => {
    const layer = createCalloutLayer({
      id: 'callout-1',
      text: 'data-product-id',
      target: { x: 40, y: 60 },
      label: { x: 180, y: 120 },
      stroke: STROKE,
    })
    expect(layer).toMatchObject({
      kind: 'callout',
      payload: {
        background: null,
        targetMarker: 'circle',
        labelMarker: 'circle',
      },
    })
    if (!layer) throw new Error('expected callout layer')
    expect(calloutGeometryBounds(layer.payload).width).toBeGreaterThan(40)
    expect(calloutTextRect(layer.payload).x).toBeGreaterThan(layer.payload.label.x)
    expect(calloutSelectionHandles(layer).map((handle) => handle.kind)).toEqual(['target', 'label', 'elbow', 'width'])
    const moved = updateCalloutHandle(layer, 'label', { x: 220, y: 140 })
    expect(moved.payload.label).toEqual({ x: 220, y: 140 })
    expect(rebaseCalloutLayer(layer, moved.payload).localBounds.width).toBeGreaterThan(0)
  })
})

describe('callout measured outside label contract', () => {
  const metrics = { measureText: (content: import('./document/types').RichTextContent) => ({ width: content.fixedWidth ?? 210, height: 75 }) }
  function fixture(left = true) {
    return createCalloutLayer({ id: 'outside', text: 'Текст label',
      target: { x: 400, y: 100 }, label: { x: left ? 300 : 500, y: 180 },
      background: { color: STROKE.color, padding: 12, radius: 4 }, stroke: STROKE })!
  }
  it.each([true, false])('anchors the padded block outside the label (left=%s)', (left) => {
    const payload = fixture(left).payload
    const rect = calloutTextRect(payload, metrics)
    expect(rect.width).toBe(234)
    expect(rect.height).toBe(99)
    expect(rect.y + rect.height / 2).toBe(payload.label.y)
    expect(left ? payload.label.x - rect.x - rect.width : rect.x - payload.label.x).toBe(11)
  })
  it('uses the right side for equal X coordinates', () => {
    const payload = fixture().payload
    const rect = calloutTextRect({ ...payload, label: { ...payload.label, x: payload.target.x } }, metrics)
    expect(rect.x).toBe(payload.target.x + 11)
  })
  it('rebases measured bounds without moving rotated endpoint world coordinates', () => {
    const layer = { ...fixture(), transform: { ...fixture().transform, rotation: 30 } }
    const world = (value: typeof layer) => ['target', 'label'].map((key) => {
      const p = value.payload[key as 'target' | 'label']
      return [value.transform.translateX + p.x * Math.cos(Math.PI / 6) - p.y * Math.sin(Math.PI / 6),
        value.transform.translateY + p.x * Math.sin(Math.PI / 6) + p.y * Math.cos(Math.PI / 6)]
    })
    const after = rebaseCalloutLayer(layer, layer.payload, metrics)
    world(after).forEach((p, i) => p.forEach((n, j) => expect(n).toBeCloseTo(world(layer)[i]![j]!)))
    const rect = calloutTextRect(after.payload, metrics)
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.width).toBeLessThanOrEqual(after.localBounds.width)
  })
  it('resizes the outer label edge without scaling or moving endpoints', () => {
    const layer = fixture()
    const handle = calloutSelectionHandles(layer, metrics).find((entry) => entry.kind === 'width')!
    expect(handle).toBeDefined()
    const after = updateCalloutHandle(layer, 'width', { x: handle.point.x - 600, y: handle.point.y }, metrics)
    expect(after.payload.content).toMatchObject({ wrap: 'fixedWidth', fixedWidth: 810 })
    for (const key of ['target', 'label'] as const) {
      expect(after.transform.translateX + after.payload[key].x)
        .toBeCloseTo(layer.transform.translateX + layer.payload[key].x)
      expect(after.transform.translateY + after.payload[key].y)
        .toBeCloseTo(layer.transform.translateY + layer.payload[key].y)
    }
    expect(after.transform.scaleX).toBe(1)
    expect(after.payload.content.spans).toEqual(layer.payload.content.spans)
  })
})

it('uses measured label bounds for scene and spatial hits despite stale persisted bounds', () => {
  const layer = createCalloutLayer({ id: 'measured', text: 'Wide', target: { x: 900, y: 200 }, label: { x: 700, y: 400 } })!
  const context = { measureText: () => ({ width: 600, height: 80 }) }
  const document = { ...documentFixture, layers: [layer] }
  const rect = calloutTextRect(layer.payload, context)
  const point = { x: layer.transform.translateX + rect.x + 2, y: layer.transform.translateY + rect.y + 2 }
  expect(hitTestDocument(document, point, context)?.nodeId).toBe(layer.id)
  expect(new DocumentSpatialIndex(document, context).hitAll(point)[0]?.nodeId).toBe(layer.id)
  const text = createDocumentRenderScene(document, context).nodes.find((node) => node.id === 'measured:text')!
  expect(text).toMatchObject({ x: layer.transform.translateX + rect.x, width: 600, height: 80 })
})
