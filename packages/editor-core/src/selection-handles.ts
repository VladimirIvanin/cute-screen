import { arrowSelectionHandles } from './arrow-geometry'
import {
  calloutSelectionHandles,
  type CalloutGeometryContext,
} from './callout-geometry'
import type {
  LayerNode,
  Point,
} from './document/types'
import {
  transformPoint,
  transformToMatrix,
} from './geometry'
import {
  BOUNDS_RESIZE_HANDLES,
  layerIntrinsicResizeHandles,
  type BoundsResizeHandle,
} from './layer-resize'
import { layerHitBounds } from './hit-test'
import type { SelectionHandle } from './selection-target'

/** Shared positions for painting controls and resolving pointer targets. Radius is CSS pixels. */
export function layerSelectionHandles(
  layer: LayerNode,
  screenScale: Point = { x: 1, y: 1 },
  context: CalloutGeometryContext = {},
): readonly SelectionHandle[] {
  if (
    !layer.visible ||
    layer.locked ||
    layer.kind === 'numberedMarker'
  ) return []
  const matrix = transformToMatrix(layer.transform)
  const world = (point: Point) => transformPoint(matrix, point)
  const base = { nodeId: layer.id, radius: 9 }
  const handles: SelectionHandle[] = []
  if (layer.kind === 'arrow') handles.push(...arrowSelectionHandles(layer).map((item) => ({
    ...base, kind: 'arrow' as const, handle: item.kind, point: world(item.point),
  })))
  if (layer.kind === 'callout') handles.push(...calloutSelectionHandles(layer, context).map((item) => ({
    ...base, kind: 'callout' as const, handle: item.kind, point: world(item.point),
  })))
  if (layer.kind === 'ruler') handles.push(...(['start', 'end'] as const).map((handle) => ({
    ...base, kind: 'endpoint' as const, handle, point: world(layer.payload[handle]),
  })))
  if (layer.kind === 'loupe') handles.push({ ...base, kind: 'loupeSource', point: {
    x: layer.payload.sourceRegion.x + layer.payload.sourceRegion.width / 2,
    y: layer.payload.sourceRegion.y + layer.payload.sourceRegion.height / 2,
  } })
  const b = layerHitBounds(layer, context)
  const positions: Record<BoundsResizeHandle, Point> = {
    nw: { x: b.x, y: b.y }, n: { x: b.x + b.width / 2, y: b.y }, ne: { x: b.x + b.width, y: b.y },
    e: { x: b.x + b.width, y: b.y + b.height / 2 }, se: { x: b.x + b.width, y: b.y + b.height },
    s: { x: b.x + b.width / 2, y: b.y + b.height }, sw: { x: b.x, y: b.y + b.height },
    w: { x: b.x, y: b.y + b.height / 2 },
  }
  const resize = layer.kind === 'image' ? BOUNDS_RESIZE_HANDLES : layerIntrinsicResizeHandles(layer).filter(
    (handle): handle is BoundsResizeHandle => handle !== 'start' && handle !== 'end',
  )
  handles.push(...resize.map((handle) => ({ ...base, kind: 'resize' as const, handle, point: world(positions[handle]) })))
  const center = world({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
  for (const handle of ['nw', 'ne', 'se', 'sw'] as const) {
    const corner = world(positions[handle])
    const dx = (corner.x - center.x) * screenScale.x
    const dy = (corner.y - center.y) * screenScale.y
    const length = Math.hypot(dx, dy) || 1
    const offset = resize.includes(handle) ? 14 : 0
    handles.push({ ...base, kind: 'rotate', handle, point: {
      x: corner.x + dx / length * offset / screenScale.x,
      y: corner.y + dy / length * offset / screenScale.y,
    } })
  }
  return handles
}
