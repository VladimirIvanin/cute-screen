import type {
  CensorEffect,
  CensorLayer,
  CensorRegion,
  Point,
  Rect,
} from '../../document/types'
import { assertValidFreeformPolygon, pointsBounds } from './polygon'
import {
  assertRect,
  assertUnitColor,
  freezeColor,
  freezeRect,
  commonLayer,
} from './shared'

function freezeCensorEffect(effect: CensorEffect): CensorEffect {
  switch (effect.mode) {
    case 'pixelate':
      if (
        !Number.isInteger(effect.blockSize) ||
        effect.blockSize < 2 ||
        effect.blockSize > 128
      ) {
        throw new RangeError(
          'pixelate blockSize must be an integer from 2 to 128',
        )
      }
      return Object.freeze({ mode: 'pixelate', blockSize: effect.blockSize })
    case 'blur':
      if (
        !Number.isFinite(effect.strength) ||
        effect.strength < 0.5 ||
        effect.strength > 128
      ) {
        throw new RangeError('blur strength must be between 0.5 and 128')
      }
      return Object.freeze({ mode: 'blur', strength: effect.strength })
    case 'solid':
      assertUnitColor(effect.color, 'solid color')
      return Object.freeze({ mode: 'solid', color: freezeColor(effect.color) })
  }
}

export function createCensorLayer(input: {
  readonly id: string
  readonly region:
    | Readonly<{ readonly kind: 'rectangle'; readonly bounds: Rect }>
    | Readonly<{ readonly kind: 'freeform'; readonly points: readonly Point[] }>
  readonly effect?: CensorEffect
}): CensorLayer {
  const effect = freezeCensorEffect(
    input.effect ?? { mode: 'pixelate', blockSize: 12 },
  )
  let canvasBounds: Rect
  let region: CensorRegion
  if (input.region.kind === 'rectangle') {
    assertRect(input.region.bounds, 'censor bounds')
    canvasBounds = freezeRect(input.region.bounds)
    region = Object.freeze({ kind: 'rectangle' })
  } else {
    assertValidFreeformPolygon(input.region.points, 'censor freeform points')
    canvasBounds = pointsBounds(input.region.points)
    assertRect(canvasBounds, 'censor freeform bounds')
    region = Object.freeze({
      kind: 'freeform',
      points: Object.freeze(
        input.region.points.map((point) =>
          Object.freeze({
            x: point.x - canvasBounds.x,
            y: point.y - canvasBounds.y,
          }),
        ),
      ),
    })
  }
  return Object.freeze({
    ...commonLayer(input.id, canvasBounds.x, canvasBounds.y, {
      x: 0,
      y: 0,
      width: canvasBounds.width,
      height: canvasBounds.height,
    }),
    kind: 'censor',
    payload: Object.freeze({
      region,
      effect,
      sampleSource: 'compositeBelow',
    }),
  })
}
