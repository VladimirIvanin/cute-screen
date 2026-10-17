import {
  calloutGeometryContext,
  layerSelectionHandles,
  type LayerNode,
  type SelectionHandle,
} from '@cute-screen/editor-renderer'
import type {
  CanvasPoint,
  ViewportOutputBounds,
} from './contracts'

function insertionHandle(handle: SelectionHandle): SelectionHandle {
  if (handle.kind !== 'callout') return handle
  if (handle.handle === 'elbow') return { ...handle, handle: 'insert:1' }
  if (!handle.handle.startsWith('segment:')) return handle
  return { ...handle, handle: handle.handle.replace('segment:', 'insert:') as `insert:${number}` }
}

/** Clamped square centres must be identical for painting and pointer targeting. */
export function canvasSelectionHandles(
  layer: LayerNode,
  scale: CanvasPoint,
  bounds: ViewportOutputBounds | undefined,
  insertSteps = false,
): readonly SelectionHandle[] {
  const handles = layerSelectionHandles(layer, scale, calloutGeometryContext())
    .map((handle) => insertSteps ? insertionHandle(handle) : handle)
  if (!bounds) return handles
  const hasResize = handles.some((handle) => handle.kind === 'resize')
  return handles.map((handle) => {
    if (handle.kind !== 'resize' && !(handle.kind === 'rotate' && !hasResize)) return handle
    const halfX = 3 / scale.x
    const halfY = 3 / scale.y
    return { ...handle, point: {
      x: Math.max(bounds.x + halfX, Math.min(bounds.x + bounds.width - halfX, handle.point.x)),
      y: Math.max(bounds.y + halfY, Math.min(bounds.y + bounds.height - halfY, handle.point.y)),
    } }
  })
}
