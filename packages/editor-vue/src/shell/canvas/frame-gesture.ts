import {
  constrainRulerMove,
  gradientFrame,
  isGradientLayer,
  rulerCanvasBounds,
  snapFrameMove,
  snapFrameResizePoint,
  snapPoint,
  type BoundsResizeHandle,
  type FrameMoveSnapState,
} from '@cute-screen/editor-renderer'
import {
  CanvasGeometryController,
  canvasLayerBounds,
  transformCanvasPoint,
} from './geometry-controller'
import type {
  CanvasPoint,
  CanvasViewportProps,
} from './contracts'
import type { CanvasGesture } from './workspace-state'
import type { GestureFinishContext } from './gesture-finish-controller'
import { updateCropGesture } from './crop-gesture'

type MoveGesture = Extract<CanvasGesture, { readonly kind: 'move' }>
type ResizeGesture = Extract<CanvasGesture, { readonly kind: 'resize' | 'intrinsicResize' }>

export function finishFrameGeometry(
  context: GestureFinishContext,
  completed: CanvasGesture,
  end: CanvasPoint | undefined,
  event: PointerEvent,
): CanvasGesture {
  if (!end) return completed
  if (completed?.kind === 'move' && completed.dragging) {
    return updateFrameMove(completed, end, context.props, !event.ctrlKey && !event.metaKey,
      context.screenScale().x) ?? completed
  }
  if ((completed?.kind === 'resize' || completed?.kind === 'intrinsicResize') &&
    completed.handle !== 'start' && completed.handle !== 'end') {
    return updateFrameResize(completed, end, context.props, event, context.screenScale().x)
  }
  if (completed?.kind === 'crop') {
    return updateCropGesture(completed, end, context.props, context.crop, !event.ctrlKey && !event.metaKey,
      context.screenScale().x)
  }
  return completed
}

export function updateFrameMove(
  gesture: MoveGesture,
  point: CanvasPoint,
  props: CanvasViewportProps,
  enabled: boolean,
  zoom = (props.zoom ?? 100) / 100,
): MoveGesture | undefined {
  const document = props.document
  if (!document || props.readOnly) return undefined
  enabled = enabled && (point.x !== gesture.start.x || point.y !== gesture.start.y)
  const ids = gesture.nodeIds ?? props.selectedLayerIds ?? [gesture.id]
  const layers = document.layers.filter((layer) => ids.includes(layer.id) && layer.visible && !layer.locked)
  if (!layers.length) return undefined
  const corners = layers.flatMap((layer) => {
    const b = canvasLayerBounds(layer)
    return [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y },
      { x: b.x, y: b.y + b.height }, { x: b.x + b.width, y: b.y + b.height }]
      .map((point) => transformCanvasPoint(layer.transform, point))
  })
  const x = Math.min(...corners.map((point) => point.x)), y = Math.min(...corners.map((point) => point.y))
  const bounds = { x, y, width: Math.max(...corners.map((point) => point.x)) - x,
    height: Math.max(...corners.map((point) => point.y)) - y }
  const result = snapFrameMove(bounds, { x: point.x - gesture.start.x, y: point.y - gesture.start.y },
    gradientFrame(document), { zoom,
      enabled, previous: gesture.frameSnap })
  const candidates = new CanvasGeometryController({ props, gesture: () => gesture }).snapCandidates(gesture.id)
    .filter((candidate) => candidate.id.endsWith('-center') ||
      (!candidate.id.startsWith('canvas-') && !candidate.id.startsWith('crop-')))
  const fallback = snapPoint(point, candidates, zoom,
    enabled && !layers.some(isGradientLayer))
  const proposed = { x: result.state.x === undefined ? fallback.x - gesture.start.x : result.delta.x,
    y: result.state.y === undefined ? fallback.y - gesture.start.y : result.delta.y }
  const delta = constrainRulerMove(layers, proposed, rulerCanvasBounds(document), document.canvas)
  const state: FrameMoveSnapState = {
    ...(delta.x === result.delta.x && result.state.x !== undefined ? { x: result.state.x } : {}),
    ...(delta.y === result.delta.y && result.state.y !== undefined ? { y: result.state.y } : {}),
  }
  return { ...gesture, current: { x: gesture.start.x + delta.x, y: gesture.start.y + delta.y },
    frameSnap: state, dragging: true,
    guides: state.x === undefined && state.y === undefined ? fallback.guides : [],
    guidesVisible: gesture.guidesVisible }
}

export function updateFrameResize<T extends ResizeGesture>(
  gesture: T,
  point: CanvasPoint,
  props: CanvasViewportProps,
  event: Pick<PointerEvent, 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  zoom = (props.zoom ?? 100) / 100,
): T {
  const layer = gesture.kind === 'intrinsicResize' ? gesture.initial : props.document?.layers.find((layer) => layer.id === gesture.id)
  const preserveAspect = layer?.kind === 'image' ? !event.shiftKey : event.shiftKey || layer?.kind === 'emoji' || layer?.kind === 'loupe'
  const fromCenter = gesture.handle === 'start' || gesture.handle === 'end' ? false : event.altKey
  if (
    layer &&
    props.document &&
    !props.readOnly &&
    !layer.locked &&
    layer.visible &&
    gesture.handle !== 'start' &&
    gesture.handle !== 'end' &&
    Math.abs(layer.transform.rotation % 360) < 1e-8 &&
    !event.ctrlKey &&
    !event.metaKey &&
    (point.x !== gesture.start.x ||
      point.y !== gesture.start.y)
  ) {
    const b = canvasLayerBounds(layer)
    const first = transformCanvasPoint(layer.transform, { x: b.x, y: b.y })
    const last = transformCanvasPoint(layer.transform, { x: b.x + b.width, y: b.y + b.height })
    const handle = gesture.handle.replace(/[we]/g, (h) => layer.transform.scaleX < 0 ? h === 'w' ? 'e' : 'w' : h)
      .replace(/[ns]/g, (h) => layer.transform.scaleY < 0 ? h === 'n' ? 's' : 'n' : h) as BoundsResizeHandle
    point = snapFrameResizePoint({ x: Math.min(first.x, last.x), y: Math.min(first.y, last.y),
      width: Math.abs(last.x - first.x), height: Math.abs(last.y - first.y) }, handle, point,
    gradientFrame(props.document), { zoom, preserveAspect, fromCenter })
  }
  return (gesture.kind === 'resize'
    ? { ...gesture, current: point, freeResize: event.shiftKey, centerResize: fromCenter }
    : { ...gesture, current: point, preserveAspect, centerResize: fromCenter }) as T
}
