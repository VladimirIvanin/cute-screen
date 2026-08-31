import { readJsonObject } from '../json'
import {
  CENSOR_MODES,
  LOUPE_SHAPES,
  RULER_FONT_SIZE_BOUNDS,
  RULER_THICKNESS_BOUNDS,
  RULER_UNITS,
  SPOTLIGHT_FEATHER_PRESETS,
  SPOTLIGHT_SHAPES,
  type CensorLayerPayload,
  type JsonObject,
  type LayerKind,
  type LoupeLayerPayload,
  type Rect,
  type RulerLayerPayload,
  type SrgbColor,
  type SpotlightLayerPayload,
} from '../types'
import {
  assertValidFreeformPolygon,
  pointsBounds,
} from '../../tools/precision/polygon'
import { parseSrgbColor, parseUnitInterval } from './paint'
import {
  assertOnlyFields,
  readFiniteNumber,
  readPositiveNumber,
} from './primitives'

const MAX_CENSOR_BLOCK_SIZE = 128
const MAX_CENSOR_BLUR_STRENGTH = 128
const MAX_LOUPE_ZOOM = 16
const MAX_LOUPE_SIZE = 2_048
const MAX_LOUPE_BORDER_WIDTH = 64
const MAX_LOUPE_SHADOW_OFFSET = 512
const MAX_LOUPE_SHADOW_BLUR = 128
const GEOMETRY_EPSILON = 1e-9

function parseStrictPoint(
  value: unknown,
  field: string,
): Readonly<{ x: number; y: number }> & JsonObject {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['x', 'y'], field)
  return Object.freeze({
    x: readFiniteNumber(input.x, `${field}.x`),
    y: readFiniteNumber(input.y, `${field}.y`),
  })
}

function parseStrictRect(value: unknown, field: string): Rect & JsonObject {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['x', 'y', 'width', 'height'], field)
  return Object.freeze({
    x: readFiniteNumber(input.x, `${field}.x`),
    y: readFiniteNumber(input.y, `${field}.y`),
    width: readPositiveNumber(input.width, `${field}.width`),
    height: readPositiveNumber(input.height, `${field}.height`),
  })
}

function parseCensorEffect(
  value: unknown,
  field: string,
): CensorLayerPayload['effect'] {
  const input = readJsonObject(value, field)
  if (!CENSOR_MODES.includes(input.mode as (typeof CENSOR_MODES)[number])) {
    throw new Error(`${field}.mode is invalid`)
  }
  if (input.mode === 'pixelate') {
    assertOnlyFields(input, ['mode', 'blockSize'], field)
    const blockSize = readFiniteNumber(input.blockSize, `${field}.blockSize`)
    if (
      !Number.isInteger(blockSize) ||
      blockSize < 2 ||
      blockSize > MAX_CENSOR_BLOCK_SIZE
    ) {
      throw new Error(`${field}.blockSize is outside supported bounds`)
    }
    return Object.freeze({ mode: 'pixelate', blockSize })
  }
  if (input.mode === 'blur') {
    assertOnlyFields(input, ['mode', 'strength'], field)
    const strength = readFiniteNumber(input.strength, `${field}.strength`)
    if (strength < 0.5 || strength > MAX_CENSOR_BLUR_STRENGTH) {
      throw new Error(`${field}.strength is outside supported bounds`)
    }
    return Object.freeze({ mode: 'blur', strength })
  }
  assertOnlyFields(input, ['mode', 'color'], field)
  return Object.freeze({
    mode: 'solid',
    color: parseSrgbColor(
      input.color,
      `${field}.color`,
    ) as unknown as SrgbColor,
  })
}

export function parseCensorPayload(
  value: unknown,
  field: string,
): CensorLayerPayload {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['region', 'effect', 'sampleSource'], field)
  if (input.sampleSource !== 'compositeBelow') {
    throw new Error(`${field}.sampleSource must be compositeBelow`)
  }
  const rawRegion = readJsonObject(input.region, `${field}.region`)
  let region: CensorLayerPayload['region']
  if (rawRegion.kind === 'rectangle') {
    assertOnlyFields(rawRegion, ['kind'], `${field}.region`)
    region = Object.freeze({ kind: 'rectangle' })
  } else if (rawRegion.kind === 'freeform') {
    assertOnlyFields(rawRegion, ['kind', 'points'], `${field}.region`)
    if (!Array.isArray(rawRegion.points)) {
      throw new Error(`${field}.region.points must be an array`)
    }
    const points = rawRegion.points.map((point, index) =>
      parseStrictPoint(point, `${field}.region.points[${index}]`),
    )
    assertValidFreeformPolygon(points, `${field}.region.points`)
    region = Object.freeze({
      kind: 'freeform',
      points: Object.freeze(points),
    }) as CensorLayerPayload['region']
  } else {
    throw new Error(`${field}.region.kind is invalid`)
  }
  return Object.freeze({
    region,
    effect: parseCensorEffect(input.effect, `${field}.effect`),
    sampleSource: 'compositeBelow',
  })
}

