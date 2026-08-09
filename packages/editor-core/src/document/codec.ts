import { collectExtras, freezeJsonObject, readJsonObject } from './json'
import {
  DEFAULT_PRESENTATION_SETTINGS,
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  LAYER_KINDS,
  type ColorMetadata,
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
  const color = colorToJson(parseColor(input.color, `${field}.color`))
  const extras = collectExtras(input, [
    'blobHash',
    'intrinsicWidth',
    'intrinsicHeight',
    'format',
    'orientationApplied',
    'color',
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
  })
}

function parseLayer(value: unknown, index: number): LayerNode {
  const field = `layers[${index}]`
  const input = readJsonObject(value, field)
  if (!isLayerKind(input.kind)) throw new Error(`${field}.kind is invalid`)
  const extras = collectExtras(input, [
    'id',
    'kind',
    'transform',
    'opacity',
    'visible',
    'locked',
    'payload',
  ])
  const opacity = readFiniteNumber(input.opacity, `${field}.opacity`)
  if (opacity < 0 || opacity > 1) {
    throw new Error(`${field}.opacity must be between 0 and 1`)
  }
  const payload =
    input.kind === 'image'
      ? parseImagePayload(input.payload, `${field}.payload`)
      : freezeJsonObject(input.payload, `${field}.payload`)
  return Object.freeze({
    id: readStableId(input.id, `${field}.id`),
    kind: input.kind,
    transform: parseTransform(input.transform, `${field}.transform`),
    opacity,
    visible: readBoolean(input.visible, `${field}.visible`),
    locked: readBoolean(input.locked, `${field}.locked`),
    payload,
    ...(extras === undefined ? {} : { extras }),
  }) as LayerNode
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
  return schemaVersion === 0 ? migrateV0ToV1(raw) : raw
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
    opacity: layer.opacity,
    visible: layer.visible,
    locked: layer.locked,
    payload: layer.payload,
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
  const layers = migrated.layers.map((layer, index) => parseLayer(layer, index))
  const ids = new Set<string>()
  for (const layer of layers) {
    if (ids.has(layer.id)) throw new Error(`duplicate layer id: ${layer.id}`)
    ids.add(layer.id)
  }
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
    source: parseSource(migrated.source),
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
