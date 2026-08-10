import { collectExtras, freezeJsonObject, readJsonObject } from './json'
import {
  DEFAULT_PRESENTATION_SETTINGS,
  BLEND_MODES,
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  LAYER_KINDS,
  type ColorMetadata,
  type BlendMode,
  type ArrowLayerPayload,
  type ShapeLayerPayload,
  type PencilLayerPayload,
  type MarkerLayerPayload,
  type EditorDocumentV1,
  type ImageLayerPayload,
  type JsonObject,
  type LayerKind,
  type LayerNode,
  type ParsedEditorDocument,
  type PresentationSettingsV1,
  type Rect,
  type SourceImageRef,
  type Transform2D,
} from './types'

const imageFormats = ['png', 'jpeg', 'webp', 'svg'] as const
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/u
const SHA256_PATTERN = /^[a-f0-9]{64}$/u

type ImageFormat = (typeof imageFormats)[number]

const DEFAULT_DRAWING_COLOR = Object.freeze({
  red: 0.898,
  green: 0.282,
  blue: 0.302,
  alpha: 1,
})

const DEFAULT_MARKER_COLOR = Object.freeze({
  red: 1,
  green: 0.835,
  blue: 0.29,
  alpha: 1,
})

function defaultStroke(): JsonObject {
  return {
    color: DEFAULT_DRAWING_COLOR,
    width: 3,
    style: 'solid',
    cap: 'round',
    join: 'round',
  }
}

function defaultDrawingPayload(
  kind: LayerKind,
  bounds: { readonly width?: unknown; readonly height?: unknown },
): JsonObject {
  const width = typeof bounds.width === 'number' ? bounds.width : 1
  const height = typeof bounds.height === 'number' ? bounds.height : 1
  switch (kind) {
    case 'arrow':
      return {
        path: 'straight',
        start: { x: 0, y: 0 },
        end: { x: width, y: height },
        stroke: defaultStroke(),
        startCap: 'none',
        endCap: 'triangle',
      }
    case 'shape':
      return {
        shape: 'rectangle',
        fill: { kind: 'none' },
        stroke: defaultStroke(),
        cornerRadius: 0,
        starPoints: 5,
        starInnerRatio: 0.45,
      }
    case 'pencil':
      return {
        points: [{ x: width / 2, y: height / 2, pressure: 0.5 }],
        brush: 'pen',
        width: 3,
        color: DEFAULT_DRAWING_COLOR,
        smoothing: 0.5,
      }
    case 'marker':
      return {
        points: [{ x: width / 2, y: height / 2, pressure: 0.5 }],
        width: 18,
        color: DEFAULT_MARKER_COLOR,
        smoothing: 0.5,
      }
    default:
      return {}
  }
}

function completeDrawingPayload(
  kind: LayerKind,
  payload: Record<string, unknown>,
  bounds: { readonly width?: unknown; readonly height?: unknown },
): JsonObject {
  if (
    kind !== 'arrow' &&
    kind !== 'shape' &&
    kind !== 'pencil' &&
    kind !== 'marker'
  ) {
    return payload as JsonObject
  }
  return {
    ...defaultDrawingPayload(kind, bounds),
    ...payload,
  } as unknown as JsonObject
}

function readNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  return value
}

function readStableId(value: unknown, field: string): string {
  const id = readNonEmptyString(value, field)
  if (!UUID_PATTERN.test(id) && !ULID_PATTERN.test(id)) {
    throw new Error(`${field} must be a UUID or ULID`)
  }
  return id
}

function readSha256(value: unknown, field: string): string {
  const hash = readNonEmptyString(value, field)
  if (!SHA256_PATTERN.test(hash)) {
    throw new Error(`${field} must be a lowercase SHA-256 hash`)
  }
  return hash
}

function readFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`)
  }
  return value
}

function readPositiveNumber(value: unknown, field: string): number {
  const number = readFiniteNumber(value, field)
  if (number <= 0) throw new Error(`${field} must be positive`)
  return number
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} must be boolean`)
  return value
}

function isImageFormat(value: unknown): value is ImageFormat {
  return (
    typeof value === 'string' && imageFormats.includes(value as ImageFormat)
  )
}

