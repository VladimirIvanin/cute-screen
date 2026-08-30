import type {
  RenderNode,
  RenderPaint,
  RenderTextStyle,
  RgbaColor,
} from '@cute-screen/editor-core'
import type { ImageResourceInput } from '../../types'
import type { Canvas2DLike, Context2D } from './contracts'

export function defaultCanvas(width: number, height: number): Canvas2DLike {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height) as unknown as Canvas2DLike
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  throw new Error('Canvas2D scratch surface is unavailable')
}

export function cssColor(color: RgbaColor): string {
  return `rgba(${Math.round(color.red * 255)}, ${Math.round(
    color.green * 255,
  )}, ${Math.round(color.blue * 255)}, ${color.alpha})`
}

export function cssBlendMode(
  mode: RenderNode['blendMode'],
): GlobalCompositeOperation {
  switch (mode) {
    case 'multiply':
      return 'multiply'
    case 'screen':
      return 'screen'
    case 'overlay':
      return 'overlay'
    case 'darken':
      return 'darken'
    case 'lighten':
      return 'lighten'
    case 'softLight':
      return 'soft-light'
    case 'hardLight':
      return 'hard-light'
    default:
      return 'source-over'
  }
}

export function paintStyle(
  context: Context2D,
  paint: RenderPaint,
  resources: ReadonlyMap<string, ImageResourceInput['source']> = new Map(),
): string | CanvasGradient | CanvasPattern {
  if (!('kind' in paint)) return cssColor(paint)
  if (paint.kind === 'imageTexture') {
    const resource = resources.get(paint.resourceId)
    if (!resource) return 'rgba(229, 72, 77, 0.16)'
    const pattern = context.createPattern(resource, 'repeat')
    if (!pattern) return 'rgba(229, 72, 77, 0.16)'
    if (
      typeof pattern.setTransform === 'function' &&
      typeof DOMMatrix !== 'undefined'
    ) {
      const transform = new DOMMatrix()
        .translate(paint.offsetX, paint.offsetY)
        .rotate(paint.rotation)
        .scale(paint.scale)
      pattern.setTransform(transform)
    }
    return pattern
  }
  const gradient =
    paint.kind === 'linearGradient'
      ? context.createLinearGradient(
          paint.startX,
          paint.startY,
          paint.endX,
          paint.endY,
        )
      : context.createRadialGradient(
          paint.centerX,
          paint.centerY,
          0,
          paint.centerX,
          paint.centerY,
          paint.radius,
        )
  for (const stop of paint.stops)
    gradient.addColorStop(stop.position, cssColor(stop.color))
  return gradient
}

export function canvasFont(style: RenderTextStyle, fontFamily: string): string {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px "${fontFamily.replaceAll('"', '')}", sans-serif`
}

export function withTransform(
  context: Context2D,
  node: RenderNode,
  centerX: number,
  centerY: number,
  draw: () => void,
): void {
  context.save()
  context.globalAlpha = node.opacity
  context.globalCompositeOperation = cssBlendMode(node.blendMode)
  const originX = node.transformOriginX ?? centerX
  const originY = node.transformOriginY ?? centerY
  const scaleX = node.scaleX ?? 1
  const scaleY = node.scaleY ?? 1
  if (node.rotation !== 0 || scaleX !== 1 || scaleY !== 1) {
    context.translate(originX, originY)
    context.rotate((node.rotation * Math.PI) / 180)
    context.scale(scaleX, scaleY)
    context.translate(-originX, -originY)
  }
  draw()
  context.restore()
}
