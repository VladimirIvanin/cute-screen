import { invertMatrix, transformPoint, transformToMatrix } from '../../geometry'
import type {
  JsonObject,
  Point,
  Rect,
  RulerLayer,
  RulerLayerPayload,
  RulerUnit,
  SrgbColor,
} from '../../document/types'
import {
  DEFAULT_RULER_COLOR,
  DEFAULT_RULER_FONT_SIZE,
  DEFAULT_RULER_THICKNESS,
  GEOMETRY_EPSILON,
  RULER_BADGE_TEXT_WIDTH_FACTOR,
  RULER_FONT_SIZE_BOUNDS,
  RULER_THICKNESS_BOUNDS,
  assertCanvasSize,
  assertPoint,
  assertUnitColor,
  commonLayer,
  freezeColor,
  freezePoint,
  freezeRect,
} from './shared'

export function createRulerLayer(input: {
  readonly id: string
  readonly start: Point
  readonly end: Point
  readonly canvas: Readonly<{ readonly width: number; readonly height: number }>
  readonly unit?: RulerUnit
  readonly snapAngleIncrementDegrees?: number
  readonly color?: SrgbColor
  readonly thickness?: number
  readonly fontSize?: number
}): RulerLayer {
  assertPoint(input.start, 'ruler start')
  assertPoint(input.end, 'ruler end')
  if (input.start.x === input.end.x && input.start.y === input.end.y) {
    throw new RangeError('ruler endpoints must be distinct')
  }
  const unit = input.unit ?? 'pixels'
  if (unit !== 'pixels' && unit !== 'percent') {
    throw new RangeError('ruler unit is invalid')
  }
  const snapAngleIncrementDegrees = input.snapAngleIncrementDegrees ?? 15
  if (
    !Number.isFinite(snapAngleIncrementDegrees) ||
    snapAngleIncrementDegrees <= 0 ||
    snapAngleIncrementDegrees > 90
  ) {
    throw new RangeError('ruler snap angle increment must be between 0 and 90')
  }
  const color = input.color ?? DEFAULT_RULER_COLOR
  assertUnitColor(color, 'ruler color')
  const thickness = input.thickness ?? DEFAULT_RULER_THICKNESS
  if (
    !Number.isFinite(thickness) ||
    !Number.isInteger(thickness) ||
    thickness < RULER_THICKNESS_BOUNDS.min ||
    thickness > RULER_THICKNESS_BOUNDS.max
  ) {
    throw new RangeError('ruler thickness must be between 1 and 12')
  }
  const fontSize = input.fontSize ?? DEFAULT_RULER_FONT_SIZE
  if (
    !Number.isFinite(fontSize) ||
    !Number.isInteger(fontSize) ||
    fontSize < RULER_FONT_SIZE_BOUNDS.min ||
    fontSize > RULER_FONT_SIZE_BOUNDS.max
  ) {
    throw new RangeError('ruler fontSize must be between 10 and 48')
  }
  assertCanvasSize(input.canvas, 'ruler canvas')
  const payload = Object.freeze({
    start: freezePoint(input.start),
    end: freezePoint(input.end),
    unit,
    percentBasis: 'canvasDiagonal' as const,
    snapAngleIncrementDegrees,
    color: freezeColor(color),
    thickness,
    fontSize,
  })
  const seed = Object.freeze({
    ...commonLayer(input.id, 0, 0, { x: 0, y: 0, width: 1, height: 1 }),
    kind: 'ruler',
    payload,
  }) satisfies RulerLayer
  return rebaseRulerLayer(seed, payload, input.canvas)
}

function rulerTickHalfLength(thickness: number): number {
  return Math.max(6, Math.min(12, thickness))
}

function rulerBadgeDimensions(
  label: string,
  fontSize: number,
): {
  readonly width: number
  readonly height: number
} {
  const height = fontSize + 8
  const conservativeTextWidth =
    Array.from(label).length * fontSize * RULER_BADGE_TEXT_WIDTH_FACTOR
  return Object.freeze({
    width: Math.max(
      height,
      conservativeTextWidth + Math.max(12, fontSize * 0.9),
    ),
    height,
  })
}

export interface RulerVisualGeometry {
  readonly bounds: Rect
  readonly badgePolygon: readonly Point[]
}

