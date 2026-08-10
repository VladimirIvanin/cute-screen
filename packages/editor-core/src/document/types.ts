/** M07 adds portable content-layer payloads and source provenance. */
export const EDITOR_DOCUMENT_SCHEMA_VERSION = 4 as const

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

export interface SrgbColor extends JsonObject {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
}

export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'softLight',
  'hardLight',
] as const

export type BlendMode = (typeof BLEND_MODES)[number]

export interface ShadowStyle extends JsonObject {
  readonly color: SrgbColor
  readonly offsetX: number
  readonly offsetY: number
  readonly blur: number
}

export interface GradientStop extends JsonObject {
  readonly position: number
  readonly color: SrgbColor
}

export interface PaintTransform extends JsonObject {
  readonly scale: number
  readonly rotation: number
  readonly offsetX: number
  readonly offsetY: number
}

export type FillPaint =
  | Readonly<{ readonly kind: 'none' }>
  | Readonly<{
      readonly kind: 'solid'
      readonly color: SrgbColor
      readonly opacity: number
    }>
  | Readonly<{
      readonly kind: 'linearGradient'
      readonly stops: readonly GradientStop[]
      readonly start: Point
      readonly end: Point
      readonly opacity: number
    }>
  | Readonly<{
      readonly kind: 'radialGradient'
      readonly stops: readonly GradientStop[]
      readonly center: Point
      readonly radius: number
      readonly opacity: number
    }>
  | Readonly<{
      readonly kind: 'pattern'
      readonly pattern: 'dots' | 'grid' | 'diagonal' | 'crosshatch' | 'checker'
      readonly color: SrgbColor
      readonly background: SrgbColor
      readonly transform: PaintTransform
      readonly opacity: number
    }>
  | Readonly<{
      readonly kind: 'imageTexture'
      readonly blobHash: string
      readonly format: 'png' | 'jpeg' | 'webp'
      readonly intrinsicWidth: number
      readonly intrinsicHeight: number
      readonly fit: 'repeat' | 'fit' | 'fill'
      readonly transform: PaintTransform
      readonly opacity: number
    }>

export interface StrokeStyle extends JsonObject {
  readonly color: SrgbColor
  readonly width: number
  readonly style: 'solid' | 'dashed' | 'dotted'
  readonly cap: 'butt' | 'round' | 'square'
  readonly join: 'miter' | 'round' | 'bevel'
}

export interface SampledPoint extends JsonObject {
  readonly x: number
  readonly y: number
  readonly pressure: number
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
  /** Ingress flow; legacy factories may omit it, but the v4 codec always emits it. */
  readonly provenance?: 'capture' | 'fileOpen' | 'clipboard'
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
  /** Bounds in the node's untransformed local coordinate system. */
  readonly localBounds?: Rect
  readonly opacity: number
  readonly visible: boolean
  readonly locked: boolean
  /** Applied after the layer's fill, stroke and shadows are grouped. */
  readonly blendMode?: BlendMode
  /** Bounded by the document codec to keep preview/export deterministic. */
  readonly shadows?: readonly ShadowStyle[]
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
  /** v2 makes the original screenshot an ordinary, locked-by-default image. */
  readonly role: 'base' | 'content'
  readonly border?: StrokeStyle | null
  readonly radius?: number
  /** Reserved schema fields; crop/mask UI is intentionally outside M07. */
  readonly crop?: null
  readonly mask?: null
}

export interface FontReference extends JsonObject {
  readonly source: 'bundled' | 'system'
  readonly family: string
  readonly postscriptName?: string
  readonly weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
  readonly style: 'normal' | 'italic'
}

export interface RichTextSpan extends JsonObject {
  /** UTF-16 offsets; codec rejects offsets that split a surrogate pair. */
  readonly start: number
  readonly end: number
  readonly fontSize?: number
  readonly weight?: FontReference['weight']
  readonly italic?: boolean
  readonly underline?: boolean
  readonly letterSpacing?: number
}

export interface RichTextParagraph extends JsonObject {
  readonly start: number
  readonly end: number
  readonly alignment: 'start' | 'center' | 'end' | 'justify'
  readonly lineHeight?: number
}

export interface RichTextContent extends JsonObject {
  readonly text: string
  readonly wrap: 'autoSize' | 'fixedWidth'
  readonly fixedWidth?: number
  readonly spans: readonly RichTextSpan[]
  readonly paragraphs: readonly RichTextParagraph[]
}

export interface TextOutline extends JsonObject {
  readonly stroke: StrokeStyle
  readonly position: 'center' | 'outside'
}

export interface TextBackground extends JsonObject {
  readonly fill: FillPaint & JsonObject
  readonly padding: number
  readonly radius: number
}

