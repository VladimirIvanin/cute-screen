import type {
  EditorDocumentV1,
  FillPaint,
  JsonObject,
  LayerNode,
  Point,
  Rect,
  ShapeLayer,
} from './document/types'
import {
  invertMatrix,
  transformPoint,
  transformToMatrix,
} from './geometry'

export type LinearGradientPaint = Extract<FillPaint, { kind: 'linearGradient' }> & JsonObject & { readonly start: Point & JsonObject; readonly end: Point & JsonObject }
export const DEFAULT_GRADIENT_FILL: LinearGradientPaint = Object.freeze({
  kind: 'linearGradient', start: Object.freeze({ x: .5, y: 1 }), end: Object.freeze({ x: .5, y: 0 }), opacity: 1,
  stops: Object.freeze([
    Object.freeze({ position: 0, color: Object.freeze({ red: 0, green: 0, blue: 0, alpha: 1 }) }),
    Object.freeze({ position: 1, color: Object.freeze({ red: 0, green: 0, blue: 0, alpha: 0 }) }),
  ]),
})
export const DEFAULT_GRADIENT_DEFAULTS: JsonObject = Object.freeze({
  annotationTool: 'gradient', shape: 'rectangle', fill: DEFAULT_GRADIENT_FILL,
  stroke: Object.freeze({ color: Object.freeze({ red: 0, green: 0, blue: 0, alpha: 0 }), width: 1,
    style: 'solid', cap: 'butt', join: 'miter' }), cornerRadius: 0, starPoints: 5, starInnerRatio: .45,
  layerOpacity: 1, blendMode: 'normal',
})
export function isGradientLayer(layer: LayerNode | undefined): layer is ShapeLayer {
  return layer?.kind === 'shape' && layer.payload.annotationTool === 'gradient' && (layer.payload.fill as JsonObject | undefined)?.kind === 'linearGradient'
}
export function gradientFrame(document: EditorDocumentV1): Rect {
  return document.crop ?? { x: 0, y: 0, ...document.canvas }
}
export function snapGradientPoint(
  point: Point,
  frame: Rect,
  zoom = 1,
): Point {
  const tolerance = 6 / Math.max(.01, zoom)
  const snap = (value: number, first: number, last: number) =>
    Math.abs(value - first) <= tolerance ? first : Math.abs(value - last) <= tolerance ? last : value
  return { x: snap(point.x, frame.x, frame.x + frame.width), y: snap(point.y, frame.y, frame.y + frame.height) }
}

/** Targets are gesture-relative translation deltas, never persisted layer constraints. */
export interface GradientMoveSnapState {
  readonly x?: number
  readonly y?: number
}

export function snapGradientMove(
  layer: LayerNode,
  delta: Point,
  frame: Rect,
  options: {
    readonly zoom?: number
    readonly previous?: GradientMoveSnapState | undefined
    readonly enabled?: boolean
  } = {},
): Readonly<{ delta: Point; state: GradientMoveSnapState }> {
  const zoom = options.zoom ?? 1
  if (
    options.enabled === false ||
    !Number.isFinite(zoom) ||
    zoom <= 0 ||
    !isGradientLayer(layer) ||
    layer.locked ||
    !layer.visible ||
    !layer.localBounds ||
    Math.abs(layer.transform.rotation % 360) > 1e-8
  ) return { delta, state: {} }
  const bounds = layer.localBounds
  const transform = layer.transform
  const left = transform.translateX + bounds.x * transform.scaleX + Math.min(0, bounds.width * transform.scaleX)
  const top = transform.translateY + bounds.y * transform.scaleY + Math.min(0, bounds.height * transform.scaleY)
  const axis = (value: number, targets: readonly number[], previous: number | undefined) => {
    // Hysteresis lets the user slide along one edge into a corner without jitter.
    if (
      previous !== undefined &&
      targets.includes(previous) &&
      Math.abs(value - previous) <= 14 / zoom
    ) return previous
    return targets.filter((target) => Math.abs(value - target) <= 6 / zoom)
      .sort((a, b) => Math.abs(value - a) - Math.abs(value - b))[0]
  }
  const x = axis(
    delta.x,
    [frame.x - left, frame.x + frame.width - left - Math.abs(bounds.width * transform.scaleX)],
    options.previous?.x,
  )
  const y = axis(
    delta.y,
    [frame.y - top, frame.y + frame.height - top - Math.abs(bounds.height * transform.scaleY)],
    options.previous?.y,
  )
  return {
    delta: { x: x ?? delta.x, y: y ?? delta.y },
    state: { ...(x === undefined ? {} : { x }), ...(y === undefined ? {} : { y }) },
  }
}

export function fitGradientLayer(
  layer: ShapeLayer,
  frame: Rect,
  axis: 'width' | 'height',
): ShapeLayer {
  if (
    !isGradientLayer(layer) ||
    layer.locked ||
    Math.abs(layer.transform.rotation % 360) > 1e-8
  ) return layer
  const bounds = layer.localBounds!
  const scale = axis === 'width' ? layer.transform.scaleX : layer.transform.scaleY
  const origin = axis === 'width' ? frame.x : frame.y
  const extent = frame[axis]
  const local = axis === 'width' ? bounds.x : bounds.y
  const translation = origin + (scale < 0 ? extent : 0) - local * scale
  const after = { ...layer, localBounds: { ...bounds, [axis]: extent },
    transform: { ...layer.transform, [axis === 'width' ? 'translateX' : 'translateY']: translation } }
  return JSON.stringify(after) === JSON.stringify(layer) ? layer : Object.freeze(after)
}
export type GradientPlacement = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom' | 'width' | 'height'

