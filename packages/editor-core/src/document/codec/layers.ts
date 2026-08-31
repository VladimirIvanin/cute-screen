import { collectExtras, freezeJsonObject, readJsonObject } from '../json'
import {
  BLEND_MODES,
  type BlendMode,
  type JsonObject,
  type LayerKind,
  type LayerNode,
} from '../types'
import {
  parseCalloutPayload,
  parseEmojiPayload,
  parseImagePayload,
  parseNumberedMarkerPayload,
} from './content'
import {
  parseArrowPayload,
  parseSampledPayload,
  parseShapePayload,
  parseSrgbColor,
} from './paint'
import {
  assertPrecisionPayloadBounds,
  parseCensorPayload,
  parseLoupePayload,
  parseRulerPayload,
  parseSpotlightPayload,
} from './precision'
import {
  assertOnlyFields,
  isLayerKind,
  parseRect,
  parseTransform,
  readBoolean,
  readFiniteNumber,
  readStableId,
} from './primitives'
import { parseTextPayload } from './text'

function isBlendMode(value: unknown): value is BlendMode {
  return typeof value === 'string' && BLEND_MODES.includes(value as BlendMode)
}

function parseDrawingPayload(
  kind: LayerKind,
  value: unknown,
  field: string,
): JsonObject {
  switch (kind) {
    case 'arrow':
      return parseArrowPayload(value, field)
    case 'shape':
      return parseShapePayload(value, field)
    case 'pencil':
      return parseSampledPayload(value, field, false)
    case 'marker':
      return parseSampledPayload(value, field, true)
    case 'censor':
      return parseCensorPayload(value, field)
    case 'spotlight':
      return parseSpotlightPayload(value, field)
    case 'ruler':
      return parseRulerPayload(value, field)
    case 'loupe':
      return parseLoupePayload(value, field)
    default:
      return freezeJsonObject(value, field)
  }
}

function parseLayerPayload(
  kind: LayerKind,
  value: unknown,
  field: string,
): JsonObject {
  switch (kind) {
    case 'image':
      return parseImagePayload(value, field)
    case 'text':
      return parseTextPayload(value, field)
    case 'numberedMarker':
      return parseNumberedMarkerPayload(value, field)
    case 'callout':
      return parseCalloutPayload(value, field)
    case 'emoji':
      return parseEmojiPayload(value, field)
    default:
      return parseDrawingPayload(kind, value, field)
  }
}

function parseLayerShadows(
  value: unknown,
  field: string,
): readonly JsonObject[] {
  if (!Array.isArray(value) || value.length > 4) {
    throw new Error(`${field}.shadows is invalid`)
  }
  return Object.freeze(
    value.map((shadow, shadowIndex) => {
      const shadowField = `${field}.shadows[${shadowIndex}]`
      const parsed = readJsonObject(shadow, shadowField)
      assertOnlyFields(
        parsed,
        ['color', 'offsetX', 'offsetY', 'blur'],
        shadowField,
      )
      const blur = readFiniteNumber(parsed.blur, `${shadowField}.blur`)
      if (blur < 0) throw new Error(`${shadowField}.blur is invalid`)
      return Object.freeze({
        color: parseSrgbColor(parsed.color, `${shadowField}.color`),
        offsetX: readFiniteNumber(parsed.offsetX, `${shadowField}.offsetX`),
        offsetY: readFiniteNumber(parsed.offsetY, `${shadowField}.offsetY`),
        blur,
      })
    }),
  )
}

function isPrecisionLayer(kind: LayerKind): boolean {
  return (
    kind === 'censor' ||
    kind === 'spotlight' ||
    kind === 'ruler' ||
    kind === 'loupe'
  )
}

function isTextBearingLayer(kind: LayerKind): boolean {
  return kind === 'text' || kind === 'numberedMarker' || kind === 'callout'
}

function assertPrecisionLayerShape(
  input: Record<string, unknown>,
  field: string,
): void {
  assertOnlyFields(
    input,
    [
      'id',
      'kind',
      'transform',
      'localBounds',
      'opacity',
      'visible',
      'locked',
      'blendMode',
      'shadows',
      'payload',
    ],
    field,
  )
  const transform = readJsonObject(input.transform, `${field}.transform`)
  assertOnlyFields(
    transform,
    ['translateX', 'translateY', 'rotation', 'scaleX', 'scaleY'],
    `${field}.transform`,
  )
}

function parseStrictLayerRect(value: unknown, field: string) {
  const input = readJsonObject(value, field)
  assertOnlyFields(input, ['x', 'y', 'width', 'height'], field)
  return parseRect(input, field)
}

export function parseLayer(value: unknown, index: number): LayerNode {
  const field = `layers[${index}]`
  const input = readJsonObject(value, field)
  if (!isLayerKind(input.kind)) throw new Error(`${field}.kind is invalid`)
  const precisionLayer = isPrecisionLayer(input.kind)
  if (precisionLayer) assertPrecisionLayerShape(input, field)
  const textBearing = isTextBearingLayer(input.kind)
  if (
    textBearing &&
    (Object.hasOwn(input, 'opacity') ||
      Object.hasOwn(input, 'blendMode') ||
      Object.hasOwn(input, 'shadows'))
  ) {
    throw new Error(`${field} text-bearing common effects are removed in v7`)
  }
  const extras = collectExtras(input, [
    'id',
    'kind',
    'transform',
    'localBounds',
    'opacity',
    'visible',
    'locked',
    'blendMode',
    'shadows',
    'payload',
  ])
  const payload = parseLayerPayload(
    input.kind,
    input.payload,
    `${field}.payload`,
  )
  const localBounds = precisionLayer
    ? parseStrictLayerRect(input.localBounds, `${field}.localBounds`)
    : parseRect(input.localBounds, `${field}.localBounds`)
  assertPrecisionPayloadBounds(input.kind, payload, localBounds, field)
  const common = {
    id: readStableId(input.id, `${field}.id`),
    kind: input.kind,
    transform: parseTransform(input.transform, `${field}.transform`),
    localBounds,
    visible: readBoolean(input.visible, `${field}.visible`),
    locked: readBoolean(input.locked, `${field}.locked`),
    payload,
    ...(extras === undefined ? {} : { extras }),
  }
  if (textBearing) return Object.freeze(common) as LayerNode
  const opacity = readFiniteNumber(input.opacity, `${field}.opacity`)
  if (opacity < 0 || opacity > 1) {
    throw new Error(`${field}.opacity must be between 0 and 1`)
  }
  if (!isBlendMode(input.blendMode)) {
    throw new Error(`${field}.blendMode is invalid`)
  }
  return Object.freeze({
    ...common,
    opacity,
    blendMode: input.blendMode,
    shadows: parseLayerShadows(input.shadows, field),
  }) as LayerNode
}
