import type {
  SpotlightFeatherPreset,
  SpotlightLayer,
  SpotlightShape,
  SpotlightAperture,
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
  if (
    !Number.isFinite(dimOpacity) ||
    dimOpacity < 0 ||
    dimOpacity > 1
  ) {
    throw new RangeError('spotlight dimOpacity must be between 0 and 1')
  }
  const feather = input.feather ?? null
  if (
    feather !== null &&
    feather !== 'soft' &&
    feather !== 'strong'
  ) {
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
      apertures: Object.freeze([
        {
          id: `${input.id}:aperture`, shape, bounds: {
            x: 0, y: 0, width: input.bounds.width, height: input.bounds.height,
          },
        },
      ]),
      dimColor: freezeColor(dimColor),
      dimOpacity,
      feather,
    }),
  })
}
/** Aperture bounds are local to the layer; transform belongs to the entire spotlight. */
export function spotlightWithApertures(
  layer: SpotlightLayer,
  apertures: readonly SpotlightAperture[],
): SpotlightLayer {
  if (!apertures.length || apertures.length > 64)
    throw new RangeError('spotlight requires 1…64 apertures')
  if (new Set(apertures.map((item) => item.id)).size !== apertures.length)
    throw new Error('spotlight aperture IDs must be unique')
  for (const aperture of apertures) {
    assertRect(aperture.bounds, 'spotlight aperture bounds')
    if (!aperture.id || !['rectangle', 'ellipse', 'diamond'].includes(aperture.shape))
      throw new Error('invalid spotlight aperture')
  }
  const x = Math.min(...apertures.map((item) => item.bounds.x))
  const y = Math.min(...apertures.map((item) => item.bounds.y))
  const right = Math.max(...apertures.map((item) => item.bounds.x + item.bounds.width))
  const bottom = Math.max(...apertures.map((item) => item.bounds.y + item.bounds.height))
  return Object.freeze({
    ...layer, localBounds: {
      x, y, width: right - x, height: bottom - y,
    }, payload: {
      ...layer.payload, apertures: Object.freeze(apertures.map((item) => Object.freeze({
        ...item, bounds: Object.freeze({
          ...item.bounds,
        }),
      }))),
    },
  })
}
export function addSpotlightAperture(
  layer: SpotlightLayer,
  aperture: SpotlightAperture,
): SpotlightLayer {
  return spotlightWithApertures(layer, [...layer.payload.apertures, aperture])
}
export function updateSpotlightAperture(
  layer: SpotlightLayer,
  id: string,
  patch: Partial<Pick<SpotlightAperture, 'shape' | 'bounds'>>,
): SpotlightLayer {
  if (!layer.payload.apertures.some((item) => item.id === id))
    throw new Error('spotlight aperture is missing')
  return spotlightWithApertures(layer, layer.payload.apertures.map((item) => item.id === id ? {
    ...item, ...patch,
  } : item))
}
export function removeSpotlightAperture(
  layer: SpotlightLayer,
  id: string,
): SpotlightLayer | undefined {
  const remaining = layer.payload.apertures.filter((item) => item.id !== id)
  return remaining.length ? spotlightWithApertures(layer, remaining) : undefined
}
export function spotlightApertureAt(
  layer: SpotlightLayer,
  point: {
    readonly x: number
    readonly y: number
  },
): SpotlightAperture | undefined {
  return [...layer.payload.apertures].reverse().find(({ shape, bounds }) => {
    const x = (point.x - bounds.x - bounds.width / 2) / (bounds.width / 2)
    const y = (point.y - bounds.y - bounds.height / 2) / (bounds.height / 2)
    return shape === 'rectangle' ? Math.abs(x) <= 1 && Math.abs(y) <= 1 : shape === 'ellipse' ? x * x + y * y <= 1 : Math.abs(x) + Math.abs(y) <= 1
  })
}
