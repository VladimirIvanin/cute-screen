import type {
  RenderNode,
  RenderPaint,
  RenderSceneSnapshot,
  RenderTextStyle,
  RgbaColor,
} from '@cute-screen/editor-core'

import type { InvalidationReason } from './scheduler'
import { drawNodes2D } from './canvas2d'
import { layoutRichText } from './rich-text-layout'
import type {
  CanvasStack,
  FrameMetric,
  ImageResource,
  ImageResourceInput,
  Renderer,
} from './types'

interface CanvasKitImageResource extends ImageResource {
  readonly image: CanvasKitImage
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
}

type CanvasKitShader = CanvasKitDeletable
type CanvasKitPathEffect = CanvasKitDeletable
type CanvasKitMaskFilter = CanvasKitDeletable
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
  readonly FilterMode?: Readonly<{ Linear?: unknown }>
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
  readonly BlurStyle?: Readonly<{ Normal: unknown }>
  readonly ClipOp?: Readonly<{ Intersect?: unknown }>
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
): void {
  const canvas = surface.getCanvas()
  canvas.clear(canvasKit.TRANSPARENT)
  for (const node of scene.nodes) {
    if (node.kind !== 'image') {
      drawNodesCanvasKit(canvasKit, canvas, [node], resources, typefaces)
      continue
    }
    if (!node.visible || node.opacity === 0) continue
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
  surface.flush()
}

export function renderHeadlessCanvasKitPng(
  canvasKit: CanvasKitApi,
  scene: RenderSceneSnapshot,
  fontData: readonly CanvasKitFontData[] = [],
): Uint8Array {
  const surface = canvasKit.MakeSurface(scene.width, scene.height)
  if (!surface) throw new Error('CanvasKit headless surface creation failed')
  const typefaces = new CanvasKitTypefaceStore(canvasKit, fontData)
  try {
    drawScene(canvasKit, surface, scene, new Map(), typefaces)
    const image = surface.makeImageSnapshot()
    try {
      const bytes = image.encodeToBytes(canvasKit.ImageFormat.PNG)
      if (!bytes) throw new Error('CanvasKit PNG encoding failed')
      return new Uint8Array(bytes)
    } finally {
      image.delete()
    }
  } finally {
    typefaces.dispose()
    surface.dispose()
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
    const surface = this.#canvasKit.MakeWebGLCanvasSurface(stack.scene)
    if (!surface) throw new Error('CanvasKit WebGL surface creation failed')
    // CanvasKit silently swaps the DOM canvas for a software surface when the
    // GPU surface cannot be made. Runtime owns fallback explicitly so pointer
    // listeners, telemetry and backend state stay coherent.
    if (!stack.scene.isConnected) {
      surface.dispose()
      throw new Error(
        'CanvasKit replaced the scene canvas with a software surface',
      )
    }
    this.#stack = stack
    this.#surface = surface
    if (!stack.overlay.getContext('2d')) {
      surface.dispose()
      this.#surface = undefined
      throw new Error('Canvas2D overlay context is unavailable')
    }
  }

  async createImageResource(input: ImageResourceInput): Promise<ImageResource> {
    this.#assertReady(false)
    const image = this.#surface!.makeImageFromTextureSource(input.source)
    if (!image) throw new Error(`CanvasKit texture load failed for ${input.id}`)
    const resource: CanvasKitImageResource = {
      id: input.id,
      width: input.width,
      height: input.height,
      image,
      dispose: () => {
        if (this.#resources.delete(input.id)) {
          this.#disposePicture()
          image.delete()
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
      const context = overlay.getContext('2d')!
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, overlay.width, overlay.height)
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

  async exportPng(): Promise<Uint8Array> {
    this.#assertReady()
    drawScene(
      this.#canvasKit,
      this.#surface!,
      this.#scene!,
      this.#resources,
      this.#typefaces,
    )
    const image = this.#surface!.makeImageSnapshot()
    try {
      const bytes = image.encodeToBytes(this.#canvasKit.ImageFormat.PNG)
      if (!bytes) throw new Error('CanvasKit PNG encoding failed')
      return new Uint8Array(bytes)
    } finally {
      image.delete()
    }
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
