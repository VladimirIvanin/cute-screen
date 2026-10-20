import { compositionDraftDocument } from './composition-view'
import { GradientEditingController } from './gradient-editing-controller'
import { CalloutRouteEditing } from './callout-route-editing'
import { textEditorBindings } from './text-editor-bindings'
import {
  useNumberedMarkerPreview,
  type NumberedMarkerPreview,
} from './numbered-marker-preview'
import {
  markerDocumentForScene,
  editSelectedMarkerLabel,
} from './numbered-marker-editing'
import { SpotlightEditingController } from './spotlight-editing-controller'
import {
  applyCropSession,
  cancelCropSession,
  resetCrop,
  setCropPreset,
  type CropPreset,
  type LayerNode,
  type RulerAngleGuide,
} from '@cute-screen/editor-renderer'
import type {
  CanvasPoint,
  CanvasViewportProps,
} from './contracts'
import type { CanvasViewportEmit } from './contracts'
import { CropController } from './crop-controller'
import { DraftController } from './draft-controller'
import { EyedropperController } from './eyedropper-controller'
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
import {
  createSelectionMoveStarter,
  handleCanvasBackgroundPointerDown,
} from './pointer-selection-controller'
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
import { createWorkspaceToolbars } from './workspace-toolbars'
import {
  registerInputLifecycle,
  registerRenderLifecycle,
} from './workspace-lifecycle'
import {
  createGestureFinishContext,
  createKeyboardContext,
  createPointerDownContext,
  createPointerMoveContext,
  createPointerLeaveHandler,
  type WorkspaceInteractionPorts,
} from './workspace-interaction-contexts'
import type { GestureFinishContext } from './gesture-finish-controller'
import type { PointerDownContext } from './pointer-down-contracts'
import type { PointerMoveContext } from './pointer-move-controller'

export class CanvasWorkspaceController {
  readonly #gradient: GradientEditingController
  readonly #props: CanvasViewportProps
  readonly #emit: CanvasViewportEmit
  readonly #state = createCanvasWorkspaceState()
  readonly #viewport: ViewportController
  readonly #spotlight: SpotlightEditingController
  readonly #geometry: CanvasGeometryController
  readonly #pointerGeometry: PointerGeometryController
  readonly #crop: CropController
  readonly #draft: DraftController
  readonly #toolbars: ReturnType<typeof createWorkspaceToolbars>
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
  readonly #markerPreview: NumberedMarkerPreview
  #gesture: CanvasGesture
  #rulerGuide: RulerAngleGuide | undefined
  readonly #calloutRouting: CalloutRouteEditing
  readonly calloutInsertMode = (): boolean => this.#calloutRouting.active()
  #spacePressed = false
  #cycle: { readonly key: string; readonly at: number; readonly index: number } | undefined

