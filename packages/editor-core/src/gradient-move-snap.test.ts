import {
  describe,
  expect,
  it,
} from 'vitest'
import { createDrawingLayer } from './drawing'
import { snapGradientMove } from './gradient'
import type { ShapeLayer } from './document/types'

const frame = { x: 0, y: 0, width: 600, height: 400 }
const layer = createDrawingLayer({
  id: 'gradient',
  tool: 'gradient',
  start: { x: 20, y: 30 },
  end: { x: 220, y: 130 },
}) as ShapeLayer

describe('gradient movement edge magnet', () => {
  it('captures the rectangle edges and retains each axis until the pointer pulls away', () => {
    const caught = snapGradientMove(layer, { x: -15, y: -26 }, frame)
    expect(caught).toEqual({ delta: { x: -20, y: -30 }, state: { x: -20, y: -30 } })
    const held = snapGradientMove(layer, { x: -8, y: -18 }, frame, { previous: caught.state })
    expect(held).toEqual(caught)
    const releasedX = snapGradientMove(layer, { x: -5, y: -17 }, frame, { previous: held.state })
    expect(releasedX).toEqual({ delta: { x: -5, y: -30 }, state: { y: -30 } })
    expect(snapGradientMove(layer, { x: 12, y: 50 }, frame, { previous: releasedX.state }))
      .toEqual({ delta: { x: 12, y: 50 }, state: {} })
    expect(layer.transform).toMatchObject({ translateX: 20, translateY: 30 })
  })

  it('snaps right/bottom and respects crop offsets, bounds origins and reflected scales', () => {
    expect(snapGradientMove(layer, { x: 376, y: 274 }, frame).delta).toEqual({ x: 380, y: 270 })
    const reflected = { ...layer, localBounds: { x: 10, y: 5, width: 200, height: 100 },
      transform: { ...layer.transform, scaleX: -2, scaleY: -1 } }
    const crop = { x: 7, y: 11, width: 500, height: 300 }
    expect(snapGradientMove(reflected, { x: 410, y: 82 }, crop).delta).toEqual({ x: 407, y: 86 })
    expect(snapGradientMove(layer, { x: -9, y: -15 }, crop).delta).toEqual({ x: -13, y: -19 })
  })

  it.each([.5, 1, 2])('keeps capture and release distances in CSS pixels at zoom %s', (zoom) => {
    const caught = snapGradientMove(layer, { x: -20 + 5 / zoom, y: 50 }, frame, { zoom })
    expect(caught.delta.x).toBe(-20)
    expect(snapGradientMove(layer, { x: -20 + 13 / zoom, y: 50 }, frame,
      { zoom, previous: caught.state }).delta.x).toBe(-20)
    const released = snapGradientMove(layer, { x: -20 + 15 / zoom, y: 50 }, frame,
      { zoom, previous: caught.state })
    expect(released.delta.x).toBe(-20 + 15 / zoom)
    expect(released.state).toEqual({})
    expect(snapGradientMove(layer, { x: -20 + 7 / zoom, y: 50 }, frame, { zoom }).state).toEqual({})
  })

  it('clears magnetic state when bypassed and ignores locked, hidden, rotated and ordinary shapes', () => {
    const delta = { x: -15, y: -25 }
    const previous = { x: -20, y: -30 }
    expect(snapGradientMove(layer, delta, frame, { enabled: false, previous }))
      .toEqual({ delta, state: {} })
    for (const blocked of [
      { ...layer, locked: true },
      { ...layer, visible: false },
      { ...layer, transform: { ...layer.transform, rotation: 45 } },
      { ...layer, payload: { ...layer.payload, annotationTool: 'shape' } },
    ]) {
      expect(snapGradientMove(blocked, delta, frame, { previous })).toEqual({ delta, state: {} })
    }
    expect(snapGradientMove(layer, delta, frame, { zoom: 0, previous })).toEqual({ delta, state: {} })
  })
})
