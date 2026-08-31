import {
  applyCropSession,
  createDrawingLayer,
  resizeLayerGeometry,
  updateArrowHandle,
  updateCalloutHandle,
  type LayerNode,
  type StrokeStyle,
  type Transform2D,
} from '@cute-screen/editor-renderer'
import { nextTick, type Ref } from 'vue'
import type {
  CanvasPoint,
  CanvasViewportEmit,
  CanvasViewportProps,
} from './contracts'
import type { CropController } from './crop-controller'
import { calloutTextEditorOrigin } from './pointer-geometry-controller'
import type { TextEditorStartInput } from './text-editor-controller'
import {
  DEFAULT_TEXT_TOOL,
  type CanvasGesture,
  type ResizeHandle,
} from './workspace-state'

export interface GestureFinishContext {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly scene: Ref<HTMLCanvasElement | undefined>
  readonly isPanning: Ref<boolean>
  readonly crop: CropController
  readonly gesture: () => CanvasGesture
  readonly clearGesture: () => void
  readonly clearRulerGuide: () => void
  readonly precisionLayer: (id: string) => LayerNode | undefined
  readonly samplingError: (english: string, russian: string) => string
  readonly resizeTransform: (
    layer: LayerNode,
    handle: ResizeHandle,
    point: CanvasPoint,
    freeResize: boolean,
    centerResize: boolean,
  ) => Transform2D
  readonly toLocal: (layer: LayerNode, point: CanvasPoint) => CanvasPoint
  readonly moveLoupeSource: (
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
    point: CanvasPoint,
  ) => Extract<LayerNode, { readonly kind: 'loupe' }>
  readonly resolveCalloutStroke: () => StrokeStyle
  readonly startText: (input: TextEditorStartInput) => void
  readonly canvasPoint: (event: PointerEvent) => CanvasPoint | undefined
  readonly updateHoverCursor: (point: CanvasPoint) => void
  readonly invalidateOverlay: () => void
  readonly renderCommittedScene: () => void
  readonly updateArrowToolbar: () => void
}

export function finishCanvasGesture(
  context: GestureFinishContext,
  event: PointerEvent,
): void {
  const completed = context.gesture()
  const precisionLayer = createCompletedPrecisionLayer(context, completed)
  clearTransientState(context, event)
  commitMovement(context, completed)
  commitCrop(context, completed)
  commitQuickSelection(context, completed)
  commitTransform(context, completed)
  commitLayerHandle(context, completed)
  commitCreation(context, completed, precisionLayer)
  context.invalidateOverlay()
  const hoverPoint = context.canvasPoint(event)
  if (hoverPoint) context.updateHoverCursor(hoverPoint)
  if (requiresCommittedRestore(completed)) scheduleCommittedRestore(context)
}

export function cancelCanvasGesture(
  context: GestureFinishContext,
  event?: PointerEvent,
): void {
  const gesture = context.gesture()
  const cancelledCrop = gesture?.kind === 'crop' ? gesture.initial : undefined
  const cancelledQuickSelection = gesture?.kind === 'quickSelect'
  const restoreCommittedScene = requiresCommittedRestore(gesture)
  context.clearGesture()
  context.isPanning.value = false
  if (cancelledCrop) context.crop.session = cancelledCrop
  if (cancelledQuickSelection) context.crop.quickDraft = undefined
  context.clearRulerGuide()
  if (event && context.scene.value?.hasPointerCapture(event.pointerId)) {
    context.scene.value.releasePointerCapture(event.pointerId)
  }
  if (event) {
    const hoverPoint = context.canvasPoint(event)
    if (hoverPoint) context.updateHoverCursor(hoverPoint)
  }
  context.invalidateOverlay()
  if (restoreCommittedScene) scheduleCommittedRestore(context)
}

function createCompletedPrecisionLayer(
  context: GestureFinishContext,
  gesture: CanvasGesture,
): LayerNode | undefined {
  if (gesture?.kind !== 'precision') return undefined
  try {
    return context.precisionLayer(crypto.randomUUID())
  } catch (error) {
    context.emit(
      'toolError',
      error instanceof Error
        ? error.message
        : context.samplingError(
            'The tool gesture could not be created',
            'Не удалось создать элемент',
          ),
    )
    return undefined
  }
}

