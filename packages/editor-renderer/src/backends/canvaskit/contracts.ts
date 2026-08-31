import type { ImageResource, ImageResourceInput } from '../../types'

export interface CanvasKitImageResource extends ImageResource {
  readonly source: ImageResourceInput['source']
  image: CanvasKitImage
}

export interface CanvasKitDeletable {
  delete(): void
}

export interface CanvasKitPaint extends CanvasKitDeletable {
  setAntiAlias(value: boolean): void
  setColorComponents(
    red: number,
    green: number,
    blue: number,
    alpha: number,
  ): void
  setStyle(style: unknown): void
  setStrokeWidth(width: number): void
  setStrokeCap(value: unknown): void
  setStrokeJoin(value: unknown): void
  setBlendMode(value: unknown): void
  setShader(shader: CanvasKitShader | null): void
  setPathEffect(effect: CanvasKitPathEffect | null): void
  setMaskFilter?(filter: CanvasKitMaskFilter | null): void
  setImageFilter?(filter: CanvasKitImageFilter | null): void
}

export type CanvasKitShader = CanvasKitDeletable
export type CanvasKitPathEffect = CanvasKitDeletable
export type CanvasKitMaskFilter = CanvasKitDeletable
export type CanvasKitImageFilter = CanvasKitDeletable
export type CanvasKitPath = CanvasKitDeletable
export interface CanvasKitTypeface extends CanvasKitDeletable {
  getGlyphIDs?(text: string): Uint16Array | null
}

export interface CanvasKitFontData {
  readonly family: string
  readonly subset: 'latin' | 'cyrillic'
  readonly data: ArrayBuffer
}

export interface CanvasKitPathBuilder extends CanvasKitDeletable {
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  cubicTo(
    control1X: number,
    control1Y: number,
    control2X: number,
    control2Y: number,
    endX: number,
    endY: number,
  ): void
  close(): void
  addOval?(oval: Float32Array, isCounterClockwise?: boolean): void
  addRect?(rect: Float32Array, isCounterClockwise?: boolean): void
  detach(): CanvasKitPath
}

export interface CanvasKitImage extends CanvasKitDeletable {
  encodeToBytes(format: unknown): Uint8Array | null
  makeShaderOptions?(
    tileX: unknown,
    tileY: unknown,
    filter: unknown,
    mipmap: unknown,
    matrix?: Float32Array,
  ): CanvasKitShader | null
}

export interface CanvasKitCanvas {
  clear(color: unknown): void
  save(): number
  restore(): void
  rotate(rotation: number, centerX: number, centerY: number): void
  translate(x: number, y: number): void
  scale(x: number, y: number): void
  drawRect(rect: Float32Array, paint: CanvasKitPaint): void
  drawOval(rect: Float32Array, paint: CanvasKitPaint): void
  drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    paint: CanvasKitPaint,
  ): void
  drawPath(path: CanvasKitPath, paint: CanvasKitPaint): void
  drawImageRect(
    image: CanvasKitImage,
    source: Float32Array,
    destination: Float32Array,
    paint: CanvasKitPaint,
    fastSample?: boolean,
  ): void
  drawImageRectOptions?(
    image: CanvasKitImage,
    source: Float32Array,
    destination: Float32Array,
    filter: unknown,
    mipmap: unknown,
    paint?: CanvasKitPaint | null,
  ): void
  clipPath?(path: CanvasKitPath, op: unknown, antiAlias: boolean): void
  clipRect?(rect: Float32Array, op: unknown, antiAlias: boolean): void
  clipRRect?(rrect: Float32Array, op?: unknown, antiAlias?: boolean): void
  drawRRect?(rrect: Float32Array, paint: CanvasKitPaint): void
  drawPicture?(picture: CanvasKitPicture): void
  drawText?(
    text: string,
    x: number,
    y: number,
    paint: CanvasKitPaint,
    font: CanvasKitFont,
  ): void
}

export type CanvasKitPicture = CanvasKitDeletable
export interface CanvasKitFontMetricsSource {
  getTextWidth?(text: string): number
  getMetrics?(): Readonly<{
    ascent: number
    descent: number
    leading: number
    bounds?: Float32Array
  }>
  getGlyphIDs?(text: string): Uint16Array | null
  getGlyphBounds?(glyphs: Uint16Array): Float32Array
  getGlyphWidths?(glyphs: Uint16Array): Float32Array
}

