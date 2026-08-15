import { invertMatrix, transformPoint, transformToMatrix } from './geometry'
import {
  DEFAULT_RULER_COLOR,
  DEFAULT_RULER_FONT_SIZE,
  DEFAULT_RULER_THICKNESS,
  RULER_FONT_SIZE_BOUNDS,
  RULER_THICKNESS_BOUNDS,
} from './document/types'
import type {
  CensorEffect,
  CensorLayer,
  CensorRegion,
  JsonObject,
  LoupeLayer,
  Point,
  Rect,
  RulerLayer,
  RulerLayerPayload,
  RulerUnit,
  ShadowStyle,
  SpotlightFeatherPreset,
  SpotlightLayer,
  SpotlightShape,
  SrgbColor,
} from './document/types'

const IDENTITY = Object.freeze({
  translateX: 0,
  translateY: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
})
const BLACK = Object.freeze({ red: 0, green: 0, blue: 0, alpha: 1 })
const WHITE = Object.freeze({ red: 1, green: 1, blue: 1, alpha: 1 })
const RULER_HIT_PADDING = 6
const GEOMETRY_EPSILON = 1e-9
const MAX_LOUPE_SOURCE_COORDINATE = 1_000_000
const RULER_BADGE_TEXT_WIDTH_FACTOR = 0.85

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${field} must be finite`)
}

function assertPoint(point: Point, field: string): void {
  assertFinite(point.x, `${field}.x`)
  assertFinite(point.y, `${field}.y`)
}

function assertRect(rect: Rect, field: string): void {
  assertPoint(rect, field)
  assertFinite(rect.width, `${field}.width`)
  assertFinite(rect.height, `${field}.height`)
  if (rect.width <= 0 || rect.height <= 0) {
    throw new RangeError(`${field} must have positive dimensions`)
  }
}

function assertCanvasSize(
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

function assertUnitColor(color: SrgbColor, field: string): void {
  for (const channel of ['red', 'green', 'blue', 'alpha'] as const) {
    const value = color[channel]
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${field}.${channel} must be between 0 and 1`)
    }
  }
}

function freezePoint(point: Point): Point & JsonObject {
  return Object.freeze({ x: point.x, y: point.y }) as Point & JsonObject
}

function freezeRect(rect: Rect): Rect & JsonObject {
  return Object.freeze({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }) as Rect & JsonObject
}

function freezeColor(color: SrgbColor): SrgbColor {
  return Object.freeze({
    red: color.red,
    green: color.green,
    blue: color.blue,
    alpha: color.alpha,
  })
}

function polygonArea(points: readonly Point[]): number {
  let twiceArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!
    const next = points[(index + 1) % points.length]!
    twiceArea += point.x * next.y - next.x * point.y
  }
  return twiceArea / 2
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function between(value: number, start: number, end: number): boolean {
  return (
    value >= Math.min(start, end) - GEOMETRY_EPSILON &&
    value <= Math.max(start, end) + GEOMETRY_EPSILON
  )
}

function pointOnSegment(point: Point, start: Point, end: Point): boolean {
  return (
    Math.abs(orientation(start, end, point)) <= GEOMETRY_EPSILON &&
    between(point.x, start.x, end.x) &&
    between(point.y, start.y, end.y)
  )
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  if (
    ((abC > GEOMETRY_EPSILON && abD < -GEOMETRY_EPSILON) ||
      (abC < -GEOMETRY_EPSILON && abD > GEOMETRY_EPSILON)) &&
    ((cdA > GEOMETRY_EPSILON && cdB < -GEOMETRY_EPSILON) ||
      (cdA < -GEOMETRY_EPSILON && cdB > GEOMETRY_EPSILON))
  ) {
    return true
  }
  return (
    pointOnSegment(c, a, b) ||
    pointOnSegment(d, a, b) ||
    pointOnSegment(a, c, d) ||
    pointOnSegment(b, c, d)
  )
}

