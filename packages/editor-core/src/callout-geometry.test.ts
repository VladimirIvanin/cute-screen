import { describe, expect, it } from 'vitest'

import {
  calloutGeometryBounds,
  calloutPathPoints,
  calloutSelectionHandles,
  calloutTextRect,
  createCalloutLayer,
  defaultCalloutRoute,
  rebaseCalloutLayer,
  updateCalloutHandle,
} from './index'

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
    expect(calloutTextRect(layer.payload).x).toBeGreaterThan(
      layer.payload.label.x,
    )
    expect(calloutSelectionHandles(layer).map((handle) => handle.kind)).toEqual(
      ['target', 'label', 'elbow'],
    )
    const moved = updateCalloutHandle(layer, 'label', { x: 220, y: 140 })
    expect(moved.payload.label).toEqual({ x: 220, y: 140 })
    expect(
      rebaseCalloutLayer(layer, moved.payload).localBounds.width,
    ).toBeGreaterThan(0)
  })
})
