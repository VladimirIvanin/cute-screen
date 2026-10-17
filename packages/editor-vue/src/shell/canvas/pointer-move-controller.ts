import {
  rulerAngleStep,
  updateRulerPointer,
} from './ruler-modifiers'
import {
  SELECTION_DRAG_THRESHOLD_CSS,
  constrainRulerMove,
  moveStroke,
  rulerCanvasBounds,
  moveCrop,
  resizeCrop,
  snapPoint,
  type RulerAngleGuide,
  type SnapCandidate,
} from '@cute-screen/editor-renderer'
import type { Ref } from 'vue'
import type {
  CanvasPoint,
  CanvasViewportEmit,
  CanvasViewportProps,
} from './contracts'
import type { CropController } from './crop-controller'
import {
  DEFAULT_PRECISION_TOOLS,
  type CanvasGesture,
} from './workspace-state'

export interface PointerMoveContext {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly scrollContainer: Ref<HTMLDivElement | undefined>
  readonly crop: CropController
  readonly gesture: () => CanvasGesture
  readonly setGesture: (gesture: NonNullable<CanvasGesture>) => void
  readonly setRulerGuide: (guide: RulerAngleGuide | undefined) => void
  readonly canvasPoint: (event: {
    readonly clientX: number
    readonly clientY: number
    readonly pressure?: number
    readonly pointerType?: string
  }) => CanvasPoint | undefined
  readonly samplingCursor: Ref<CanvasPoint | undefined>
  readonly scheduleEyedropper: (point: CanvasPoint, client: { clientX: number; clientY: number }) => void
  readonly updateHoverCursor: (point: CanvasPoint) => void
  readonly snapCandidates: (id: string) => readonly SnapCandidate[]
  readonly invalidateOverlay: () => void
  readonly invalidateGesturePreview: () => void
  readonly renderCommittedScene: () => void
}

export function handlePointerMove(
  context: PointerMoveContext,
  event: PointerEvent,
): void {
  const point = context.canvasPoint(event)
  if (!point) return
  if (context.props.sampling) {
    context.samplingCursor.value = point
    context.scheduleEyedropper(point, {
      clientX: event.clientX,
      clientY: event.clientY,
    })
    context.invalidateOverlay()
    return
  }
  const gesture = context.gesture()
  if (!gesture) {
    context.updateHoverCursor(point)
    return
  }
  switch (gesture.kind) {
    case 'pan':
      movePan(context, event, gesture)
      break
    case 'quickSelect':
      moveQuickSelection(context, point, gesture)
      break
    case 'crop':
      moveCropGesture(context, point, gesture)
      break
    case 'precision':
      movePrecision(context, event, point, gesture)
      break
    case 'move':
      moveLayer(context, event, point, gesture)
      break
    case 'resize':
    case 'intrinsicResize':
    case 'rotate':
      moveTransform(context, event, point, gesture)
      break
    case 'loupeSource':
      context.setGesture({ ...gesture, current: point })
      context.renderCommittedScene()
      break
    case 'draw':
      moveDrawing(context, event, point, gesture)
      break
    case 'calloutDraw':
      context.setGesture({
        ...gesture,
        current: point,
        constrainAngle: event.shiftKey,
      })
      context.invalidateOverlay()
      break
    case 'arrowHandle':
    case 'calloutHandle':
      context.setGesture({ ...gesture, current: point })
      context.invalidateOverlay()
      break
    case 'text':
      context.setGesture({ ...gesture, current: point })
      break
  }
}

function movePan(
  context: PointerMoveContext,
  event: PointerEvent,
  gesture: Extract<NonNullable<CanvasGesture>, { readonly kind: 'pan' }>,
): void {
  const scroll = context.scrollContainer.value
  if (!scroll) return
  scroll.scrollLeft = gesture.scrollLeft - (event.clientX - gesture.clientX)
  scroll.scrollTop = gesture.scrollTop - (event.clientY - gesture.clientY)
}

function moveQuickSelection(
  context: PointerMoveContext,
  point: CanvasPoint,
  gesture: Extract<NonNullable<CanvasGesture>, { readonly kind: 'quickSelect' }>,
): void {
  const crop = {
    x: Math.min(gesture.start.x, point.x),
    y: Math.min(gesture.start.y, point.y),
    width: Math.max(1, Math.abs(point.x - gesture.start.x)),
    height: Math.max(1, Math.abs(point.y - gesture.start.y)),
  }
  context.crop.quickDraft = crop
  context.setGesture({ ...gesture, current: point })
  context.emit('quickFrameChange', crop)
  context.invalidateOverlay()
}

function moveCropGesture(
  context: PointerMoveContext,
  point: CanvasPoint,
  gesture: Extract<NonNullable<CanvasGesture>, { readonly kind: 'crop' }>,
): void {
  const delta = { x: point.x - gesture.start.x, y: point.y - gesture.start.y }
  const session =
    gesture.action === 'move' ? moveCrop(gesture.initial, delta) : resizeCrop(gesture.initial, gesture.handle!, delta)
  context.crop.session = session
  if (context.props.quickFrameMode) {
    context.emit('quickFrameChange', { ...session.crop })
  }
  context.invalidateOverlay()
}