function clearTransientState(
  context: GestureFinishContext,
  event: PointerEvent,
): void {
  context.clearGesture()
  context.isPanning.value = false
  context.clearRulerGuide()
  if (context.scene.value?.hasPointerCapture(event.pointerId)) {
    context.scene.value.releasePointerCapture(event.pointerId)
  }
}

function commitMovement(
  context: GestureFinishContext,
  gesture: CanvasGesture,
): void {
  if (gesture?.kind !== 'move') return
  const deltaX = gesture.current.x - gesture.start.x
  const deltaY = gesture.current.y - gesture.start.y
  if (deltaX !== 0 || deltaY !== 0) {
    context.emit('moveLayer', gesture.id, deltaX, deltaY)
  }
}

function commitCrop(
  context: GestureFinishContext,
  gesture: CanvasGesture,
): void {
  const session = context.crop.session
  if (gesture?.kind !== 'crop' || !session || !context.props.quickFrameMode) {
    return
  }
  const before = gesture.initial.crop
  const after = session.crop
  if (
    before.x !== after.x ||
    before.y !== after.y ||
    before.width !== after.width ||
    before.height !== after.height
  ) {
    context.emit('documentCommand', applyCropSession(session))
  }
}

function commitQuickSelection(
  context: GestureFinishContext,
  gesture: CanvasGesture,
): void {
  if (gesture?.kind !== 'quickSelect') return
  const draft = context.crop.quickDraft
  if (
    draft &&
    gesture.current.x !== gesture.start.x &&
    gesture.current.y !== gesture.start.y
  ) {
    const crop = { ...draft }
    context.emit('documentCommand', {
      type: 'setCrop',
      before: null,
      after: crop,
    })
    context.emit('quickSelectionComplete', crop)
    return
  }
  context.crop.quickDraft = undefined
  context.invalidateOverlay()
}

function commitTransform(
  context: GestureFinishContext,
  gesture: CanvasGesture,
): void {
  if (gesture?.kind === 'resize') commitBoundsResize(context, gesture)
  if (gesture?.kind === 'intrinsicResize') {
    commitIntrinsicResize(context, gesture)
  }
  if (
    gesture?.kind === 'rotate' &&
    gesture.currentAngle !== gesture.initial.rotation
  ) {
    context.emit('transformLayer', gesture.id, {
      ...gesture.initial,
      rotation: gesture.currentAngle,
    })
  }
}

function commitBoundsResize(
  context: GestureFinishContext,
  gesture: Extract<NonNullable<CanvasGesture>, { readonly kind: 'resize' }>,
): void {
  const layer = context.props.document?.layers.find(
    (candidate) => candidate.id === gesture.id,
  )
  if (
    !layer ||
    (gesture.current.x === gesture.start.x &&
      gesture.current.y === gesture.start.y)
  ) {
    return
  }
  context.emit(
    'transformLayer',
    gesture.id,
    context.resizeTransform(
      layer,
      gesture.handle,
      gesture.current,
      gesture.freeResize,
      gesture.centerResize,
    ),
  )
}

function commitIntrinsicResize(
  context: GestureFinishContext,
  gesture: Extract<
    NonNullable<CanvasGesture>,
    { readonly kind: 'intrinsicResize' }
  >,
): void {
  if (
    gesture.current.x === gesture.start.x &&
    gesture.current.y === gesture.start.y
  ) {
    return
  }
  try {
    const after = resizeLayerGeometry(
      gesture.initial,
      gesture.handle,
      gesture.current,
      {
        preserveAspect: gesture.preserveAspect,
        fromCenter: gesture.centerResize,
        ...(context.props.document
          ? { canvas: context.props.document.canvas }
          : {}),
      },
    )
    if (JSON.stringify(after) !== JSON.stringify(gesture.initial)) {
      context.emit('documentCommand', {
        type: 'updateLayer',
        before: gesture.initial,
        after,
      })
    }
  } catch (error) {
    context.emit(
      'toolError',
      error instanceof Error
        ? error.message
        : context.samplingError(
            'The layer geometry could not be resized',
            'Не удалось изменить геометрию слоя',
          ),
    )
  }
}

