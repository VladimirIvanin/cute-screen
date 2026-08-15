import type {
  RenderCensorNode,
  RenderLoupeNode,
  RenderNode,
  RenderPaint,
  RenderRulerNode,
  RenderSceneSnapshot,
  RenderSpotlightNode,
  RenderTextStyle,
  RgbaColor,
} from '@cute-screen/editor-core'

import type { InvalidationReason } from './scheduler'
import { drawNodes2D } from './canvas2d'
import { layoutRichText } from './rich-text-layout'
import {
  formatRulerDisplayLabel,
  intersectPixelRects,
  loupeConnectorGeometry,
  rulerBadgeBox,
  rulerBadgePalette,
  rulerBadgeRotationDegrees,
  rulerEndpointTickHalfLength,
  rulerWorldEndpoints,
  scaledOutputSize,
  spotlightFeatherWidth,
} from './precision-rendering'
import type {
  CanvasStack,
  FrameMetric,
  ImageResource,
  ImageResourceInput,
  Renderer,
  RenderExportOptions,
} from './types'

interface CanvasKitImageResource extends ImageResource {
  readonly source: ImageResourceInput['source']
  image: CanvasKitImage
}

interface CanvasKitDeletable {
  delete(): void
}

interface CanvasKitPaint extends CanvasKitDeletable {
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

type CanvasKitShader = CanvasKitDeletable
type CanvasKitPathEffect = CanvasKitDeletable
type CanvasKitMaskFilter = CanvasKitDeletable
type CanvasKitImageFilter = CanvasKitDeletable
type CanvasKitPath = CanvasKitDeletable
interface CanvasKitTypeface extends CanvasKitDeletable {
  getGlyphIDs?(text: string): Uint16Array | null
}

export interface CanvasKitFontData {
  readonly family: string
  readonly subset: 'latin' | 'cyrillic'
  readonly data: ArrayBuffer
}

interface CanvasKitPathBuilder extends CanvasKitDeletable {
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

interface CanvasKitImage extends CanvasKitDeletable {
  encodeToBytes(format: unknown): Uint8Array | null
  makeShaderOptions?(
    tileX: unknown,
    tileY: unknown,
    filter: unknown,
    mipmap: unknown,
    matrix?: Float32Array,
  ): CanvasKitShader | null
}

interface CanvasKitCanvas {
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

type CanvasKitPicture = CanvasKitDeletable
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

interface CanvasKitFont extends CanvasKitDeletable, CanvasKitFontMetricsSource {
  setEmbolden?(embolden: boolean): void
  setSkewX?(skew: number): void
}

interface CanvasKitPictureRecorder extends CanvasKitDeletable {
  beginRecording(bounds: Float32Array): CanvasKitCanvas
  finishRecordingAsPicture(): CanvasKitPicture
}

interface CanvasKitSurface {
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

function configurePaint(
  canvasKit: CanvasKitApi,
  paint: CanvasKitPaint,
  color: RgbaColor,
  opacity: number,
  style: 'fill' | 'stroke',
  strokeWidth = 1,
): void {
  paint.setAntiAlias(true)
  paint.setColorComponents(
    color.red,
    color.green,
    color.blue,
    color.alpha * opacity,
  )
  paint.setStyle(
    style === 'fill' ? canvasKit.PaintStyle.Fill : canvasKit.PaintStyle.Stroke,
  )
  if (style === 'stroke') paint.setStrokeWidth(strokeWidth)
}

function blendMode(
  canvasKit: CanvasKitApi,
  mode: RenderNode['blendMode'],
): unknown {
  switch (mode) {
    case 'multiply':
      return canvasKit.BlendMode.Multiply
    case 'screen':
      return canvasKit.BlendMode.Screen
    case 'overlay':
      return canvasKit.BlendMode.Overlay
    case 'darken':
      return canvasKit.BlendMode.Darken
    case 'lighten':
      return canvasKit.BlendMode.Lighten
    case 'softLight':
      return canvasKit.BlendMode.SoftLight
    case 'hardLight':
      return canvasKit.BlendMode.HardLight
    default:
      return canvasKit.BlendMode.SrcOver
  }
}

function configureFillPaint(
  canvasKit: CanvasKitApi,
  paint: CanvasKitPaint,
  fill: RenderPaint,
  opacity: number,
  blend: RenderNode['blendMode'],
  resources: ReadonlyMap<string, CanvasKitImageResource> = new Map(),
): CanvasKitShader | undefined {
  if (!('kind' in fill)) {
    configurePaint(canvasKit, paint, fill, opacity, 'fill')
    paint.setBlendMode(blendMode(canvasKit, blend))
    return undefined
  }
  if (fill.kind === 'imageTexture') {
    const shader = resources
      .get(fill.resourceId)
      ?.image.makeShaderOptions?.(
        canvasKit.TileMode.Repeat ?? canvasKit.TileMode.Clamp,
        canvasKit.TileMode.Repeat ?? canvasKit.TileMode.Clamp,
        canvasKit.FilterMode?.Linear,
        canvasKit.MipmapMode?.None,
        new Float32Array([
          fill.scale,
          0,
          fill.offsetX,
          0,
          fill.scale,
          fill.offsetY,
          0,
          0,
          1,
        ]),
      )
    if (shader) {
      configurePaint(
        canvasKit,
        paint,
        { red: 1, green: 1, blue: 1, alpha: fill.opacity },
        opacity,
        'fill',
      )
      paint.setShader(shader)
      paint.setBlendMode(blendMode(canvasKit, blend))
      return shader
    }
    // Image shaders are supplied by the next CanvasKit texture compiler. Keep
    // the missing-resource placeholder explicit until then, rather than
    // rendering a different silent solid fill than Canvas2D.
    configurePaint(
      canvasKit,
      paint,
      { red: 0.898, green: 0.282, blue: 0.302, alpha: 0.16 },
      opacity,
      'fill',
    )
    paint.setBlendMode(blendMode(canvasKit, blend))
    return undefined
  }
  const colors = new Float32Array(
    fill.stops.flatMap((stop) => [
      stop.color.red,
      stop.color.green,
      stop.color.blue,
      stop.color.alpha,
    ]),
  )
  const positions = fill.stops.map((stop) => stop.position)
  const shader =
    fill.kind === 'linearGradient'
      ? canvasKit.Shader.MakeLinearGradient(
          [fill.startX, fill.startY],
          [fill.endX, fill.endY],
          colors,
          positions,
          canvasKit.TileMode.Clamp,
        )
      : canvasKit.Shader.MakeRadialGradient(
          [fill.centerX, fill.centerY],
          fill.radius,
          colors,
          positions,
          canvasKit.TileMode.Clamp,
        )
  configurePaint(
    canvasKit,
    paint,
    { red: 1, green: 1, blue: 1, alpha: 1 },
    opacity,
    'fill',
  )
  paint.setShader(shader)
  paint.setBlendMode(blendMode(canvasKit, blend))
  return shader
}

function configureStrokePaint(
  canvasKit: CanvasKitApi,
  paint: CanvasKitPaint,
  node:
    | Extract<RenderNode, { readonly kind: 'line' | 'path' }>
    | Extract<RenderNode, { readonly kind: 'rect' | 'ellipse' | 'polygon' }>,
  color: RgbaColor,
  width: number,
): CanvasKitPathEffect | undefined {
  configurePaint(canvasKit, paint, color, node.opacity, 'stroke', width)
  paint.setBlendMode(blendMode(canvasKit, node.blendMode))
  paint.setStrokeCap(
    (node.kind === 'line' || node.kind === 'path') && node.lineCap === 'round'
      ? canvasKit.StrokeCap.Round
      : (node.kind === 'line' || node.kind === 'path') &&
          node.lineCap === 'square'
        ? canvasKit.StrokeCap.Square
        : canvasKit.StrokeCap.Butt,
  )
  paint.setStrokeJoin(
    node.lineJoin === 'round'
      ? canvasKit.StrokeJoin.Round
      : node.lineJoin === 'bevel'
        ? canvasKit.StrokeJoin.Bevel
        : canvasKit.StrokeJoin.Miter,
  )
  if ((node.kind === 'line' || node.kind === 'path') && node.dash) {
    const effect = canvasKit.PathEffect.MakeDash([...node.dash])
    paint.setPathEffect(effect)
    return effect
  }
  paint.setPathEffect(null)
  return undefined
}

function withTransform(
  canvas: CanvasKitCanvas,
  node: RenderNode,
  centerX: number,
  centerY: number,
  draw: () => void,
): void {
  canvas.save()
  const originX = node.transformOriginX ?? centerX
  const originY = node.transformOriginY ?? centerY
  const scaleX = node.scaleX ?? 1
  const scaleY = node.scaleY ?? 1
  if (node.rotation !== 0 || scaleX !== 1 || scaleY !== 1) {
    canvas.translate(originX, originY)
    canvas.rotate(node.rotation, 0, 0)
    canvas.scale(scaleX, scaleY)
    canvas.translate(-originX, -originY)
  }
  draw()
  canvas.restore()
}

/** Leaves the device-space clip created under a layer transform in place while
 * returning drawing coordinates to the parent scene transform. */
function cancelNodeTransform(
  canvas: CanvasKitCanvas,
  node: RenderNode,
  centerX: number,
  centerY: number,
): void {
  const originX = node.transformOriginX ?? centerX
  const originY = node.transformOriginY ?? centerY
  const scaleX = node.scaleX ?? 1
  const scaleY = node.scaleY ?? 1
  if (node.rotation === 0 && scaleX === 1 && scaleY === 1) return
  canvas.translate(originX, originY)
  canvas.scale(1 / scaleX, 1 / scaleY)
  canvas.rotate(-node.rotation, 0, 0)
  canvas.translate(-originX, -originY)
}

function roundedRectPath(
  canvasKit: CanvasKitApi,
  node: Extract<RenderNode, { readonly kind: 'rect' }>,
): CanvasKitPath {
  const builder = new canvasKit.PathBuilder()
  try {
    const radius = Math.min(
      node.cornerRadius ?? 0,
      node.width / 2,
      node.height / 2,
    )
    if (radius <= 0) {
      builder.moveTo(node.x, node.y)
      builder.lineTo(node.x + node.width, node.y)
      builder.lineTo(node.x + node.width, node.y + node.height)
      builder.lineTo(node.x, node.y + node.height)
      builder.close()
      return builder.detach()
    }
    // Cubic approximation of a circular quarter; Canvas2D uses a quadratic
    // corner, while this keeps CanvasKit's path renderer deterministic.
    const kappa = radius * 0.552_284_75
    builder.moveTo(node.x + radius, node.y)
    builder.lineTo(node.x + node.width - radius, node.y)
    builder.cubicTo(
      node.x + node.width - radius + kappa,
      node.y,
      node.x + node.width,
      node.y + radius - kappa,
      node.x + node.width,
      node.y + radius,
    )
    builder.lineTo(node.x + node.width, node.y + node.height - radius)
    builder.cubicTo(
      node.x + node.width,
      node.y + node.height - radius + kappa,
      node.x + node.width - radius + kappa,
      node.y + node.height,
      node.x + node.width - radius,
      node.y + node.height,
    )
    builder.lineTo(node.x + radius, node.y + node.height)
    builder.cubicTo(
      node.x + radius - kappa,
      node.y + node.height,
      node.x,
      node.y + node.height - radius + kappa,
      node.x,
      node.y + node.height - radius,
    )
    builder.lineTo(node.x, node.y + radius)
    builder.cubicTo(
      node.x,
      node.y + radius - kappa,
      node.x + radius - kappa,
      node.y,
      node.x + radius,
      node.y,
    )
    builder.close()
    return builder.detach()
  } finally {
    builder.delete()
  }
}

function canvasKitInkBounds(
  font: CanvasKitFontMetricsSource,
  text: string,
  fontSize: number,
): Readonly<{ top: number; bottom: number }> {
  const glyphs = font.getGlyphIDs?.(text)
  if (glyphs && glyphs.length > 0 && font.getGlyphBounds) {
    const bounds = font.getGlyphBounds(glyphs)
    let top = Number.POSITIVE_INFINITY
    let bottom = Number.NEGATIVE_INFINITY
    for (let index = 0; index + 3 < bounds.length; index += 4) {
      const glyphTop = bounds[index + 1] ?? Number.NaN
      const glyphBottom = bounds[index + 3] ?? Number.NaN
      if (!Number.isFinite(glyphTop) || !Number.isFinite(glyphBottom)) continue
      top = Math.min(top, glyphTop)
      bottom = Math.max(bottom, glyphBottom)
    }
    if (Number.isFinite(top) && Number.isFinite(bottom) && bottom > top) {
      return { top, bottom }
    }
  }
  const metrics = font.getMetrics?.()
  if (metrics) {
    if (
      Number.isFinite(metrics.ascent) &&
      Number.isFinite(metrics.descent) &&
      metrics.descent > metrics.ascent
    ) {
      return { top: metrics.ascent, bottom: metrics.descent }
    }
    const bounds = metrics.bounds
    const boundsTop = bounds?.[1] ?? Number.NaN
    const boundsBottom = bounds?.[3] ?? Number.NaN
    if (
      bounds &&
      Number.isFinite(boundsTop) &&
      Number.isFinite(boundsBottom) &&
      boundsBottom > boundsTop
    ) {
      return { top: boundsTop, bottom: boundsBottom }
    }
  }
  return { top: -fontSize * 0.8, bottom: fontSize * 0.2 }
}

function canvasKitLineMetrics(
  font: CanvasKitFontMetricsSource,
  fontSize: number,
): Readonly<{ ascent: number; descent: number }> {
  const metrics = font.getMetrics?.()
  const ascent = metrics ? -metrics.ascent : Number.NaN
  const descent = metrics?.descent ?? Number.NaN
  return {
    ascent: Number.isFinite(ascent) && ascent >= 0 ? ascent : fontSize * 0.8,
    descent:
      Number.isFinite(descent) && descent >= 0 ? descent : fontSize * 0.2,
  }
}

export function resolveCanvasKitVisualCenterBaseline(
  font: CanvasKitFontMetricsSource,
  text: string,
  y: number,
  height: number,
  lineHeight: number,
  fontSize: number,
): number {
  const lines = text.split('\n')
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (const [index, line] of lines.entries()) {
    if (line.length === 0) continue
    const ink = canvasKitInkBounds(font, line, fontSize)
    top = Math.min(top, index * lineHeight + ink.top)
    bottom = Math.max(bottom, index * lineHeight + ink.bottom)
  }
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
    const fallback = canvasKitInkBounds(font, '0', fontSize)
    top = fallback.top
    bottom = (lines.length - 1) * lineHeight + fallback.bottom
  }
  return y + height / 2 - (top + bottom) / 2
}

function canvasKitTextWidth(
  font: CanvasKitFontMetricsSource,
  text: string,
  fontSize: number,
): number {
  const measured = font.getTextWidth?.(text)
  if (typeof measured === 'number' && Number.isFinite(measured)) return measured
  const glyphs = font.getGlyphIDs?.(text)
  if (glyphs && font.getGlyphWidths) {
    return font
      .getGlyphWidths(glyphs)
      .reduce((total, width) => total + width, 0)
  }
  return Array.from(text).length * fontSize * 0.6
}

interface ResolvedCanvasKitTypeface {
  readonly key: string
  readonly typeface: CanvasKitTypeface
}

function requiresCyrillicCoverage(text: string): boolean {
  return /[\u0400-\u052f]/u.test(text)
}

function hasGlyphCoverage(
  source: Pick<CanvasKitFontMetricsSource, 'getGlyphIDs'>,
  text: string,
): boolean {
  const glyphs = source.getGlyphIDs?.(text)
  return (
    glyphs !== null &&
    glyphs !== undefined &&
    glyphs.length === Array.from(text).length &&
    !glyphs.some((glyph) => glyph === 0)
  )
}

class CanvasKitTypefaceStore {
  readonly #typefaces = new Map<string, CanvasKitTypeface>()

