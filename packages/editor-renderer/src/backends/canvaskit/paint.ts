import type {
  RenderNode,
  RenderPaint,
  RgbaColor,
} from '@cute-screen/editor-core'
import type {
  CanvasKitApi,
  CanvasKitImageResource,
  CanvasKitPaint,
  CanvasKitPathEffect,
  CanvasKitShader,
} from './contracts'

export function configurePaint(
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

export function blendMode(
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

export function configureFillPaint(
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

export function configureStrokePaint(
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