function movePrecision(
  context: PointerMoveContext,
  event: PointerEvent,
  point: CanvasPoint,
  gesture: Extract<NonNullable<CanvasGesture>, { readonly kind: 'precision' }>,
): void {
  const defaults = gesture.precisionDefaults ?? context.props.precisionDefaults ?? DEFAULT_PRECISION_TOOLS
  const ruler = gesture.tool === 'ruler'
    ? updateRulerPointer(gesture, point, event, defaults.ruler.snapAngleIncrementDegrees)
    : undefined
  context.setRulerGuide(ruler?.guide)
  const previous = gesture.points[gesture.points.length - 1]
  const shouldAppend =
    gesture.tool === 'censor' &&
    defaults.censor.region === 'freeform' &&
    (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.5)
  context.setGesture({
    ...(ruler?.gesture ?? gesture),
    current: ruler?.gesture.current ?? point,
    rawCurrent: point,
    guidesHeld: event.altKey,
    points: shouldAppend ? [...gesture.points, point] : gesture.points,
  })
  if (gesture.tool === 'spotlight') context.renderCommittedScene()
  else context.invalidateOverlay()
}

function moveLayer(
  context: PointerMoveContext,
  event: PointerEvent,
  point: CanvasPoint,
  gesture: Extract<NonNullable<CanvasGesture>, { readonly kind: 'move' }>,
): void {
  if (
    gesture.startClient &&
    !gesture.dragging &&
    Math.hypot(
      event.clientX - gesture.startClient.x,
      event.clientY - gesture.startClient.y,
    ) < SELECTION_DRAG_THRESHOLD_CSS
  ) return
  const result = snapPoint(
    point,
    context.snapCandidates(gesture.id),
    (context.props.zoom ?? 100) / 100,
    !event.ctrlKey && !event.metaKey,
  )
  const document = context.props.document
  const delta = { x: result.x - gesture.start.x, y: result.y - gesture.start.y }
  const selected = gesture.nodeIds ?? context.props.selectedLayerIds ?? [gesture.id]
  const constrained = document
    ? constrainRulerMove(
        document.layers.filter((layer) => selected.includes(layer.id)),
        delta,
        rulerCanvasBounds(document),
        document.canvas,
      )
    : delta
  const limited = constrained.x !== delta.x || constrained.y !== delta.y
  context.setGesture({
    ...gesture,
    current: { x: gesture.start.x + constrained.x, y: gesture.start.y + constrained.y },
    dragging: true,
    guides: limited ? [] : result.guides,
    guidesVisible: event.altKey,
  })
  context.invalidateGesturePreview()
}

function moveTransform(
  context: PointerMoveContext,
  event: PointerEvent,
  point: CanvasPoint,
  gesture: Extract<NonNullable<CanvasGesture>, { readonly kind: 'resize' | 'intrinsicResize' | 'rotate' }>,
): void {
  if (gesture.kind === 'resize') {
    context.setGesture({
      ...gesture,
      current: point,
      freeResize: event.shiftKey,
      centerResize: event.altKey,
    })
  } else if (gesture.kind === 'intrinsicResize') {
    context.setGesture({
      ...gesture,
      snapAngleIncrementDegrees: gesture.initial.kind === 'ruler' ? rulerAngleStep(event, gesture.initial.payload.snapAngleIncrementDegrees) : undefined,
      current: point,
      preserveAspect: event.shiftKey || gesture.initial.kind === 'emoji' || gesture.initial.kind === 'loupe',
      centerResize: gesture.handle === 'start' || gesture.handle === 'end' ? false : event.altKey,
    })
  } else {
    const angle = Math.atan2(point.y - gesture.center.y, point.x - gesture.center.x)
    let rotation = gesture.initial.rotation + ((angle - gesture.startAngle) * 180) / Math.PI
    if (event.shiftKey) rotation = Math.round(rotation / 15) * 15
    context.setGesture({ ...gesture, currentAngle: rotation })
  }
  context.invalidateGesturePreview()
}

function moveDrawing(
  context: PointerMoveContext,
  event: PointerEvent,
  point: CanvasPoint,
  gesture: Extract<NonNullable<CanvasGesture>, { readonly kind: 'draw' }>,
): void {
  let stroke = gesture.stroke
  if (stroke) {
    const coalesced = event.getCoalescedEvents?.()
    for (const sample of coalesced?.length ? coalesced : [event]) {
      const candidate = context.canvasPoint(sample)
      if (candidate) stroke = moveStroke(stroke, candidate, event.shiftKey)
    }
  }
  context.setGesture({
    ...gesture,
    current: stroke?.points.at(-1) ?? point,
    constrainAngle: event.shiftKey,
    drawFromCenter: event.altKey,
    points: stroke?.points ?? gesture.points,
    ...(stroke ? { stroke } : {}),
  })
  context.invalidateOverlay()
}
