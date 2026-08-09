export const EDITOR_DOCUMENT_SCHEMA_VERSION = 1 as const

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject
export interface JsonObject {
  readonly [key: string]: JsonValue
}

export interface Point {
  readonly x: number
  readonly y: number
}

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface Transform2D {
  readonly translateX: number
  readonly translateY: number
  readonly rotation: number
  readonly scaleX: number
  readonly scaleY: number
}

export interface Matrix2D {
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
  readonly e: number
  readonly f: number
}

export interface ColorMetadata {
  readonly colorSpace: 'srgb' | 'display-p3' | 'unknown'
  readonly hasIccProfile: boolean
  readonly dpiX?: number
  readonly dpiY?: number
}

export interface SourceImageRef {
  readonly blobHash: string
  readonly format: 'png' | 'jpeg' | 'webp' | 'svg'
  readonly mimeType: string
  readonly width: number
  readonly height: number
  readonly orientationApplied: true
  readonly color: ColorMetadata
}

export interface PresentationSettingsV1 {
  readonly beautify: Readonly<{ enabled: false }>
  readonly watermark: Readonly<{ enabled: false }>
}

export const DEFAULT_PRESENTATION_SETTINGS: PresentationSettingsV1 =
  Object.freeze({
    beautify: Object.freeze({ enabled: false }),
    watermark: Object.freeze({ enabled: false }),
  })

export type LayerKind =
  | 'arrow'
  | 'shape'
  | 'pencil'
  | 'marker'
  | 'text'
  | 'numberedMarker'
  | 'callout'
  | 'censor'
  | 'spotlight'
  | 'ruler'
  | 'loupe'
  | 'emoji'
  | 'image'

export interface LayerBase<K extends LayerKind, P extends JsonObject> {
  readonly id: string
  readonly kind: K
  readonly transform: Transform2D
  readonly opacity: number
  readonly visible: boolean
  readonly locked: boolean
  readonly payload: P
  /** Future fields are retained verbatim during parse/serialize round-trips. */
  readonly extras?: JsonObject
}

export interface ImageLayerPayload extends JsonObject {
  readonly blobHash: string
  readonly intrinsicWidth: number
  readonly intrinsicHeight: number
  readonly format: 'png' | 'jpeg' | 'webp' | 'svg'
  readonly orientationApplied: true
  readonly color: ColorMetadata & JsonObject
}

export type ArrowLayer = LayerBase<'arrow', JsonObject>
export type ShapeLayer = LayerBase<'shape', JsonObject>
export type PencilLayer = LayerBase<'pencil', JsonObject>
export type MarkerLayer = LayerBase<'marker', JsonObject>
export type TextLayer = LayerBase<'text', JsonObject>
export type NumberedMarkerLayer = LayerBase<'numberedMarker', JsonObject>
export type CalloutLayer = LayerBase<'callout', JsonObject>
export type CensorLayer = LayerBase<'censor', JsonObject>
export type SpotlightLayer = LayerBase<'spotlight', JsonObject>
export type RulerLayer = LayerBase<'ruler', JsonObject>
export type LoupeLayer = LayerBase<'loupe', JsonObject>
export type EmojiLayer = LayerBase<'emoji', JsonObject>
export type ImageLayer = LayerBase<'image', ImageLayerPayload>

export type LayerNode =
  | ArrowLayer
  | ShapeLayer
  | PencilLayer
  | MarkerLayer
  | TextLayer
  | NumberedMarkerLayer
  | CalloutLayer
  | CensorLayer
  | SpotlightLayer
  | RulerLayer
  | LoupeLayer
  | EmojiLayer
  | ImageLayer

export interface EditorDocumentV1 {
  readonly schemaVersion: typeof EDITOR_DOCUMENT_SCHEMA_VERSION
  readonly id: string
  readonly source: SourceImageRef
  readonly canvas: Readonly<{ width: number; height: number }>
  readonly crop: Rect | null
  /** Array order is the authoritative back-to-front z-order. */
  readonly layers: readonly LayerNode[]
  readonly presentation: PresentationSettingsV1
  readonly createdAt: string
  readonly updatedAt: string
  readonly extras?: JsonObject
}

export type ParsedEditorDocument =
  | Readonly<{ kind: 'editable'; document: EditorDocumentV1 }>
  | Readonly<{
      kind: 'readOnly'
      schemaVersion: number
      raw: JsonObject
      reason: 'newerSchema'
    }>

const layerKinds = new Set<LayerKind>([
  'arrow',
  'shape',
  'pencil',
  'marker',
  'text',
  'numberedMarker',
  'callout',
  'censor',
  'spotlight',
  'ruler',
  'loupe',
  'emoji',
  'image',
])

