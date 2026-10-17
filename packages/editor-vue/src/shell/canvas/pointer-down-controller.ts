import { rulerAngleStep } from './ruler-modifiers'
import {
  DEFAULT_DRAWING_DEFAULTS,
  beginStroke,
  calloutTextLayout,
  createPreparedNumberedMarker,
  hitTestDocument,
} from '@cute-screen/editor-renderer'
import type { CanvasPoint } from './contracts'
import type { PointerDownContext } from './pointer-down-contracts'
import { handleSelectionStart } from './pointer-selection-controller'

export function handlePointerDown(
  context: PointerDownContext,
  event: PointerEvent,
): void {
  if (handleEditingText(context, event)) return
  const point = context.canvasPoint(event)
  if (
    !point ||
    !context.scene.value ||
    !context.props.document
  ) return
  if (event.button === 0) context.scene.value.focus({ preventScroll: true })
  if (handleSampling(context, event, point)) return
  if (handlePan(context, event)) return
  if (event.button !== 0) return
  if (handleQuickSelection(context, event, point)) return
  if (handleCrop(context, event, point)) return
  const selected = context.selectedLayer()
  if (context.props.readOnly) {
    handleSelectionStart(context, event, point, selected)
    return
  }
  if (context.props.activeTool === 'loupe' && selected?.kind === 'loupe') {
    const target = context.resolveSelectionTarget(point)
    if (target.kind === 'handle' && target.target.kind === 'loupeSource') {
      handleSelectionStart(context, event, point, selected)
      return
    }
  }
  if (handleCreationTool(context, event, point)) return
  handleSelectionStart(context, event, point, selected)
}

function handleEditingText(
  context: PointerDownContext,
  event: PointerEvent,
): boolean {
  const editing = context.editingText.value
  if (!editing) return false
  if (event.button === 0) {
    event.preventDefault()
    context.finishTextEditing(() => {
      const point = context.canvasPoint(event)
      if (
        !point ||
        !context.scene.value ||
        !context.props.document
      ) return
      context.scene.value.focus({ preventScroll: true })
      // The click finishes editing and selects its destination; it never creates
      // a second text object or grabs a handle of the just-committed object.
      const hit = hitTestDocument(context.props.document, point)
      if (hit) context.emit('selectLayer', hit.nodeId, event.metaKey || event.ctrlKey)
      else if (
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) context.emit('clearSelection')
    })
  }
  return true
}

function handleSampling(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
): boolean {
  if (!context.props.sampling) return false
  event.preventDefault()
  if (event.button > 0) {
    context.samplingCursor.value = undefined
    context.hideEyedropper()
    context.emit('colorSampleCancel')
    return true
  }
  context.samplingCursor.value = point
  context.scheduleEyedropper(point, {
    clientX: event.clientX,
    clientY: event.clientY,
  })
  context.sampleScene(point)
  return true
}

function handlePan(
  context: PointerDownContext,
  event: PointerEvent,
): boolean {
  if (event.button > 1) return false
  const pan = event.button === 1 || context.props.activeTool === 'hand' || context.spacePressed()
  const scroll = context.scrollContainer.value
  if (
    !pan ||
    !scroll ||
    !context.scene.value
  ) return false
  event.preventDefault()
  context.scene.value.setPointerCapture(event.pointerId)
  context.isPanning.value = true
  context.setGesture({
    kind: 'pan',
    clientX: event.clientX,
    clientY: event.clientY,
    scrollLeft: scroll.scrollLeft,
    scrollTop: scroll.scrollTop,
  })
  return true
}

function handleQuickSelection(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
): boolean {
  if (!context.props.quickSelectionMode || !context.scene.value) return false
  event.preventDefault()
  context.scene.value.setPointerCapture(event.pointerId)
  const crop = { x: point.x, y: point.y, width: 1, height: 1 }
  context.crop.quickDraft = crop
  context.setGesture({ kind: 'quickSelect', start: point, current: point })
  context.emit('quickFrameChange', crop)
  context.invalidateOverlay()
  return true
}

function handleCrop(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
): boolean {
  const { props } = context
  if (props.activeTool !== 'crop' && !props.quickFrameMode) return false
  const session = context.crop.ensureSession()
  if (!session) return props.activeTool === 'crop'
  const handle = context.crop.handleAtPoint(session, point)
  if (!handle && !context.crop.canMoveAtPoint(session, point)) {
    return props.activeTool === 'crop'
  }
  event.preventDefault()
  context.setCursor(context.crop.cursorAtPoint(point) ?? '')
  context.scene.value!.setPointerCapture(event.pointerId)
  context.setGesture({
    kind: 'crop',
    action: handle ? 'resize' : 'move',
    ...(handle ? { handle } : {}),
    start: point,
    initial: session,
  })
  return true
}