  constructor(canvasKit: CanvasKitApi, fontData: readonly CanvasKitFontData[]) {
    const makeTypeface = canvasKit.Typeface?.MakeFreeTypeFaceFromData
    if (!makeTypeface) return
    for (const font of fontData) {
      const typeface = makeTypeface(font.data.slice(0))
      if (typeface) {
        this.#typefaces.set(
          `${font.family.toLowerCase()}\u0000${font.subset}`,
          typeface,
        )
      }
    }
  }

  resolve(family: string, text: string): ResolvedCanvasKitTypeface | undefined {
    const requireCoverage = requiresCyrillicCoverage(text)
    const subset = requireCoverage ? 'cyrillic' : 'latin'
    const normalizedFamily = family.toLowerCase()
    const exactKey = `${normalizedFamily}\u0000${subset}`
    const exact = this.#typefaces.get(exactKey)
    if (exact && (!requireCoverage || hasGlyphCoverage(exact, text)))
      return { key: exactKey, typeface: exact }
    for (const [key, typeface] of this.#typefaces) {
      if (
        key.endsWith(`\u0000${subset}`) &&
        (!requireCoverage || hasGlyphCoverage(typeface, text))
      )
        return { key, typeface }
    }
    if (!requireCoverage) {
      const fallback = this.#typefaces.entries().next().value as
        readonly [string, CanvasKitTypeface] | undefined
      return fallback ? { key: fallback[0], typeface: fallback[1] } : undefined
    }
    for (const [key, typeface] of this.#typefaces) {
      if (hasGlyphCoverage(typeface, text)) return { key, typeface }
    }
    return undefined
  }