function isLayerKind(value: unknown): value is LayerKind {
  return typeof value === 'string' && LAYER_KINDS.includes(value as LayerKind)
}

function isBlendMode(value: unknown): value is BlendMode {
  return typeof value === 'string' && BLEND_MODES.includes(value as BlendMode)
}

function parseTransform(value: unknown, field: string): Transform2D {
  const input = readJsonObject(value, field)
  const transform = {
    translateX: readFiniteNumber(input.translateX, `${field}.translateX`),
    translateY: readFiniteNumber(input.translateY, `${field}.translateY`),
    rotation: readFiniteNumber(input.rotation, `${field}.rotation`),
    scaleX: readFiniteNumber(input.scaleX, `${field}.scaleX`),
    scaleY: readFiniteNumber(input.scaleY, `${field}.scaleY`),
  }
  if (transform.scaleX === 0 || transform.scaleY === 0) {
    throw new Error(`${field} scales must not be zero`)
  }
  return Object.freeze(transform)
}

function parseColor(value: unknown, field: string): ColorMetadata {
  const input = readJsonObject(value, field)
  const colorSpace = input.colorSpace
  if (
    colorSpace !== 'srgb' &&
    colorSpace !== 'display-p3' &&
    colorSpace !== 'unknown'
  ) {
    throw new Error(`${field}.colorSpace is invalid`)
  }
  const dpiX =
    input.dpiX === undefined
      ? undefined
      : readPositiveNumber(input.dpiX, `${field}.dpiX`)
  const dpiY =
    input.dpiY === undefined
      ? undefined
      : readPositiveNumber(input.dpiY, `${field}.dpiY`)
  return Object.freeze({
    colorSpace,
    hasIccProfile: readBoolean(input.hasIccProfile, `${field}.hasIccProfile`),
    ...(dpiX === undefined ? {} : { dpiX }),
    ...(dpiY === undefined ? {} : { dpiY }),
  })
}

function colorToJson(color: ColorMetadata): ColorMetadata & JsonObject {
  return Object.freeze({
    colorSpace: color.colorSpace,
    hasIccProfile: color.hasIccProfile,
    ...(color.dpiX === undefined ? {} : { dpiX: color.dpiX }),
    ...(color.dpiY === undefined ? {} : { dpiY: color.dpiY }),
  }) as ColorMetadata & JsonObject
}

function parseSource(value: unknown): SourceImageRef {
  const input = readJsonObject(value, 'source')
  if (!isImageFormat(input.format)) throw new Error('source.format is invalid')
  if (input.orientationApplied !== true) {
    throw new Error('source.orientationApplied must be true')
  }
  return Object.freeze({
    blobHash: readSha256(input.blobHash, 'source.blobHash'),
    format: input.format,
    mimeType: readNonEmptyString(input.mimeType, 'source.mimeType'),
    width: readPositiveNumber(input.width, 'source.width'),
    height: readPositiveNumber(input.height, 'source.height'),
    orientationApplied: true,
    color: parseColor(input.color, 'source.color'),
  })
}

function sourceToJson(source: SourceImageRef): JsonObject {
  return {
    blobHash: source.blobHash,
    format: source.format,
    mimeType: source.mimeType,
    width: source.width,
    height: source.height,
    orientationApplied: true,
    color: colorToJson(source.color),
  }
}

function parseRect(value: unknown, field: string): Rect {
  const input = readJsonObject(value, field)
  return Object.freeze({
    x: readFiniteNumber(input.x, `${field}.x`),
    y: readFiniteNumber(input.y, `${field}.y`),
    width: readPositiveNumber(input.width, `${field}.width`),
    height: readPositiveNumber(input.height, `${field}.height`),
  })
}

