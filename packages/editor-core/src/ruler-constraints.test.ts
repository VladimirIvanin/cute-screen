import fc from 'fast-check'
import {
  describe,
  expect,
  it,
} from 'vitest'
import { createRulerLayer } from './tools/precision/ruler'
import { resizeLayerGeometry } from './layer-resize'
import {
  transformPoint,
  transformToMatrix,
} from './geometry'
import {
  constrainRulerEndpoint,
  constrainRulerMove,
  constrainRulerTransform,
  fitRulerToBounds,
} from './ruler-constraints'
import type { RulerLayer } from './document/types'

const canvas = { width: 400, height: 300 }
const bounds = { x: 0, y: 0, ...canvas }
const ruler = () => createRulerLayer({ id: 'ruler', start: { x: 20, y: 30 }, end: { x: 120, y: 80 }, canvas })
const endpoints = (layer: RulerLayer) => [layer.payload.start, layer.payload.end].map((point) =>
  transformPoint(transformToMatrix(layer.transform), point))

describe('ruler canvas constraints', () => {
  it.each([
    [{ x: -100, y: -100 }, { x: 0, y: 0 }],
    [{ x: 700, y: 900 }, { x: 400, y: 300 }],
    [{ x: 100, y: 200 }, { x: 100, y: 200 }],
  ])('clamps a free endpoint %j to %j', (candidate, expected) => {
    expect(constrainRulerEndpoint({ x: 20, y: 30 }, candidate, bounds)).toEqual(expected)
  })

  it('clips a snapped ray at the crop edge while retaining its angle', () => {
    const result = constrainRulerEndpoint(
      { x: 100, y: 100 },
      { x: 600, y: 500 },
      { x: 50, y: 40, width: 200, height: 160 },
      45,
    )
    expect(result.x).toBeCloseTo(200)
    expect(result.y).toBeCloseTo(200)
  })

  it.each(['start', 'end'] as const)('limits %s resize in reflected world space', (handle) => {
    const before = ruler()
    const rotated = { ...before, transform: { ...before.transform, rotation: 20, scaleX: -1, translateX: 180 } }
    const after = resizeLayerGeometry(rotated, handle, { x: 900, y: -200 }, { canvas }) as RulerLayer
    const [start, end] = endpoints(after)
    const index = handle === 'start' ? 0 : 1
    expect([start, end][index]!.x).toBeCloseTo(400)
    expect([start, end][index]!.y).toBeCloseTo(0)
    expect([start, end][1 - index]!.x).toBeCloseTo(endpoints(rotated)[1 - index]!.x)
    expect([start, end][1 - index]!.y).toBeCloseTo(endpoints(rotated)[1 - index]!.y)
    expect(after.payload.thickness).toBe(before.payload.thickness)
  })

  it('limits a shared move against every ruler in a selection without shortening them', () => {
    const first = ruler()
    const second = { ...first, transform: { ...first.transform, translateX: first.transform.translateX + 150 } }
    const delta = constrainRulerMove([first, second], { x: 1000, y: -1000 }, bounds)
    expect(delta.x).toBe(130)
    expect(delta.y).toBeGreaterThanOrEqual(-30)
    expect(delta.y).toBeLessThan(0)
    expect(constrainRulerMove([first], { x: 8, y: 9 }, bounds)).toEqual({ x: 8, y: 9 })
  })

  it('keeps a horizontal measurement badge inside after a move to the top edge', () => {
    const before = createRulerLayer({ id: 'badge', start: { x: 20, y: 40 }, end: { x: 350, y: 40 }, canvas })
    const delta = constrainRulerMove([before], { x: 1000, y: -1000 }, bounds)
    expect(delta.x).toBe(50)
    expect(delta.y).toBe(-29)
  })

  it('uses crop coordinates for endpoint resize', () => {
    const before = ruler()
    const after = resizeLayerGeometry(before, 'end', { x: 900, y: -200 }, { canvas, rulerBounds: { x: 10, y: 20, width: 150, height: 100 } }) as RulerLayer
    expect(endpoints(after)[1]!.x).toBeCloseTo(160)
    expect(endpoints(after)[1]!.y).toBeCloseTo(20)
  })

  it('keeps a collapsed endpoint unchanged', () => {
    const before = ruler()
    expect(resizeLayerGeometry(before, 'end', endpoints(before)[0]!, { canvas })).toBe(before)
  })

  it('fits rotated and reflected rulers into non-origin crops while preserving direction', () => {
    fc.assert(fc.property(
      fc.integer({ min: -180, max: 180 }),
      fc.boolean(),
      fc.integer({ min: 1, max: 200 }),
      fc.integer({ min: 1, max: 150 }),
      (rotation, reflected, width, height) => {
        const source = ruler()
        const before = { ...source, transform: { ...source.transform, rotation, scaleX: reflected ? -1 : 1 } }
        const crop = { x: 130, y: 100, width, height }
        const after = fitRulerToBounds(before, crop, canvas)
        const [start, end] = endpoints(after)
        for (const point of [start!, end!]) {
          expect(point.x).toBeGreaterThanOrEqual(crop.x - 1e-6)
          expect(point.x).toBeLessThanOrEqual(crop.x + crop.width + 1e-6)
          expect(point.y).toBeGreaterThanOrEqual(crop.y - 1e-6)
          expect(point.y).toBeLessThanOrEqual(crop.y + crop.height + 1e-6)
        }
        const [oldStart, oldEnd] = endpoints(before)
        const cross = (end!.x - start!.x) * (oldEnd!.y - oldStart!.y)
          - (end!.y - start!.y) * (oldEnd!.x - oldStart!.x)
        expect(cross).toBeCloseTo(0, 6)
        expect(after.payload.fontSize).toBe(before.payload.fontSize)
      },
    ), { numRuns: 1000 })
  })

  it('contains rotation by translation and rejects a span larger than the canvas', () => {
    const before = ruler()
    const transform = { ...before.transform, rotation: 90, translateX: -50 }
    const next = { ...before, transform: constrainRulerTransform(before, transform, bounds) }
    for (const point of endpoints(next)) {
      expect(point.x).toBeGreaterThanOrEqual(-1e-8)
      expect(point.x).toBeLessThanOrEqual(400 + 1e-8)
      expect(point.y).toBeGreaterThanOrEqual(-1e-8)
      expect(point.y).toBeLessThanOrEqual(300 + 1e-8)
    }
    const wide = createRulerLayer({ id: 'wide', start: { x: 0, y: 100 }, end: { x: 400, y: 100 }, canvas })
    expect(constrainRulerTransform(wide, { ...wide.transform, rotation: 90 }, bounds)).toBe(wide.transform)
  })
})
