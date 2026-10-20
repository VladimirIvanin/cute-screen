import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  snapFrameMove,
  snapFrameResizePoint,
} from './frame-snap'

const frame = { x: 10, y: 20, width: 600, height: 400 }
const bounds = { x: 30, y: 50, width: 200, height: 100 }

describe('selection frame magnets', () => {
  it.each([.5, 1, 2])('captures and holds each moving edge in CSS pixels at zoom %s', (zoom) => {
    const caught = snapFrameMove(bounds, { x: -20 + 5 / zoom, y: -30 + 5 / zoom }, frame, { zoom })
    expect(caught).toEqual({ delta: { x: -20, y: -30 }, state: { x: -20, y: -30 } })
    expect(snapFrameMove(bounds, { x: -20 + 13 / zoom, y: 100 }, frame,
      { zoom, previous: caught.state })).toEqual({ delta: { x: -20, y: 100 }, state: { x: -20 } })
    expect(snapFrameMove(bounds, { x: -20 + 15 / zoom, y: 100 }, frame,
      { zoom, previous: caught.state }).state).toEqual({})
    expect(snapFrameMove(bounds, { x: 380, y: 270 }, frame).delta).toEqual({ x: 380, y: 270 })
  })

  it('clears held state when disabled and does not mutate the rectangle', () => {
    const delta = { x: -15, y: -25 }
    expect(snapFrameMove(bounds, delta, frame, { enabled: false, previous: { x: -20 } }))
      .toEqual({ delta, state: {} })
    expect(bounds).toEqual({ x: 30, y: 50, width: 200, height: 100 })
  })

  it.each([.5, 1, 2])('snaps only active resize axes with a 6 CSS px threshold at zoom %s', (zoom) => {
    expect(snapFrameResizePoint(bounds, 'nw', { x: 10 + 5 / zoom, y: 20 + 5 / zoom }, frame, { zoom }))
      .toEqual({ x: 10, y: 20 })
    expect(snapFrameResizePoint(bounds, 'e', { x: 610 - 5 / zoom, y: 22 }, frame, { zoom }))
      .toEqual({ x: 610, y: 22 })
    expect(snapFrameResizePoint(bounds, 'se', { x: 610 - 7 / zoom, y: 420 - 7 / zoom }, frame, { zoom }))
      .toEqual({ x: 610 - 7 / zoom, y: 420 - 7 / zoom })
  })

  it('snaps the resulting aspect-constrained corner, preserving the opposite corner', () => {
    expect(snapFrameResizePoint(bounds, 'se', { x: 606, y: 390 }, frame, { preserveAspect: true }))
      .toEqual({ x: 606, y: 390 })
    expect(snapFrameResizePoint(bounds, 'se', { x: 762, y: 200 }, frame, { preserveAspect: true }))
      .toEqual({ x: 770, y: 420 })
  })

  it('preserves centre resizing and ignores a snap across the fixed anchor', () => {
    expect(snapFrameResizePoint(bounds, 'nw', { x: 14, y: 24 }, frame, { fromCenter: true }))
      .toEqual({ x: 10, y: 20 })
    expect(snapFrameResizePoint(bounds, 'se', { x: 11, y: 21 }, frame))
      .toEqual({ x: 11, y: 21 })
  })
})
