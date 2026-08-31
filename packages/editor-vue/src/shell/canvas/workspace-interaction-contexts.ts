import type { RulerAngleGuide } from '@cute-screen/editor-renderer'
import type { ComputedRef } from 'vue'
import type {
  CanvasViewportEmit,
  CanvasViewportProps,
  ViewportOutputBounds,
} from './contracts'
import type { CropController } from './crop-controller'
import type { DraftController } from './draft-controller'
import type { EyedropperController } from './eyedropper-controller'
import type { GestureFinishContext } from './gesture-finish-controller'
import type { CanvasGeometryController } from './geometry-controller'
import type { KeyboardContext } from './keyboard-controller'
import type { PointerDownContext } from './pointer-down-contracts'
import type { PointerGeometryController } from './pointer-geometry-controller'
import type { PointerMoveContext } from './pointer-move-controller'
import type { CanvasRendererController } from './renderer-controller'
import type { TextEditorController } from './text-editor-controller'
import type {
  CanvasGesture,
  createCanvasWorkspaceState,
} from './workspace-state'

type State = ReturnType<typeof createCanvasWorkspaceState>
type Cycle = {
  readonly key: string
  readonly at: number
  readonly index: number
}

export interface WorkspaceInteractionPorts {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly state: State
  readonly outputBounds: ComputedRef<ViewportOutputBounds | undefined>
  readonly crop: CropController
  readonly draft: DraftController
  readonly eyedropper: EyedropperController
  readonly geometry: CanvasGeometryController
  readonly pointerGeometry: PointerGeometryController
  readonly renderer: CanvasRendererController
  readonly textEditor: TextEditorController
  readonly gesture: () => CanvasGesture
  readonly setGesture: (gesture: CanvasGesture) => void
  readonly setRulerGuide: (guide: RulerAngleGuide | undefined) => void
  readonly spacePressed: () => boolean
  readonly setSpacePressed: (pressed: boolean) => void
  readonly cycle: () => Cycle | undefined
  readonly setCycle: (cycle: Cycle) => void
  readonly canvasPoint: (event: {
    readonly clientX: number
    readonly clientY: number
    readonly pressure?: number
    readonly pointerType?: string
  }) => import('./contracts').CanvasPoint | undefined
  readonly selectedLayer: PointerDownContext['selectedLayer']
  readonly layerBounds: PointerDownContext['layerBounds']
  readonly transformPoint: PointerDownContext['transformPoint']
  readonly toLocal: GestureFinishContext['toLocal']
  readonly moveLoupeSource: GestureFinishContext['moveLoupeSource']
  readonly invalidateOverlay: () => void
  readonly updateArrowToolbar: () => void
}

export function createPointerDownContext(
  ports: WorkspaceInteractionPorts,
): PointerDownContext {
  const { state, pointerGeometry, eyedropper } = ports
  return {
    props: ports.props,
    emit: ports.emit,
    scene: state.scene,
    scrollContainer: state.scrollContainer,
    isPanning: state.isPanning,
    editingText: state.editingText,
    crop: ports.crop,
    spacePressed: ports.spacePressed,
    cycle: ports.cycle,
    setCycle: ports.setCycle,
    setGesture: ports.setGesture,
    clearRulerGuide: () => ports.setRulerGuide(undefined),
    canvasPoint: ports.canvasPoint,
    commitText: () => ports.textEditor.commit(),
    samplingCursor: eyedropper.cursor,
    hideEyedropper: () => eyedropper.hide(),
    scheduleEyedropper: (point, client) => eyedropper.schedule(point, client),
    sampleScene: (point) => eyedropper.sample(point),
    visibleCanvasCenter: () => eyedropper.visibleCanvasCenter(),
    selectedLayer: ports.selectedLayer,
    loupeSourceHandle: (layer, point) =>
      pointerGeometry.loupeSourceHandle(layer, point),
    calloutHandle: (layer, point) =>
      pointerGeometry.calloutHandle(layer, point),
    arrowHandle: (layer, point) => pointerGeometry.arrowHandle(layer, point),
    intrinsicEndpoint: (layer, point) =>
      pointerGeometry.intrinsicEndpoint(layer, point),
    resizeHandle: (layer, point) =>
      pointerGeometry.boundsResizeHandle(layer, point),
    rotationCorner: (layer, point) =>
      pointerGeometry.rotationCorner(layer, point),
    resizeCursor: (handle) => pointerGeometry.resizeCursor(handle),
    setCursor: (cursor, rotate) => pointerGeometry.setCursor(cursor, rotate),
    layerBounds: ports.layerBounds,
    transformPoint: ports.transformPoint,
    startText: (input) => ports.textEditor.start(input),
    invalidateOverlay: ports.invalidateOverlay,
    renderCommittedScene: () => rendererCommitted(ports.renderer),
  }
}

