import type {
  LoupeLayer,
  Point,
  Rect,
  ShadowStyle,
  SrgbColor,
} from '../../document/types'
import {
  GEOMETRY_EPSILON,
  WHITE,
  assertFinite,
  assertPoint,
  assertRect,
  assertUnitColor,
  assertValidLoupeSourceRegion,
  commonLayer,
  freezeColor,
  freezeRect,
} from './shared'

function freezeShadow(shadow: ShadowStyle): ShadowStyle {
  assertUnitColor(shadow.color, 'loupe shadow color')
  for (const [field, value] of [
    ['offsetX', shadow.offsetX],
    ['offsetY', shadow.offsetY],
    ['blur', shadow.blur],
  ] as const) {
    assertFinite(value, `loupe shadow ${field}`)
  }
  if (
    Math.abs(shadow.offsetX) > 512 ||
    Math.abs(shadow.offsetY) > 512 ||
    shadow.blur < 0 ||
    shadow.blur > 128
  ) {
    throw new RangeError('loupe shadow is outside supported bounds')
  }
  return Object.freeze({
    color: freezeColor(shadow.color),
    offsetX: shadow.offsetX,
    offsetY: shadow.offsetY,
    blur: shadow.blur,
  })
}

export function createLoupeLayer(input: {
  readonly id: string
  readonly sourceRegion: Rect
  readonly canvas: Readonly<{ readonly width: number; readonly height: number }>
  /** Destination lens top-left in canvas coordinates. */
  readonly destination: Point
  readonly zoom?: number
  readonly size?: number
  readonly shape?: 'circle' | 'rectangle'
  readonly borderColor?: SrgbColor
  readonly borderWidth?: number
  readonly shadow?: ShadowStyle | null
}): LoupeLayer {
  assertRect(input.sourceRegion, 'loupe sourceRegion')
  assertValidLoupeSourceRegion(input.sourceRegion, input.canvas)
  assertPoint(input.destination, 'loupe destination')
  if (
    Math.abs(input.sourceRegion.width - input.sourceRegion.height) >
    GEOMETRY_EPSILON
  ) {
    throw new RangeError('loupe sourceRegion must be square')
  }
  const zoom = input.zoom ?? 2
  if (!Number.isFinite(zoom) || zoom < 1 || zoom > 16) {
    throw new RangeError('loupe zoom must be between 1 and 16')
  }
  const size = input.size ?? input.sourceRegion.width * zoom
  if (!Number.isFinite(size) || size < 16 || size > 2_048) {
    throw new RangeError('loupe size must be between 16 and 2048')
  }
  if (Math.abs(input.sourceRegion.width * zoom - size) > GEOMETRY_EPSILON) {
    throw new RangeError('loupe sourceRegion size must equal lens size / zoom')
  }
  const shape = input.shape ?? 'circle'
  if (shape !== 'circle' && shape !== 'rectangle') {
    throw new RangeError('loupe shape is invalid')
  }
  const borderColor = input.borderColor ?? WHITE
  assertUnitColor(borderColor, 'loupe borderColor')
  const borderWidth = input.borderWidth ?? 3
  if (!Number.isFinite(borderWidth) || borderWidth < 0 || borderWidth > 64) {
    throw new RangeError('loupe borderWidth must be between 0 and 64')
  }
  const shadow =
    input.shadow === null
      ? null
      : freezeShadow(
          input.shadow ?? {
            color: { red: 0, green: 0, blue: 0, alpha: 0.35 },
            offsetX: 0,
            offsetY: 6,
            blur: 14,
          },
        )
  return Object.freeze({
    ...commonLayer(input.id, input.destination.x, input.destination.y, {
      x: 0,
      y: 0,
      width: size,
      height: size,
    }),
    kind: 'loupe',
    payload: Object.freeze({
      sourceRegion: freezeRect(input.sourceRegion),
      lens: Object.freeze({ shape, size }),
      zoom,
      border: Object.freeze({
        color: freezeColor(borderColor),
        width: borderWidth,
      }),
      shadow,
      sampleSource: 'compositeBelow',
    }),
  })
}
