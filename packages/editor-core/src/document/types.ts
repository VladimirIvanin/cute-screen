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

export const LAYER_KINDS = [
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
] as const

export type LayerKind = (typeof LAYER_KINDS)[number]

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
