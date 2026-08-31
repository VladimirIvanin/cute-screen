import type { RenderNode, RenderPaint, RgbaColor } from '../../scene/contracts'
import type { LayerNode } from '../types'

export const TRANSPARENT: RgbaColor = Object.freeze({
  red: 0,
  green: 0,
  blue: 0,
  alpha: 0,
})
const FALLBACK_STROKE: RgbaColor = Object.freeze({
  red: 0.898,
  green: 0.282,
  blue: 0.302,
  alpha: 1,
})
export const TEXT_BLACK: RgbaColor = Object.freeze({
  red: 0,
  green: 0,
  blue: 0,
  alpha: 1,
})

export function color(value: unknown, fallback = FALLBACK_STROKE): RgbaColor {
  if (!value || typeof value !== 'object') return fallback
  const input = value as Record<string, unknown>
  const channels = [input.red, input.green, input.blue, input.alpha]
  if (
    !channels.every(
      (channel) =>
        typeof channel === 'number' &&
        Number.isFinite(channel) &&
        channel >= 0 &&
        channel <= 1,
    )
  )
    return fallback
  return Object.freeze({
    red: input.red as number,
    green: input.green as number,
    blue: input.blue as number,
    alpha: input.alpha as number,
  })
}

function paintOpacity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 1
}

function imageTexture(input: Record<string, unknown>): RenderPaint | undefined {
  if (input.kind !== 'imageTexture') return undefined
  const transform =
    input.transform && typeof input.transform === 'object'
      ? (input.transform as Record<string, unknown>)
      : {}
  if (
    typeof input.blobHash !== 'string' ||
    input.blobHash.length !== 64 ||
    !/^[a-f0-9]+$/u.test(input.blobHash)
  )
    return undefined
  return Object.freeze({
    kind: 'imageTexture' as const,
    resourceId: input.blobHash,
    opacity: paintOpacity(input.opacity),
    scale:
      typeof transform.scale === 'number' && transform.scale > 0
        ? transform.scale
        : 1,
    rotation: typeof transform.rotation === 'number' ? transform.rotation : 0,
    offsetX: typeof transform.offsetX === 'number' ? transform.offsetX : 0,
    offsetY: typeof transform.offsetY === 'number' ? transform.offsetY : 0,
  })
}

export function fill(
  value: unknown,
  geometry: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  },
): RenderPaint {
  if (!value || typeof value !== 'object') return TRANSPARENT
  const input = value as Record<string, unknown>
  if (input.kind === 'none') return TRANSPARENT
  if (input.kind === 'solid') {
    const base = color(input.color, TRANSPARENT)
    const opacity = paintOpacity(input.opacity)
    return Object.freeze({
      ...base,
      alpha: base.alpha * Math.max(0, Math.min(1, opacity)),
    })
  }
  const stops = Array.isArray(input.stops)
    ? input.stops.map((stop) => {
        const entry = stop as Record<string, unknown>
        return Object.freeze({
          position: typeof entry.position === 'number' ? entry.position : 0,
          color: Object.freeze({
            ...color(entry.color, TRANSPARENT),
            alpha:
              color(entry.color, TRANSPARENT).alpha *
              paintOpacity(input.opacity),
          }),
        })
      })
    : []
  if (input.kind === 'linearGradient' && stops.length >= 2) {
    const start = localPoint(input.start, { x: 0, y: 0 })
    const end = localPoint(input.end, { x: 1, y: 1 })
    return Object.freeze({
      kind: 'linearGradient' as const,
      startX: geometry.x + start.x * geometry.width,
      startY: geometry.y + start.y * geometry.height,
      endX: geometry.x + end.x * geometry.width,
      endY: geometry.y + end.y * geometry.height,
      stops: Object.freeze(stops),
    })
  }
  if (input.kind === 'radialGradient' && stops.length >= 2) {
    const center = localPoint(input.center, { x: 0.5, y: 0.5 })
    const radius = typeof input.radius === 'number' ? input.radius : 0.5
    return Object.freeze({
      kind: 'radialGradient' as const,
      centerX: geometry.x + center.x * geometry.width,
      centerY: geometry.y + center.y * geometry.height,
      radius: Math.max(
        0.001,
        radius * Math.max(geometry.width, geometry.height),
      ),
      stops: Object.freeze(stops),
    })
  }
  const texture = imageTexture(input)
  if (texture) return texture
  // Bundled patterns and a missing/corrupt texture are recoverable visible
  // fallbacks until their resource/shader compiler is attached.
  return Object.freeze({ red: 0.898, green: 0.282, blue: 0.302, alpha: 0.16 })
}

