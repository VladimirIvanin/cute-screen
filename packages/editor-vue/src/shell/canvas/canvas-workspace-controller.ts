import {
  applyCropSession,
  cancelCropSession,
  resetCrop,
  setCropPreset,
  type CropPreset,
  type LayerNode,
  type RulerAngleGuide,
  type Transform2D,
} from '@cute-screen/editor-renderer'
import type { CanvasPoint, CanvasViewportProps } from './contracts'
import type { CanvasViewportEmit } from './contracts'
import { CropController } from './crop-controller'
import { DraftController } from './draft-controller'
import {
  EyedropperController,
  EYEDROPPER_GRID_SIZE,
} from './eyedropper-controller'
import {
  cancelCanvasGesture,
  finishCanvasGesture,
} from './gesture-finish-controller'
import {
  CanvasGeometryController,
  canvasLayerBounds,
  transformCanvasPoint,
} from './geometry-controller'
import { KeyboardController } from './keyboard-controller'
import { CanvasOverlayController } from './overlay-controller'
import { handlePointerDown } from './pointer-down-controller'
import { PointerGeometryController } from './pointer-geometry-controller'
import { handlePointerMove } from './pointer-move-controller'
import { CanvasRendererController } from './renderer-controller'
import { SceneDocumentController } from './scene-document-controller'
import {
  createTextFormattingController,
  cssTextBackground,
  cssTextColor,
} from './text-formatting-controller'
import { TextEditorController } from './text-editor-controller'
import { ViewportController } from './viewport-controller'
import {
  createCanvasWorkspaceState,
  type CanvasGesture,
} from './workspace-state'
import { createFloatingToolbarController } from './floating-toolbar-controller'
import {
  registerInputLifecycle,
  registerRenderLifecycle,
} from './workspace-lifecycle'
import {
  createGestureFinishContext,
  createKeyboardContext,
  createPointerDownContext,
  createPointerMoveContext,
  type WorkspaceInteractionPorts,
} from './workspace-interaction-contexts'
import type { GestureFinishContext } from './gesture-finish-controller'
import type { PointerDownContext } from './pointer-down-contracts'
import type { PointerMoveContext } from './pointer-move-controller'

export class CanvasWorkspaceController {
  readonly #props: CanvasViewportProps
  readonly #emit: CanvasViewportEmit
  readonly #state = createCanvasWorkspaceState()
  readonly #viewport: ViewportController
  readonly #geometry: CanvasGeometryController
  readonly #pointerGeometry: PointerGeometryController
  readonly #crop: CropController
  readonly #draft: DraftController
  readonly #toolbars: ReturnType<typeof createFloatingToolbarController>
  readonly #textFormatting: ReturnType<typeof createTextFormattingController>
  readonly #textEditor: TextEditorController
  readonly #renderer: CanvasRendererController
  readonly #overlay: CanvasOverlayController
  readonly #sceneDocument: SceneDocumentController
  readonly #eyedropper: EyedropperController
  readonly #keyboard: KeyboardController
  readonly #pointerDown: PointerDownContext
  readonly #pointerMove: PointerMoveContext
  readonly #finish: GestureFinishContext
  #gesture: CanvasGesture
  #rulerGuide: RulerAngleGuide | undefined
  #spacePressed = false
  #cycle:
    | { readonly key: string; readonly at: number; readonly index: number }
    | undefined