function handleCreationTool(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
): boolean {
  const tool = context.props.activeTool
  if (
    tool === 'censor' ||
    tool === 'spotlight' ||
    tool === 'ruler' ||
    tool === 'loupe'
  ) {
    beginPrecision(context, event, point, tool)
    return true
  }
  if (tool === 'image') {
    event.preventDefault()
    const center = context.visibleCanvasCenter() ?? point
    context.emit('requestImageImport', { x: center.x, y: center.y })
    return true
  }
  if (tool === 'numberedMarker') {
    addNumberedMarker(context, event, point)
    return true
  }
  if (tool === 'callout') {
    beginCallout(context, event, point)
    return true
  }
  if (tool === 'text') {
    beginText(context, event, point)
    return true
  }
  if (
    tool === 'arrow' ||
    tool === 'shape' ||
    tool === 'pencil' ||
    tool === 'marker'
  ) {
    beginDrawing(context, event, point, tool)
    return true
  }
  return false
}

function beginPrecision(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
  tool: 'censor' | 'spotlight' | 'ruler' | 'loupe',
): void {
  event.preventDefault()
  context.scene.value!.setPointerCapture(event.pointerId)
  context.setGesture({
    kind: 'precision',
    precisionDefaults: context.props.precisionDefaults,
    tool,
    start: point,
    current: point,
    points: [point],
    guidesHeld: event.altKey,
    snapAngleIncrementDegrees: rulerAngleStep(
      event,
      context.props.precisionDefaults?.ruler.snapAngleIncrementDegrees ?? 15,
    ),
  })
  context.clearRulerGuide()
  context.invalidateOverlay()
}

function addNumberedMarker(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
): void {
  event.preventDefault()
  if (!Number.isSafeInteger(context.props.nextMarkerSequence ?? 1)) {
    context.emit('toolError', 'Choose a smaller marker number in tool settings.')
    return
  }
  try {
    const layer = createPreparedNumberedMarker({
      id: crypto.randomUUID(),
      sequence: context.props.nextMarkerSequence ?? 1,
      origin: point,
      shape: context.props.markerShape ?? 'circle',
      style: context.props.markerStyle,
    })
    context.scene.value?.setPointerCapture(event.pointerId)
    context.setGesture({ kind: 'numberedMarker', layer })
  } catch (error) {
    context.emit('toolError', error instanceof Error ? error.message : 'Could not prepare the numbered marker')
  }
}

function beginCallout(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
): void {
  event.preventDefault()
  context.scene.value!.setPointerCapture(event.pointerId)
  context.setGesture({
    kind: 'calloutDraw',
    start: point,
    current: point,
    constrainAngle: event.shiftKey,
  })
  context.invalidateOverlay()
}

function beginText(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
): void {
  event.preventDefault()
  const document = context.props.document!
  const hit = hitTestDocument(document, point)
  const text = document.layers.find(
    (layer) =>
      layer.id === hit?.nodeId &&
      (layer.kind === 'text' || layer.kind === 'callout' || layer.kind === 'numberedMarker'),
  )
  if (
    text?.kind === 'text' ||
    text?.kind === 'callout' ||
    text?.kind === 'numberedMarker'
  ) {
    const layout = text.kind === 'callout' ? calloutTextLayout(text.payload) : undefined
    const bounds = context.layerBounds(text)
    context.startText({
      origin: layout
        ? {
            x: text.transform.translateX + layout.text.x,
            y: text.transform.translateY + layout.text.y,
          }
        : {
            x: text.transform.translateX + bounds.x,
            y: text.transform.translateY + bounds.y,
          },
      existing: text,
    })
    return
  }
  context.scene.value!.setPointerCapture(event.pointerId)
  context.setGesture({ kind: 'text', start: point, current: point })
}

function beginDrawing(
  context: PointerDownContext,
  event: PointerEvent,
  point: CanvasPoint,
  tool: 'arrow' | 'shape' | 'pencil' | 'marker',
): void {
  event.preventDefault()
  context.scene.value!.setPointerCapture(event.pointerId)
  context.setGesture({
    kind: 'draw',
    highlighterEffect: context.props.highlighterEffect,
    drawingDefaults: tool === 'pencil' ? {
      ...(context.props.drawingDefaults ?? DEFAULT_DRAWING_DEFAULTS),
      pencil: { ...(context.props.drawingDefaults ?? DEFAULT_DRAWING_DEFAULTS).pencil, pressureMode: event.pointerType === 'pen' ? 'pen' : 'simulated' },
    } : context.props.drawingDefaults,
    tool,
    start: point,
    current: point,
    constrainAngle: event.shiftKey,
    drawFromCenter: event.altKey,
    points: [point],
    ...(tool === 'pencil' || tool === 'marker' ? { stroke: beginStroke(point, event.shiftKey) } : {}),
  })
  context.invalidateOverlay()
}