  dispose(): void {
    for (const typeface of this.#typefaces.values()) typeface.delete()
    this.#typefaces.clear()
  }
}

function censorPath(
  canvasKit: CanvasKitApi,
  node: RenderCensorNode,
): CanvasKitPath {
  const builder = new canvasKit.PathBuilder()
  if (node.region.kind === 'rectangle') {
    builder.moveTo(node.region.x, node.region.y)
    builder.lineTo(node.region.x + node.region.width, node.region.y)
    builder.lineTo(
      node.region.x + node.region.width,
      node.region.y + node.region.height,
    )
    builder.lineTo(node.region.x, node.region.y + node.region.height)
  } else {
    const first = node.region.points[0]!
    builder.moveTo(first.x, first.y)
    for (const point of node.region.points.slice(1)) {
      builder.lineTo(point.x, point.y)
    }
  }
  builder.close()
  const path = builder.detach()
  builder.delete()
  return path
}

function spotlightPath(
  canvasKit: CanvasKitApi,
  node: RenderSpotlightNode,
): CanvasKitPath {
  const aperture = node.aperture
  const builder = new canvasKit.PathBuilder()
  if (aperture.shape === 'ellipse') {
    if (builder.addOval) {
      builder.addOval(
        canvasKit.XYWHRect(
          aperture.x,
          aperture.y,
          aperture.width,
          aperture.height,
        ),
      )
    } else {
      const centerX = aperture.x + aperture.width / 2
      const centerY = aperture.y + aperture.height / 2
      const radiusX = aperture.width / 2
      const radiusY = aperture.height / 2
      const kappa = 0.552_284_75
      builder.moveTo(centerX + radiusX, centerY)
      builder.cubicTo(
        centerX + radiusX,
        centerY + radiusY * kappa,
        centerX + radiusX * kappa,
        centerY + radiusY,
        centerX,
        centerY + radiusY,
      )
      builder.cubicTo(
        centerX - radiusX * kappa,
        centerY + radiusY,
        centerX - radiusX,
        centerY + radiusY * kappa,
        centerX - radiusX,
        centerY,
      )
      builder.cubicTo(
        centerX - radiusX,
        centerY - radiusY * kappa,
        centerX - radiusX * kappa,
        centerY - radiusY,
        centerX,
        centerY - radiusY,
      )
      builder.cubicTo(
        centerX + radiusX * kappa,
        centerY - radiusY,
        centerX + radiusX,
        centerY - radiusY * kappa,
        centerX + radiusX,
        centerY,
      )
      builder.close()
    }
  } else {
    const points =
      aperture.shape === 'diamond'
        ? [
            [aperture.x + aperture.width / 2, aperture.y],
            [aperture.x + aperture.width, aperture.y + aperture.height / 2],
            [aperture.x + aperture.width / 2, aperture.y + aperture.height],
            [aperture.x, aperture.y + aperture.height / 2],
          ]
        : [
            [aperture.x, aperture.y],
            [aperture.x + aperture.width, aperture.y],
            [aperture.x + aperture.width, aperture.y + aperture.height],
            [aperture.x, aperture.y + aperture.height],
          ]
    builder.moveTo(points[0]![0]!, points[0]![1]!)
    for (const point of points.slice(1)) builder.lineTo(point[0]!, point[1]!)
    builder.close()
  }
  const path = builder.detach()
  builder.delete()
  return path
}

function loupePath(
  canvasKit: CanvasKitApi,
  node: RenderLoupeNode,
): CanvasKitPath {
  const builder = new canvasKit.PathBuilder()
  if (node.lens.shape === 'circle' && builder.addOval) {
    builder.addOval(
      canvasKit.XYWHRect(
        node.lens.x,
        node.lens.y,
        node.lens.size,
        node.lens.size,
      ),
    )
  } else {
    const x = node.lens.x
    const y = node.lens.y
    const edgeX = x + node.lens.size
    const edgeY = y + node.lens.size
    builder.moveTo(x, y)
    builder.lineTo(edgeX, y)
    builder.lineTo(edgeX, edgeY)
    builder.lineTo(x, edgeY)
    builder.close()
  }
  const path = builder.detach()
  builder.delete()
  return path
}

function drawSnapshotCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  image: CanvasKitImage,
  source: Float32Array,
  destination: Float32Array,
  paint: CanvasKitPaint,
  nearest = false,
): void {
  if (canvas.drawImageRectOptions && canvasKit.FilterMode) {
    canvas.drawImageRectOptions(
      image,
      source,
      destination,
      nearest
        ? (canvasKit.FilterMode.Nearest ?? canvasKit.FilterMode.Linear)
        : canvasKit.FilterMode.Linear,
      canvasKit.MipmapMode?.None,
      paint,
    )
    return
  }
  canvas.drawImageRect(image, source, destination, paint, nearest)
}

function drawCensorCanvasKit(
  canvasKit: CanvasKitApi,
  surface: CanvasKitSurface,
  canvas: CanvasKitCanvas,
  scene: RenderSceneSnapshot,
  node: RenderCensorNode,
  scale: number,
): void {
  const path = censorPath(canvasKit, node)
  const paint = new canvasKit.Paint()
  const center =
    node.region.kind === 'rectangle'
      ? {
          x: node.region.x + node.region.width / 2,
          y: node.region.y + node.region.height / 2,
        }
      : {
          x:
            node.region.points.reduce((sum, point) => sum + point.x, 0) /
            node.region.points.length,
          y:
            node.region.points.reduce((sum, point) => sum + point.y, 0) /
            node.region.points.length,
        }
  try {
    if (node.effect.mode === 'solid') {
      withTransform(canvas, node, center.x, center.y, () => {
        configurePaint(
          canvasKit,
          paint,
          node.effect.mode === 'solid'
            ? node.effect.color
            : { red: 0, green: 0, blue: 0, alpha: 0 },
          node.opacity,
          'fill',
        )
        paint.setBlendMode(blendMode(canvasKit, node.blendMode))
        canvas.drawPath(path, paint)
      })
      return
    }

    surface.flush()
    const below = surface.makeImageSnapshot()
    try {
      paint.setAntiAlias(false)
      paint.setColorComponents(1, 1, 1, node.opacity)
      paint.setBlendMode(blendMode(canvasKit, node.blendMode))
      if (node.effect.mode === 'blur') {
        const filter = canvasKit.ImageFilter?.MakeBlur(
          Math.max(0.5, (node.effect.strength * scale) / 2),
          Math.max(0.5, (node.effect.strength * scale) / 2),
          canvasKit.TileMode.Clamp,
          null,
        )
        try {
          paint.setImageFilter?.(filter ?? null)
          withTransform(canvas, node, center.x, center.y, () => {
            canvas.clipPath?.(path, canvasKit.ClipOp?.Intersect, true)
            cancelNodeTransform(canvas, node, center.x, center.y)
            drawSnapshotCanvasKit(
              canvasKit,
              canvas,
              below,
              canvasKit.XYWHRect(
                0,
                0,
                scene.width * scale,
                scene.height * scale,
              ),
              canvasKit.XYWHRect(0, 0, scene.width, scene.height),
              paint,
            )
          })
        } finally {
          paint.setImageFilter?.(null)
          filter?.delete()
        }
      } else {
        const effect = node.effect
        withTransform(canvas, node, center.x, center.y, () => {
          canvas.clipPath?.(path, canvasKit.ClipOp?.Intersect, false)
          cancelNodeTransform(canvas, node, center.x, center.y)
          for (let y = 0; y < scene.height; y += effect.blockSize) {
            for (let x = 0; x < scene.width; x += effect.blockSize) {
              const width = Math.min(effect.blockSize, scene.width - x)
              const height = Math.min(effect.blockSize, scene.height - y)
              const sampleX =
                Math.min(scene.width - 0.5, x + effect.blockSize / 2) * scale
              const sampleY =
                Math.min(scene.height - 0.5, y + effect.blockSize / 2) * scale
              drawSnapshotCanvasKit(
                canvasKit,
                canvas,
                below,
                canvasKit.XYWHRect(sampleX, sampleY, 1, 1),
                canvasKit.XYWHRect(x, y, width, height),
                paint,
                true,
              )
            }
          }
        })
      }
    } finally {
      below.delete()
    }
  } finally {
    paint.delete()
    path.delete()
  }
}

function drawSpotlightCanvasKit(
  canvasKit: CanvasKitApi,
  surface: CanvasKitSurface,
  canvas: CanvasKitCanvas,
  scene: RenderSceneSnapshot,
  node: RenderSpotlightNode,
  scale: number,
): void {
  surface.flush()
  const below = surface.makeImageSnapshot()
  const path = spotlightPath(canvasKit, node)
  const paint = new canvasKit.Paint()
  const centerX = node.aperture.x + node.aperture.width / 2
  const centerY = node.aperture.y + node.aperture.height / 2
  let featherFilter: CanvasKitMaskFilter | undefined
  try {
    configurePaint(
      canvasKit,
      paint,
      node.dimColor,
      node.opacity * node.dimOpacity,
      'fill',
    )
    paint.setBlendMode(blendMode(canvasKit, node.blendMode))
    canvas.drawRect(canvasKit.XYWHRect(0, 0, scene.width, scene.height), paint)

    withTransform(canvas, node, centerX, centerY, () => {
      canvas.clipPath?.(path, canvasKit.ClipOp?.Intersect, true)
      cancelNodeTransform(canvas, node, centerX, centerY)
      paint.setColorComponents(1, 1, 1, 1)
      paint.setBlendMode(canvasKit.BlendMode.Src ?? canvasKit.BlendMode.SrcOver)
      drawSnapshotCanvasKit(
        canvasKit,
        canvas,
        below,
        canvasKit.XYWHRect(0, 0, scene.width * scale, scene.height * scale),
        canvasKit.XYWHRect(0, 0, scene.width, scene.height),
        paint,
      )
    })

    const feather = spotlightFeatherWidth(node.feather)
    if (feather > 0) {
      configurePaint(
        canvasKit,
        paint,
        node.dimColor,
        node.opacity * node.dimOpacity * 0.8,
        'stroke',
        feather * 0.9,
      )
      paint.setBlendMode(blendMode(canvasKit, node.blendMode))
      if (canvasKit.MaskFilter && canvasKit.BlurStyle && paint.setMaskFilter) {
        featherFilter = canvasKit.MaskFilter.MakeBlur(
          canvasKit.BlurStyle.Normal,
          Math.max(0.5, feather / 2),
          true,
        )
        paint.setMaskFilter(featherFilter)
      }
      withTransform(canvas, node, centerX, centerY, () => {
        canvas.drawPath(path, paint)
      })
    }
  } finally {
    paint.setMaskFilter?.(null)
    featherFilter?.delete()
    paint.delete()
    path.delete()
    below.delete()
  }
}

function drawRulerCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: RenderRulerNode,
  typefaces?: CanvasKitTypefaceStore,
): void {
  const stroke = new canvasKit.Paint()
  const fill = new canvasKit.Paint()
  const centerX = (node.x1 + node.x2) / 2
  const centerY = (node.y1 + node.y2) / 2
  const label = formatRulerDisplayLabel(node)
  try {
    withTransform(canvas, node, centerX, centerY, () => {
      const dx = node.x2 - node.x1
      const dy = node.y2 - node.y1
      const length = Math.hypot(dx, dy)
      const perpendicular = { x: -dy / length, y: dx / length }
      const tickHalf = rulerEndpointTickHalfLength(node.thickness)
      configurePaint(
        canvasKit,
        stroke,
        node.color,
        node.opacity,
        'stroke',
        node.thickness,
      )
      stroke.setStrokeCap(canvasKit.StrokeCap.Butt)
      stroke.setBlendMode(blendMode(canvasKit, node.blendMode))
      canvas.drawLine(node.x1, node.y1, node.x2, node.y2, stroke)
      for (const endpoint of [
        { x: node.x1, y: node.y1 },
        { x: node.x2, y: node.y2 },
      ]) {
        canvas.drawLine(
          endpoint.x - perpendicular.x * tickHalf,
          endpoint.y - perpendicular.y * tickHalf,
          endpoint.x + perpendicular.x * tickHalf,
          endpoint.y + perpendicular.y * tickHalf,
          stroke,
        )
      }
    })
    if (!canvasKit.Font || !canvas.drawText) return
    const resolved = typefaces?.resolve('Roboto', label)
    const fallback = resolved
      ? undefined
      : (canvasKit.Typeface?.MakeDefault?.() ??
        canvasKit.Typeface?.GetDefault?.())
    const typeface = resolved?.typeface ?? fallback
    if (!typeface) return
    const font = new canvasKit.Font(typeface, node.fontSize)
    font.setEmbolden?.(true)
    try {
      const labelWidth = canvasKitTextWidth(font, label, node.fontSize)
      const badge = rulerBadgeBox(labelWidth, node.fontSize)
      const palette = rulerBadgePalette(node.color)
      const badgeRect = canvasKit.XYWHRect(
        -badge.width / 2,
        -badge.height / 2,
        badge.width,
        badge.height,
      )
      const rounded = canvasKit.RRectXY(badgeRect, badge.radius, badge.radius)
      const endpoints = rulerWorldEndpoints(node)
      const badgeCenterX = (endpoints.start.x + endpoints.end.x) / 2
      const badgeCenterY = (endpoints.start.y + endpoints.end.y) / 2
      canvas.save()
      try {
        canvas.translate(badgeCenterX, badgeCenterY)
        canvas.rotate(rulerBadgeRotationDegrees(node), 0, 0)
        configurePaint(
          canvasKit,
          fill,
          palette.background,
          node.opacity,
          'fill',
        )
        fill.setBlendMode(blendMode(canvasKit, node.blendMode))
        if (canvas.drawRRect) canvas.drawRRect(rounded, fill)
        else canvas.drawRect(badgeRect, fill)
        configurePaint(canvasKit, stroke, node.color, node.opacity, 'stroke', 1)
        stroke.setStrokeCap(canvasKit.StrokeCap.Butt)
        stroke.setBlendMode(blendMode(canvasKit, node.blendMode))
        if (canvas.drawRRect) canvas.drawRRect(rounded, stroke)
        else canvas.drawRect(badgeRect, stroke)
        configurePaint(canvasKit, fill, palette.text, node.opacity, 'fill')
        fill.setBlendMode(blendMode(canvasKit, node.blendMode))
        const baseline = resolveCanvasKitVisualCenterBaseline(
          font,
          label,
          -badge.height / 2,
          badge.height,
          node.fontSize,
          node.fontSize,
        )
        canvas.drawText(label, -labelWidth / 2, baseline, fill, font)
      } finally {
        canvas.restore()
      }
    } finally {
      font.delete()
      fallback?.delete()
    }
  } finally {
    fill.delete()
    stroke.delete()
  }
}

function drawLoupeCanvasKit(
  canvasKit: CanvasKitApi,
  surface: CanvasKitSurface,
  canvas: CanvasKitCanvas,
  scene: RenderSceneSnapshot,
  node: RenderLoupeNode,
  scale: number,
): void {
  surface.flush()
  const below = surface.makeImageSnapshot()
  const path = loupePath(canvasKit, node)
  const paint = new canvasKit.Paint()
  const radius = node.lens.size / 2
  const centerX = node.lens.x + radius
  const centerY = node.lens.y + radius
  const connector = loupeConnectorGeometry(node)
  let shadowFilter: CanvasKitMaskFilter | undefined
  try {
    if (connector) {
      configurePaint(
        canvasKit,
        paint,
        node.border.color,
        node.opacity,
        'stroke',
        3,
      )
      paint.setBlendMode(blendMode(canvasKit, node.blendMode))
      paint.setStrokeCap(canvasKit.StrokeCap.Round)
      paint.setStrokeJoin(canvasKit.StrokeJoin.Round)
      canvas.drawLine(
        connector.lensCenter.x,
        connector.lensCenter.y,
        connector.lineEnd.x,
        connector.lineEnd.y,
        paint,
      )
      const arrowBuilder = new canvasKit.PathBuilder()
      arrowBuilder.moveTo(connector.source.x, connector.source.y)
      arrowBuilder.lineTo(connector.arrowLeft.x, connector.arrowLeft.y)
      arrowBuilder.lineTo(connector.arrowRight.x, connector.arrowRight.y)
      arrowBuilder.close()
      const arrow = arrowBuilder.detach()
      arrowBuilder.delete()
      try {
        configurePaint(
          canvasKit,
          paint,
          node.border.color,
          node.opacity,
          'fill',
        )
        paint.setBlendMode(blendMode(canvasKit, node.blendMode))
        canvas.drawPath(arrow, paint)
      } finally {
        arrow.delete()
      }
    }
    withTransform(canvas, node, centerX, centerY, () => {
      if (node.shadow) {
        configurePaint(
          canvasKit,
          paint,
          node.shadow.color,
          node.opacity,
          'stroke',
          Math.max(1, node.border.width),
        )
        if (
          canvasKit.MaskFilter &&
          canvasKit.BlurStyle &&
          paint.setMaskFilter
        ) {
          shadowFilter = canvasKit.MaskFilter.MakeBlur(
            canvasKit.BlurStyle.Normal,
            Math.max(0.5, node.shadow.blur / 2),
            true,
          )
          paint.setMaskFilter(shadowFilter)
        }
        canvas.save()
        canvas.translate(node.shadow.offsetX, node.shadow.offsetY)
        canvas.drawPath(path, paint)
        canvas.restore()
        paint.setMaskFilter?.(null)
      }

      canvas.save()
      canvas.clipPath?.(path, canvasKit.ClipOp?.Intersect, true)
      paint.setAntiAlias(false)
      paint.setColorComponents(0, 0, 0, 0)
      paint.setBlendMode(canvasKit.BlendMode.Src)
      canvas.drawRect(
        canvasKit.XYWHRect(
          node.lens.x,
          node.lens.y,
          node.lens.size,
          node.lens.size,
        ),
        paint,
      )
      // The lens starts as transparent black; only its source/canvas intersection
      // is populated from the frozen composite below.
      const sourceIntersection = intersectPixelRects(node.sourceRegion, {
        x: 0,
        y: 0,
        width: scene.width,
        height: scene.height,
      })
      if (sourceIntersection) {
        paint.setColorComponents(1, 1, 1, node.opacity)
        paint.setBlendMode(blendMode(canvasKit, node.blendMode))
        const destinationX =
          node.lens.x + (sourceIntersection.x - node.sourceRegion.x) * node.zoom
        const destinationY =
          node.lens.y + (sourceIntersection.y - node.sourceRegion.y) * node.zoom
        drawSnapshotCanvasKit(
          canvasKit,
          canvas,
          below,
          canvasKit.XYWHRect(
            sourceIntersection.x * scale,
            sourceIntersection.y * scale,
            sourceIntersection.width * scale,
            sourceIntersection.height * scale,
          ),
          canvasKit.XYWHRect(
            destinationX,
            destinationY,
            sourceIntersection.width * node.zoom,
            sourceIntersection.height * node.zoom,
          ),
          paint,
          true,
        )
      }
      canvas.restore()

      if (node.border.width > 0) {
        configurePaint(
          canvasKit,
          paint,
          node.border.color,
          node.opacity,
          'stroke',
          node.border.width,
        )
        paint.setBlendMode(blendMode(canvasKit, node.blendMode))
        canvas.drawPath(path, paint)
      }
    })
  } finally {
    paint.setMaskFilter?.(null)
    shadowFilter?.delete()
    paint.delete()
    path.delete()
    below.delete()
  }
}

export function drawNodesCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  nodes: readonly RenderNode[],
  resources: ReadonlyMap<string, CanvasKitImageResource> = new Map(),
  typefaces?: CanvasKitTypefaceStore,
): void {
  for (const node of nodes) {
    if (!node.visible || node.opacity === 0) continue
    const fill = new canvasKit.Paint()
    const stroke = new canvasKit.Paint()
    let shader: CanvasKitShader | undefined
    let pathEffect: CanvasKitPathEffect | undefined
    try {
      switch (node.kind) {
        case 'rect': {
          const rect = canvasKit.XYWHRect(
            node.x,
            node.y,
            node.width,
            node.height,
          )
          const roundedPath =
            (node.cornerRadius ?? 0) > 0
              ? roundedRectPath(canvasKit, node)
              : undefined
          try {
            withTransform(
              canvas,
              node,
              node.x + node.width / 2,
              node.y + node.height / 2,
              () => {
                shader = configureFillPaint(
                  canvasKit,
                  fill,
                  node.fill,
                  node.opacity,
                  node.blendMode,
                  resources,
                )
                if (roundedPath) canvas.drawPath(roundedPath, fill)
                else canvas.drawRect(rect, fill)
                if (node.stroke && (node.strokeWidth ?? 0) > 0) {
                  pathEffect = configureStrokePaint(
                    canvasKit,
                    stroke,
                    node,
                    node.stroke,
                    node.strokeWidth ?? 1,
                  )
                  if (roundedPath) canvas.drawPath(roundedPath, stroke)
                  else canvas.drawRect(rect, stroke)
                }
              },
            )
          } finally {
            roundedPath?.delete()
          }
          break
        }
        case 'ellipse': {
          const oval = canvasKit.LTRBRect(
            node.centerX - node.radiusX,
            node.centerY - node.radiusY,
            node.centerX + node.radiusX,
            node.centerY + node.radiusY,
          )
          withTransform(canvas, node, node.centerX, node.centerY, () => {
            shader = configureFillPaint(
              canvasKit,
              fill,
              node.fill,
              node.opacity,
              node.blendMode,
              resources,
            )
            canvas.drawOval(oval, fill)
            if (node.stroke && (node.strokeWidth ?? 0) > 0) {
              pathEffect = configureStrokePaint(
                canvasKit,
                stroke,
                node,
                node.stroke,
                node.strokeWidth ?? 1,
              )
              canvas.drawOval(oval, stroke)
            }
          })
          break
        }
        case 'line':
          withTransform(
            canvas,
            node,
            (node.x1 + node.x2) / 2,
            (node.y1 + node.y2) / 2,
            () => {
              pathEffect = configureStrokePaint(
                canvasKit,
                stroke,
                node,
                node.stroke,
                node.strokeWidth,
              )
              canvas.drawLine(node.x1, node.y1, node.x2, node.y2, stroke)
            },
          )
          break
        case 'path': {
          const pathBuilder = new canvasKit.PathBuilder()
          const first = node.points[0]!
          pathBuilder.moveTo(first.x, first.y)
          for (const point of node.points.slice(1))
            pathBuilder.lineTo(point.x, point.y)
          const centerX =
            (Math.min(...node.points.map((point) => point.x)) +
              Math.max(...node.points.map((point) => point.x))) /
            2
          const centerY =
            (Math.min(...node.points.map((point) => point.y)) +
              Math.max(...node.points.map((point) => point.y))) /
            2
          let path: CanvasKitPath | undefined
          try {
            const builtPath = pathBuilder.detach()
            path = builtPath
            withTransform(canvas, node, centerX, centerY, () => {
              pathEffect = configureStrokePaint(
                canvasKit,
                stroke,
                node,
                node.stroke,
                node.strokeWidth,
              )
              canvas.drawPath(builtPath, stroke)
            })
          } finally {
            path?.delete()
            pathBuilder.delete()
          }
          break
        }
        case 'polygon': {
          const pathBuilder = new canvasKit.PathBuilder()
          const first = node.points[0]!
          pathBuilder.moveTo(first.x, first.y)
          for (const point of node.points.slice(1))
            pathBuilder.lineTo(point.x, point.y)
          pathBuilder.close()
          const centerX =
            node.points.reduce((total, point) => total + point.x, 0) /
            node.points.length
          const centerY =
            node.points.reduce((total, point) => total + point.y, 0) /
            node.points.length
          let path: CanvasKitPath | undefined
          try {
            const builtPath = pathBuilder.detach()
            path = builtPath
            withTransform(canvas, node, centerX, centerY, () => {
              shader = configureFillPaint(
                canvasKit,
                fill,
                node.fill,
                node.opacity,
                node.blendMode,
                resources,
              )
              canvas.drawPath(builtPath, fill)
              if (node.stroke && (node.strokeWidth ?? 0) > 0) {
                pathEffect = configureStrokePaint(
                  canvasKit,
                  stroke,
                  node,
                  node.stroke,
                  node.strokeWidth ?? 1,
                )
                canvas.drawPath(builtPath, stroke)
              }
            })
          } finally {
            path?.delete()
            pathBuilder.delete()
          }
          break
        }
        case 'text': {
          if (!canvasKit.Font || !canvasKit.Typeface || !canvas.drawText) break
          const defaultTypeface =
            canvasKit.Typeface.MakeDefault?.() ??
            canvasKit.Typeface.GetDefault?.()
          if (!defaultTypeface && !typefaces) break
          const fonts = new Map<string, CanvasKitFont>()
          const fontForStyle = (
            style: RenderTextStyle,
            text: string,
          ): CanvasKitFont => {
            const resolved = typefaces?.resolve(style.fontFamily, text)
            const typeface = resolved?.typeface ?? defaultTypeface
            if (!typeface) {
              if (requiresCyrillicCoverage(text)) {
                throw new Error(
                  `CanvasKit glyph coverage is unavailable for "${node.text}" in ${style.fontFamily}`,
                )
              }
              throw new Error(
                `CanvasKit typeface is unavailable for ${style.fontFamily}`,
              )
            }
            const key = [
              resolved?.key ?? 'default',
              style.fontSize,
              style.fontWeight,
              style.fontStyle,
            ].join('\u0000')
            const existing = fonts.get(key)
            if (existing) {
              if (
                requiresCyrillicCoverage(text) &&
                !hasGlyphCoverage(existing, text)
              ) {
                throw new Error(
                  `CanvasKit glyph coverage is unavailable for "${node.text}" in ${style.fontFamily}`,
                )
              }
              return existing
            }
            const font = new canvasKit.Font!(typeface, style.fontSize)
            font.setEmbolden?.(style.fontWeight >= 600)
            font.setSkewX?.(style.fontStyle === 'italic' ? -0.2 : 0)
            if (
              requiresCyrillicCoverage(text) &&
              !hasGlyphCoverage(font, text)
            ) {
              font.delete()
              throw new Error(
                `CanvasKit glyph coverage is unavailable for "${node.text}" in ${style.fontFamily}`,
              )
            }
            fonts.set(key, font)
            return font
          }
          try {
            withTransform(
              canvas,
              node,
              node.x + node.width / 2,
              node.y + node.height / 2,
              () => {
                const layout = layoutRichText(node, (text, style) => {
                  const font = fontForStyle(style, text)
                  const ink = canvasKitInkBounds(font, text, style.fontSize)
                  const line = canvasKitLineMetrics(font, style.fontSize)
                  return {
                    width: canvasKitTextWidth(font, text, style.fontSize),
                    ascent: Math.max(0, -ink.top),
                    descent: Math.max(0, ink.bottom),
                    lineAscent: line.ascent,
                    lineDescent: line.descent,
                  }
                })
                for (const line of layout.lines) {
                  if (line.bullet) {
                    configurePaint(
                      canvasKit,
                      fill,
                      line.bullet.color,
                      node.opacity,
                      'fill',
                    )
                    fill.setBlendMode(blendMode(canvasKit, node.blendMode))
                    canvas.drawOval(
                      canvasKit.LTRBRect(
                        line.bullet.centerX - line.bullet.radius,
                        line.bullet.centerY - line.bullet.radius,
                        line.bullet.centerX + line.bullet.radius,
                        line.bullet.centerY + line.bullet.radius,
                      ),
                      fill,
                    )
                  }
                  for (const fragment of line.fragments) {
                    configurePaint(
                      canvasKit,
                      fill,
                      fragment.color,
                      node.opacity,
                      'fill',
                    )
                    fill.setBlendMode(blendMode(canvasKit, node.blendMode))
                    canvas.drawText!(
                      fragment.text,
                      fragment.x,
                      fragment.baseline,
                      fill,
                      fontForStyle(fragment, fragment.text),
                    )
                  }
                  for (const strike of line.strikes) {
                    configurePaint(
                      canvasKit,
                      stroke,
                      strike.color,
                      node.opacity,
                      'stroke',
                      strike.thickness,
                    )
                    stroke.setBlendMode(blendMode(canvasKit, node.blendMode))
                    canvas.drawLine(
                      strike.x,
                      strike.y,
                      strike.x + strike.width,
                      strike.y,
                      stroke,
                    )
                  }
                }
              },
            )
          } finally {
            for (const font of fonts.values()) font.delete()
            defaultTypeface?.delete()
          }
          break
        }
        case 'ruler':
          drawRulerCanvasKit(canvasKit, canvas, node, typefaces)
          break
        case 'censor':
        case 'spotlight':
        case 'loupe':
          throw new Error(
            `${node.kind} rendering requires an ordered CanvasKit surface`,
          )
      }
    } finally {
      fill.delete()
      stroke.delete()
      shader?.delete()
      pathEffect?.delete()
    }
  }
}