function commitLayerHandle(
  context: GestureFinishContext,
  gesture: CanvasGesture,
): void {
  if (
    !gesture ||
    (gesture.kind !== 'arrowHandle' &&
      gesture.kind !== 'calloutHandle' &&
      gesture.kind !== 'loupeSource') ||
    !moved(gesture)
  ) {
    return
  }
  let layer = context.props.document?.layers.find(
    (candidate) => candidate.id === gesture.id,
  )
  let after: LayerNode | undefined
  if (gesture.kind === 'arrowHandle' && layer?.kind === 'arrow') {
    after = updateArrowHandle(
      layer,
      gesture.handle,
      context.toLocal(layer, gesture.current),
    )
  }
  if (gesture.kind === 'calloutHandle' && layer?.kind === 'callout') {
    after = updateCalloutHandle(
      layer,
      gesture.handle,
      context.toLocal(layer, gesture.current),
    )
  }
  if (gesture.kind === 'loupeSource') {
    after = context.moveLoupeSource(gesture.initial, gesture.current)
    layer = gesture.initial
    if (JSON.stringify(after) === JSON.stringify(layer)) return
  }
  if (layer && after) {
    context.emit('documentCommand', {
      type: 'updateLayer',
      before: layer,
      after,
    })
  }
}

function moved(
  gesture: Extract<NonNullable<CanvasGesture>, { readonly start: CanvasPoint }>,
): boolean {
  return (
    'current' in gesture &&
    (gesture.current.x !== gesture.start.x ||
      gesture.current.y !== gesture.start.y)
  )
}

function commitCreation(
  context: GestureFinishContext,
  gesture: CanvasGesture,
  precisionLayer: LayerNode | undefined,
): void {
  if (gesture?.kind === 'calloutDraw' && moved(gesture)) {
    const stroke = context.resolveCalloutStroke()
    context.startText({
      origin: calloutTextEditorOrigin(
        gesture.current,
        stroke,
        context.props.textDefaults?.fontSize ?? DEFAULT_TEXT_TOOL.fontSize,
      ),
      kind: 'callout',
      calloutDraft: { target: gesture.start, label: gesture.current },
      calloutStroke: stroke,
    })
  }
  if (gesture?.kind === 'draw') {
    const layer = createDrawingLayer({
      id: crypto.randomUUID(),
      tool: gesture.tool,
      start: gesture.start,
      end: gesture.current,
      ...(context.props.drawingDefaults
        ? { defaults: context.props.drawingDefaults }
        : {}),
      constrainAngle: gesture.constrainAngle,
      drawFromCenter: gesture.drawFromCenter,
      points: gesture.points,
    })
    if (layer) context.emit('addLayer', layer)
  }
  if (gesture?.kind === 'precision' && precisionLayer) {
    context.emit('addLayer', precisionLayer, precisionLayer.kind === 'loupe')
  }
  if (gesture?.kind === 'text') startCreatedText(context, gesture)
}

function startCreatedText(
  context: GestureFinishContext,
  gesture: Extract<NonNullable<CanvasGesture>, { readonly kind: 'text' }>,
): void {
  const width = Math.abs(gesture.current.x - gesture.start.x)
  const fixedWidth = width >= 4
  context.startText({
    origin: fixedWidth
      ? {
          x: Math.min(gesture.start.x, gesture.current.x),
          y: Math.min(gesture.start.y, gesture.current.y),
        }
      : gesture.start,
    ...(fixedWidth ? { width, fixedWidth: true } : {}),
  })
}

function requiresCommittedRestore(gesture: CanvasGesture): boolean {
  return (
    gesture?.kind === 'move' ||
    gesture?.kind === 'resize' ||
    gesture?.kind === 'intrinsicResize' ||
    gesture?.kind === 'rotate' ||
    gesture?.kind === 'arrowHandle' ||
    gesture?.kind === 'calloutHandle' ||
    gesture?.kind === 'loupeSource'
  )
}

function scheduleCommittedRestore(context: GestureFinishContext): void {
  void nextTick(() => {
    context.renderCommittedScene()
    context.updateArrowToolbar()
  })
}
