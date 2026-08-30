export interface RgbaColor {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
}

export interface RenderGradientStop {
  readonly position: number
  readonly color: RgbaColor
}

/** Renderer-neutral paints deliberately carry resolved canvas-space geometry. */
export type RenderPaint =
  | RgbaColor
  | Readonly<{
      readonly kind: 'linearGradient'
      readonly startX: number
      readonly startY: number
      readonly endX: number
      readonly endY: number
      readonly stops: readonly RenderGradientStop[]
    }>
  | Readonly<{
      readonly kind: 'radialGradient'
      readonly centerX: number
      readonly centerY: number
      readonly radius: number
      readonly stops: readonly RenderGradientStop[]
    }>
  | Readonly<{
      readonly kind: 'imageTexture'
      readonly resourceId: string
      readonly opacity: number
      readonly scale: number
      readonly rotation: number
      readonly offsetX: number
      readonly offsetY: number
    }>

export type RenderBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'softLight'
  | 'hardLight'

export type RenderLineCap = 'butt' | 'round' | 'square'
export type RenderLineJoin = 'miter' | 'round' | 'bevel'

interface RenderNodeBase {
  readonly id: string
  readonly rotation: number
  /** Optional layer-space scale. When present, rotation and scale share this origin. */
  readonly scaleX?: number
  readonly scaleY?: number
  readonly transformOriginX?: number
  readonly transformOriginY?: number
  readonly opacity: number
  readonly visible: boolean
  readonly blendMode?: RenderBlendMode
}

export interface RenderRectNode extends RenderNodeBase {
  readonly kind: 'rect'
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly cornerRadius?: number
  readonly fill: RenderPaint
  readonly stroke?: RgbaColor
  readonly strokeWidth?: number
  readonly lineJoin?: RenderLineJoin
}

export interface RenderEllipseNode extends RenderNodeBase {
  readonly kind: 'ellipse'
  readonly centerX: number
  readonly centerY: number
  readonly radiusX: number
  readonly radiusY: number
  readonly fill: RenderPaint
  readonly stroke?: RgbaColor
  readonly strokeWidth?: number
  readonly lineJoin?: RenderLineJoin
}

export interface RenderLineNode extends RenderNodeBase {
  readonly kind: 'line'
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly stroke: RgbaColor
  readonly strokeWidth: number
  readonly lineCap?: RenderLineCap
  readonly lineJoin?: RenderLineJoin
  readonly dash?: readonly number[]
}

/** A single stroked contour. Freehand tools must not be decomposed into lines,
 * otherwise their blend mode and joins are applied once per input segment. */
export interface RenderPathNode extends RenderNodeBase {
  readonly kind: 'path'
  readonly points: readonly Readonly<{
    readonly x: number
    readonly y: number
  }>[]
  readonly stroke: RgbaColor
  readonly strokeWidth: number
  readonly lineCap?: RenderLineCap
  readonly lineJoin?: RenderLineJoin
  readonly dash?: readonly number[]
}

export interface RenderPolygonNode extends RenderNodeBase {
  readonly kind: 'polygon'
  readonly points: readonly Readonly<{
    readonly x: number
    readonly y: number
  }>[]
  readonly fill: RenderPaint
  readonly stroke?: RgbaColor
  readonly strokeWidth?: number
  readonly lineJoin?: RenderLineJoin
}

/** Raster layers share the ordered scene graph with annotation nodes. */
export interface RenderImageNode extends RenderNodeBase {
  readonly kind: 'image'
  readonly resourceId: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly scaleX: number
  readonly scaleY: number
  readonly cornerRadius?: number
  readonly stroke?: RgbaColor
  readonly strokeWidth?: number
  readonly lineJoin?: RenderLineJoin
}

export interface RenderTextStyle {
  readonly fontFamily: string
  readonly fontSize: number
  readonly color: RgbaColor
  readonly fontWeight: number
  readonly fontStyle: 'normal' | 'italic'
  readonly strikethrough: boolean
}

export interface RenderTextRun extends RenderTextStyle {
  /** UTF-16 offsets into RenderTextNode.text. */
  readonly start: number
  readonly end: number
}