function drawScene(
  canvasKit: CanvasKitApi,
  surface: CanvasKitSurface,
  scene: RenderSceneSnapshot,
  resources: ReadonlyMap<string, CanvasKitImageResource>,
  typefaces?: CanvasKitTypefaceStore,
  scale = 1,
  translateToOutput = false,
): void {
  const canvas = surface.getCanvas()
  canvas.clear(canvasKit.TRANSPARENT)
  canvas.save()
  try {
    canvas.scale(scale, scale)
    if (translateToOutput) {
      canvas.translate(-scene.outputBounds.x, -scene.outputBounds.y)
    }
    for (const node of scene.nodes) {
      if (!node.visible || node.opacity === 0) continue
      if (node.kind === 'censor') {
        drawCensorCanvasKit(canvasKit, surface, canvas, scene, node, scale)
        continue
      }
      if (node.kind === 'spotlight') {
        drawSpotlightCanvasKit(canvasKit, surface, canvas, scene, node, scale)
        continue
      }
      if (node.kind === 'ruler') {
        drawRulerCanvasKit(canvasKit, canvas, node, typefaces)
        continue
      }
      if (node.kind === 'loupe') {
        drawLoupeCanvasKit(canvasKit, surface, canvas, scene, node, scale)
        continue
      }
      if (node.kind !== 'image') {
        drawNodesCanvasKit(canvasKit, canvas, [node], resources, typefaces)
        continue
      }
      const resource = resources.get(node.resourceId)
      const fill = new canvasKit.Paint()
      const stroke = new canvasKit.Paint()
      try {
        canvas.save()
        canvas.translate(node.x, node.y)
        canvas.rotate(node.rotation, 0, 0)
        canvas.scale(node.scaleX, node.scaleY)
        const bounds = canvasKit.XYWHRect(0, 0, node.width, node.height)
        const rounded =
          (node.cornerRadius ?? 0) > 0
            ? canvasKit.RRectXY(
                bounds,
                node.cornerRadius ?? 0,
                node.cornerRadius ?? 0,
              )
            : undefined
        if (rounded) {
          canvas.clipRRect?.(rounded, canvasKit.ClipOp?.Intersect, true)
        }
        if (resource) {
          fill.setAntiAlias(true)
          fill.setColorComponents(1, 1, 1, node.opacity)
          fill.setBlendMode(blendMode(canvasKit, node.blendMode))
          canvas.drawImageRect(
            resource.image,
            canvasKit.XYWHRect(0, 0, resource.width, resource.height),
            bounds,
            fill,
            false,
          )
        } else {
          configurePaint(
            canvasKit,
            fill,
            { red: 0.72, green: 0.28, blue: 0.28, alpha: 0.16 },
            node.opacity,
            'fill',
          )
          configurePaint(
            canvasKit,
            stroke,
            { red: 0.72, green: 0.28, blue: 0.28, alpha: 0.9 },
            node.opacity,
            'stroke',
          )
          if (rounded && canvas.drawRRect) {
            canvas.drawRRect(rounded, fill)
            canvas.drawRRect(rounded, stroke)
          } else {
            canvas.drawRect(bounds, fill)
            canvas.drawRect(bounds, stroke)
          }
        }
        if (node.stroke && (node.strokeWidth ?? 0) > 0) {
          configurePaint(
            canvasKit,
            stroke,
            node.stroke,
            node.opacity,
            'stroke',
            node.strokeWidth ?? 1,
          )
          stroke.setStrokeJoin(
            node.lineJoin === 'round'
              ? canvasKit.StrokeJoin.Round
              : node.lineJoin === 'bevel'
                ? canvasKit.StrokeJoin.Bevel
                : canvasKit.StrokeJoin.Miter,
          )
          if (rounded && canvas.drawRRect) canvas.drawRRect(rounded, stroke)
          else canvas.drawRect(bounds, stroke)
        }
      } finally {
        canvas.restore()
        fill.delete()
        stroke.delete()
      }
    }
  } finally {
    canvas.restore()
  }
  surface.flush()
}