export function stroke(value: unknown): {
  readonly color: RgbaColor
  readonly width: number
  readonly cap: 'butt' | 'round' | 'square'
  readonly join: 'miter' | 'round' | 'bevel'
  readonly dash?: readonly number[]
} {
  if (!value || typeof value !== 'object')
    return { color: FALLBACK_STROKE, width: 1, cap: 'butt', join: 'miter' }
  const input = value as Record<string, unknown>
  const width =
    typeof input.width === 'number' &&
    Number.isFinite(input.width) &&
    input.width > 0
      ? input.width
      : 1
  const style = input.style
  return {
    color: color(input.color),
    width,
    cap: input.cap === 'round' || input.cap === 'square' ? input.cap : 'butt',
    join:
      input.join === 'round' || input.join === 'bevel' ? input.join : 'miter',
    ...(style === 'dashed'
      ? { dash: Object.freeze([width * 3, width * 2]) }
      : {}),
    ...(style === 'dotted' ? { dash: Object.freeze([width, width * 2]) } : {}),
  }
}

export function bounds(layer: LayerNode) {
  return layer.localBounds
}

export function layerOpacity(layer: LayerNode): number {
  return 'opacity' in layer ? layer.opacity : 1
}

export function layerBlendMode(layer: LayerNode) {
  return 'blendMode' in layer ? layer.blendMode : 'normal'
}

export function localPoint(
  value: unknown,
  fallback: { readonly x: number; readonly y: number },
) {
  if (!value || typeof value !== 'object') return fallback
  const input = value as Record<string, unknown>
  return {
    x:
      typeof input.x === 'number' && Number.isFinite(input.x)
        ? input.x
        : fallback.x,
    y:
      typeof input.y === 'number' && Number.isFinite(input.y)
        ? input.y
        : fallback.y,
  }
}

export function lineNode(
  layer: LayerNode,
  id: string,
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
  style: ReturnType<typeof stroke>,
): RenderNode {
  return {
    kind: 'line',
    id,
    x1: layer.transform.translateX + start.x,
    y1: layer.transform.translateY + start.y,
    x2: layer.transform.translateX + end.x,
    y2: layer.transform.translateY + end.y,
    rotation: layer.transform.rotation,
    opacity: layerOpacity(layer),
    visible: layer.visible,
    blendMode: layerBlendMode(layer),
    stroke: style.color,
    strokeWidth: style.width,
    lineCap: style.cap,
    lineJoin: style.join,
    ...(style.dash === undefined ? {} : { dash: style.dash }),
  }
}

export function pathNode(
  layer: LayerNode,
  id: string,
  points: readonly { readonly x: number; readonly y: number }[],
  style: ReturnType<typeof stroke>,
): RenderNode {
  return {
    kind: 'path',
    id,
    points: points.map((point) => ({
      x: layer.transform.translateX + point.x,
      y: layer.transform.translateY + point.y,
    })),
    rotation: layer.transform.rotation,
    opacity: layerOpacity(layer),
    visible: layer.visible,
    blendMode: layerBlendMode(layer),
    stroke: style.color,
    strokeWidth: style.width,
    lineCap: style.cap,
    lineJoin: style.join,
    ...(style.dash === undefined ? {} : { dash: style.dash }),
  }
}