export interface TextLayerPayload extends JsonObject {
  readonly content: RichTextContent
  readonly font: FontReference
  readonly fill: FillPaint & JsonObject
  readonly outline: TextOutline | null
  readonly background: TextBackground | null
}

export interface NumberedMarkerPayload extends JsonObject {
  readonly sequence: number
  readonly shape: 'circle' | 'square' | 'diamond' | 'star'
  readonly label: RichTextContent
  readonly fill: FillPaint & JsonObject
  readonly outline: TextOutline | null
}

export interface CalloutPayload extends JsonObject {
  readonly content: RichTextContent
  readonly font: FontReference
  readonly fill: FillPaint & JsonObject
  readonly outline: TextOutline | null
  readonly padding: number
  readonly radius: number
  readonly tailAnchor: Point & JsonObject
}

export interface EmojiAssetReference extends JsonObject {
  readonly collection: 'notoEmoji'
  readonly version: string
  readonly assetId: string
}

export interface EmojiPayload extends JsonObject {
  readonly grapheme: string
  readonly asset: EmojiAssetReference
}

export interface ArrowLayerPayload extends JsonObject {
  readonly path: 'straight' | 'quadratic'
  readonly start: Point & JsonObject
  readonly end: Point & JsonObject
  readonly bend?: Point & JsonObject
  readonly stroke: StrokeStyle
  readonly startCap: 'none' | 'chevron' | 'triangle' | 'circle'
  readonly endCap: 'none' | 'chevron' | 'triangle' | 'circle'
}

export interface ShapeLayerPayload extends JsonObject {
  readonly shape: 'rectangle' | 'circle' | 'oval' | 'diamond' | 'star'
  readonly fill: FillPaint & JsonObject
  readonly stroke: StrokeStyle
  readonly cornerRadius: number
  readonly starPoints: number
  readonly starInnerRatio: number
}

export interface PencilLayerPayload extends JsonObject {
  readonly points: readonly SampledPoint[]
  readonly brush: 'pen' | 'pencil' | 'brush'
  readonly width: number
  readonly color: SrgbColor
  readonly smoothing: number
}

export interface MarkerLayerPayload extends JsonObject {
  readonly points: readonly SampledPoint[]
  readonly width: number
  readonly color: SrgbColor
  readonly smoothing: number
}

/** Payload-specific contracts are validated by the v4 codec; legacy aliases stay broad for migration input. */
export type ArrowLayer = LayerBase<'arrow', JsonObject>
export type ShapeLayer = LayerBase<'shape', JsonObject>
export type PencilLayer = LayerBase<'pencil', JsonObject>
export type MarkerLayer = LayerBase<'marker', JsonObject>
export type TextLayer = LayerBase<'text', TextLayerPayload>
export type NumberedMarkerLayer = LayerBase<
  'numberedMarker',
  NumberedMarkerPayload
>
export type CalloutLayer = LayerBase<'callout', CalloutPayload>
export type CensorLayer = LayerBase<'censor', JsonObject>
export type SpotlightLayer = LayerBase<'spotlight', JsonObject>
export type RulerLayer = LayerBase<'ruler', JsonObject>
export type LoupeLayer = LayerBase<'loupe', JsonObject>
export type EmojiLayer = LayerBase<'emoji', EmojiPayload>
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
  /** Compatibility input type; parsed documents always use the current schema. */
  readonly schemaVersion: 1 | 2 | 3 | typeof EDITOR_DOCUMENT_SCHEMA_VERSION
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

export interface EditorDocumentV2 extends Omit<
  EditorDocumentV1,
  'schemaVersion' | 'layers'
> {
  readonly schemaVersion: 2
  readonly layers: readonly LayerNode[]
}

export interface EditorDocumentV3 extends Omit<
  EditorDocumentV1,
  'schemaVersion' | 'layers'
> {
  readonly schemaVersion: 3
  /** v3 persistence never permits implicit geometry/effect defaults. */
  readonly layers: readonly (LayerNode &
    Readonly<{
      readonly localBounds: Rect
      readonly blendMode: BlendMode
      readonly shadows: readonly ShadowStyle[]
    }>)[]
}

export interface EditorDocumentV4 extends Omit<
  EditorDocumentV1,
  'schemaVersion' | 'layers'
> {
  readonly schemaVersion: typeof EDITOR_DOCUMENT_SCHEMA_VERSION
  readonly layers: readonly (LayerNode &
    Readonly<{
      readonly localBounds: Rect
      readonly blendMode: BlendMode
      readonly shadows: readonly ShadowStyle[]
    }>)[]
}

/** Current editable document contract. */
export type EditorDocument = EditorDocumentV4

export type ParsedEditorDocument =
  | Readonly<{ kind: 'editable'; document: EditorDocumentV1 }>
  | Readonly<{
      kind: 'readOnly'
      schemaVersion: number
      raw: JsonObject
      reason: 'newerSchema'
    }>