export interface CanvasKitFont
  extends CanvasKitDeletable, CanvasKitFontMetricsSource {
  setEmbolden?(embolden: boolean): void
  setSkewX?(skew: number): void
}

export interface CanvasKitPictureRecorder extends CanvasKitDeletable {
  beginRecording(bounds: Float32Array): CanvasKitCanvas
  finishRecordingAsPicture(): CanvasKitPicture
}

export interface CanvasKitSurface {
  readonly Gd?: number
  getCanvas(): CanvasKitCanvas
  flush(): void
  makeImageSnapshot(): CanvasKitImage
  makeImageFromTextureSource(
    source: ImageResourceInput['source'],
  ): CanvasKitImage | null
  dispose(): void
}

export interface CanvasKitApi {
  readonly Paint: new () => CanvasKitPaint
  readonly PathBuilder: new () => CanvasKitPathBuilder
  readonly PaintStyle: Readonly<{ Fill: unknown; Stroke: unknown }>
  readonly BlendMode: Readonly<{
    SrcOver: unknown
    Src?: unknown
    Multiply: unknown
    Screen: unknown
    Overlay: unknown
    Darken: unknown
    Lighten: unknown
    SoftLight: unknown
    HardLight: unknown
  }>
  readonly StrokeCap: Readonly<{
    Butt: unknown
    Round: unknown
    Square: unknown
  }>
  readonly StrokeJoin: Readonly<{
    Miter: unknown
    Round: unknown
    Bevel: unknown
  }>
  readonly TileMode: Readonly<{ Clamp: unknown; Repeat?: unknown }>
  readonly FilterMode?: Readonly<{ Linear?: unknown; Nearest?: unknown }>
  readonly MipmapMode?: Readonly<{ None?: unknown }>
  readonly Shader: Readonly<{
    MakeLinearGradient(
      start: readonly number[],
      end: readonly number[],
      colors: Float32Array,
      positions: number[] | null,
      tileMode: unknown,
    ): CanvasKitShader
    MakeRadialGradient(
      center: readonly number[],
      radius: number,
      colors: Float32Array,
      positions: number[] | null,
      tileMode: unknown,
    ): CanvasKitShader
  }>
  readonly PathEffect: Readonly<{
    MakeDash(intervals: number[], phase?: number): CanvasKitPathEffect
  }>
  readonly MaskFilter?: Readonly<{
    MakeBlur(
      style: unknown,
      sigma: number,
      respectCTM: boolean,
    ): CanvasKitMaskFilter
  }>
  readonly ImageFilter?: Readonly<{
    MakeBlur(
      sigmaX: number,
      sigmaY: number,
      tileMode: unknown,
      input: CanvasKitImageFilter | null,
    ): CanvasKitImageFilter
  }>
  readonly BlurStyle?: Readonly<{ Normal: unknown }>
  readonly ClipOp?: Readonly<{ Intersect?: unknown; Difference?: unknown }>
  readonly ImageFormat: Readonly<{ PNG: unknown }>
  readonly TRANSPARENT: unknown
  readonly PictureRecorder?: new () => CanvasKitPictureRecorder
  readonly Font?: new (
    typeface: CanvasKitTypeface,
    size: number,
  ) => CanvasKitFont
  readonly Typeface?: Readonly<{
    MakeDefault?: () => CanvasKitTypeface
    GetDefault?: () => CanvasKitTypeface
    MakeFreeTypeFaceFromData?: (data: ArrayBuffer) => CanvasKitTypeface | null
  }>
  XYWHRect(x: number, y: number, width: number, height: number): Float32Array
  RRectXY(rect: Float32Array, radiusX: number, radiusY: number): Float32Array
  LTRBRect(
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): Float32Array
  MakeSurface(width: number, height: number): CanvasKitSurface | null
  MakeWebGLCanvasSurface(canvas: HTMLCanvasElement): CanvasKitSurface | null
  deleteContext(handle: number): void
}
