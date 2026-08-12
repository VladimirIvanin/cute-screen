import type {
  RenderNode,
  RenderPaint,
  RenderSceneSnapshot,
  RgbaColor,
} from '@cute-screen/editor-core'

import type { InvalidationReason } from './scheduler'
import { drawNodes2D } from './canvas2d'
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
interface CanvasKitFont extends CanvasKitDeletable {
  getTextWidth?(text: string): number
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
    typeface: CanvasKitDeletable,
    size: number,
  ) => CanvasKitFont
  readonly Typeface?: Readonly<{
    MakeDefault?: () => CanvasKitDeletable
    GetDefault?: () => CanvasKitDeletable
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

export function drawNodesCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  nodes: readonly RenderNode[],
  resources: ReadonlyMap<string, CanvasKitImageResource> = new Map(),
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
          const typeface =
            canvasKit.Typeface.MakeDefault?.() ??
            canvasKit.Typeface.GetDefault?.()
          if (!typeface) break
          const font = new canvasKit.Font(typeface, node.fontSize)
          try {
            withTransform(
              canvas,
              node,
              node.x + node.width / 2,
              node.y + node.height / 2,
              () => {
                const drawLine = (
                  line: string,
                  y: number,
                  paint: CanvasKitPaint,
                  offsetX = 0,
                ): void => {
                  const spacing = node.letterSpacing ?? 0
                  const characters = Array.from(line)
                  const characterWidth = (character: string): number =>
                    font.getTextWidth?.(character) ?? node.fontSize * 0.6
                  const width =
                    spacing === 0
                      ? (font.getTextWidth?.(line) ??
                        characters.length * node.fontSize * 0.6)
                      : characters.reduce(
                          (total, character, index) =>
                            total +
                            characterWidth(character) +
                            (index === characters.length - 1 ? 0 : spacing),
                          0,
                        )
                  let x =
                    node.align === 'center'
                      ? node.x + node.width / 2 - width / 2
                      : node.align === 'end'
                        ? node.x + node.width - width
                        : node.x
                  x += offsetX
                  if (spacing === 0) {
                    canvas.drawText!(line, x, y, paint, font)
                    return
                  }
                  for (const character of characters) {
                    canvas.drawText!(character, x, y, paint, font)
                    x += characterWidth(character) + spacing
                  }
                }
                for (const shadow of node.shadows ?? []) {
                  const maskFilter =
                    shadow.blur > 0 &&
                    canvasKit.MaskFilter &&
                    canvasKit.BlurStyle &&
                    stroke.setMaskFilter
                      ? canvasKit.MaskFilter.MakeBlur(
                          canvasKit.BlurStyle.Normal,
                          shadow.blur / 2,
                          false,
                        )
                      : undefined
                  try {
                    configurePaint(
                      canvasKit,
                      stroke,
                      shadow.color,
                      node.opacity,
                      'fill',
                    )
                    stroke.setBlendMode(blendMode(canvasKit, node.blendMode))
                    stroke.setMaskFilter?.(maskFilter ?? null)
                    for (const [index, line] of node.text
                      .split('\n')
                      .entries()) {
                      drawLine(
                        line,
                        node.y +
                          node.fontSize +
                          shadow.offsetY +
                          index * node.lineHeight,
                        stroke,
                        shadow.offsetX,
                      )
                    }
                  } finally {
                    stroke.setMaskFilter?.(null)
                    maskFilter?.delete()
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
                  stroke.setBlendMode(blendMode(canvasKit, node.blendMode))
                  stroke.setStrokeJoin(
                    node.lineJoin === 'round'
                      ? canvasKit.StrokeJoin.Round
                      : node.lineJoin === 'bevel'
                        ? canvasKit.StrokeJoin.Bevel
                        : canvasKit.StrokeJoin.Miter,
                  )
                  for (const [index, line] of node.text.split('\n').entries()) {
                    drawLine(
                      line,
                      node.y + node.fontSize + index * node.lineHeight,
                      stroke,
                    )
                  }
                }
                shader = configureFillPaint(
                  canvasKit,
                  fill,
                  node.fill,
                  node.opacity,
                  node.blendMode,
                  resources,
                )
                for (const [index, line] of node.text.split('\n').entries()) {
                  drawLine(
                    line,
                    node.y + node.fontSize + index * node.lineHeight,
                    fill,
                  )
                }
                if (node.underline) {
                  fill.setStyle(canvasKit.PaintStyle.Stroke)
                  fill.setStrokeWidth(Math.max(1, node.fontSize * 0.06))
                  for (const [index, line] of node.text.split('\n').entries()) {
                    const characters = Array.from(line)
                    const spacing = node.letterSpacing ?? 0
                    const width = characters.reduce(
                      (total, character, characterIndex) =>
                        total +
                        (font.getTextWidth?.(character) ??
                          node.fontSize * 0.6) +
                        (characterIndex === characters.length - 1
                          ? 0
                          : spacing),
                      0,
                    )
                    const startX =
                      node.align === 'center'
                        ? node.x + node.width / 2 - width / 2
                        : node.align === 'end'
                          ? node.x + node.width - width
                          : node.x
                    const underlineY =
                      node.y + node.fontSize * 1.06 + index * node.lineHeight
                    canvas.drawLine(
                      startX,
                      underlineY,
                      startX + width,
                      underlineY,
                      fill,
                    )
                  }
                }
              },
            )
          } finally {
            font.delete()
            typeface.delete()
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
): void {
  const canvas = surface.getCanvas()
  canvas.clear(canvasKit.TRANSPARENT)
  for (const node of scene.nodes) {
    if (node.kind !== 'image') {
      drawNodesCanvasKit(canvasKit, canvas, [node], resources)
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
): Uint8Array {
  const surface = canvasKit.MakeSurface(scene.width, scene.height)
  if (!surface) throw new Error('CanvasKit headless surface creation failed')
  try {
    drawScene(canvasKit, surface, scene, new Map())
    const image = surface.makeImageSnapshot()
    try {
      const bytes = image.encodeToBytes(canvasKit.ImageFormat.PNG)
      if (!bytes) throw new Error('CanvasKit PNG encoding failed')
      return new Uint8Array(bytes)
    } finally {
      image.delete()
    }
  } finally {
    surface.dispose()
  }
}

export class CanvasKitRenderer implements Renderer {
  readonly backend = 'canvaskit' as const
  readonly #canvasKit: CanvasKitApi
  readonly #now: () => number
  readonly #resources = new Map<string, CanvasKitImageResource>()
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
  ) {
    this.#canvasKit = canvasKit
    this.#now = now
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
    drawScene(this.#canvasKit, this.#surface!, this.#scene!, this.#resources)
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
    for (const resource of [...this.#resources.values()]) resource.dispose()
    const surface = this.#surface
    const contextHandle = surface?.Gd
    surface?.dispose()
    if (contextHandle !== undefined) {
      this.#canvasKit.deleteContext(contextHandle)
    }
    this.#surface = undefined
    this.#stack = undefined
    this.#scene = undefined
    this.#disposePicture()
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
    drawScene(this.#canvasKit, this.#surface!, this.#scene!, this.#resources)
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
