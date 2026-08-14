import { describe, expect, it } from 'vitest'

import {
  arrowCapSize,
  arrowEndpointAngles,
  arrowPathPoints,
  arrowSelectionHandles,
  rebaseArrowLayer,
  updateArrowHandle,
} from './arrow-geometry'
import type { ArrowLayer, ArrowLayerPayload } from './document/types'
import { transformPoint, transformToMatrix } from './geometry'

const stroke = {
  color: { red: 1, green: 0, blue: 0, alpha: 1 },
  width: 3,
  style: 'dashed' as const,
  cap: 'round' as const,
  join: 'round' as const,
}

function elbowPayload(axis: 'x' | 'y' = 'x', offset = -20): ArrowLayerPayload {
  return {
    path: 'elbow',
    start: { x: 0, y: 10 },
    end: { x: 100, y: 90 },
    elbow: { axis, offset },
    stroke,
    startCap: 'lineArrow',
    endCap: 'solidArrow',
  }
}

describe('arrow geometry', () => {
  it('generates one three-segment orthogonal elbow contour', () => {
    const points = arrowPathPoints(elbowPayload('x', -20))
    expect(points).toEqual([
      { x: 0, y: 10 },
      { x: 0, y: 30 },
      { x: 100, y: 30 },
      { x: 100, y: 90 },
    ])
    expect(
      points.slice(1).every((point, index) => {
        const previous = points[index]!
        return point.x === previous.x || point.y === previous.y
      }),
    ).toBe(true)
  })

  it('orients endpoints from the first and last non-zero segments', () => {
    const points = arrowPathPoints(elbowPayload('x', -40))
    expect(points[0]).toEqual(points[1])
    const angles = arrowEndpointAngles(points)
    expect(angles.start).toBeCloseTo(Math.PI)
    expect(angles.end).toBeCloseTo(Math.PI / 2)
  })

  it('rebases edited geometry without moving world endpoints', () => {
    const layer: ArrowLayer = {
      id: '019c1f62-058e-7000-8000-000000000081',
      kind: 'arrow',
      localBounds: { x: 0, y: 0, width: 60, height: 50 },
      transform: {
        translateX: 50,
        translateY: 60,
        rotation: 30,
        scaleX: 2,
        scaleY: 0.5,
      },
      opacity: 0.7,
      visible: true,
      locked: false,
      blendMode: 'overlay',
      shadows: [],
      payload: {
        path: 'quadratic',
        start: { x: 5, y: 7 },
        end: { x: 40, y: 30 },
        bend: { x: 20, y: 0 },
        stroke,
        startCap: 'none',
        endCap: 'diamond',
      },
    }
    const oldMatrix = transformToMatrix(layer.transform)
    const expectedStart = transformPoint(oldMatrix, layer.payload.start)
    const expectedEnd = transformPoint(oldMatrix, { x: -20, y: 80 })
    const rebased = rebaseArrowLayer(layer, {
      ...layer.payload,
      end: { x: -20, y: 80 },
    })
    const nextMatrix = transformToMatrix(rebased.transform)

    const actualStart = transformPoint(nextMatrix, rebased.payload.start)
    const actualEnd = transformPoint(nextMatrix, rebased.payload.end)
    expect(actualStart.x).toBeCloseTo(expectedStart.x)
    expect(actualStart.y).toBeCloseTo(expectedStart.y)
    expect(actualEnd.x).toBeCloseTo(expectedEnd.x)
    expect(actualEnd.y).toBeCloseTo(expectedEnd.y)
    expect(rebased.localBounds).toMatchObject({ x: 0, y: 0 })
    expect(rebased.payload.bend).toBeDefined()
  })

  it('expands bounds for a 10 px capped stroke without moving transformed world endpoints', () => {
    const layer: ArrowLayer = {
      id: '019c1f62-058e-7000-8000-000000000084',
      kind: 'arrow',
      localBounds: { x: 0, y: 0, width: 60, height: 20 },
      transform: {
        translateX: 50,
        translateY: 60,
        rotation: 30,
        scaleX: 2,
        scaleY: 0.5,
      },
      opacity: 1,
      blendMode: 'normal',
      shadows: [],
      visible: true,
      locked: false,
      payload: {
        path: 'straight',
        start: { x: 0, y: 0 },
        end: { x: 60, y: 20 },
        stroke,
        startCap: 'none',
        endCap: 'none',
      },
    }
    const beforeMatrix = transformToMatrix(layer.transform)
    const expectedStart = transformPoint(beforeMatrix, layer.payload.start)
    const expectedEnd = transformPoint(beforeMatrix, layer.payload.end)
    const payload: ArrowLayerPayload = {
      ...layer.payload,
      stroke: { ...layer.payload.stroke, width: 10 },
      endCap: 'solidArrow',
    }
    const rebased = rebaseArrowLayer(layer, payload)
    const afterMatrix = transformToMatrix(rebased.transform)
    const actualStart = transformPoint(afterMatrix, rebased.payload.start)
    const actualEnd = transformPoint(afterMatrix, rebased.payload.end)

    expect(actualStart.x).toBeCloseTo(expectedStart.x)
    expect(actualStart.y).toBeCloseTo(expectedStart.y)
    expect(actualEnd.x).toBeCloseTo(expectedEnd.x)
    expect(actualEnd.y).toBeCloseTo(expectedEnd.y)
    expect(rebased.localBounds?.width).toBeGreaterThan(layer.localBounds!.width)
    expect(rebased.localBounds?.height).toBeGreaterThan(
      layer.localBounds!.height,
    )
    expect(
      rebased.payload.end.x + arrowCapSize('solidArrow', 10),
    ).toBeLessThanOrEqual(rebased.localBounds!.width)
  })

  it('exposes the editable midpoint of an elbow middle segment', () => {
    const layer: ArrowLayer = {
      id: '019c1f62-058e-7000-8000-000000000082',
      kind: 'arrow',
      localBounds: { x: 0, y: 0, width: 100, height: 100 },
      transform: {
        translateX: 0,
        translateY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      opacity: 1,
      blendMode: 'normal',
      shadows: [],
      visible: true,
      locked: false,
      payload: elbowPayload('y', -10),
    }
    expect(arrowSelectionHandles(layer)).toEqual([
      { kind: 'start', point: { x: 0, y: 10 } },
      { kind: 'end', point: { x: 100, y: 90 } },
      { kind: 'elbow', point: { x: 40, y: 50 } },
    ])
  })

  it('exposes and rebases a quadratic bend without moving its endpoints', () => {
    const layer: ArrowLayer = {
      id: '019c1f62-058e-7000-8000-000000000083',
      kind: 'arrow',
      localBounds: { x: 0, y: 0, width: 100, height: 60 },
      transform: {
        translateX: 30,
        translateY: 40,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      opacity: 1,
      blendMode: 'normal',
      shadows: [],
      visible: true,
      locked: false,
      payload: {
        path: 'quadratic',
        start: { x: 10, y: 40 },
        end: { x: 90, y: 40 },
        bend: { x: 50, y: 10 },
        stroke,
        startCap: 'none',
        endCap: 'solidArrow',
      },
    }
    expect(arrowSelectionHandles(layer).map((handle) => handle.kind)).toEqual([
      'start',
      'end',
      'bend',
    ])

    const updated = updateArrowHandle(layer, 'bend', { x: 50, y: -20 })
    expect(updated.transform.translateX + updated.payload.start.x).toBe(40)
    expect(updated.transform.translateY + updated.payload.start.y).toBe(80)
    expect(updated.transform.translateX + updated.payload.end.x).toBe(120)
    expect(updated.transform.translateY + updated.payload.end.y).toBe(80)
    expect(
      updated.transform.translateY + (updated.payload.bend?.y ?? Number.NaN),
    ).toBe(20)
  })
})
