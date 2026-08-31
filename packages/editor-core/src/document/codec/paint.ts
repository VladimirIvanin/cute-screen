import { readJsonObject } from '../json'
import {
  ARROW_CAPS,
  type ArrowLayerPayload,
  type JsonObject,
  type MarkerLayerPayload,
  type PencilLayerPayload,
  type ShapeLayerPayload,
} from '../types'
import {
  assertOnlyFields,
  readFiniteNumber,
  readPositiveNumber,
  readSha256,
} from './primitives'

export function parseUnitInterval(value: unknown, field: string): number {
  const number = readFiniteNumber(value, field)
  if (number < 0 || number > 1) {
    throw new Error(`${field} must be between 0 and 1`)
  }
  return number
}

export function parseSrgbColor(value: unknown, field: string): JsonObject {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['red', 'green', 'blue', 'alpha'], field)
  return Object.freeze({
    red: parseUnitInterval(input.red, `${field}.red`),
    green: parseUnitInterval(input.green, `${field}.green`),
    blue: parseUnitInterval(input.blue, `${field}.blue`),
    alpha: parseUnitInterval(input.alpha, `${field}.alpha`),
  })
}

export function parsePointPayload(value: unknown, field: string): JsonObject {
  const input = readJsonObject(value, field)
  return Object.freeze({
    x: readFiniteNumber(input.x, `${field}.x`),
    y: readFiniteNumber(input.y, `${field}.y`),
  })
}

export function parseStroke(value: unknown, field: string): JsonObject {
  const input = readJsonObject(value, field)
  if (
    input.style !== 'solid' &&
    input.style !== 'dashed' &&
    input.style !== 'dotted'
  ) {
    throw new Error(`${field}.style is invalid`)
  }
  if (input.cap !== 'butt' && input.cap !== 'round' && input.cap !== 'square') {
    throw new Error(`${field}.cap is invalid`)
  }
  if (
    input.join !== 'miter' &&
    input.join !== 'round' &&
    input.join !== 'bevel'
  ) {
    throw new Error(`${field}.join is invalid`)
  }
  return Object.freeze({
    color: parseSrgbColor(input.color, `${field}.color`),
    width: readPositiveNumber(input.width, `${field}.width`),
    style: input.style,
    cap: input.cap,
    join: input.join,
  })
}

function parsePaintTransform(value: unknown, field: string): JsonObject {
  const input = readJsonObject(value, field)
  return Object.freeze({
    scale: readPositiveNumber(input.scale, `${field}.scale`),
    rotation: readFiniteNumber(input.rotation, `${field}.rotation`),
    offsetX: readFiniteNumber(input.offsetX, `${field}.offsetX`),
    offsetY: readFiniteNumber(input.offsetY, `${field}.offsetY`),
  })
}

function parseGradientStops(
  value: unknown,
  field: string,
): readonly JsonObject[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) {
    throw new Error(`${field} must contain 2 to 8 stops`)
  }
  let previous = -Infinity
  const stops = value.map((stop, index) => {
    const input = readJsonObject(stop, `${field}[${index}]`)
    const position = parseUnitInterval(
      input.position,
      `${field}[${index}].position`,
    )
    if (position < previous) throw new Error(`${field} must be ordered`)
    previous = position
    return Object.freeze({
      position,
      color: parseSrgbColor(input.color, `${field}[${index}].color`),
    })
  })
  return Object.freeze(stops)
}

function parseFill(value: unknown, field: string): JsonObject {
  const input = readJsonObject(value, field)
  switch (input.kind) {
    case 'none':
      return Object.freeze({ kind: 'none' })
    case 'solid':
      return Object.freeze({
        kind: 'solid',
        color: parseSrgbColor(input.color, `${field}.color`),
        opacity: parseUnitInterval(input.opacity, `${field}.opacity`),
      })
    case 'linearGradient':
      return Object.freeze({
        kind: 'linearGradient',
        stops: parseGradientStops(input.stops, `${field}.stops`),
        start: parsePointPayload(input.start, `${field}.start`),
        end: parsePointPayload(input.end, `${field}.end`),
        opacity: parseUnitInterval(input.opacity, `${field}.opacity`),
      })
    case 'radialGradient':
      return Object.freeze({
        kind: 'radialGradient',
        stops: parseGradientStops(input.stops, `${field}.stops`),
        center: parsePointPayload(input.center, `${field}.center`),
        radius: readPositiveNumber(input.radius, `${field}.radius`),
        opacity: parseUnitInterval(input.opacity, `${field}.opacity`),
      })
    case 'pattern': {
      if (
        input.pattern !== 'dots' &&
        input.pattern !== 'grid' &&
        input.pattern !== 'diagonal' &&
        input.pattern !== 'crosshatch' &&
        input.pattern !== 'checker'
      )
        throw new Error(`${field}.pattern is invalid`)
      return Object.freeze({
        kind: 'pattern',
        pattern: input.pattern,
        color: parseSrgbColor(input.color, `${field}.color`),
        background: parseSrgbColor(input.background, `${field}.background`),
        transform: parsePaintTransform(input.transform, `${field}.transform`),
        opacity: parseUnitInterval(input.opacity, `${field}.opacity`),
      })
    }
    case 'imageTexture': {
      if (
        input.format !== 'png' &&
        input.format !== 'jpeg' &&
        input.format !== 'webp'
      )
        throw new Error(`${field}.format is invalid`)
      if (input.fit !== 'repeat' && input.fit !== 'fit' && input.fit !== 'fill')
        throw new Error(`${field}.fit is invalid`)
      return Object.freeze({
        kind: 'imageTexture',
        blobHash: readSha256(input.blobHash, `${field}.blobHash`),
        format: input.format,
        intrinsicWidth: readPositiveNumber(
          input.intrinsicWidth,
          `${field}.intrinsicWidth`,
        ),
        intrinsicHeight: readPositiveNumber(
          input.intrinsicHeight,
          `${field}.intrinsicHeight`,
        ),
        fit: input.fit,
        transform: parsePaintTransform(input.transform, `${field}.transform`),
        opacity: parseUnitInterval(input.opacity, `${field}.opacity`),
      })
    }
    default:
      throw new Error(`${field}.kind is invalid`)
  }
}