/** Returns conservative local geometry for the transformed line, ticks and
 * world-upright badge. Renderer font metrics may make the actual badge tighter. */
export function rulerVisualGeometry(
  layer: RulerLayer,
  payload: RulerLayerPayload,
  canvas: Readonly<{ readonly width: number; readonly height: number }>,
): RulerVisualGeometry {
  assertCanvasSize(canvas, 'ruler canvas')
  const matrix = transformToMatrix(layer.transform)
  const inverse = invertMatrix(matrix)
  const worldStart = transformPoint(matrix, payload.start)
  const worldEnd = transformPoint(matrix, payload.end)
  const worldLength = Math.hypot(
    worldEnd.x - worldStart.x,
    worldEnd.y - worldStart.y,
  )
  if (worldLength <= 0) throw new RangeError('ruler endpoints must be distinct')
  const diagonal = Math.hypot(canvas.width, canvas.height)
  const label =
    payload.unit === 'pixels'
      ? `${formatMeasurement(worldLength, 0)} px`
      : `${formatMeasurement((worldLength / diagonal) * 100, 2)}%`
  const badge = rulerBadgeDimensions(label, payload.fontSize)
  const center = {
    x: (worldStart.x + worldEnd.x) / 2,
    y: (worldStart.y + worldEnd.y) / 2,
  }
  const angle = Math.atan2(worldEnd.y - worldStart.y, worldEnd.x - worldStart.x)
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const badgePolygon = Object.freeze(
    [
      { x: -badge.width / 2, y: -badge.height / 2 },
      { x: badge.width / 2, y: -badge.height / 2 },
      { x: badge.width / 2, y: badge.height / 2 },
      { x: -badge.width / 2, y: badge.height / 2 },
    ].map((corner) =>
      transformPoint(inverse, {
        x: center.x + cosine * corner.x - sine * corner.y,
        y: center.y + sine * corner.x + cosine * corner.y,
      }),
    ),
  )
  const localDx = payload.end.x - payload.start.x
  const localDy = payload.end.y - payload.start.y
  const localLength = Math.hypot(localDx, localDy)
  const perpendicular = { x: -localDy / localLength, y: localDx / localLength }
  const tickHalf = rulerTickHalfLength(payload.thickness)
  const tickPoints = [payload.start, payload.end].flatMap((endpoint) => [
    {
      x: endpoint.x - perpendicular.x * tickHalf,
      y: endpoint.y - perpendicular.y * tickHalf,
    },
    {
      x: endpoint.x + perpendicular.x * tickHalf,
      y: endpoint.y + perpendicular.y * tickHalf,
    },
  ])
  const points = [payload.start, payload.end, ...tickPoints, ...badgePolygon]
  const padding = Math.max(1, payload.thickness / 2)
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minimumX = Math.min(...xs) - padding
  const minimumY = Math.min(...ys) - padding
  const maximumX = Math.max(...xs) + padding
  const maximumY = Math.max(...ys) + padding
  return Object.freeze({
    bounds: freezeRect({
      x: minimumX,
      y: minimumY,
      width: maximumX - minimumX,
      height: maximumY - minimumY,
    }),
    badgePolygon,
  })
}

function shiftedPoint(point: Point, origin: Point): Point & JsonObject {
  return freezePoint({ x: point.x - origin.x, y: point.y - origin.y })
}

/** Rebases local ruler geometry while preserving both world-space endpoints. */
export function rebaseRulerLayer(
  layer: RulerLayer,
  payload: RulerLayerPayload,
  canvas: Readonly<{ readonly width: number; readonly height: number }>,
): RulerLayer {
  const geometry = rulerVisualGeometry(layer, payload, canvas)
  const origin = { x: geometry.bounds.x, y: geometry.bounds.y }
  const matrix = transformToMatrix(layer.transform)
  return Object.freeze({
    ...layer,
    transform: Object.freeze({
      ...layer.transform,
      translateX:
        layer.transform.translateX + matrix.a * origin.x + matrix.c * origin.y,
      translateY:
        layer.transform.translateY + matrix.b * origin.x + matrix.d * origin.y,
    }),
    localBounds: freezeRect({
      x: 0,
      y: 0,
      width: geometry.bounds.width,
      height: geometry.bounds.height,
    }),
    payload: Object.freeze({
      ...payload,
      start: shiftedPoint(payload.start, origin),
      end: shiftedPoint(payload.end, origin),
    }),
  })
}