function renderCanvasKitPng(
  canvasKit: CanvasKitApi,
  scene: RenderSceneSnapshot,
  resources: ReadonlyMap<string, CanvasKitImageResource>,
  typefaces: CanvasKitTypefaceStore,
  options: RenderExportOptions = {},
): Uint8Array {
  const scale = options.scale ?? 1
  const outputSize = scaledOutputSize(scene.outputBounds, scale)
  const fullWidth = Math.max(1, Math.round(scene.width * scale))
  const fullHeight = Math.max(1, Math.round(scene.height * scale))
  const surface = canvasKit.MakeSurface(fullWidth, fullHeight)
  if (!surface) throw new Error('CanvasKit headless surface creation failed')
  try {
    drawScene(canvasKit, surface, scene, resources, typefaces, scale)
    const fullImage = surface.makeImageSnapshot()
    try {
      const fullOutput =
        scene.outputBounds.x === 0 &&
        scene.outputBounds.y === 0 &&
        scene.outputBounds.width === scene.width &&
        scene.outputBounds.height === scene.height
      if (fullOutput) {
        const bytes = fullImage.encodeToBytes(canvasKit.ImageFormat.PNG)
        if (!bytes) throw new Error('CanvasKit PNG encoding failed')
        return new Uint8Array(bytes)
      }

      const outputSurface = canvasKit.MakeSurface(
        outputSize.width,
        outputSize.height,
      )
      if (!outputSurface) {
        throw new Error('CanvasKit cropped surface creation failed')
      }
      try {
        const canvas = outputSurface.getCanvas()
        canvas.clear(canvasKit.TRANSPARENT)
        const paint = new canvasKit.Paint()
        try {
          paint.setAntiAlias(false)
          paint.setColorComponents(1, 1, 1, 1)
          drawSnapshotCanvasKit(
            canvasKit,
            canvas,
            fullImage,
            canvasKit.XYWHRect(
              scene.outputBounds.x * scale,
              scene.outputBounds.y * scale,
              scene.outputBounds.width * scale,
              scene.outputBounds.height * scale,
            ),
            canvasKit.XYWHRect(0, 0, outputSize.width, outputSize.height),
            paint,
          )
        } finally {
          paint.delete()
        }
        outputSurface.flush()
        const outputImage = outputSurface.makeImageSnapshot()
        try {
          const bytes = outputImage.encodeToBytes(canvasKit.ImageFormat.PNG)
          if (!bytes) throw new Error('CanvasKit PNG encoding failed')
          return new Uint8Array(bytes)
        } finally {
          outputImage.delete()
        }
      } finally {
        outputSurface.dispose()
      }
    } finally {
      fullImage.delete()
    }
  } finally {
    surface.dispose()
  }
}

