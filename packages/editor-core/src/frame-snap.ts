import type {
  Point,
  Rect,
} from './document/types'
import type { BoundsResizeHandle } from './layer-resize'

export interface FrameMoveSnapState {
  readonly x?: number
  readonly y?: number
}

function nearestEdge(
  value: number,
  first: number,
  last: number,
  tolerance: number,
): number | undefined {
  return [first, last].filter((edge) => Math.abs(value - edge) <= tolerance)
    .sort((a, b) => Math.abs(value - a) - Math.abs(value - b))[0]
}

/** Rectangle edges, rather than the pointer, capture the frame. State is gesture-local. */
export function snapFrameMove(
  bounds: Rect,
  delta: Point,
  frame: Rect,
  options: {
    readonly zoom?: number
    readonly previous?: FrameMoveSnapState | undefined
    readonly enabled?: boolean
  } = {},
): Readonly<{ delta: Point; state: FrameMoveSnapState }> {
  const zoom = options.zoom ?? 1
  if (
    options.enabled === false ||
    !Number.isFinite(zoom) ||
    zoom <= 0
  ) return { delta, state: {} }
  const axis = (value: number, first: number, last: number, previous: number | undefined) => {
    if (
      previous !== undefined &&
      (previous === first ||
        previous === last) &&
        Math.abs(value - previous) <= 14 / zoom
    ) return previous
    return nearestEdge(value, first, last, 6 / zoom)
  }
  const x = axis(delta.x, frame.x - bounds.x, frame.x + frame.width - bounds.x - bounds.width, options.previous?.x)
  const y = axis(delta.y, frame.y - bounds.y, frame.y + frame.height - bounds.y - bounds.height, options.previous?.y)
  return { delta: { x: x ?? delta.x, y: y ?? delta.y },
    state: { ...(x === undefined ? {} : { x }), ...(y === undefined ? {} : { y }) } }
}

/** Axis-aligned world bounds. Callers map reflected handles before entering here. */
export function snapFrameResizePoint(
  bounds: Rect,
  handle: BoundsResizeHandle,
  point: Point,
  frame: Rect,
  options: { readonly zoom?: number; readonly preserveAspect?: boolean; readonly fromCenter?: boolean } = {},
): Point {
  const zoom = options.zoom ?? 1
  if (!Number.isFinite(zoom) || zoom <= 0) return point
  const changesX = handle.includes('w') || handle.includes('e')
  const changesY = handle.includes('n') || handle.includes('s')
  const corner = resizeCorner(bounds, handle)
  const anchor = resizeAnchor(bounds, handle, options.fromCenter === true)
  const vector = { x: corner.x - anchor.x, y: corner.y - anchor.y }
  const aspect = options.preserveAspect && changesX && changesY
  const predicted = aspect ? aspectPoint(point, anchor, vector) : point
  const validX = resizeEdge(changesX, predicted.x, anchor.x, vector.x, frame.x, frame.x + frame.width, 6 / zoom)
  const validY = resizeEdge(changesY, predicted.y, anchor.y, vector.y, frame.y, frame.y + frame.height, 6 / zoom)
  if (!aspect) return { x: validX ?? point.x, y: validY ?? point.y }
  if (validX === undefined && validY === undefined) return point
  const useX = validX !== undefined &&
    (validY === undefined || Math.abs(validX - predicted.x) <= Math.abs(validY - predicted.y))
  const snappedFactor = useX ? (validX! - anchor.x) / vector.x : (validY! - anchor.y) / vector.y
  return { x: anchor.x + vector.x * snappedFactor, y: anchor.y + vector.y * snappedFactor }
}

function resizeCorner(
  bounds: Rect,
  handle: BoundsResizeHandle,
): Point {
  return { x: bounds.x + (handle.includes('w') ? 0 : bounds.width),
    y: bounds.y + (handle.includes('n') ? 0 : bounds.height) }
}

function resizeAnchor(
  bounds: Rect,
  handle: BoundsResizeHandle,
  fromCenter: boolean,
): Point {
  return fromCenter ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    : { x: bounds.x + (handle.includes('w') ? bounds.width : 0),
        y: bounds.y + (handle.includes('n') ? bounds.height : 0) }
}

function aspectPoint(
  point: Point,
  anchor: Point,
  vector: Point,
): Point {
  const x = (point.x - anchor.x) / vector.x, y = (point.y - anchor.y) / vector.y
  const factor = Math.abs(x - 1) >= Math.abs(y - 1) ? x : y
  return { x: anchor.x + vector.x * factor, y: anchor.y + vector.y * factor }
}

function resizeEdge(
  enabled: boolean,
  value: number,
  anchor: number,
  vector: number,
  first: number,
  last: number,
  tolerance: number,
): number | undefined {
  if (!enabled || (value - anchor) * vector <= 0) return undefined
  const edge = nearestEdge(value, first, last, tolerance)
  return edge !== undefined && (edge - anchor) * vector > 0 ? edge : undefined
}
