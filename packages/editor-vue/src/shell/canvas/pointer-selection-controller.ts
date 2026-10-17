import { rulerAngleStep } from './ruler-modifiers'
import {
  type LayerNode,
  calloutLabelContains,
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
  const target = context.resolveSelectionTarget(point)
  if (context.props.readOnly) {
    if (target.kind === 'object') context.emit('selectLayer', target.nodeId, event.metaKey || event.ctrlKey)
    return
  }
  if (target.kind === 'handle' && selected) {
    beginSelectionHandle(context, event, point, selected, target.target)
    return
  }
  if (target.kind === 'selection') {
    beginSelectionMove(context, event, point, target.nodeIds)
    return
  }
  selectHitLayer(context, event, point, target.kind === 'object' ? target.hits : [])
}

function beginSelectionHandle(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
  selected: LayerNode,
  handle: import('@cute-screen/editor-renderer').SelectionHandle,
): void {
  switch (handle.kind) {
    case 'arrow':
    case 'callout': beginDirectHandle(context, event, point, selected, handle)
      break
    case 'endpoint': beginIntrinsicResize(context, event, point, selected, handle.handle)
      break
    case 'resize': beginResize(context, event, point, selected, handle.handle)
      break
    case 'rotate': beginRotation(context, event, point, selected)
      break
    case 'loupeSource':
      if (selected.kind !== 'loupe') return
      context.scene.value!.setPointerCapture(event.pointerId)
      context.setGesture({ kind: 'loupeSource', id: selected.id, initial: selected, start: point, current: point })
      context.renderCommittedScene()
      break
  }
}

function beginDirectHandle(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
  selected: LayerNode,
  target: Extract<import('@cute-screen/editor-renderer').SelectionHandle, { kind: 'arrow' | 'callout' }>,
): boolean {
  const callout = target.kind === 'callout' ? target.handle : undefined
  if (selected.kind === 'callout' && callout) {
    const local = context.toLocal(selected, point)
    const anchor = callout === 'labelBody' || callout === 'label' ? selected.payload.label : callout === 'target' ? selected.payload.target : local
    context.scene.value!.setPointerCapture(event.pointerId)
    context.setGesture({
      kind: 'calloutHandle',
      id: selected.id,
      handle: callout,
      offset: { x: local.x - anchor.x, y: local.y - anchor.y },
      start: point,
      current: point,
    })
    context.renderCommittedScene()
    return true
  }
  const arrow = target.kind === 'arrow' ? target.handle : undefined
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
    snapAngleIncrementDegrees: selected.kind === 'ruler' ? rulerAngleStep(event, selected.payload.snapAngleIncrementDegrees) : undefined,
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
          preserveAspect: event.shiftKey || selected.kind === 'emoji' || selected.kind === 'loupe',
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
  hits: readonly import('@cute-screen/editor-renderer').HitTestResult[],
): void {
  const key = hits.map((hit) => hit.nodeId).join(':')
  const now = performance.now()
  const previous = context.cycle()
  const shouldCycle = event.detail > 1 && previous?.key === key && now - previous.at <= 1000
  const index = hits.length === 0 ? 0 : shouldCycle ? ((previous?.index ?? 0) + 1) % hits.length : 0
  context.setCycle({ key, at: now, index })
  const hit = hits[index]
  if (!hit) {
    clearEmptyHit(context, event)
    return
  }
  const selectedIds = context.props.selectedLayerIds ??
    (context.props.selectedLayerId ? [context.props.selectedLayerId] : [])
  const toggle = event.metaKey || event.ctrlKey
  const keepSelection = keepsSelection(selectedIds, hit.nodeId, toggle, shouldCycle)
  if (!keepSelection || selectedIds.length === 1) context.emit('selectLayer', hit.nodeId, toggle)
  if (toggle) return
  if (
    (!keepSelection ||
      selectedIds.length === 1) &&
      beginCalloutBodyMove(context, event, point, hit.nodeId)
  ) return
  beginSelectionMove(context, event, point, keepSelection ? selectedIds : [hit.nodeId])
}

function clearEmptyHit(
  context: PointerDownContext,
  event: PointerEvent,
): void {
  if (
    !event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  ) context.emit('clearSelection')
  context.invalidateOverlay()
}
function keepsSelection(
  ids: readonly string[],
  id: string,
  toggle: boolean,
  cycling: boolean,
): boolean {
  return !toggle && ids.includes(id) && !cycling
}
function beginCalloutBodyMove(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
  id: string,
): boolean {
  const clicked = context.props.document?.layers.find((layer) => layer.id === id)
  if (clicked?.kind !== 'callout' || clicked.locked) return false
  if (!calloutLabelContains(clicked.payload, context.toLocal(clicked, point))) return false
  beginDirectHandle(context, event, point, clicked, { kind: 'callout', handle: 'labelBody', nodeId: id, point, radius: 0 })
  return true
}
export function beginSelectionMove(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
  nodeIds: readonly string[],
): void {
  if (
    context.props.readOnly ||
    !nodeIds.length ||
    event.button !== 0
  ) return
  const layers = context.props.document?.layers.filter((layer) => nodeIds.includes(layer.id)) ?? []
  if (layers.length !== nodeIds.length || layers.some((layer) => layer.locked || !layer.visible)) return
  context.scene.value!.setPointerCapture(event.pointerId)
  context.setGesture({
    kind: 'move',
    id: nodeIds[0]!,
    nodeIds: [...nodeIds],
    startClient: { x: event.clientX, y: event.clientY },
    dragging: false,
    start: point,
    current: point,
    guides: [],
    guidesVisible: false,
  })
  context.renderCommittedScene()
}

export function createSelectionMoveStarter(context: PointerDownContext): (event: PointerEvent) => void {
  return (event) => {
    if (context.props.activeTool !== 'select' || context.editingText.value) return
    const point = context.canvasPoint(event)
    const ids = context.props.selectedLayerIds ?? (context.props.selectedLayerId ? [context.props.selectedLayerId] : [])
    if (point) beginSelectionMove(context, event, point, ids)
  }
}

export function handleCanvasBackgroundPointerDown(
  context: PointerDownContext,
  gestureActive: boolean,
  event: PointerEvent,
): void {
  const target = event.target
  const background = target === context.scrollContainer.value || target instanceof HTMLElement &&
    (target.classList.contains('cs-canvas-stage') || target.classList.contains('cs-canvas-surface'))
  if (!background) return
  if (
    event.button !== 0 ||
    event.shiftKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    context.spacePressed() ||
    gestureActive ||
    context.props.sampling ||
    context.props.quickSelectionMode ||
    context.props.activeTool === 'hand' ||
    context.props.activeTool === 'crop'
  ) return
  context.finishTextEditing(() => {
    context.emit('clearSelection')
    context.scene.value?.focus({ preventScroll: true })
  })
}