export function parseSpotlightPayload(
  value: unknown,
  field: string,
): SpotlightLayerPayload {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['shape', 'dimColor', 'dimOpacity', 'feather'], field)
  if (
    !SPOTLIGHT_SHAPES.includes(input.shape as (typeof SPOTLIGHT_SHAPES)[number])
  ) {
    throw new Error(`${field}.shape is invalid`)
  }
  if (
    input.feather !== null &&
    !SPOTLIGHT_FEATHER_PRESETS.includes(
      input.feather as (typeof SPOTLIGHT_FEATHER_PRESETS)[number],
    )
  ) {
    throw new Error(`${field}.feather is invalid`)
  }
  return Object.freeze({
    shape: input.shape as SpotlightLayerPayload['shape'],
    dimColor: parseSrgbColor(
      input.dimColor,
      `${field}.dimColor`,
    ) as unknown as SrgbColor,
    dimOpacity: parseUnitInterval(input.dimOpacity, `${field}.dimOpacity`),
    feather: input.feather as SpotlightLayerPayload['feather'],
  })
}

export function parseRulerPayload(
  value: unknown,
  field: string,
): RulerLayerPayload {
  const input = readJsonObject(value, field)
  assertOnlyFields(
    input,
    [
      'start',
      'end',
      'unit',
      'percentBasis',
      'snapAngleIncrementDegrees',
      'color',
      'thickness',
      'fontSize',
    ],
    field,
  )
  if (!RULER_UNITS.includes(input.unit as (typeof RULER_UNITS)[number])) {
    throw new Error(`${field}.unit is invalid`)
  }
  if (input.percentBasis !== 'canvasDiagonal') {
    throw new Error(`${field}.percentBasis is invalid`)
  }
  const start = parseStrictPoint(input.start, `${field}.start`)
  const end = parseStrictPoint(input.end, `${field}.end`)
  if (start.x === end.x && start.y === end.y) {
    throw new Error(`${field} endpoints must be distinct`)
  }
  const increment = readFiniteNumber(
    input.snapAngleIncrementDegrees,
    `${field}.snapAngleIncrementDegrees`,
  )
  if (increment <= 0 || increment > 90) {
    throw new Error(`${field}.snapAngleIncrementDegrees is invalid`)
  }
  const thickness = readFiniteNumber(input.thickness, `${field}.thickness`)
  if (
    !Number.isInteger(thickness) ||
    thickness < RULER_THICKNESS_BOUNDS.min ||
    thickness > RULER_THICKNESS_BOUNDS.max
  ) {
    throw new Error(`${field}.thickness is invalid`)
  }
  const fontSize = readFiniteNumber(input.fontSize, `${field}.fontSize`)
  if (
    !Number.isInteger(fontSize) ||
    fontSize < RULER_FONT_SIZE_BOUNDS.min ||
    fontSize > RULER_FONT_SIZE_BOUNDS.max
  ) {
    throw new Error(`${field}.fontSize is invalid`)
  }
  return Object.freeze({
    start,
    end,
    unit: input.unit as RulerLayerPayload['unit'],
    percentBasis: 'canvasDiagonal',
    snapAngleIncrementDegrees: increment,
    color: parseSrgbColor(
      input.color,
      `${field}.color`,
    ) as unknown as SrgbColor,
    thickness,
    fontSize,
  }) as RulerLayerPayload
}

function parseLoupeShadow(
  value: unknown,
  field: string,
): LoupeLayerPayload['shadow'] {
  if (value === null) return null
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['color', 'offsetX', 'offsetY', 'blur'], field)
  const offsetX = readFiniteNumber(input.offsetX, `${field}.offsetX`)
  const offsetY = readFiniteNumber(input.offsetY, `${field}.offsetY`)
  const blur = readFiniteNumber(input.blur, `${field}.blur`)
  if (
    Math.abs(offsetX) > MAX_LOUPE_SHADOW_OFFSET ||
    Math.abs(offsetY) > MAX_LOUPE_SHADOW_OFFSET ||
    blur < 0 ||
    blur > MAX_LOUPE_SHADOW_BLUR
  ) {
    throw new Error(`${field} is outside supported bounds`)
  }
  return Object.freeze({
    color: parseSrgbColor(
      input.color,
      `${field}.color`,
    ) as unknown as SrgbColor,
    offsetX,
    offsetY,
    blur,
  })
}

