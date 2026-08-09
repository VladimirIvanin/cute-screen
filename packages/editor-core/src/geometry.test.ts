import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { invertMatrix, transformPoint, transformToMatrix } from './index'

describe('geometry', () => {
  it('round-trips finite points through an invertible transform', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1_000, max: 1_000, noNaN: true }),
        fc.double({ min: -1_000, max: 1_000, noNaN: true }),
        fc.double({ min: -3, max: 3, noNaN: true }),
        fc.double({ min: 0.1, max: 5, noNaN: true }),
        fc.double({ min: 0.1, max: 5, noNaN: true }),
        (x, y, rotation, scaleX, scaleY) => {
          const matrix = transformToMatrix({
            translateX: 10,
            translateY: -20,
            rotation,
            scaleX,
            scaleY,
          })
          const restored = transformPoint(
            invertMatrix(matrix),
            transformPoint(matrix, { x, y }),
          )
          expect(restored.x).toBeCloseTo(x, 8)
          expect(restored.y).toBeCloseTo(y, 8)
        },
      ),
    )
  })
})
