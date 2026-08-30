import {
  DEFAULT_RULER_COLOR,
  DEFAULT_RULER_FONT_SIZE,
  DEFAULT_RULER_THICKNESS,
  RULER_FONT_SIZE_BOUNDS,
  RULER_THICKNESS_BOUNDS,
  type JsonObject,
  type Point,
  type Rect,
  type SrgbColor,
} from '../../document/types'

export const IDENTITY = Object.freeze({
  translateX: 0,
  translateY: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
})
export const BLACK = Object.freeze({ red: 0, green: 0, blue: 0, alpha: 1 })
export const WHITE = Object.freeze({ red: 1, green: 1, blue: 1, alpha: 1 })
export const RULER_HIT_PADDING = 6
export const GEOMETRY_EPSILON = 1e-9
const MAX_LOUPE_SOURCE_COORDINATE = 1_000_000
export const RULER_BADGE_TEXT_WIDTH_FACTOR = 0.85

export function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${field} must be finite`)
}

export function assertPoint(point: Point, field: string): void {
  assertFinite(point.x, `${field}.x`)
  assertFinite(point.y, `${field}.y`)
}

export function assertRect(rect: Rect, field: string): void {
  assertPoint(rect, field)
  assertFinite(rect.width, `${field}.width`)
  assertFinite(rect.height, `${field}.height`)
  if (rect.width <= 0 || rect.height <= 0) {
    throw new RangeError(`${field} must have positive dimensions`)
  }
}

export function assertCanvasSize(
  canvas: Readonly<{ readonly width: number; readonly height: number }>,
  field: string,
): void {
  assertFinite(canvas.width, `${field}.width`)
  assertFinite(canvas.height, `${field}.height`)
  if (canvas.width <= 0 || canvas.height <= 0) {
    throw new RangeError(`${field} must have positive dimensions`)
  }
}

export function assertValidLoupeSourceRegion(
  region: Rect,
  canvas: Readonly<{ readonly width: number; readonly height: number }>,
): void {
  assertRect(region, 'loupe sourceRegion')
  assertCanvasSize(canvas, 'loupe canvas')
  if (
    Math.abs(region.x) > MAX_LOUPE_SOURCE_COORDINATE ||
    Math.abs(region.y) > MAX_LOUPE_SOURCE_COORDINATE ||
    Math.abs(region.x + region.width) > MAX_LOUPE_SOURCE_COORDINATE ||
    Math.abs(region.y + region.height) > MAX_LOUPE_SOURCE_COORDINATE
  ) {
    throw new RangeError(
      'loupe sourceRegion coordinates exceed supported bounds',
    )
  }
  const intersectionWidth =
    Math.min(region.x + region.width, canvas.width) - Math.max(region.x, 0)
  const intersectionHeight =
    Math.min(region.y + region.height, canvas.height) - Math.max(region.y, 0)
  if (intersectionWidth <= 0 || intersectionHeight <= 0) {
    throw new RangeError('loupe sourceRegion must intersect the canvas')
  }
}

export function assertUnitColor(color: SrgbColor, field: string): void {
  for (const channel of ['red', 'green', 'blue', 'alpha'] as const) {
    const value = color[channel]
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${field}.${channel} must be between 0 and 1`)
    }
  }
}

export function freezePoint(point: Point): Point & JsonObject {
  return Object.freeze({ x: point.x, y: point.y }) as Point & JsonObject
}

export function freezeRect(rect: Rect): Rect & JsonObject {
  return Object.freeze({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }) as Rect & JsonObject
}

export function freezeColor(color: SrgbColor): SrgbColor {
  return Object.freeze({
    red: color.red,
    green: color.green,
    blue: color.blue,
    alpha: color.alpha,
  })
}

export function commonLayer(id: string, x: number, y: number, bounds: Rect) {
  return {
    id,
    transform: Object.freeze({ ...IDENTITY, translateX: x, translateY: y }),
    localBounds: freezeRect(bounds),
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: 'normal' as const,
    shadows: Object.freeze([]),
  }
}

export {
  DEFAULT_RULER_COLOR,
  DEFAULT_RULER_FONT_SIZE,
  DEFAULT_RULER_THICKNESS,
  RULER_FONT_SIZE_BOUNDS,
  RULER_THICKNESS_BOUNDS,
}