export interface RenderTextParagraph {
  /** UTF-16 offsets into RenderTextNode.text. */
  readonly start: number
  readonly end: number
  readonly alignment: 'start' | 'center' | 'end'
  readonly listKind: 'none' | 'bullet'
}

/** Text stays a first-class scene node so preview and export share rich layout input. */
export interface RenderTextNode extends RenderNodeBase {
  readonly kind: 'text'
  readonly text: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly wrap: 'autoSize' | 'fixedWidth'
  readonly fixedWidth?: number
  readonly runs: readonly RenderTextRun[]
  readonly paragraphs: readonly RenderTextParagraph[]
  /** Optional optical alignment for compact labels such as numbered markers. */
  readonly verticalAlign?: 'visualCenter'
}

export type RenderCensorRegion =
  | Readonly<{
      readonly kind: 'rectangle'
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
    }>
  | Readonly<{
      readonly kind: 'freeform'
      readonly points: readonly Point2D[]
    }>

export interface Point2D {
  readonly x: number
  readonly y: number
}

export type RenderCensorEffect =
  | Readonly<{ readonly mode: 'pixelate'; readonly blockSize: number }>
  | Readonly<{ readonly mode: 'blur'; readonly strength: number }>
  | Readonly<{ readonly mode: 'solid'; readonly color: RgbaColor }>

/** Samples only already-rendered nodes, so effects cannot recurse. */
export interface RenderCensorNode extends RenderNodeBase {
  readonly kind: 'censor'
  readonly region: RenderCensorRegion
  readonly effect: RenderCensorEffect
  readonly sampleSource: 'compositeBelow'
}

export interface RenderSpotlightNode extends RenderNodeBase {
  readonly kind: 'spotlight'
  readonly aperture: Readonly<{
    readonly shape: 'rectangle' | 'ellipse' | 'diamond'
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }>
  readonly dimColor: RgbaColor
  readonly dimOpacity: number
  readonly feather: 'soft' | 'strong' | null
}

export interface RenderRulerNode extends RenderNodeBase {
  readonly kind: 'ruler'
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly length: number
  readonly angleDegrees: number
  readonly percent: number
  readonly percentBasis: 'canvasDiagonal'
  readonly unit: 'pixels' | 'percent'
  readonly label: string
  readonly color: RgbaColor
  readonly thickness: number
  readonly fontSize: number
}

export interface RenderLoupeNode extends RenderNodeBase {
  readonly kind: 'loupe'
  readonly sourceRegion: Readonly<{
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }>
  readonly lens: Readonly<{
    readonly shape: 'circle' | 'rectangle'
    readonly x: number
    readonly y: number
    readonly size: number
  }>
  readonly zoom: number
  readonly border: Readonly<{
    readonly color: RgbaColor
    readonly width: number
  }>
  readonly shadow: Readonly<{
    readonly color: RgbaColor
    readonly offsetX: number
    readonly offsetY: number
    readonly blur: number
  }> | null
  readonly sampleSource: 'compositeBelow'
}

/** Canvas-space rectangle shown by committed preview and derived exports.
 * Nodes keep document coordinates; renderers translate only the output surface. */
export interface RenderOutputBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type RenderNode =
  | RenderRectNode
  | RenderEllipseNode
  | RenderLineNode
  | RenderPathNode
  | RenderPolygonNode
  | RenderImageNode
  | RenderTextNode
  | RenderCensorNode
  | RenderSpotlightNode
  | RenderRulerNode
  | RenderLoupeNode

export interface RenderSceneSnapshot {
  readonly width: number
  readonly height: number
  readonly outputBounds: RenderOutputBounds
  readonly nodes: readonly RenderNode[]
}

export type RenderSceneInput = Omit<
  RenderSceneSnapshot,
  'nodes' | 'outputBounds'
> & {
  readonly outputBounds?: RenderOutputBounds
  readonly nodes: readonly RenderNode[]
}

/** Compile-time marker for the DOM-free editor package boundary. */
export type EditorCoreBoundary = Readonly<{
  package: 'editor-core'
}>