export function parseLoupePayload(
  value: unknown,
  field: string,
): LoupeLayerPayload {
  const input = readJsonObject(value, field)
  assertOnlyFields(
    input,
    ['sourceRegion', 'lens', 'zoom', 'border', 'shadow', 'sampleSource'],
    field,
  )
  if (input.sampleSource !== 'compositeBelow') {
    throw new Error(`${field}.sampleSource must be compositeBelow`)
  }
  const sourceRegion = parseStrictRect(
    input.sourceRegion,
    `${field}.sourceRegion`,
  )
  if (Math.abs(sourceRegion.width - sourceRegion.height) > GEOMETRY_EPSILON) {
    throw new Error(`${field}.sourceRegion must be square`)
  }
  const lens = readJsonObject(input.lens, `${field}.lens`)
  assertOnlyFields(lens, ['shape', 'size'], `${field}.lens`)
  if (!LOUPE_SHAPES.includes(lens.shape as (typeof LOUPE_SHAPES)[number])) {
    throw new Error(`${field}.lens.shape is invalid`)
  }
  const size = readFiniteNumber(lens.size, `${field}.lens.size`)
  if (size < 16 || size > MAX_LOUPE_SIZE) {
    throw new Error(`${field}.lens.size is outside supported bounds`)
  }
  const zoom = readFiniteNumber(input.zoom, `${field}.zoom`)
  if (zoom < 1 || zoom > MAX_LOUPE_ZOOM) {
    throw new Error(`${field}.zoom is outside supported bounds`)
  }
  if (Math.abs(sourceRegion.width * zoom - size) > GEOMETRY_EPSILON) {
    throw new Error(`${field} sourceRegion size must equal lens size / zoom`)
  }
  const border = readJsonObject(input.border, `${field}.border`)
  assertOnlyFields(border, ['color', 'width'], `${field}.border`)
  const borderWidth = readFiniteNumber(border.width, `${field}.border.width`)
  if (borderWidth < 0 || borderWidth > MAX_LOUPE_BORDER_WIDTH) {
    throw new Error(`${field}.border.width is outside supported bounds`)
  }
  return Object.freeze({
    sourceRegion,
    lens: Object.freeze({
      shape: lens.shape as LoupeLayerPayload['lens']['shape'],
      size,
    }),
    zoom,
    border: Object.freeze({
      color: parseSrgbColor(
        border.color,
        `${field}.border.color`,
      ) as unknown as SrgbColor,
      width: borderWidth,
    }),
    shadow: parseLoupeShadow(input.shadow, `${field}.shadow`),
    sampleSource: 'compositeBelow',
  })
}

export function assertPrecisionPayloadBounds(
  kind: LayerKind,
  payload: JsonObject,
  localBounds: Rect,
  field: string,
): void {
  if (kind === 'censor') {
    const censor = payload as unknown as CensorLayerPayload
    if (censor.region.kind !== 'freeform') return
    const bounds = pointsBounds(censor.region.points)
    if (
      Math.abs(bounds.x - localBounds.x) > GEOMETRY_EPSILON ||
      Math.abs(bounds.y - localBounds.y) > GEOMETRY_EPSILON ||
      Math.abs(bounds.width - localBounds.width) > GEOMETRY_EPSILON ||
      Math.abs(bounds.height - localBounds.height) > GEOMETRY_EPSILON
    ) {
      throw new Error(`${field}.localBounds must match its freeform region`)
    }
  } else if (kind === 'ruler') {
    const ruler = payload as unknown as RulerLayerPayload
    for (const [name, point] of [
      ['start', ruler.start],
      ['end', ruler.end],
    ] as const) {
      if (
        point.x < localBounds.x ||
        point.x > localBounds.x + localBounds.width ||
        point.y < localBounds.y ||
        point.y > localBounds.y + localBounds.height
      ) {
        throw new Error(`${field}.payload.${name} must remain in localBounds`)
      }
    }
  } else if (kind === 'loupe') {
    const loupe = payload as unknown as LoupeLayerPayload
    if (
      Math.abs(localBounds.width - loupe.lens.size) > GEOMETRY_EPSILON ||
      Math.abs(localBounds.height - loupe.lens.size) > GEOMETRY_EPSILON
    ) {
      throw new Error(`${field}.localBounds must match its destination lens`)
    }
  }
}