export function rulerVisualBoundsAreConservative(
  layer: RulerLayer,
  canvas: Readonly<{ readonly width: number; readonly height: number }>,
): boolean {
  const bounds = rulerVisualGeometry(layer, layer.payload, canvas).bounds
  return (
    bounds.x >= layer.localBounds.x - GEOMETRY_EPSILON &&
    bounds.y >= layer.localBounds.y - GEOMETRY_EPSILON &&
    bounds.x + bounds.width <=
      layer.localBounds.x + layer.localBounds.width + GEOMETRY_EPSILON &&
    bounds.y + bounds.height <=
      layer.localBounds.y + layer.localBounds.height + GEOMETRY_EPSILON
  )
}

function formatMeasurement(
  value: number,
  maximumFractionDigits: number,
): string {
  const rounded = Number(value.toFixed(maximumFractionDigits))
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

export interface RulerMeasurement {
  readonly length: number
  readonly angleDegrees: number
  readonly percent: number
  readonly percentBasis: 'canvasDiagonal'
  readonly label: string
}

export function measureRuler(
  layer: RulerLayer,
  canvas: Readonly<{ readonly width: number; readonly height: number }>,
): RulerMeasurement {
  if (
    !Number.isFinite(canvas.width) ||
    !Number.isFinite(canvas.height) ||
    canvas.width <= 0 ||
    canvas.height <= 0
  ) {
    throw new RangeError('ruler canvas dimensions must be positive and finite')
  }
  const matrix = transformToMatrix(layer.transform)
  const start = transformPoint(matrix, layer.payload.start)
  const end = transformPoint(matrix, layer.payload.end)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  const angleDegrees = (Math.atan2(dy, dx) * 180) / Math.PI
  const percent = (length / Math.hypot(canvas.width, canvas.height)) * 100
  return Object.freeze({
    length,
    angleDegrees,
    percent,
    percentBasis: 'canvasDiagonal',
    label:
      layer.payload.unit === 'pixels'
        ? `${formatMeasurement(length, 0)} px`
        : `${formatMeasurement(percent, 2)}%`,
  })
}

export interface RulerAngleGuide {
  readonly kind: 'angle'
  readonly start: Point
  readonly end: Point
  readonly angleDegrees: number
}

export interface RulerSnapResult {
  readonly end: Point
  readonly snapped: boolean
  readonly angleDegrees: number
  /** Transient overlay geometry; never part of RulerLayerPayload. */
  readonly guide?: RulerAngleGuide
}

export function snapRulerEndpoint(
  start: Point,
  candidate: Point,
  angleIncrementDegrees: number,
): RulerSnapResult {
  assertPoint(start, 'ruler snap start')
  assertPoint(candidate, 'ruler snap candidate')
  if (
    !Number.isFinite(angleIncrementDegrees) ||
    angleIncrementDegrees <= 0 ||
    angleIncrementDegrees > 90
  ) {
    throw new RangeError('ruler snap angle increment must be between 0 and 90')
  }
  const dx = candidate.x - start.x
  const dy = candidate.y - start.y
  const length = Math.hypot(dx, dy)
  if (length === 0) {
    return Object.freeze({
      end: freezePoint(candidate),
      snapped: false,
      angleDegrees: 0,
    })
  }
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  const snappedAngle =
    Math.round(angle / angleIncrementDegrees) * angleIncrementDegrees
  const radians = (snappedAngle * Math.PI) / 180
  const end = freezePoint({
    x: start.x + Math.cos(radians) * length,
    y: start.y + Math.sin(radians) * length,
  })
  const snapped = Math.abs(snappedAngle - angle) > GEOMETRY_EPSILON
  return Object.freeze({
    end,
    snapped,
    angleDegrees: snappedAngle,
    ...(snapped
      ? {
          guide: Object.freeze({
            kind: 'angle' as const,
            start: freezePoint(start),
            end,
            angleDegrees: snappedAngle,
          }),
        }
      : {}),
  })
}
