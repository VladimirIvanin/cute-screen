/** v7 is the only editable persisted document schema. */
export const EDITOR_DOCUMENT_SCHEMA_VERSION = 7 as const

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
  /** Ingress flow; all v7 persistence factories emit it. */
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
  readonly localBounds: Rect
  readonly visible: boolean
  readonly locked: boolean
  readonly payload: P
  /** Future fields are retained verbatim during parse/serialize round-trips. */
  readonly extras?: JsonObject
}

/** Text-bearing v7 layers intentionally cannot persist common visual effects. */
export type TextBearingLayerBase<
  K extends 'text' | 'numberedMarker' | 'callout',
  P extends JsonObject,
> = LayerBase<K, P>

export interface CompositedLayerBase<
  K extends Exclude<LayerKind, 'text' | 'numberedMarker' | 'callout'>,
  P extends JsonObject,
> extends LayerBase<K, P> {
  readonly opacity: number
  /** Applied after the layer's fill, stroke and shadows are grouped. */
  readonly blendMode: BlendMode
  /** Bounded by the document codec to keep preview/export deterministic. */
  readonly shadows: readonly ShadowStyle[]
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

export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900

export type RichTextSpan = Readonly<{
  /** UTF-16 offsets; codec rejects offsets that split a surrogate pair. */
  readonly start: number
  readonly end: number
  readonly fontFamily: string
  readonly fontSize: number
  readonly color: SrgbColor
  readonly weight: FontWeight
  readonly italic: boolean
  readonly strikethrough: boolean
}>

export type RichTextParagraph = Readonly<{
  readonly start: number
  readonly end: number
  readonly alignment: 'start' | 'center' | 'end'
  readonly listKind: 'none' | 'bullet'
}>

export type RichTextContent = Readonly<{
  readonly text: string
  readonly wrap: 'autoSize' | 'fixedWidth'
  readonly fixedWidth?: number
  readonly spans: readonly RichTextSpan[]
  readonly paragraphs: readonly RichTextParagraph[]
}>

export type TextBackground = Readonly<{
  readonly color: SrgbColor
  readonly padding: number
  readonly radius: number
}>

export type TextLayerPayload = Readonly<{
  readonly content: RichTextContent
  readonly background: TextBackground | null
}>

export type NumberedMarkerBadge = Readonly<{
  readonly shape: 'circle' | 'square' | 'diamond' | 'star'
  readonly color: SrgbColor
}>

export type NumberedMarkerPayload = Readonly<{
  readonly sequence: number
  readonly label: RichTextContent
  readonly badge: NumberedMarkerBadge
}>

export type CalloutPayload = Readonly<{
  readonly content: RichTextContent
  readonly bubble: TextBackground
  readonly tailAnchor: Point & JsonObject
}>

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
  readonly path: 'straight' | 'quadratic' | 'elbow'
  readonly start: Point & JsonObject
  readonly end: Point & JsonObject
  readonly bend?: Point & JsonObject
  readonly elbow?: Readonly<{
    readonly axis: 'x' | 'y'
    /** Signed displacement of the middle segment from the endpoint midpoint. */
    readonly offset: number
  }> &
    JsonObject
  readonly stroke: StrokeStyle
  readonly startCap: ArrowCap
  readonly endCap: ArrowCap
}

export const ARROW_CAPS = [
  'none',
  'lineArrow',
  'solidArrow',
  'triangle',
  'circle',
  'diamond',
] as const

export type ArrowCap = (typeof ARROW_CAPS)[number]

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

export const CENSOR_MODES = ['pixelate', 'blur', 'solid'] as const
export type CensorMode = (typeof CENSOR_MODES)[number]

export type CensorRegion =
  | Readonly<{ readonly kind: 'rectangle' }>
  | Readonly<{
      readonly kind: 'freeform'
      /** An implicitly closed, simple polygon in layer-local coordinates. */
      readonly points: readonly (Point & JsonObject)[]
    }>

export type CensorEffect =
  | Readonly<{ readonly mode: 'pixelate'; readonly blockSize: number }>
  | Readonly<{ readonly mode: 'blur'; readonly strength: number }>
  | Readonly<{ readonly mode: 'solid'; readonly color: SrgbColor }>

export type CensorLayerPayload = Readonly<{
  readonly region: CensorRegion & JsonObject
  readonly effect: CensorEffect & JsonObject
  /** The renderer samples only nodes preceding this layer in z-order. */
  readonly sampleSource: 'compositeBelow'
}>

