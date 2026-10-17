import { calloutLabelContains } from './callout-geometry'
import type { ArrowHandleKind } from './arrow-geometry'
import type {
  CalloutHandleKind,
  CalloutGeometryContext,
} from './callout-geometry'
import type { BoundsResizeHandle } from './layer-resize'
import type {
  EditorDocumentV1,
  Point,
  Rect,
  Transform2D,
} from './document/types'
import {
  invertMatrix,
  transformPoint,
  transformToMatrix,
} from './geometry'
import {
  hitTestDocumentAll,
  layerHitBounds,
  type HitTestResult,
  type HitTestOptions,
  type DocumentSpatialIndex,
} from './hit-test'
import { LAYER_INTERACTION_POLICIES } from './interaction-policy'
export { LAYER_INTERACTION_POLICIES } from './interaction-policy'

type HandleBase = { readonly nodeId: string; readonly point: Point; readonly radius: number }
export type SelectionHandle = HandleBase & (
  | { readonly kind: 'arrow'; readonly handle: ArrowHandleKind }
  | { readonly kind: 'callout'; readonly handle: CalloutHandleKind }
  | { readonly kind: 'endpoint'; readonly handle: 'start' | 'end' }
  | { readonly kind: 'resize' | 'rotate'; readonly handle: BoundsResizeHandle }
  | { readonly kind: 'loupeSource' }
)
export interface SelectionFrame {
  readonly bounds: Rect
  readonly transform: Transform2D
  readonly nodeIds: readonly string[]
}
export type SelectionTarget =
  | { readonly kind: 'empty' }
  | { readonly kind: 'object'; readonly nodeId: string; readonly hits: readonly HitTestResult[] }
  | { readonly kind: 'selection'; readonly nodeIds: readonly string[] }
  | { readonly kind: 'handle'; readonly target: SelectionHandle }

const identity: Transform2D = { translateX: 0, translateY: 0, rotation: 0, scaleX: 1, scaleY: 1 }

export function selectionFrame(
  document: EditorDocumentV1,
  selectedIds: readonly string[],
  context: CalloutGeometryContext = {},
): SelectionFrame | undefined {
  const layers = document.layers.filter((layer) => layer.visible && selectedIds.includes(layer.id))
  const first = layers[0]
  if (!first) return undefined
  const nodeIds = layers.map((layer) => layer.id)
  if (layers.length === 1) return { bounds: layerHitBounds(first, context), transform: first.transform, nodeIds }
  const points = layers.flatMap((layer) => {
    const b = layerHitBounds(layer, context)
    const matrix = transformToMatrix(layer.transform)
    return [
      { x: b.x, y: b.y },
      { x: b.x + b.width, y: b.y },
      { x: b.x, y: b.y + b.height },
      { x: b.x + b.width, y: b.y + b.height },
    ].map((point) => transformPoint(matrix, point))
  })
  const x = Math.min(...points.map((point) => point.x))
  const y = Math.min(...points.map((point) => point.y))
  return { nodeIds, transform: identity, bounds: { x, y,
    width: Math.max(...points.map((point) => point.x)) - x,
    height: Math.max(...points.map((point) => point.y)) - y } }
}

export function nearestSelectionHandle(
  handles: readonly SelectionHandle[],
  point: Point,
  screenScale: Point = { x: 1, y: 1 },
): SelectionHandle | undefined {
  let nearest: SelectionHandle | undefined
  let distance = Infinity
  for (const handle of handles) {
    const d = Math.hypot((handle.point.x - point.x) * screenScale.x, (handle.point.y - point.y) * screenScale.y)
    if (d <= handle.radius && d < distance) {
      nearest = handle
      distance = d
    }
  }
  return nearest
}

function frameContains(
  frame: SelectionFrame,
  point: Point,
): boolean {
  const local = transformPoint(invertMatrix(transformToMatrix(frame.transform)), point)
  const b = frame.bounds
  return local.x >= b.x && local.y >= b.y && local.x <= b.x + b.width && local.y <= b.y + b.height
}

export function resolveSelectionTarget(input: {
  readonly document: EditorDocumentV1
  readonly selectedIds: readonly string[]
  readonly point: Point
  readonly screenScale?: Point
  readonly handles?: readonly SelectionHandle[]
  readonly context?: CalloutGeometryContext
  readonly readOnly?: boolean
  readonly hitIndex?: DocumentSpatialIndex
}): SelectionTarget {
  const { document, selectedIds, point, context = {}, screenScale = { x: 1, y: 1 } } = input
  const selected = document.layers.filter((layer) => selectedIds.includes(layer.id))
  const movable = !input.readOnly && selected.length > 0 && selected.length === selectedIds.length &&
    selected.every((layer) => layer.visible && !layer.locked)
  if (movable && selected.length === 1) {
    const handles = input.handles?.filter((handle) => selectedIds.includes(handle.nodeId)) ?? []
    // Direct geometry controls precede bounds controls; nearest wins within each family.
    const direct = handles.filter((handle) => handle.kind !== 'resize' && handle.kind !== 'rotate')
    const handle = nearestSelectionHandle(direct, point, screenScale)
    if (handle) return { kind: 'handle', target: handle }
    const layer = selected[0]!
    const local = transformPoint(invertMatrix(transformToMatrix(layer.transform)), point)
    if (layer.kind === 'callout' && calloutLabelContains(layer.payload, local, context))
      return { kind: 'handle', target: { kind: 'callout', handle: 'labelBody', nodeId: layer.id, point, radius: 0 } }
    const boundsHandle = nearestSelectionHandle(handles.filter((item) => item.kind === 'resize'), point, screenScale)
      ?? nearestSelectionHandle(handles.filter((item) => item.kind === 'rotate'), point, screenScale)
    if (boundsHandle) return { kind: 'handle', target: boundsHandle }
  }
  const hits = (options: HitTestOptions) => input.hitIndex?.hitAll(point, options)
    ?? hitTestDocumentAll(document, point, context, options)
  const exact = hits({ screenScale, useInteractionPolicy: true, margin: 0 })
  if (exact[0]) return { kind: 'object', nodeId: exact[0].nodeId, hits: exact }
  const frame = movable ? selectionFrame(document, selectedIds, context) : undefined
  if (
    frame &&
    selected.every((layer) => LAYER_INTERACTION_POLICIES[layer.kind].selectedMove === 'frame') &&
    frameContains(frame, point)
  ) {
    return { kind: 'selection', nodeIds: frame.nodeIds }
  }
  const options: HitTestOptions = { screenScale, useInteractionPolicy: true }
  const padded = hits(options)
  return padded[0] ? { kind: 'object', nodeId: padded[0].nodeId, hits: padded } : { kind: 'empty' }
}