export function renderHeadlessCanvasKitPng(
  canvasKit: CanvasKitApi,
  scene: RenderSceneSnapshot,
  fontData: readonly CanvasKitFontData[] = [],
  options: RenderExportOptions = {},
): Uint8Array {
  const typefaces = new CanvasKitTypefaceStore(canvasKit, fontData)
  try {
    return renderCanvasKitPng(canvasKit, scene, new Map(), typefaces, options)
  } finally {
    typefaces.dispose()
  }
}

export class CanvasKitRenderer implements Renderer {
  readonly backend = 'canvaskit' as const
  readonly #canvasKit: CanvasKitApi
  readonly #now: () => number
  readonly #resources = new Map<string, CanvasKitImageResource>()
  readonly #typefaces: CanvasKitTypefaceStore
  #stack: CanvasStack | undefined
  #surface: CanvasKitSurface | undefined
  #scene: RenderSceneSnapshot | undefined
  #overlay: readonly RenderNode[] = []
  #picture: CanvasKitPicture | undefined
  #pictureScene: RenderSceneSnapshot | undefined
  #disposed = false

  constructor(
    canvasKit: CanvasKitApi,
    now: () => number = () => performance.now(),
    fontData: readonly CanvasKitFontData[] = [],
  ) {
    this.#canvasKit = canvasKit
    this.#now = now
    this.#typefaces = new CanvasKitTypefaceStore(canvasKit, fontData)
  }