/** Alignment preserves the intrinsic area and fill; fit changes one intrinsic extent. */
export function placeGradientLayer(
  layer: ShapeLayer,
  frame: Rect,
  placement: GradientPlacement,
): ShapeLayer {
  if (placement === 'width' || placement === 'height') return fitGradientLayer(layer, frame, placement)
  if (
    !isGradientLayer(layer) ||
    layer.locked ||
    Math.abs(layer.transform.rotation % 360) > 1e-8
  ) return layer
  const horizontal = ['left', 'centerX', 'right'].includes(placement)
  const bounds = layer.localBounds!
  const scale = horizontal ? layer.transform.scaleX : layer.transform.scaleY
  const extent = (horizontal ? bounds.width : bounds.height) * Math.abs(scale)
  const frameExtent = horizontal ? frame.width : frame.height
  const fraction = placement.startsWith('center') ? .5 : placement === 'right' || placement === 'bottom' ? 1 : 0
  const origin = (horizontal ? frame.x : frame.y) + (frameExtent - extent) * fraction
  const local = horizontal ? bounds.x : bounds.y
  const offset = local * scale + Math.min(0, scale) * (horizontal ? bounds.width : bounds.height)
  const field = horizontal ? 'translateX' : 'translateY'
  const translation = origin - offset
  if (Math.abs(translation - layer.transform[field]) < 1e-8) return layer
  return Object.freeze({ ...layer, transform: { ...layer.transform, [field]: translation } })
}
export function gradientPoints(layer: ShapeLayer): Readonly<{ start: Point; end: Point }> {
  const fill = layer.payload.fill as LinearGradientPaint
  const bounds = layer.localBounds!
  const matrix = transformToMatrix(layer.transform)
  const world = (point: Point) => transformPoint(matrix, {
    x: bounds.x + point.x * bounds.width,
    y: bounds.y + point.y * bounds.height,
  })
  return { start: world(fill.start), end: world(fill.end) }
}
/** Endpoint values are world points; a line value is a world-space delta. */
export function updateGradientHandle(
  layer: ShapeLayer,
  handle: 'start' | 'end' | 'line' | number,
  point: Point,
  shift = false,
): ShapeLayer {
  if (!isGradientLayer(layer) || layer.locked) return layer
  const fill = layer.payload.fill as LinearGradientPaint
  const bounds = layer.localBounds!
  const inverse = invertMatrix(transformToMatrix(layer.transform))
  if (!inverse) return layer
  const normalize = (world: Point) => {
    const local = transformPoint(inverse, world)
    return { x: (local.x - bounds.x) / bounds.width, y: (local.y - bounds.y) / bounds.height }
  }
  let after: LinearGradientPaint
  if (handle === 'line') {
    const origin = normalize({ x: 0, y: 0 })
    const delta = normalize(point)
    const move = (p: Point) => ({ x: p.x + delta.x - origin.x, y: p.y + delta.y - origin.y })
    after = { ...fill, start: move(fill.start), end: move(fill.end) }
  } else if (typeof handle === 'number') {
    if (!fill.stops[handle]) return layer
    const world = gradientPoints(layer)
    const dx = world.end.x - world.start.x, dy = world.end.y - world.start.y
    const projection = ((point.x - world.start.x) * dx + (point.y - world.start.y) * dy) / (dx * dx + dy * dy)
    const position = Math.max(0, Math.min(1, projection))
    const stops = fill.stops
      .map((stop, index) => index === handle ? { ...stop, position } : stop)
      .sort((a, b) => a.position - b.position)
    after = { ...fill, stops }
  } else {
    if (shift) {
      const origin = gradientPoints(layer)[handle === 'start' ? 'end' : 'start']
      const length = Math.hypot(point.x - origin.x, point.y - origin.y)
      const angle = Math.round(Math.atan2(point.y - origin.y, point.x - origin.x) / (Math.PI / 4)) * Math.PI / 4
      point = { x: origin.x + Math.cos(angle) * length, y: origin.y + Math.sin(angle) * length }
    }
    const next = normalize(point)
    const fixed = fill[handle === 'start' ? 'end' : 'start']
    if (Math.hypot(next.x - fixed.x, next.y - fixed.y) < 1e-6) return layer
    after = { ...fill, [handle]: next }
  }
  return JSON.stringify(after) === JSON.stringify(fill) ? layer : Object.freeze({
    ...layer,
    payload: { ...layer.payload, fill: after },
  })
}

export function rotateGradientFill(
  fill: LinearGradientPaint,
  degrees: number,
  width = 1,
  height = 1,
): LinearGradientPaint {
  const center = { x: (fill.start.x + fill.end.x) / 2, y: (fill.start.y + fill.end.y) / 2 }
  const radians = degrees * Math.PI / 180
  const rotate = (point: Point) => {
    const x = (point.x - center.x) * width, y = (point.y - center.y) * height
    return { x: center.x + (x * Math.cos(radians) - y * Math.sin(radians)) / width,
      y: center.y + (x * Math.sin(radians) + y * Math.cos(radians)) / height }
  }
  return { ...fill, start: rotate(fill.start), end: rotate(fill.end) }
}
