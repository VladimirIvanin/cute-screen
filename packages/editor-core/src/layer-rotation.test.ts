import {
  describe,
  expect,
  it,
} from 'vitest'
import { rotateLayerTransform } from './layer-rotation'
import {
  transformPoint,
  transformToMatrix,
} from './geometry'

describe('rotation around the layer center', () => {
  it.each([
    { rotation: 0, scaleX: 1, scaleY: 1 },
    { rotation: 37, scaleX: 2.5, scaleY: .4 },
    { rotation: -73, scaleX: -1, scaleY: 1 },
    { rotation: 127, scaleX: 1, scaleY: -1 },
  ])('keeps an offset bounds center fixed for $rotation / $scaleX / $scaleY', (initial) => {
    const layer = {
      localBounds: { x: -85, y: 43, width: 240, height: 96 },
      transform: { translateX: 327, translateY: -109, ...initial },
    }
    const center = { x: 35, y: 91 }
    const before = transformPoint(transformToMatrix(layer.transform), center)
    for (const rotation of [90, 180, -179, 360, 721]) {
      const next = rotateLayerTransform(layer, rotation)
      const after = transformPoint(transformToMatrix(next), center)
      expect(after.x).toBeCloseTo(before.x, 10)
      expect(after.y).toBeCloseTo(before.y, 10)
      expect(next).toMatchObject({ rotation, scaleX: initial.scaleX, scaleY: initial.scaleY })
      const corner = transformPoint(transformToMatrix(next), { x: -85, y: 43 })
      expect(Math.hypot(corner.x - after.x, corner.y - after.y))
        .toBeCloseTo(Math.hypot(120 * initial.scaleX, 48 * initial.scaleY), 10)
      const restored = rotateLayerTransform({ ...layer, transform: next }, initial.rotation)
      expect(restored.translateX).toBeCloseTo(layer.transform.translateX, 10)
      expect(restored.translateY).toBeCloseTo(layer.transform.translateY, 10)
    }
  })

  it('does not introduce translation drift for an unchanged angle', () => {
    const layer = {
      localBounds: { x: 100, y: 200, width: 450, height: 300 },
      transform: { translateX: .1, translateY: .3, rotation: 37, scaleX: 1, scaleY: 1 },
    }
    expect(rotateLayerTransform(layer, 37)).toEqual(layer.transform)
  })
})