export function parseArrowPayload(
  value: unknown,
  field: string,
): ArrowLayerPayload {
  const input = readJsonObject(value, field)
  if (
    input.path !== 'straight' &&
    input.path !== 'quadratic' &&
    input.path !== 'elbow'
  )
    throw new Error(`${field}.path is invalid`)
  const parseCap = (value: unknown, cap: string) => {
    if (ARROW_CAPS.includes(value as (typeof ARROW_CAPS)[number]))
      return value as (typeof ARROW_CAPS)[number]
    throw new Error(`${field}.${cap} is invalid`)
  }
  const startCap = parseCap(input.startCap, 'startCap')
  const endCap = parseCap(input.endCap, 'endCap')
  if (input.path === 'quadratic' && input.bend === undefined)
    throw new Error(`${field}.bend is required for a quadratic path`)
  if (input.path === 'elbow' && input.elbow === undefined)
    throw new Error(`${field}.elbow is required for an elbow path`)
  if (input.text !== undefined || input.label !== undefined)
    throw new Error(`${field} connector text is not supported`)
  const elbow =
    input.path === 'elbow'
      ? (() => {
          const route = readJsonObject(input.elbow, `${field}.elbow`)
          if (route.axis !== 'x' && route.axis !== 'y')
            throw new Error(`${field}.elbow.axis is invalid`)
          return Object.freeze({
            axis: route.axis,
            offset: readFiniteNumber(route.offset, `${field}.elbow.offset`),
          })
        })()
      : undefined
  return Object.freeze({
    path: input.path,
    start: parsePointPayload(
      input.start,
      `${field}.start`,
    ) as ArrowLayerPayload['start'],
    end: parsePointPayload(
      input.end,
      `${field}.end`,
    ) as ArrowLayerPayload['end'],
    ...(input.path !== 'quadratic'
      ? {}
      : {
          bend: parsePointPayload(
            input.bend,
            `${field}.bend`,
          ) as ArrowLayerPayload['start'],
        }),
    ...(elbow === undefined ? {} : { elbow }),
    stroke: parseStroke(
      input.stroke,
      `${field}.stroke`,
    ) as ArrowLayerPayload['stroke'],
    startCap,
    endCap,
  })
}

export function parseShapePayload(
  value: unknown,
  field: string,
): ShapeLayerPayload {
  const input = readJsonObject(value, field)
  if (
    !['rectangle', 'circle', 'oval', 'diamond', 'star'].includes(
      String(input.shape),
    )
  )
    throw new Error(`${field}.shape is invalid`)
  const fill = parseFill(input.fill, `${field}.fill`)
  const cornerRadius = readFiniteNumber(
    input.cornerRadius,
    `${field}.cornerRadius`,
  )
  const starPoints = readFiniteNumber(input.starPoints, `${field}.starPoints`)
  const starInnerRatio = parseUnitInterval(
    input.starInnerRatio,
    `${field}.starInnerRatio`,
  )
  if (
    cornerRadius < 0 ||
    starPoints < 3 ||
    starPoints > 32 ||
    !Number.isInteger(starPoints)
  )
    throw new Error(`${field} geometry is invalid`)
  return Object.freeze({
    shape: input.shape as ShapeLayerPayload['shape'],
    fill: fill as ShapeLayerPayload['fill'],
    stroke: parseStroke(
      input.stroke,
      `${field}.stroke`,
    ) as ShapeLayerPayload['stroke'],
    cornerRadius,
    starPoints,
    starInnerRatio,
  })
}

export function parseSampledPayload(
  value: unknown,
  field: string,
  marker: boolean,
): PencilLayerPayload | MarkerLayerPayload {
  const input = readJsonObject(value, field)
  if (!Array.isArray(input.points) || input.points.length === 0)
    throw new Error(`${field}.points must not be empty`)
  const points = input.points.map((point, index) => {
    const parsed = readJsonObject(point, `${field}.points[${index}]`)
    return Object.freeze({
      x: readFiniteNumber(parsed.x, `${field}.points[${index}].x`),
      y: readFiniteNumber(parsed.y, `${field}.points[${index}].y`),
      pressure: parseUnitInterval(
        parsed.pressure,
        `${field}.points[${index}].pressure`,
      ),
    })
  })
  const common = {
    points: Object.freeze(points),
    width: readPositiveNumber(input.width, `${field}.width`),
    color: parseSrgbColor(input.color, `${field}.color`),
    smoothing: parseUnitInterval(input.smoothing, `${field}.smoothing`),
  }
  if (marker) return Object.freeze(common) as MarkerLayerPayload
  if (!['pen', 'pencil', 'brush'].includes(String(input.brush)))
    throw new Error(`${field}.brush is invalid`)
  return Object.freeze({ ...common, brush: input.brush }) as PencilLayerPayload
}