  async initialize(stack: CanvasStack): Promise<void> {
    this.#assertActive()
    this.#stack = stack
    if (!stack.overlay.getContext('2d')) {
      this.#stack = undefined
      throw new Error('Canvas2D overlay context is unavailable')
    }
    const bounds = this.#scene?.outputBounds
    try {
      this.#replaceSurface(
        bounds?.width ?? Math.max(1, stack.scene.width),
        bounds?.height ?? Math.max(1, stack.scene.height),
      )
    } catch (error) {
      this.#stack = undefined
      throw error
    }
  }

  async createImageResource(input: ImageResourceInput): Promise<ImageResource> {
    this.#assertReady(false)
    this.#resources.get(input.id)?.dispose()
    const image = this.#surface!.makeImageFromTextureSource(input.source)
    if (!image) throw new Error(`CanvasKit texture load failed for ${input.id}`)
    const resource: CanvasKitImageResource = {
      id: input.id,
      width: input.width,
      height: input.height,
      source: input.source,
      image,
      dispose: () => {
        if (this.#resources.delete(input.id)) {
          this.#disposePicture()
          resource.image.delete()
        }
      },
    }
    this.#resources.set(resource.id, resource)
    this.#disposePicture()
    return resource
  }

  setScene(scene: RenderSceneSnapshot): void {
    this.#assertActive()
    this.#scene = scene
    if (this.#pictureScene !== scene) this.#disposePicture()
    if (this.#stack) {
      this.#replaceSurface(scene.outputBounds.width, scene.outputBounds.height)
    }
  }

  setOverlay(nodes: readonly RenderNode[]): void {
    this.#assertActive()
    this.#overlay = nodes
  }

  render(reasons: readonly InvalidationReason[]): FrameMetric {
    this.#assertReady()
    const startedAt = this.#now()
    if (
      reasons.some((reason) =>
        ['scene', 'viewport', 'resource', 'export'].includes(reason),
      )
    ) {
      this.#drawCommittedScene()
    }
    if (reasons.includes('overlay') || reasons.includes('viewport')) {
      const overlay = this.#stack!.overlay
      const bounds = this.#scene!.outputBounds
      overlay.width = Math.max(1, Math.round(bounds.width))
      overlay.height = Math.max(1, Math.round(bounds.height))
      const context = overlay.getContext('2d')!
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, overlay.width, overlay.height)
      context.setTransform(1, 0, 0, 1, -bounds.x, -bounds.y)
      drawNodes2D(context, this.#overlay)
    }
    return {
      backend: this.backend,
      correlationId: this.#stack!.correlationId,
      reasons: [...reasons],
      nodeCount: this.#scene!.nodes.length + this.#overlay.length,
      startedAt,
      duration: this.#now() - startedAt,
    }
  }

  async exportPng(options: RenderExportOptions = {}): Promise<Uint8Array> {
    this.#assertReady()
    return renderCanvasKitPng(
      this.#canvasKit,
      this.#scene!,
      this.#resources,
      this.#typefaces,
      options,
    )
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#disposePicture()
    for (const resource of [...this.#resources.values()]) resource.dispose()
    this.#typefaces.dispose()
    const surface = this.#surface
    const contextHandle = surface?.Gd
    surface?.dispose()
    if (contextHandle !== undefined) {
      this.#canvasKit.deleteContext(contextHandle)
    }
    this.#surface = undefined
    this.#stack = undefined
    this.#scene = undefined
  }

  #drawCommittedScene(): void {
    const scene = this.#scene!
    const cropped =
      scene.outputBounds.x !== 0 ||
      scene.outputBounds.y !== 0 ||
      scene.outputBounds.width !== scene.width ||
      scene.outputBounds.height !== scene.height
    if (cropped) {
      const working = this.#canvasKit.MakeSurface(scene.width, scene.height)
      if (!working) throw new Error('CanvasKit crop surface creation failed')
      try {
        drawScene(
          this.#canvasKit,
          working,
          scene,
          this.#resources,
          this.#typefaces,
        )
        const image = working.makeImageSnapshot()
        try {
          const canvas = this.#surface!.getCanvas()
          canvas.clear(this.#canvasKit.TRANSPARENT)
          const paint = new this.#canvasKit.Paint()
          try {
            paint.setAntiAlias(false)
            paint.setColorComponents(1, 1, 1, 1)
            drawSnapshotCanvasKit(
              this.#canvasKit,
              canvas,
              image,
              this.#canvasKit.XYWHRect(
                scene.outputBounds.x,
                scene.outputBounds.y,
                scene.outputBounds.width,
                scene.outputBounds.height,
              ),
              this.#canvasKit.XYWHRect(
                0,
                0,
                scene.outputBounds.width,
                scene.outputBounds.height,
              ),
              paint,
            )
          } finally {
            paint.delete()
          }
          this.#surface!.flush()
        } finally {
          image.delete()
        }
      } finally {
        working.dispose()
      }
      return
    }

    const canvas = this.#surface!.getCanvas()
    const picture = this.#pictureForScene()
    canvas.clear(this.#canvasKit.TRANSPARENT)
    if (picture && canvas.drawPicture) {
      canvas.drawPicture(picture)
      this.#surface!.flush()
      return
    }
    drawScene(
      this.#canvasKit,
      this.#surface!,
      this.#scene!,
      this.#resources,
      this.#typefaces,
    )
  }

  #pictureForScene(): CanvasKitPicture | undefined {
    if (this.#picture && this.#pictureScene === this.#scene)
      return this.#picture
    const PictureRecorder = this.#canvasKit.PictureRecorder
    if (!PictureRecorder || !this.#scene) return undefined
    const scene = this.#scene
    const fullOutput =
      scene.outputBounds.x === 0 &&
      scene.outputBounds.y === 0 &&
      scene.outputBounds.width === scene.width &&
      scene.outputBounds.height === scene.height
    if (
      !fullOutput ||
      scene.nodes.some((node) =>
        ['censor', 'spotlight', 'loupe'].includes(node.kind),
      )
    ) {
      return undefined
    }
    const recorder = new PictureRecorder()
    try {
      const recording = recorder.beginRecording(
        this.#canvasKit.XYWHRect(0, 0, this.#scene.width, this.#scene.height),
      )
      for (const node of this.#scene.nodes) {
        if (node.kind === 'image') {
          this.#drawImageNode(recording, node)
        } else {
          drawNodesCanvasKit(
            this.#canvasKit,
            recording,
            [node],
            this.#resources,
            this.#typefaces,
          )
        }
      }
      this.#picture = recorder.finishRecordingAsPicture()
      this.#pictureScene = this.#scene
      return this.#picture
    } finally {
      recorder.delete()
    }
  }

  #drawImageNode(
    canvas: CanvasKitCanvas,
    node: Extract<RenderNode, { kind: 'image' }>,
  ): void {
    if (!node.visible || node.opacity === 0) return
    const resource = this.#resources.get(node.resourceId)
    const fill = new this.#canvasKit.Paint()
    const stroke = new this.#canvasKit.Paint()
    try {
      canvas.save()
      canvas.translate(node.x, node.y)
      canvas.rotate(node.rotation, 0, 0)
      canvas.scale(node.scaleX, node.scaleY)
      const bounds = this.#canvasKit.XYWHRect(0, 0, node.width, node.height)
      const rounded =
        (node.cornerRadius ?? 0) > 0
          ? this.#canvasKit.RRectXY(
              bounds,
              node.cornerRadius ?? 0,
              node.cornerRadius ?? 0,
            )
          : undefined
      if (rounded) {
        canvas.clipRRect?.(rounded, this.#canvasKit.ClipOp?.Intersect, true)
      }
      if (resource) {
        fill.setAntiAlias(true)
        fill.setColorComponents(1, 1, 1, node.opacity)
        canvas.drawImageRect(
          resource.image,
          this.#canvasKit.XYWHRect(0, 0, resource.width, resource.height),
          bounds,
          fill,
          false,
        )
      } else {
        configurePaint(
          this.#canvasKit,
          fill,
          { red: 0.72, green: 0.28, blue: 0.28, alpha: 0.16 },
          node.opacity,
          'fill',
        )
        configurePaint(
          this.#canvasKit,
          stroke,
          { red: 0.72, green: 0.28, blue: 0.28, alpha: 0.9 },
          node.opacity,
          'stroke',
        )
        if (rounded && canvas.drawRRect) {
          canvas.drawRRect(rounded, fill)
          canvas.drawRRect(rounded, stroke)
        } else {
          canvas.drawRect(bounds, fill)
          canvas.drawRect(bounds, stroke)
        }
      }
      if (node.stroke && (node.strokeWidth ?? 0) > 0) {
        configurePaint(
          this.#canvasKit,
          stroke,
          node.stroke,
          node.opacity,
          'stroke',
          node.strokeWidth ?? 1,
        )
        stroke.setStrokeJoin(
          node.lineJoin === 'round'
            ? this.#canvasKit.StrokeJoin.Round
            : node.lineJoin === 'bevel'
              ? this.#canvasKit.StrokeJoin.Bevel
              : this.#canvasKit.StrokeJoin.Miter,
        )
        if (rounded && canvas.drawRRect) canvas.drawRRect(rounded, stroke)
        else canvas.drawRect(bounds, stroke)
      }
    } finally {
      canvas.restore()
      fill.delete()
      stroke.delete()
    }
  }

  #disposePicture(): void {
    this.#picture?.delete()
    this.#picture = undefined
    this.#pictureScene = undefined
  }

  #replaceSurface(width: number, height: number): void {
    const stack = this.#stack
    if (!stack) return
    const targetWidth = Math.max(1, Math.round(width))
    const targetHeight = Math.max(1, Math.round(height))
    const sizeChanged =
      stack.scene.width !== targetWidth ||
      stack.scene.height !== targetHeight ||
      !this.#surface
    stack.scene.style.width = `${targetWidth}px`
    stack.scene.style.height = `${targetHeight}px`
    stack.overlay.style.width = `${targetWidth}px`
    stack.overlay.style.height = `${targetHeight}px`
    if (!sizeChanged) return

    this.#disposePicture()
    const previousSurface = this.#surface
    const previousContext = previousSurface?.Gd
    previousSurface?.dispose()
    if (previousContext !== undefined) {
      this.#canvasKit.deleteContext(previousContext)
    }
    this.#surface = undefined

    stack.scene.width = targetWidth
    stack.scene.height = targetHeight
    stack.overlay.width = targetWidth
    stack.overlay.height = targetHeight
    const surface = this.#canvasKit.MakeWebGLCanvasSurface(stack.scene)
    if (!surface) throw new Error('CanvasKit WebGL surface creation failed')
    // CanvasKit silently swaps the DOM canvas for a software surface when the
    // GPU surface cannot be made. Runtime owns fallback explicitly so pointer
    // listeners, telemetry and backend state stay coherent.
    if (!stack.scene.isConnected) {
      const contextHandle = surface.Gd
      surface.dispose()
      if (contextHandle !== undefined) {
        this.#canvasKit.deleteContext(contextHandle)
      }
      throw new Error(
        'CanvasKit replaced the scene canvas with a software surface',
      )
    }

    const replacements = new Map<string, CanvasKitImage>()
    try {
      for (const [id, resource] of this.#resources) {
        const image = surface.makeImageFromTextureSource(resource.source)
        if (!image) {
          throw new Error(`CanvasKit texture reload failed for ${id}`)
        }
        replacements.set(id, image)
      }
    } catch (error) {
      for (const image of replacements.values()) image.delete()
      const contextHandle = surface.Gd
      surface.dispose()
      if (contextHandle !== undefined) {
        this.#canvasKit.deleteContext(contextHandle)
      }
      throw error
    }
    for (const [id, image] of replacements) {
      const resource = this.#resources.get(id)!
      resource.image.delete()
      resource.image = image
    }
    this.#surface = surface
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('CanvasKit renderer is disposed')
  }

  #assertReady(requireScene = true): void {
    this.#assertActive()
    if (!this.#surface || !this.#stack) {
      throw new Error('CanvasKit renderer is not initialized')
    }
    if (requireScene && !this.#scene) {
      throw new Error('CanvasKit renderer has no scene')
    }
  }
}