  constructor(
    props: CanvasViewportProps,
    emit: CanvasViewportEmit,
  ) {
    this.#calloutRouting = new CalloutRouteEditing(props)
    this.#props = props
    this.#emit = emit
    this.#markerPreview = useNumberedMarkerPreview(
      props,
      this.invalidateOverlay,
      () => this.#spacePressed || Boolean(this.#gesture),
    )
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
    this.#toolbars = createWorkspaceToolbars(props, this.#state, {
      outputBounds: this.#viewport.outputBounds,
      selectedLayer: this.selectedLayer,
      previewLayer: this.gesturePreviewLayer,
      layerBounds: this.layerBounds,
      transformPoint: this.transformPoint,
    })
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
    this.#spotlight = new SpotlightEditingController({
      invalidateOverlay: this.invalidateOverlay,
      props, emit, canvas: () => this.#state.scene.value,
      canvasPoint: this.canvasPoint, toLocal: this.toLocal,
      resizeHandle: (layer, point) => this.#pointerGeometry.boundsResizeHandle(layer, point),
      render: () => {
        this.#renderer.renderCommittedSceneForGesture()
        this.invalidateOverlay()
      },
    })
    this.#gradient = new GradientEditingController({ props, emit, scene: () => this.#state.scene.value,
      point: this.canvasPoint, render: () => {
        this.#renderer.renderCommittedSceneForGesture()
        this.invalidateOverlay()
      }, invalidate: this.invalidateOverlay })
    this.#eyedropper = this.#createEyedropper()
    const ports = this.#interactionPorts()
    this.#pointerDown = createPointerDownContext(ports)
    this.#pointerMove = createPointerMoveContext(ports)
    this.#finish = createGestureFinishContext(ports)
    this.#keyboard = new KeyboardController(
      createKeyboardContext(ports, this.applyCrop, this.cancelCrop, this.cancelGesture),
    )
    this.#registerLifecycle()
  }

  bindings() {
    const state = this.#state
    return {
      viewportRoot: state.viewportRoot,
      scrollContainer: state.scrollContainer,
      viewportOutputBounds: this.#viewport.outputBounds,
      canvasPoint: this.canvasPoint,
      scene: state.scene,
      isPanning: state.isPanning,
      onPointerDown: (event: PointerEvent) => {
        this.#calloutRouting.altPressed = event.altKey
        if (
          !this.#spacePressed &&
          !this.#props.readOnly &&
          (event.detail > 1 &&
            this.#spotlight.doubleClick(event) ||
            this.#spotlight.pointerDown(event))
        ) return
        if (!this.#spacePressed && this.#gradient.pointerDown(event)) return
        handlePointerDown(this.#pointerDown, event)
      },
      editSelectedLabel: () => editSelectedMarkerLabel(this.#textEditor, this.selectedLayer()),
      onPointerLeave: createPointerLeaveHandler(this.#markerPreview, this.#eyedropper, () => {
        this.#pointerGeometry.hoverTarget = { kind: 'empty' }
        this.invalidateOverlay()
      }),
      finishTextEditing: (continuation: () => void) => this.#textEditor.finishEditing(continuation),
      onBackgroundPointerDown: (event: PointerEvent) =>
        handleCanvasBackgroundPointerDown(this.#pointerDown, Boolean(this.#gesture), event),
      onPointerMove: (event: PointerEvent) => {
        this.#calloutRouting.altPressed = event.altKey
        const previewPoint = event.target === state.scene.value
          ? this.canvasPoint(event) : undefined
        this.#markerPreview.move(previewPoint)
        if (!this.#gesture && this.#gradient.pointerMove(event)) return
        if (!this.#spotlight.pointerMove(event)) handlePointerMove(this.#pointerMove, event)
        if (!this.#gesture) this.invalidateOverlay()
      },
      finishGesture: (event: PointerEvent) => {
        if (this.#gradient.pointerUp(event)) return
        if (this.#gesture?.kind === 'calloutHandle') this.#calloutRouting.finish()
        if (!this.#spotlight.pointerUp(event)) finishCanvasGesture(this.#finish, event)
      },
      cancelGesture: (event?: PointerEvent) => {
        this.#gradient.cancel()
        this.#spotlight.cancel()
        cancelCanvasGesture(this.#finish, event)
      },
      onDoubleClick: (event: MouseEvent) => {
        if (!this.#spotlight.doubleClick(event)) this.#textEditor.doubleClick(event)
      },
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
      ...textEditorBindings(this.#textEditor),
      overlay: state.overlay,
      rendererError: state.rendererError,
      retryRender: () => void this.#renderer.drawDocument(),
      ...this.#eyedropper.bindings(),
      applyCropDraft: this.applyCrop,
      cancelCropDraft: this.cancelCrop,
      resetCropDraft: this.resetCrop,
      setCropPresetValue: this.setCropPreset,
      refitCanvas: () => this.#viewport.fit(),
      imageInsertionTarget: (point?: { readonly x: number; readonly y: number }) =>
        this.#viewport.imageInsertionTarget(point),
      startSelectionMove: createSelectionMoveStarter(this.#pointerDown),
      focusCanvas: () => this.#state.scene.value?.focus({ preventScroll: true }),
    }
  }

  readonly applyCrop = (): void => {
    const session = this.#crop.ensureSession()
    if (!session) return
    this.#emit('documentCommand', applyCropSession(session))
    this.cancelGesture()
    this.#crop.session = undefined
    this.#emit('selectTool', 'select')
  }

  readonly cancelCrop = (): void => {
    const session = this.#crop.session
    if (session) cancelCropSession(session)
    this.cancelGesture()
    this.#crop.session = undefined
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
    this.#gradient.cancel()
    this.#calloutRouting.finish()
    cancelCanvasGesture(this.#finish)
  }

  readonly canvasPoint = (event: {
    readonly clientX: number
    readonly clientY: number
    readonly pressure?: number
    readonly pointerType?: string
  }) => this.#pointerGeometry.canvasPoint(event)

  readonly selectedLayer = () => this.#geometry.selectedLayer()
  readonly gesturePreviewLayer = () => this.#gradient?.preview() ?? this.#geometry.gesturePreviewLayer()
  readonly layerBounds = (layer: LayerNode) => canvasLayerBounds(layer)
  readonly transformPoint = transformCanvasPoint
  readonly toLocal = (layer: LayerNode, point: CanvasPoint) => this.#geometry.toLocal(layer, point)
  readonly moveLoupeSource = (layer: Extract<LayerNode, { readonly kind: 'loupe' }>, point: CanvasPoint) =>
    this.#geometry.moveLoupeSourceMarker(layer, point)
  readonly invalidateOverlay = (): void => {
    this.#overlay.draw()
    this.#toolbars.updateTransientArrowToolbarLayout()
  }

  #createPointerGeometry(): PointerGeometryController {
    return new PointerGeometryController({
      gradientEditing: () => this.#gradient?.active() ?? false,
      props: this.#props,
      scene: this.#state.scene,
      outputBounds: this.#viewport.outputBounds,
      selectedLayer: this.selectedLayer,
      calloutInsertMode: this.calloutInsertMode,
      cropCursor: (point) => this.#crop.cursorAtPoint(point),

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
      screenScale: () => this.#pointerGeometry.screenScale(),
      updateToolbarLayout: this.#toolbars.updateFloatingToolbarLayout,
      emitEditing: this.#textFormatting.emitTextEditing,
      redrawMarker: () => void this.#renderer.drawDocument(),
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
      documentForScene: () => {
        const document = this.#spotlight.documentForScene(this.#sceneDocument.documentForScene())
        const draft = this.#gesture?.kind === 'precision' && this.#gesture.tool === 'spotlight'
          ? this.#draft.precisionLayer('__spotlight-draft__') : undefined
        const draftDocument = compositionDraftDocument(document, this.#props, this.#draft.drawingLayer(), draft)
        return markerDocumentForScene(draftDocument, state.editingText.value)
      },
      previewLayer: this.gesturePreviewLayer,
      gestureRequiresScenePreview: () => this.#gesture?.kind === 'move' && (this.#gesture.nodeIds?.length ?? 0) > 1,
      isInteracting: () => Boolean(this.#gesture || this.#props.interactivePreview),
      invalidateOverlay: this.invalidateOverlay,
    })
  }

  #createOverlay(): CanvasOverlayController {
    return new CanvasOverlayController({
      gradientDraw: (context) => this.#gradient?.draw(context) ?? false,
      props: this.#props,
      calloutInsertMode: this.calloutInsertMode,
      hoverTarget: () => this.#pointerGeometry.hoverTarget,
      calloutRemoveMode: () => this.#calloutRouting.altPressed,
      screenScale: () => this.#pointerGeometry.screenScale(),
      overlay: this.#state.overlay,
      outputBounds: this.#viewport.outputBounds,
      renderer: this.#renderer,
      gesture: () => this.#gesture,
      previewNodes: () => this.#geometry.gesturePreviewNodes(),
      previewLayer: () => this.#spotlight?.selectionLayer() ?? this.gesturePreviewLayer(),
      selectedLayer: () => this.#spotlight?.selectionLayer() ?? this.selectedLayer(),
      drawDrafts: (context) => {
        this.#markerPreview.draw(context)
        this.#draft.drawDrawing(context)
        this.#draft.drawCallout(context)
        this.#draft.drawPrecision(context)
      },
      drawingLayer: () => this.#draft.drawingLayer(),
      drawCrop: (context, bounds) => this.#crop.draw(context, bounds),
      layerBounds: this.layerBounds,
      worldHandlePositions: (layer, transform) => this.#geometry.worldBoundsHandlePositions(layer, transform),
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
        const wasChangingFrame = this.#gesture?.kind === 'crop' || this.#gesture?.kind === 'quickSelect'
        const changingFrame = gesture?.kind === 'crop' || gesture?.kind === 'quickSelect'
        this.#gesture = gesture
        if (this.#props.quickFrameMode && wasChangingFrame !== changingFrame) {
          this.#state.scene.value?.dispatchEvent(new CustomEvent('cs-quick-frame-gesture', {
            bubbles: true,
            detail: changingFrame,
          }))
        }
      },
      setRulerGuide: (guide) => {
        this.#rulerGuide = guide
      },
      spacePressed: () => this.#spacePressed,
      setSpacePressed: (pressed) => {
        this.#spacePressed = pressed
        this.#markerPreview.refresh()
        if (this.#props.activeTool === 'numberedMarker') this.#pointerGeometry.setCursor(pressed ? 'grab' : 'none')
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
      scheduleEyedropper: (point) => this.#eyedropper.schedule(point),
      hideEyedropper: () => this.#eyedropper.hide(),
      setCursor: (cursor) => this.#pointerGeometry.setCursor(cursor),
      invalidateOverlay: this.invalidateOverlay,
      onStrokeKeydown: (event) => this.#keyboard.strokeKeydown(event),
      ...this.#calloutRouting.inputHandlers(this.#keyboard, this.cancelGesture, this.invalidateOverlay),
      onDocumentPointerDown: (event) => this.#textEditor.documentPointerDown(event),
      onDocumentSelectionChange: () => this.#textEditor.documentSelectionChange(),
    })
  }
}