function isObject(
  value: JsonValue | unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${field} must be an object`)
  return value
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${field} must be a non-empty string`)
  return value
}

function finite(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${field} must be a finite number`)
  return value
}

function positive(value: unknown, field: string): number {
  const result = finite(value, field)
  if (result <= 0) throw new Error(`${field} must be positive`)
  return result
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} must be boolean`)
  return value
}

function jsonObject(value: unknown, field: string): JsonObject {
  const source = asObject(value, field)
  return Object.freeze({ ...source }) as JsonObject
}

function extras(
  source: Record<string, unknown>,
  known: readonly string[],
): JsonObject | undefined {
  const result: Record<string, JsonValue> = {}
  for (const [key, value] of Object.entries(source)) {
    if (!known.includes(key)) result[key] = value as JsonValue
  }
  return Object.keys(result).length === 0 ? undefined : Object.freeze(result)
}

function parseTransform(value: unknown, field: string): Transform2D {
  const input = asObject(value, field)
  const transform = {
    translateX: finite(input.translateX, `${field}.translateX`),
    translateY: finite(input.translateY, `${field}.translateY`),
    rotation: finite(input.rotation, `${field}.rotation`),
    scaleX: finite(input.scaleX, `${field}.scaleX`),
    scaleY: finite(input.scaleY, `${field}.scaleY`),
  }
  if (transform.scaleX === 0 || transform.scaleY === 0)
    throw new Error(`${field} scales must not be zero`)
  return Object.freeze(transform)
}

function parseColor(value: unknown, field: string): ColorMetadata {
  const input = asObject(value, field)
  const colorSpace = input.colorSpace
  if (
    colorSpace !== 'srgb' &&
    colorSpace !== 'display-p3' &&
    colorSpace !== 'unknown'
  )
    throw new Error(`${field}.colorSpace is invalid`)
  const dpiX =
    input.dpiX === undefined ? undefined : positive(input.dpiX, `${field}.dpiX`)
  const dpiY =
    input.dpiY === undefined ? undefined : positive(input.dpiY, `${field}.dpiY`)
  return Object.freeze({
    colorSpace,
    hasIccProfile: boolean(input.hasIccProfile, `${field}.hasIccProfile`),
    ...(dpiX === undefined ? {} : { dpiX }),
    ...(dpiY === undefined ? {} : { dpiY }),
  })
}

function parseSource(value: unknown): SourceImageRef {
  const input = asObject(value, 'source')
  const format = input.format
  if (
    format !== 'png' &&
    format !== 'jpeg' &&
    format !== 'webp' &&
    format !== 'svg'
  )
    throw new Error('source.format is invalid')
  if (input.orientationApplied !== true)
    throw new Error('source.orientationApplied must be true')
  return Object.freeze({
    blobHash: string(input.blobHash, 'source.blobHash'),
    format,
    mimeType: string(input.mimeType, 'source.mimeType'),
    width: positive(input.width, 'source.width'),
    height: positive(input.height, 'source.height'),
    orientationApplied: true,
    color: parseColor(input.color, 'source.color'),
  })
}

function parseRect(value: unknown, field: string): Rect {
  const input = asObject(value, field)
  return Object.freeze({
    x: finite(input.x, `${field}.x`),
    y: finite(input.y, `${field}.y`),
    width: positive(input.width, `${field}.width`),
    height: positive(input.height, `${field}.height`),
  })
}

function parseLayer(value: unknown, index: number): LayerNode {
  const input = asObject(value, `layers[${index}]`)
  const kind = input.kind
  if (typeof kind !== 'string' || !layerKinds.has(kind as LayerKind))
    throw new Error(`layers[${index}].kind is invalid`)
  const payload = jsonObject(input.payload, `layers[${index}].payload`)
  const common = {
    id: string(input.id, `layers[${index}].id`),
    kind: kind as LayerKind,
    transform: parseTransform(input.transform, `layers[${index}].transform`),
    opacity: finite(input.opacity, `layers[${index}].opacity`),
    visible: boolean(input.visible, `layers[${index}].visible`),
    locked: boolean(input.locked, `layers[${index}].locked`),
    payload,
    ...(extras(input, [
      'id',
      'kind',
      'transform',
      'opacity',
      'visible',
      'locked',
      'payload',
    ])
      ? {
          extras: extras(input, [
            'id',
            'kind',
            'transform',
            'opacity',
            'visible',
            'locked',
            'payload',
          ]),
        }
      : {}),
  }
  if (common.opacity < 0 || common.opacity > 1)
    throw new Error(`layers[${index}].opacity must be between 0 and 1`)
  if (kind === 'image') {
    const image = payload as unknown as Record<string, unknown>
    if (image.orientationApplied !== true)
      throw new Error(
        `layers[${index}].payload.orientationApplied must be true`,
      )
    parseColor(image.color, `layers[${index}].payload.color`)
    positive(image.intrinsicWidth, `layers[${index}].payload.intrinsicWidth`)
    positive(image.intrinsicHeight, `layers[${index}].payload.intrinsicHeight`)
    string(image.blobHash, `layers[${index}].payload.blobHash`)
  }
  return Object.freeze(common) as LayerNode
}