function rectToJson(rect: Rect): JsonObject {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

function parsePresentation(value: unknown): PresentationSettingsV1 {
  const input = readJsonObject(value, 'presentation')
  const beautify = readJsonObject(input.beautify, 'presentation.beautify')
  const watermark = readJsonObject(input.watermark, 'presentation.watermark')
  if (beautify.enabled !== false || watermark.enabled !== false) {
    throw new Error('presentation contains unsupported settings')
  }
  return DEFAULT_PRESENTATION_SETTINGS
}

function parseImagePayload(value: unknown, field: string): ImageLayerPayload {
  const input = readJsonObject(value, field)
  if (!isImageFormat(input.format))
    throw new Error(`${field}.format is invalid`)
  if (input.orientationApplied !== true) {
    throw new Error(`${field}.orientationApplied must be true`)
  }
  if (input.role !== 'base' && input.role !== 'content') {
    throw new Error(`${field}.role is invalid`)
  }
  const color = colorToJson(parseColor(input.color, `${field}.color`))
  const extras = collectExtras(input, [
    'blobHash',
    'intrinsicWidth',
    'intrinsicHeight',
    'format',
    'orientationApplied',
    'color',
    'role',
  ])
  return Object.freeze({
    ...(extras ?? {}),
    blobHash: readSha256(input.blobHash, `${field}.blobHash`),
    intrinsicWidth: readPositiveNumber(
      input.intrinsicWidth,
      `${field}.intrinsicWidth`,
    ),
    intrinsicHeight: readPositiveNumber(
      input.intrinsicHeight,
      `${field}.intrinsicHeight`,
    ),
    format: input.format,
    orientationApplied: true,
    color,
    role: input.role,
  })
}

function parseUnitInterval(value: unknown, field: string): number {
  const number = readFiniteNumber(value, field)
  if (number < 0 || number > 1) {
    throw new Error(`${field} must be between 0 and 1`)
  }
  return number
}

function parseSrgbColor(value: unknown, field: string): JsonObject {
  const input = readJsonObject(value, field)
  return Object.freeze({
    red: parseUnitInterval(input.red, `${field}.red`),
    green: parseUnitInterval(input.green, `${field}.green`),
    blue: parseUnitInterval(input.blue, `${field}.blue`),
    alpha: parseUnitInterval(input.alpha, `${field}.alpha`),
  })
}

function parsePointPayload(value: unknown, field: string): JsonObject {
  const input = readJsonObject(value, field)
  return Object.freeze({
    x: readFiniteNumber(input.x, `${field}.x`),
    y: readFiniteNumber(input.y, `${field}.y`),
  })
}

function parseStroke(value: unknown, field: string): JsonObject {
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
  const scale = readPositiveNumber(input.scale, `${field}.scale`)
  return Object.freeze({
    scale,
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
      const pattern = input.pattern
      if (
        pattern !== 'dots' &&
        pattern !== 'grid' &&
        pattern !== 'diagonal' &&
        pattern !== 'crosshatch' &&
        pattern !== 'checker'
      ) {
        throw new Error(`${field}.pattern is invalid`)
      }
      return Object.freeze({
        kind: 'pattern',
        pattern,
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
      ) {
        throw new Error(`${field}.format is invalid`)
      }
      if (
        input.fit !== 'repeat' &&
        input.fit !== 'fit' &&
        input.fit !== 'fill'
      ) {
        throw new Error(`${field}.fit is invalid`)
      }
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

function parseArrowPayload(value: unknown, field: string): ArrowLayerPayload {
  const input = readJsonObject(value, field)
  if (input.path !== 'straight' && input.path !== 'quadratic') {
    throw new Error(`${field}.path is invalid`)
  }
  const parseCap = (
    value: unknown,
    cap: string,
  ): 'none' | 'chevron' | 'triangle' | 'circle' => {
    if (
      value === 'none' ||
      value === 'chevron' ||
      value === 'triangle' ||
      value === 'circle'
    )
      return value
    throw new Error(`${field}.${cap} is invalid`)
  }
  const startCap = parseCap(input.startCap, 'startCap')
  const endCap = parseCap(input.endCap, 'endCap')
  if (input.path === 'quadratic' && input.bend === undefined) {
    throw new Error(`${field}.bend is required for a quadratic path`)
  }
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
    ...(input.bend === undefined
      ? {}
      : {
          bend: parsePointPayload(
            input.bend,
            `${field}.bend`,
          ) as ArrowLayerPayload['start'],
        }),
    stroke: parseStroke(
      input.stroke,
      `${field}.stroke`,
    ) as ArrowLayerPayload['stroke'],
    startCap,
    endCap,
  })
}

function parseShapePayload(value: unknown, field: string): ShapeLayerPayload {
  const input = readJsonObject(value, field)
  if (
    !['rectangle', 'circle', 'oval', 'diamond', 'star'].includes(
      String(input.shape),
    )
  ) {
    throw new Error(`${field}.shape is invalid`)
  }
  const fill = parseFill(input.fill, `${field}.fill`)
  const radius = readFiniteNumber(input.cornerRadius, `${field}.cornerRadius`)
  const starPoints = readFiniteNumber(input.starPoints, `${field}.starPoints`)
  const innerRatio = parseUnitInterval(
    input.starInnerRatio,
    `${field}.starInnerRatio`,
  )
  if (
    radius < 0 ||
    starPoints < 3 ||
    starPoints > 32 ||
    !Number.isInteger(starPoints)
  ) {
    throw new Error(`${field} geometry is invalid`)
  }
  return Object.freeze({
    shape: input.shape as ShapeLayerPayload['shape'],
    fill: fill as ShapeLayerPayload['fill'],
    stroke: parseStroke(
      input.stroke,
      `${field}.stroke`,
    ) as ShapeLayerPayload['stroke'],
    cornerRadius: radius,
    starPoints,
    starInnerRatio: innerRatio,
  })
}

function parseSampledPayload(
  value: unknown,
  field: string,
  marker: boolean,
): PencilLayerPayload | MarkerLayerPayload {
  const input = readJsonObject(value, field)
  if (!Array.isArray(input.points) || input.points.length === 0) {
    throw new Error(`${field}.points must not be empty`)
  }
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
  if (
    input.brush !== 'pen' &&
    input.brush !== 'pencil' &&
    input.brush !== 'brush'
  ) {
    throw new Error(`${field}.brush is invalid`)
  }
  return Object.freeze({ ...common, brush: input.brush }) as PencilLayerPayload
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
    default:
      return freezeJsonObject(value, field)
  }
}

function parseLayer(value: unknown, index: number): LayerNode {
  const field = `layers[${index}]`
  const input = readJsonObject(value, field)
  if (!isLayerKind(input.kind)) throw new Error(`${field}.kind is invalid`)
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
  const opacity = readFiniteNumber(input.opacity, `${field}.opacity`)
  if (opacity < 0 || opacity > 1) {
    throw new Error(`${field}.opacity must be between 0 and 1`)
  }
  const payload =
    input.kind === 'image'
      ? parseImagePayload(input.payload, `${field}.payload`)
      : parseDrawingPayload(input.kind, input.payload, `${field}.payload`)
  const blendMode = input.blendMode
  if (!isBlendMode(blendMode)) throw new Error(`${field}.blendMode is invalid`)
  if (!Array.isArray(input.shadows) || input.shadows.length > 4) {
    throw new Error(`${field}.shadows is invalid`)
  }
  const shadows = input.shadows.map((shadow, shadowIndex) => {
    const parsed = readJsonObject(shadow, `${field}.shadows[${shadowIndex}]`)
    const blur = readFiniteNumber(
      parsed.blur,
      `${field}.shadows[${shadowIndex}].blur`,
    )
    if (blur < 0)
      throw new Error(`${field}.shadows[${shadowIndex}].blur is invalid`)
    return Object.freeze({
      color: parseSrgbColor(
        parsed.color,
        `${field}.shadows[${shadowIndex}].color`,
      ),
      offsetX: readFiniteNumber(
        parsed.offsetX,
        `${field}.shadows[${shadowIndex}].offsetX`,
      ),
      offsetY: readFiniteNumber(
        parsed.offsetY,
        `${field}.shadows[${shadowIndex}].offsetY`,
      ),
      blur,
    })
  })
  return Object.freeze({
    id: readStableId(input.id, `${field}.id`),
    kind: input.kind,
    transform: parseTransform(input.transform, `${field}.transform`),
    ...(input.localBounds === undefined
      ? {}
      : { localBounds: parseRect(input.localBounds, `${field}.localBounds`) }),
    opacity,
    visible: readBoolean(input.visible, `${field}.visible`),
    locked: readBoolean(input.locked, `${field}.locked`),
    blendMode,
    shadows: Object.freeze(shadows),
    payload,
    ...(extras === undefined ? {} : { extras }),
  }) as LayerNode
}

function stableBaseLayerId(documentId: string, sourceHash: string): string {
  const seed = `${sourceHash.slice(0, 8)}-${sourceHash.slice(8, 12)}-7${sourceHash.slice(13, 16)}-8${sourceHash.slice(17, 20)}-${sourceHash.slice(20, 32)}`
  return seed === documentId ? documentId : seed
}

function migrateV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  const source = readJsonObject(raw.source, 'source')
  const layers = Array.isArray(raw.layers) ? raw.layers : []
  const baseId = stableBaseLayerId(
    readStableId(raw.id, 'id'),
    readSha256(source.blobHash, 'source.blobHash'),
  )
  const withBounds: Record<string, unknown>[] = layers.map((layer) => {
    const input = readJsonObject(layer, 'layer')
    return {
      ...input,
      localBounds: input.localBounds ?? { x: 0, y: 0, width: 1, height: 1 },
      ...(input.kind === 'image'
        ? {
            payload: {
              ...readJsonObject(input.payload, 'layer.payload'),
              role:
                readJsonObject(input.payload, 'layer.payload').role ??
                'content',
            },
          }
        : {}),
    }
  })
  const hasBase = withBounds.some((layer) => {
    const payload = layer.payload
    return (
      layer.kind === 'image' &&
      payload &&
      typeof payload === 'object' &&
      (payload as Record<string, unknown>).role === 'base'
    )
  })
  const base = {
    id: baseId,
    kind: 'image',
    localBounds: { x: 0, y: 0, width: source.width, height: source.height },
    transform: {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    opacity: 1,
    visible: true,
    locked: true,
    payload: {
      blobHash: source.blobHash,
      intrinsicWidth: source.width,
      intrinsicHeight: source.height,
      format: source.format,
      orientationApplied: true,
      color: source.color,
      role: 'base',
    },
  }
  return {
    ...raw,
    schemaVersion: 2,
    layers: hasBase ? withBounds : [base, ...withBounds],
  }
}

function migrateV2ToV3(raw: Record<string, unknown>): Record<string, unknown> {
  const layers = Array.isArray(raw.layers) ? raw.layers : []
  return {
    ...raw,
    schemaVersion: 3,
    layers: layers.map((layer) => {
      const input = readJsonObject(layer, 'layer')
      const bounds =
        input.localBounds && typeof input.localBounds === 'object'
          ? readJsonObject(input.localBounds, 'layer.localBounds')
          : { x: 0, y: 0, width: 1, height: 1 }
      const payload = readJsonObject(input.payload, 'layer.payload')
      return {
        ...input,
        localBounds: bounds,
        blendMode: input.blendMode ?? 'normal',
        shadows: input.shadows ?? [],
        payload: isLayerKind(input.kind)
          ? completeDrawingPayload(input.kind, payload, bounds)
          : payload,
      }
    }),
  }
}

function migrateV0ToV1(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    schemaVersion: 1,
    crop: raw.crop ?? null,
    presentation: raw.presentation ?? DEFAULT_PRESENTATION_SETTINGS,
  }
}

function migrateToCurrent(
  raw: Record<string, unknown>,
  schemaVersion: number,
): Record<string, unknown> {
  const v1 = schemaVersion === 0 ? migrateV0ToV1(raw) : raw
  const v2 = schemaVersion < 2 ? migrateV1ToV2(v1) : v1
  return schemaVersion < 3 ? migrateV2ToV3(v2) : v2
}

function documentToJson(document: EditorDocumentV1): JsonObject {
  const layers: readonly JsonObject[] = document.layers.map((layer) => ({
    ...(layer.extras ?? {}),
    id: layer.id,
    kind: layer.kind,
    transform: {
      translateX: layer.transform.translateX,
      translateY: layer.transform.translateY,
      rotation: layer.transform.rotation,
      scaleX: layer.transform.scaleX,
      scaleY: layer.transform.scaleY,
    },
    localBounds:
      layer.localBounds === undefined
        ? { x: 0, y: 0, width: 1, height: 1 }
        : rectToJson(layer.localBounds),
    opacity: layer.opacity,
    visible: layer.visible,
    locked: layer.locked,
    blendMode: layer.blendMode ?? 'normal',
    shadows: layer.shadows ?? [],
    payload: completeDrawingPayload(
      layer.kind,
      layer.payload,
      layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 },
    ),
  }))
  return {
    ...(document.extras ?? {}),
    schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
    id: document.id,
    source: sourceToJson(document.source),
    canvas: { width: document.canvas.width, height: document.canvas.height },
    crop: document.crop === null ? null : rectToJson(document.crop),
    layers,
    presentation: {
      beautify: { enabled: document.presentation.beautify.enabled },
      watermark: { enabled: document.presentation.watermark.enabled },
    },
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}

export function parseEditorDocument(
  input: string | JsonObject,
): ParsedEditorDocument {
  const raw = typeof input === 'string' ? (JSON.parse(input) as unknown) : input
  const object = readJsonObject(raw, 'document')
  const schemaVersion = readFiniteNumber(object.schemaVersion, 'schemaVersion')
  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
    throw new Error('schemaVersion must be a non-negative integer')
  }
  if (schemaVersion > EDITOR_DOCUMENT_SCHEMA_VERSION) {
    return Object.freeze({
      kind: 'readOnly',
      schemaVersion,
      raw: freezeJsonObject(object, 'document'),
      reason: 'newerSchema',
    })
  }

  const migrated = migrateToCurrent(object, schemaVersion)
  const canvas = readJsonObject(migrated.canvas, 'canvas')
  const canvasSize = Object.freeze({
    width: readPositiveNumber(canvas.width, 'canvas.width'),
    height: readPositiveNumber(canvas.height, 'canvas.height'),
  })
  if (!Array.isArray(migrated.layers))
    throw new Error('layers must be an array')
  const source = parseSource(migrated.source)
  const layers = migrated.layers.map((layer, index) => parseLayer(layer, index))
  const ids = new Set<string>()
  let baseCount = 0
  for (const layer of layers) {
    if (ids.has(layer.id)) throw new Error(`duplicate layer id: ${layer.id}`)
    ids.add(layer.id)
    if (layer.kind === 'image' && layer.payload.role === 'base') {
      baseCount += 1
      if (layer.payload.blobHash !== source.blobHash) {
        throw new Error('base layer must reference source.blobHash')
      }
    }
  }
  if (baseCount > 1)
    throw new Error('document must not contain more than one base layer')
  const crop =
    migrated.crop === null || migrated.crop === undefined
      ? null
      : parseRect(migrated.crop, 'crop')
  if (
    crop !== null &&
    (crop.x < 0 ||
      crop.y < 0 ||
      crop.x + crop.width > canvasSize.width ||
      crop.y + crop.height > canvasSize.height)
  ) {
    throw new Error('crop must remain inside canvas')
  }
  const extras = collectExtras(migrated, [
    'schemaVersion',
    'id',
    'source',
    'canvas',
    'crop',
    'layers',
    'presentation',
    'createdAt',
    'updatedAt',
  ])
  const document: EditorDocumentV1 = {
    schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
    id: readStableId(migrated.id, 'id'),
    source,
    canvas: canvasSize,
    crop,
    layers: Object.freeze(layers),
    presentation: parsePresentation(migrated.presentation),
    createdAt: readNonEmptyString(migrated.createdAt, 'createdAt'),
    updatedAt: readNonEmptyString(migrated.updatedAt, 'updatedAt'),
    ...(extras === undefined ? {} : { extras }),
  }
  return Object.freeze({ kind: 'editable', document: Object.freeze(document) })
}

export function normalizeEditorDocument(
  document: EditorDocumentV1,
): EditorDocumentV1 {
  const parsed = parseEditorDocument(documentToJson(document))
  if (parsed.kind !== 'editable') {
    throw new Error('current schema unexpectedly read-only')
  }
  return parsed.document
}

export function serializeEditorDocument(document: EditorDocumentV1): string {
  return JSON.stringify(documentToJson(normalizeEditorDocument(document)))
}
