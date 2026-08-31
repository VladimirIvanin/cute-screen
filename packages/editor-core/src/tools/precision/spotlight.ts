import type {
  SpotlightFeatherPreset,
  SpotlightLayer,
  SpotlightShape,
  SrgbColor,
  Rect,
} from '../../document/types'
import {
  BLACK,
  assertRect,
  assertUnitColor,
  commonLayer,
  freezeColor,
} from './shared'

export function createSpotlightLayer(input: {
  readonly id: string
  readonly bounds: Rect
  readonly shape?: SpotlightShape
  readonly dimColor?: SrgbColor
  readonly dimOpacity?: number
  readonly feather?: SpotlightFeatherPreset | null
}): SpotlightLayer {
  assertRect(input.bounds, 'spotlight bounds')
  const shape = input.shape ?? 'rectangle'
  if (!['rectangle', 'ellipse', 'diamond'].includes(shape)) {
    throw new RangeError('spotlight shape is invalid')
  }
  const dimColor = input.dimColor ?? BLACK
  assertUnitColor(dimColor, 'spotlight dimColor')
  const dimOpacity = input.dimOpacity ?? 0.65
  if (!Number.isFinite(dimOpacity) || dimOpacity < 0 || dimOpacity > 1) {
    throw new RangeError('spotlight dimOpacity must be between 0 and 1')
  }
  const feather = input.feather ?? null
  if (feather !== null && feather !== 'soft' && feather !== 'strong') {
    throw new RangeError('spotlight feather preset is invalid')
  }
  return Object.freeze({
    ...commonLayer(input.id, input.bounds.x, input.bounds.y, {
      x: 0,
      y: 0,
      width: input.bounds.width,
      height: input.bounds.height,
    }),
    kind: 'spotlight',
    payload: Object.freeze({
      shape,
      dimColor: freezeColor(dimColor),
      dimOpacity,
      feather,
    }),
  })
}
