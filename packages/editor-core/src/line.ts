import type {
  LayerNode,
  Point,
} from './document/types'

export type AnnotationTool = LayerNode['kind'] | 'line' | 'gradient'
export type LineAxis = 'horizontal' | 'vertical'

/** Persisted identity is explicit: legacy arrows without caps remain arrows. */
export function annotationTool(layer: LayerNode): AnnotationTool {
  if (layer.kind === 'shape' && layer.payload.annotationTool === 'gradient') return 'gradient'
  return layer.kind === 'arrow' && layer.payload.annotationTool === 'line' ? 'line' : layer.kind
}

export interface LineAlignment {
  readonly enabled?: boolean | undefined
  readonly shift?: boolean | undefined
  readonly axis?: LineAxis | undefined
}

/** World-space endpoint projection; the caller owns the transient hysteresis state. */
export function resolveLineEndpoint(
  start: Point,
  end: Point,
  options: LineAlignment = {},
): Readonly<{ point: Point; axis: LineAxis | undefined }> {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (!length) return { point: end, axis: undefined }
  if (options.shift) {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4
    return { point: { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length }, axis: undefined }
  }
  if (options.enabled === false) return { point: end, axis: undefined }
  const horizontal = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI
  const vertical = 90 - horizontal
  const axis = options.axis === 'horizontal' && horizontal <= 8 ? 'horizontal'
    : options.axis === 'vertical' && vertical <= 8 ? 'vertical'
      : horizontal <= 5 ? 'horizontal' : vertical <= 5 ? 'vertical' : undefined
  return { point: axis === 'horizontal' ? { x: end.x, y: start.y }
    : axis === 'vertical' ? { x: start.x, y: end.y } : end, axis }
}
