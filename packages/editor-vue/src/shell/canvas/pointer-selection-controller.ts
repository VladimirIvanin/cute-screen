import {
  hitTestDocument,
  hitTestDocumentAll,
  type LayerNode,
} from '@cute-screen/editor-renderer'
import type { CanvasPoint } from './contracts'
import type { PointerDownContext } from './pointer-down-contracts'
import type { ResizeHandle } from './workspace-state'

export function handleSelectionStart(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
  selected: LayerNode | undefined,
): void {
  if (selected && !selected.locked) {
    if (beginDirectHandle(context, event, point, selected)) return
    const endpoint = context.intrinsicEndpoint(selected, point)
    if (endpoint) {
      beginIntrinsicResize(context, event, point, selected, endpoint)
      return
    }
    const resize = context.resizeHandle(selected, point)
    if (resize) {
      beginResize(context, event, point, selected, resize)
      return
    }
    if (context.rotationCorner(selected, point)) {
      beginRotation(context, event, point, selected)
      return
    }
  }
  selectHitLayer(context, event, point)
}

function beginDirectHandle(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
  selected: LayerNode,
): boolean {
  const callout = context.calloutHandle(selected, point)
  if (selected.kind === 'callout' && callout) {
    context.scene.value!.setPointerCapture(event.pointerId)
    context.setGesture({
      kind: 'calloutHandle',
      id: selected.id,
      handle: callout,
      start: point,
      current: point,
    })
    context.renderCommittedScene()
    return true
  }
  const arrow = context.arrowHandle(selected, point)
  if (selected.kind === 'arrow' && arrow) {
    context.scene.value!.setPointerCapture(event.pointerId)
    context.setGesture({
      kind: 'arrowHandle',
      id: selected.id,
      handle: arrow,
      start: point,
      current: point,
    })
    context.renderCommittedScene()
    return true
  }
  return false
}

function beginIntrinsicResize(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
  selected: LayerNode,
  handle: 'start' | 'end',
): void {
  context.scene.value!.setPointerCapture(event.pointerId)
  context.setCursor('crosshair')
  context.setGesture({
    kind: 'intrinsicResize',
    id: selected.id,
    handle,
    start: point,
    current: point,
    initial: selected,
    preserveAspect: false,
    centerResize: false,
  })
  context.renderCommittedScene()
}

function beginResize(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
  selected: LayerNode,
  handle: ResizeHandle,
): void {
  context.scene.value!.setPointerCapture(event.pointerId)
  context.setCursor(context.resizeCursor(handle))
  context.setGesture(
    selected.kind === 'image'
      ? {
          kind: 'resize',
          id: selected.id,
          handle,
          start: point,
          current: point,
          initial: selected.transform,
          freeResize: event.shiftKey,
          centerResize: event.altKey,
        }
      : {
          kind: 'intrinsicResize',
          id: selected.id,
          handle,
          start: point,
          current: point,
          initial: selected,
          preserveAspect:
            event.shiftKey ||
            selected.kind === 'emoji' ||
            selected.kind === 'loupe',
          centerResize: event.altKey,
        },
  )
  context.renderCommittedScene()
}

function beginRotation(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
  selected: LayerNode,
): void {
  context.scene.value!.setPointerCapture(event.pointerId)
  context.setCursor('', true)
  const bounds = context.layerBounds(selected)
  const center = context.transformPoint(selected.transform, {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  })
  const angle = Math.atan2(point.y - center.y, point.x - center.x)
  context.setGesture({
    kind: 'rotate',
    id: selected.id,
    center,
    startAngle: angle,
    initial: selected.transform,
    currentAngle: selected.transform.rotation,
  })
  context.renderCommittedScene()
}

function selectHitLayer(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
): void {
  const document = context.props.document!
  const hits = hitTestDocumentAll(document, point)
  const key = hits.map((hit) => hit.nodeId).join(':')
  const now = performance.now()
  const previous = context.cycle()
  const shouldCycle =
    event.detail > 1 && previous?.key === key && now - previous.at <= 1000
  const index =
    hits.length === 0
      ? 0
      : shouldCycle
        ? ((previous?.index ?? 0) + 1) % hits.length
        : 0
  context.setCycle({ key, at: now, index })
  const hit = hits[index] ?? hitTestDocument(document, point)
  if (!hit) return
  context.emit('selectLayer', hit.nodeId, event.metaKey || event.ctrlKey)
  context.scene.value!.setPointerCapture(event.pointerId)
  context.setGesture({
    kind: 'move',
    id: hit.nodeId,
    start: point,
    current: point,
    guides: [],
    guidesVisible: false,
  })
  context.renderCommittedScene()
}