  constructor(props: CanvasViewportProps, emit: CanvasViewportEmit) {
    this.#props = props
    this.#emit = emit
    this.#viewport = new ViewportController({
      props,
      emit,
      scene: this.#state.scene,
      scrollContainer: this.#state.scrollContainer,
      canvasPoint: (event) => this.canvasPoint(event),
    })
    this.#geometry = new CanvasGeometryController({
      props,
      gesture: () => this.#gesture,
    })
    this.#pointerGeometry = this.#createPointerGeometry()
    this.#crop = new CropController({
      props,
      emit,
      overlay: this.#state.overlay,
      scene: this.#state.scene,
      rendererError: this.#state.rendererError,
    })
    this.#draft = new DraftController({
      props,
      editingText: this.#state.editingText,
      gesture: () => this.#gesture,
      rulerGuide: () => this.#rulerGuide,
    })
    this.#toolbars = this.#createToolbars()
    this.#textFormatting = this.#createTextFormatting()
    this.#textEditor = this.#createTextEditor()
    this.#renderer = this.#createRenderer()
    this.#sceneDocument = new SceneDocumentController({
      props,
      gesture: () => this.#gesture,
      previewLayer: this.gesturePreviewLayer,
      moveLoupeSource: this.moveLoupeSource,
    })
    this.#overlay = this.#createOverlay()
    this.#eyedropper = this.#createEyedropper()
    const ports = this.#interactionPorts()
    this.#pointerDown = createPointerDownContext(ports)
    this.#pointerMove = createPointerMoveContext(ports)
    this.#finish = createGestureFinishContext(ports)
    this.#keyboard = new KeyboardController(
      createKeyboardContext(
        ports,
        this.applyCrop,
        this.cancelCrop,
        this.cancelGesture,
      ),
    )
    this.#registerLifecycle()
  }

  bindings() {
    const state = this.#state
    return {
      viewportRoot: state.viewportRoot,
      scrollContainer: state.scrollContainer,
      viewportOutputBounds: this.#viewport.outputBounds,
      scene: state.scene,
      isPanning: state.isPanning,
      onPointerDown: (event: PointerEvent) =>
        handlePointerDown(this.#pointerDown, event),
      onPointerMove: (event: PointerEvent) =>
        handlePointerMove(this.#pointerMove, event),
      finishGesture: (event: PointerEvent) =>
        finishCanvasGesture(this.#finish, event),
      cancelGesture: (event?: PointerEvent) =>
        cancelCanvasGesture(this.#finish, event),
      onDoubleClick: (event: MouseEvent) => this.#textEditor.doubleClick(event),
      onWheel: (event: WheelEvent) => this.#viewport.wheel(event),
      editingText: state.editingText,
      textFloatingToolbar: state.textFloatingToolbar,
      floatingToolbarLayout: state.floatingToolbarLayout,
      arrowFloatingToolbar: state.arrowFloatingToolbar,
      floatingArrowToolbarLayout: state.floatingArrowToolbarLayout,
      textEditor: state.textEditor,
      editorTextStyle: this.#textFormatting.editorTextStyle,
      cssTextColor,
      cssTextBackground,
      ...this.#textBindings(),
      overlay: state.overlay,
      rendererError: state.rendererError,
      retryRender: () => void this.#renderer.drawDocument(),
      eyedropperLoupe: this.#eyedropper.loupe,
      eyedropperPreview: this.#eyedropper.preview,
      EYEDROPPER_GRID_SIZE,
      eyedropperSwatch: this.#eyedropper.swatch,
      eyedropperHex: this.#eyedropper.hex,
      eyedropperHint: this.#eyedropper.hint,
      applyCropDraft: this.applyCrop,
      cancelCropDraft: this.cancelCrop,
      resetCropDraft: this.resetCrop,
      setCropPresetValue: this.setCropPreset,
      refitCanvas: () => this.#viewport.fit(),
    }
  }

  readonly applyCrop = (): void => {
    const session = this.#crop.ensureSession()
    if (session) this.#emit('documentCommand', applyCropSession(session))
  }

  readonly cancelCrop = (): void => {
    const session = this.#crop.session
    if (session) cancelCropSession(session)
    this.#crop.session = undefined
    this.cancelGesture()
    this.#emit('selectTool', 'select')
  }

  readonly resetCrop = (): void => {
    const session = this.#crop.ensureSession()
    if (!session) return
    this.#crop.session = resetCrop(session)
    this.invalidateOverlay()
  }

  readonly setCropPreset = (preset: CropPreset): void => {
    const session = this.#crop.ensureSession()
    if (!session) return
    this.#crop.session = setCropPreset(session, preset)
    this.invalidateOverlay()
  }

  readonly cancelGesture = (): void => {
    cancelCanvasGesture(this.#finish)
  }

  readonly canvasPoint = (event: {
    readonly clientX: number
    readonly clientY: number
    readonly pressure?: number
    readonly pointerType?: string
  }) => this.#pointerGeometry.canvasPoint(event)

  readonly selectedLayer = () => this.#geometry.selectedLayer()
  readonly gesturePreviewLayer = () => this.#geometry.gesturePreviewLayer()
  readonly layerBounds = (layer: LayerNode) => canvasLayerBounds(layer)
  readonly transformPoint = (transform: Transform2D, point: CanvasPoint) =>
    transformCanvasPoint(transform, point)
  readonly toLocal = (layer: LayerNode, point: CanvasPoint) =>
    this.#geometry.toLocal(layer, point)
  readonly moveLoupeSource = (
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
    point: CanvasPoint,
  ) => this.#geometry.moveLoupeSourceMarker(layer, point)
  readonly invalidateOverlay = (): void => {
    this.#overlay.draw()
    this.#toolbars.updateTransientArrowToolbarLayout()
  }

  #createPointerGeometry(): PointerGeometryController {
    return new PointerGeometryController({
      props: this.#props,
      scene: this.#state.scene,
      outputBounds: this.#viewport.outputBounds,
      selectedLayer: this.selectedLayer,
      layerBounds: this.layerBounds,
      worldHandlePositions: (layer) =>
        this.#geometry.worldBoundsHandlePositions(layer),
      transformPoint: this.transformPoint,
      loupeSourceCenter: (layer) => this.#geometry.loupeSourceCenter(layer),
    })
  }

  #createToolbars() {
    const state = this.#state
    return createFloatingToolbarController({
      props: this.#props,
      textEditor: state.textEditor,
      textFloatingToolbar: state.textFloatingToolbar,
      arrowFloatingToolbar: state.arrowFloatingToolbar,
      scrollContainer: state.scrollContainer,
      floatingToolbarLayout: state.floatingToolbarLayout,
      floatingArrowToolbarLayout: state.floatingArrowToolbarLayout,
      editing: () => Boolean(state.editingText.value),
      outputBounds: this.#viewport.outputBounds,
      selectedLayer: this.selectedLayer,
      previewLayer: this.gesturePreviewLayer,
      layerBounds: this.layerBounds,
      transformPoint: this.transformPoint,
    })
  }

  #createTextFormatting() {
    return createTextFormattingController({
      props: this.#props,
      emit: this.#emit,
      editingText: this.#state.editingText,
      renderProjection: () => this.#textEditor.renderProjection(),
      updateTextToolbarLayout: this.#toolbars.updateFloatingToolbarLayout,
      updateArrowToolbarLayout: this.#toolbars.updateFloatingArrowToolbarLayout,
    })
  }

  #createTextEditor(): TextEditorController {
    const state = this.#state
    return new TextEditorController({
      props: this.#props,
      emit: this.#emit,
      editingText: state.editingText,
      floatingToolbarLayout: state.floatingToolbarLayout,
      textEditor: state.textEditor,
      layerBounds: this.layerBounds,
      canvasPoint: this.canvasPoint,
      resolveCalloutStroke: () => this.#draft.resolveCalloutStroke(),
      updateToolbarLayout: this.#toolbars.updateFloatingToolbarLayout,
      emitEditing: this.#textFormatting.emitTextEditing,
      recordCycle: (cycle) => {
        this.#cycle = cycle
      },
    })
  }

  #createRenderer(): CanvasRendererController {
    const state = this.#state
    return new CanvasRendererController({
      props: this.#props,
      emit: this.#emit,
      scene: state.scene,
      overlay: state.overlay,
      rendererError: state.rendererError,
      editingText: state.editingText,
      outputBounds: this.#viewport.outputBounds,
      documentForScene: () => this.#sceneDocument.documentForScene(),
      previewLayer: this.gesturePreviewLayer,
      invalidateOverlay: this.invalidateOverlay,
    })
  }

  #createOverlay(): CanvasOverlayController {
    return new CanvasOverlayController({
      props: this.#props,
      overlay: this.#state.overlay,
      outputBounds: this.#viewport.outputBounds,
      renderer: this.#renderer,
      gesture: () => this.#gesture,
      previewNodes: () => this.#geometry.gesturePreviewNodes(),
      previewLayer: this.gesturePreviewLayer,
      selectedLayer: this.selectedLayer,
      drawDrafts: (context) => {
        this.#draft.drawDrawing(context)
        this.#draft.drawCallout(context)
        this.#draft.drawPrecision(context)
      },
      drawCrop: (context, bounds) => this.#crop.draw(context, bounds),
      layerBounds: this.layerBounds,
      worldHandlePositions: (layer, transform) =>
        this.#geometry.worldBoundsHandlePositions(layer, transform),
      transformPoint: this.transformPoint,
      toLocal: this.toLocal,
      loupeSourceCenter: (layer) => this.#geometry.loupeSourceCenter(layer),
      moveLoupeSource: this.moveLoupeSource,
    })
  }

  #createEyedropper(): EyedropperController {
    return new EyedropperController({
      props: this.#props,
      emit: this.#emit,
      scene: this.#state.scene,
      viewportRoot: this.#state.viewportRoot,
      scrollContainer: this.#state.scrollContainer,
      outputBounds: this.#viewport.outputBounds,
      canvasPoint: this.canvasPoint,
    })
  }

  #interactionPorts(): WorkspaceInteractionPorts {
    return {
      props: this.#props,
      emit: this.#emit,
      state: this.#state,
      outputBounds: this.#viewport.outputBounds,
      crop: this.#crop,
      draft: this.#draft,
      eyedropper: this.#eyedropper,
      geometry: this.#geometry,
      pointerGeometry: this.#pointerGeometry,
      renderer: this.#renderer,
      textEditor: this.#textEditor,
      gesture: () => this.#gesture,
      setGesture: (gesture) => {
        this.#gesture = gesture
      },
      setRulerGuide: (guide) => {
        this.#rulerGuide = guide
      },
      spacePressed: () => this.#spacePressed,
      setSpacePressed: (pressed) => {
        this.#spacePressed = pressed
      },
      cycle: () => this.#cycle,
      setCycle: (cycle) => {
        this.#cycle = cycle
      },
      canvasPoint: this.canvasPoint,
      selectedLayer: this.selectedLayer,
      layerBounds: this.layerBounds,
      transformPoint: this.transformPoint,
      toLocal: this.toLocal,
      moveLoupeSource: this.moveLoupeSource,
      invalidateOverlay: this.invalidateOverlay,
      updateArrowToolbar: this.#toolbars.updateFloatingArrowToolbarLayout,
    }
  }

  #textBindings() {
    return {
      onTextEditorCompositionStart: () => this.#textEditor.compositionStart(),
      onTextEditorCompositionEnd: () => this.#textEditor.compositionEnd(),
      onTextEditorBeforeInput: (event: InputEvent) =>
        this.#textEditor.beforeInput(event),
      onTextEditorInput: () => this.#textEditor.input(),
      onTextEditorCopy: (event: ClipboardEvent) => this.#textEditor.copy(event),
      onTextEditorCut: (event: ClipboardEvent) => this.#textEditor.cut(event),
      onTextEditorPaste: (event: ClipboardEvent) =>
        this.#textEditor.paste(event),
      onTextEditorKeydown: (event: KeyboardEvent) =>
        this.#textEditor.keydown(event),
      onTextEditorBlur: (event: FocusEvent) => this.#textEditor.blur(event),
    }
  }

  #registerLifecycle(): void {
    registerRenderLifecycle({
      props: this.#props,
      emit: this.#emit,
      scene: this.#state.scene,
      overlay: this.#state.overlay,
      scrollContainer: this.#state.scrollContainer,
      editingText: this.#state.editingText,
      outputBounds: this.#viewport.outputBounds,
      renderer: this.#renderer,
      crop: this.#crop,
      drawDocument: () => this.#renderer.drawDocument(),
      invalidateOverlay: this.invalidateOverlay,
      cancelGesture: this.cancelGesture,
      setCursor: (cursor) => this.#pointerGeometry.setCursor(cursor),
      fitCanvas: () => this.#viewport.fit(),
      takeZoomAnchor: () => this.#viewport.takeZoomAnchor(),
    })
    registerInputLifecycle({
      props: this.#props,
      scene: this.#state.scene,
      outputBounds: this.#viewport.outputBounds,
      samplingCursor: this.#eyedropper.cursor,
      eyedropper: this.#eyedropper,
      initialSamplingCursor: () => this.#eyedropper.initialCursor(),
      scheduleEyedropper: (point) => this.#eyedropper.schedule(point),
      hideEyedropper: () => this.#eyedropper.hide(),
      setCursor: (cursor) => this.#pointerGeometry.setCursor(cursor),
      invalidateOverlay: this.invalidateOverlay,
      onKeydown: (event) => this.#keyboard.keydown(event),
      onKeyup: (event) => this.#keyboard.keyup(event),
      onBlur: () => this.#keyboard.blur(),
      onDocumentPointerDown: (event) =>
        this.#textEditor.documentPointerDown(event),
      onDocumentSelectionChange: () =>
        this.#textEditor.documentSelectionChange(),
    })
  }
}