export const SPOTLIGHT_SHAPES = ['rectangle', 'ellipse', 'diamond'] as const
export type SpotlightShape = (typeof SPOTLIGHT_SHAPES)[number]
export const SPOTLIGHT_FEATHER_PRESETS = ['soft', 'strong'] as const
export type SpotlightFeatherPreset = (typeof SPOTLIGHT_FEATHER_PRESETS)[number]

export type SpotlightLayerPayload = Readonly<{
  readonly shape: SpotlightShape
  readonly dimColor: SrgbColor
  readonly dimOpacity: number
  /** `null` means a hard aperture edge. */
  readonly feather: SpotlightFeatherPreset | null
}>

export const RULER_UNITS = ['pixels', 'percent'] as const
export type RulerUnit = (typeof RULER_UNITS)[number]

export const DEFAULT_RULER_COLOR: SrgbColor = Object.freeze({
  red: 227 / 255,
  green: 72 / 255,
  blue: 143 / 255,
  alpha: 1,
})
export const DEFAULT_RULER_THICKNESS = 2
export const DEFAULT_RULER_FONT_SIZE = 14
export const RULER_THICKNESS_BOUNDS = Object.freeze({ min: 1, max: 12 })
export const RULER_FONT_SIZE_BOUNDS = Object.freeze({ min: 10, max: 48 })

export type RulerLayerPayload = Readonly<{
  readonly start: Point & JsonObject
  readonly end: Point & JsonObject
  readonly unit: RulerUnit
  /** Percent length is relative to hypot(canvas.width, canvas.height). */
  readonly percentBasis: 'canvasDiagonal'
  readonly snapAngleIncrementDegrees: number
  readonly color: SrgbColor
  readonly thickness: number
  readonly fontSize: number
}>

export const LOUPE_SHAPES = ['circle', 'rectangle'] as const
export type LoupeShape = (typeof LOUPE_SHAPES)[number]

export interface LoupeLens extends JsonObject {
  readonly shape: LoupeShape
  readonly size: number
}

export interface LoupeBorder extends JsonObject {
  readonly color: SrgbColor
  readonly width: number
}

export type LoupeLayerPayload = Readonly<{
  /** Canvas-space sampling rect, intentionally independent from lens movement. */
  readonly sourceRegion: Rect & JsonObject
  /** Destination geometry; layer transform/localBounds place the lens. */
  readonly lens: LoupeLens
  readonly zoom: number
  readonly border: LoupeBorder
  readonly shadow: ShadowStyle | null
  /** Prevents the lens from recursively sampling itself or higher layers. */
  readonly sampleSource: 'compositeBelow'
}>

/** Payload-specific contracts are validated by the current codec. */
export type ArrowLayer = CompositedLayerBase<'arrow', ArrowLayerPayload>
export type ShapeLayer = CompositedLayerBase<'shape', JsonObject>
export type PencilLayer = CompositedLayerBase<'pencil', JsonObject>
export type MarkerLayer = CompositedLayerBase<'marker', JsonObject>
export type TextLayer = TextBearingLayerBase<'text', TextLayerPayload>
export type NumberedMarkerLayer = TextBearingLayerBase<
  'numberedMarker',
  NumberedMarkerPayload
>
export type CalloutLayer = TextBearingLayerBase<'callout', CalloutPayload>
export type CensorLayer = CompositedLayerBase<'censor', CensorLayerPayload>
export type SpotlightLayer = CompositedLayerBase<
  'spotlight',
  SpotlightLayerPayload
>
export type RulerLayer = CompositedLayerBase<'ruler', RulerLayerPayload>
export type LoupeLayer = CompositedLayerBase<'loupe', LoupeLayerPayload>
export type EmojiLayer = CompositedLayerBase<'emoji', EmojiPayload>
export type ImageLayer = CompositedLayerBase<'image', ImageLayerPayload>

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

export interface EditorDocumentV7 {
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

/** Current editable document contract. */
export type EditorDocument = EditorDocumentV7

/** @deprecated Historical names now alias the sole editable v7 contract. */
export type EditorDocumentV1 = EditorDocumentV7
export type EditorDocumentV2 = EditorDocumentV7
export type EditorDocumentV3 = EditorDocumentV7
export type EditorDocumentV4 = EditorDocumentV7
export type EditorDocumentV5 = EditorDocumentV7
export type EditorDocumentV6 = EditorDocumentV7

export type ParsedEditorDocument =
  | Readonly<{ kind: 'editable'; document: EditorDocument }>
  | Readonly<{
      kind: 'unsupported'
      schemaVersion: number
      raw: JsonObject
      reason: 'olderSchema'
    }>
  | Readonly<{
      kind: 'readOnly'
      schemaVersion: number
      raw: JsonObject
      reason: 'newerSchema'
    }>