export function createPointerMoveContext(
  ports: WorkspaceInteractionPorts,
): PointerMoveContext {
  return {
    props: ports.props,
    emit: ports.emit,
    scrollContainer: ports.state.scrollContainer,
    crop: ports.crop,
    gesture: ports.gesture,
    setGesture: ports.setGesture,
    setRulerGuide: ports.setRulerGuide,
    canvasPoint: ports.canvasPoint,
    samplingCursor: ports.eyedropper.cursor,
    scheduleEyedropper: (point, client) =>
      ports.eyedropper.schedule(point, client),
    updateHoverCursor: (point) =>
      ports.pointerGeometry.updateHoverCursor(point),
    snapCandidates: (id) => ports.geometry.snapCandidates(id),
    invalidateOverlay: ports.invalidateOverlay,
    invalidateGesturePreview: () => ports.renderer.invalidateGesturePreview(),
    renderCommittedScene: () => rendererCommitted(ports.renderer),
  }
}

export function createGestureFinishContext(
  ports: WorkspaceInteractionPorts,
): GestureFinishContext {
  return {
    props: ports.props,
    emit: ports.emit,
    scene: ports.state.scene,
    isPanning: ports.state.isPanning,
    crop: ports.crop,
    gesture: ports.gesture,
    clearGesture: () => ports.setGesture(undefined),
    clearRulerGuide: () => ports.setRulerGuide(undefined),
    precisionLayer: (id) => ports.draft.precisionLayer(id),
    samplingError: (english, russian) =>
      document.documentElement.lang === 'ru' ? russian : english,
    resizeTransform: (layer, handle, point, freeResize, centerResize) =>
      ports.geometry.resizeTransform(
        layer,
        handle,
        point,
        freeResize,
        centerResize,
      ),
    toLocal: ports.toLocal,
    moveLoupeSource: ports.moveLoupeSource,
    resolveCalloutStroke: () => ports.draft.resolveCalloutStroke(),
    startText: (input) => ports.textEditor.start(input),
    canvasPoint: ports.canvasPoint,
    updateHoverCursor: (point) =>
      ports.pointerGeometry.updateHoverCursor(point),
    invalidateOverlay: ports.invalidateOverlay,
    renderCommittedScene: () => rendererCommitted(ports.renderer),
    updateArrowToolbar: ports.updateArrowToolbar,
  }
}

export function createKeyboardContext(
  ports: WorkspaceInteractionPorts,
  applyCrop: () => void,
  cancelCrop: () => void,
  cancelGesture: () => void,
): KeyboardContext {
  return {
    props: ports.props,
    emit: ports.emit,
    scene: ports.state.scene,
    outputBounds: ports.outputBounds,
    editingText: ports.state.editingText,
    crop: ports.crop,
    samplingCursor: ports.eyedropper.cursor,
    gesture: ports.gesture,
    setGesture: ports.setGesture,
    setSpacePressed: ports.setSpacePressed,
    setRulerGuide: ports.setRulerGuide,
    initialSamplingCursor: () => ports.eyedropper.initialCursor(),
    sampleScene: (point) => ports.eyedropper.sample(point),
    hideEyedropper: () => ports.eyedropper.hide(),
    scheduleEyedropper: (point) => ports.eyedropper.schedule(point),
    applyCrop,
    cancelCrop,
    cancelText: () => ports.textEditor.cancel(),
    cancelGesture,
    invalidateOverlay: ports.invalidateOverlay,
  }
}

function rendererCommitted(renderer: CanvasRendererController): void {
  renderer.renderCommittedSceneForGesture()
}