function migrate(
  raw: Record<string, unknown>,
  schemaVersion: number,
): Record<string, unknown> {
  if (schemaVersion === 0) {
    return {
      ...raw,
      schemaVersion: 1,
      crop: raw.crop ?? null,
      presentation: raw.presentation ?? DEFAULT_PRESENTATION_SETTINGS,
    }
  }
  return raw
}

export function parseEditorDocument(
  input: string | JsonObject,
): ParsedEditorDocument {
  const raw = typeof input === 'string' ? (JSON.parse(input) as unknown) : input
  const object = asObject(raw, 'document')
  const schemaVersion = finite(object.schemaVersion, 'schemaVersion')
  if (!Number.isInteger(schemaVersion) || schemaVersion < 0)
    throw new Error('schemaVersion must be a non-negative integer')
  if (schemaVersion > EDITOR_DOCUMENT_SCHEMA_VERSION) {
    return Object.freeze({
      kind: 'readOnly',
      schemaVersion,
      raw: Object.freeze({ ...object }) as JsonObject,
      reason: 'newerSchema',
    })
  }
  const migrated = migrate(object, schemaVersion)
  const canvas = asObject(migrated.canvas, 'canvas')
  const layersInput = migrated.layers
  if (!Array.isArray(layersInput)) throw new Error('layers must be an array')
  const layers = layersInput.map((layer, index) => parseLayer(layer, index))
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
    crop &&
    (crop.x < 0 ||
      crop.y < 0 ||
      crop.x + crop.width > positive(canvas.width, 'canvas.width') ||
      crop.y + crop.height > positive(canvas.height, 'canvas.height'))
  )
    throw new Error('crop must remain inside canvas')
  const documentExtras = extras(migrated, [
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
    id: string(migrated.id, 'id'),
    source: parseSource(migrated.source),
    canvas: Object.freeze({
      width: positive(canvas.width, 'canvas.width'),
      height: positive(canvas.height, 'canvas.height'),
    }),
    crop,
    layers: Object.freeze(layers),
    presentation: DEFAULT_PRESENTATION_SETTINGS,
    createdAt: string(migrated.createdAt, 'createdAt'),
    updatedAt: string(migrated.updatedAt, 'updatedAt'),
    ...(documentExtras ? { extras: documentExtras } : {}),
  }
  return Object.freeze({ kind: 'editable', document: Object.freeze(document) })
}

function documentJson(document: EditorDocumentV1): JsonObject {
  const layerJson = document.layers.map((layer) => ({
    ...(layer.extras ?? {}),
    id: layer.id,
    kind: layer.kind,
    transform: layer.transform,
    opacity: layer.opacity,
    visible: layer.visible,
    locked: layer.locked,
    payload: layer.payload,
  }))
  return {
    ...(document.extras ?? {}),
    schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
    id: document.id,
    source: document.source as unknown as JsonObject,
    canvas: document.canvas as unknown as JsonObject,
    crop: document.crop as unknown as JsonValue,
    layers: layerJson as unknown as JsonValue,
    presentation: document.presentation as unknown as JsonObject,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}

export function serializeEditorDocument(document: EditorDocumentV1): string {
  const parsed = parseEditorDocument(documentJson(document))
  if (parsed.kind !== 'editable')
    throw new Error('current schema unexpectedly read-only')
  return JSON.stringify(documentJson(parsed.document))
}

export function transformToMatrix(transform: Transform2D): Matrix2D {
  const cosine = Math.cos(transform.rotation)
  const sine = Math.sin(transform.rotation)
  return Object.freeze({
    a: cosine * transform.scaleX,
    b: sine * transform.scaleX,
    c: -sine * transform.scaleY,
    d: cosine * transform.scaleY,
    e: transform.translateX,
    f: transform.translateY,
  })
}

export function multiplyMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
  return Object.freeze({
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  })
}

export function invertMatrix(matrix: Matrix2D): Matrix2D {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (!Number.isFinite(determinant) || determinant === 0)
    throw new Error('matrix is not invertible')
  return Object.freeze({
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  })
}

export function transformPoint(matrix: Matrix2D, point: Point): Point {
  return Object.freeze({
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  })
}