export function assertValidFreeformPolygon(
  points: readonly Point[],
  field = 'freeform polygon',
): void {
  if (points.length < 3 || points.length > 2_048) {
    throw new RangeError(`${field} must contain 3 to 2048 points`)
  }
  points.forEach((point, index) => assertPoint(point, `${field}[${index}]`))
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!
    const next = points[(index + 1) % points.length]!
    if (point.x === next.x && point.y === next.y) {
      throw new RangeError(`${field} has a zero-length edge`)
    }
  }
  if (Math.abs(polygonArea(points)) <= GEOMETRY_EPSILON) {
    throw new RangeError(`${field} must enclose a non-zero area`)
  }
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length
      const adjacent =
        first === second ||
        firstNext === second ||
        secondNext === first ||
        (first === 0 && secondNext === 0)
      if (adjacent) continue
      if (
        segmentsIntersect(
          points[first]!,
          points[firstNext]!,
          points[second]!,
          points[secondNext]!,
        )
      ) {
        throw new RangeError(`${field} must be a simple polygon`)
      }
    }
  }
}

export function pointsBounds(points: readonly Point[]): Rect {
  if (points.length === 0) throw new RangeError('points must not be empty')
  points.forEach((point, index) => assertPoint(point, `points[${index}]`))
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return Object.freeze({
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  })
}

export function pointInPolygon(
  point: Point,
  points: readonly Point[],
): boolean {
  for (let index = 0; index < points.length; index += 1) {
    if (
      pointOnSegment(
        point,
        points[index]!,
        points[(index + 1) % points.length]!,
      )
    ) {
      return true
    }
  }
  let inside = false
  for (
    let index = 0, previous = points.length - 1;
    index < points.length;
    previous = index++
  ) {
    const current = points[index]!
    const before = points[previous]!
    if (
      current.y > point.y !== before.y > point.y &&
      point.x <
        ((before.x - current.x) * (point.y - current.y)) /
          (before.y - current.y) +
          current.x
    ) {
      inside = !inside
    }
  }
  return inside
}

function commonLayer(id: string, x: number, y: number, bounds: Rect) {
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

function pointToSegmentDistance(
  point: Point,
  start: Point,
  end: Point,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const squared = dx * dx + dy * dy
  if (squared === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const progress = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / squared,
    ),
  )
  return Math.hypot(
    point.x - (start.x + dx * progress),
    point.y - (start.y + dy * progress),
  )
}

export function precisionLayerHitPart(
  layer: CensorLayer | SpotlightLayer | RulerLayer | LoupeLayer,
  point: Point,
  canvas?: Readonly<{ readonly width: number; readonly height: number }>,
): 'fill' | 'stroke' | undefined {
  const bounds = layer.localBounds
  if (layer.kind === 'censor') {
    return layer.payload.region.kind === 'rectangle' ||
      pointInPolygon(point, layer.payload.region.points)
      ? 'fill'
      : undefined
  }
  if (layer.kind === 'spotlight') {
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2
    const normalizedX = (point.x - centerX) / (bounds.width / 2)
    const normalizedY = (point.y - centerY) / (bounds.height / 2)
    const inside =
      layer.payload.shape === 'rectangle'
        ? true
        : layer.payload.shape === 'ellipse'
          ? normalizedX ** 2 + normalizedY ** 2 <= 1
          : Math.abs(normalizedX) + Math.abs(normalizedY) <= 1
    return inside ? 'fill' : undefined
  }
  if (layer.kind === 'ruler') {
    const start = layer.payload.start
    const end = layer.payload.end
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    const perpendicular = { x: -dy / length, y: dx / length }
    const tickHalf = rulerTickHalfLength(layer.payload.thickness)
    const strokePadding = Math.max(
      RULER_HIT_PADDING,
      layer.payload.thickness / 2,
    )
    if (pointToSegmentDistance(point, start, end) <= strokePadding) {
      return 'stroke'
    }
    for (const endpoint of [start, end]) {
      const tickStart = {
        x: endpoint.x - perpendicular.x * tickHalf,
        y: endpoint.y - perpendicular.y * tickHalf,
      }
      const tickEnd = {
        x: endpoint.x + perpendicular.x * tickHalf,
        y: endpoint.y + perpendicular.y * tickHalf,
      }
      if (pointToSegmentDistance(point, tickStart, tickEnd) <= strokePadding) {
        return 'stroke'
      }
    }
    if (
      canvas &&
      pointInPolygon(
        point,
        rulerVisualGeometry(layer, layer.payload, canvas).badgePolygon,
      )
    ) {
      return 'fill'
    }
    return undefined
  }
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  if (layer.payload.lens.shape === 'rectangle') return 'fill'
  const radius = layer.payload.lens.size / 2
  return Math.hypot(point.x - centerX, point.y - centerY) <= radius
    ? 'fill'
    : undefined
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
