import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import {
  type EditorDocumentV1,
  type LayerNode,
  type Transform2D,
  type StrokeStyle,
  applyCropSession,
  cancelCropSession,
  createCropSession,
  resetCrop,
  setCropPreset,
  type CropPreset,
  type RulerAngleGuide,
} from '@cute-screen/editor-renderer'
import type {
  CanvasPoint,
  CanvasViewportProps,
  ViewportOutputBounds,
} from '../canvas/contracts'
import type { CanvasViewportEmit } from './contracts'
import {
  EyedropperController,
  EYEDROPPER_GRID_SIZE,
} from './eyedropper-controller'
import {
  createCanvasWorkspaceState,
  type CanvasGesture,
  type ResizeHandle,
} from './workspace-state'
import { createFloatingToolbarController } from './floating-toolbar-controller'
import { CanvasRendererController } from './renderer-controller'
import {
  createTextFormattingController,
  cssTextBackground,
  cssTextColor,
} from './text-formatting-controller'
import {
  TextEditorController,
  type TextEditorStartInput,
} from './text-editor-controller'
import {
  CanvasGeometryController,
  canvasLayerBounds,
  transformCanvasPoint,
} from './geometry-controller'
import { CropController } from './crop-controller'
import { DraftController } from './draft-controller'
import { CanvasOverlayController } from './overlay-controller'
import { PointerGeometryController } from './pointer-geometry-controller'
import { handlePointerDown } from './pointer-down-controller'
import { handlePointerMove } from './pointer-move-controller'
import {
  cancelCanvasGesture,
  finishCanvasGesture,
} from './gesture-finish-controller'
import { KeyboardController } from './keyboard-controller'

export function useCanvasWorkspace(
  props: CanvasViewportProps,
  emit: CanvasViewportEmit,
) {
  const {
    scene,
    overlay,
    viewportRoot,
    textEditor,
    textFloatingToolbar,
    arrowFloatingToolbar,
    scrollContainer,
    floatingToolbarLayout,
    floatingArrowToolbarLayout,
    rendererError,
    isPanning,
    editingText,
  } = createCanvasWorkspaceState()
  let resizeObserver: ResizeObserver | undefined
  let lastFitZoom: number | undefined
  let pendingZoomAnchor:
    | {
        readonly canvas: CanvasPoint
        readonly clientX: number
        readonly clientY: number
      }
    | undefined
  let spacePressed = false
  let cycle:
    | { readonly key: string; readonly at: number; readonly index: number }
    | undefined
  let rulerGuide: RulerAngleGuide | undefined
  let gesture: CanvasGesture
  const viewportOutputBounds = computed<ViewportOutputBounds | undefined>(
    () => {
      const canvas = props.canvas
      if (!canvas) return undefined
      if (props.activeTool === 'crop' || props.quickFrameMode) {
        return { x: 0, y: 0, width: canvas.width, height: canvas.height }
      }
      return (
        props.document?.crop ?? {
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height,
        }
      )
    },
  )
  const geometryController = new CanvasGeometryController({
    props,
    gesture: () => gesture,
  })
  const pointerGeometry = new PointerGeometryController({
    props,
    scene,
    outputBounds: viewportOutputBounds,
    selectedLayer,
    layerBounds,
    worldHandlePositions: worldBoundsHandlePositions,
    transformPoint,
    loupeSourceCenter,
  })
  const cropController = new CropController({
    props,
    emit,
    overlay,
    scene,
    rendererError,
  })
  const draftController = new DraftController({
    props,
    editingText,
    gesture: () => gesture,
    rulerGuide: () => rulerGuide,
  })
  const {
    updateFloatingToolbarLayout,
    updateFloatingArrowToolbarLayout,
    updateTransientArrowToolbarLayout,
  } = createFloatingToolbarController({
    props,
    textEditor,
    textFloatingToolbar,
    arrowFloatingToolbar,
    scrollContainer,
    floatingToolbarLayout,
    floatingArrowToolbarLayout,
    editing: () => Boolean(editingText.value),
    outputBounds: viewportOutputBounds,
    selectedLayer,
    previewLayer: gesturePreviewLayer,
    layerBounds,
    transformPoint,
  })
  const textFormatting = createTextFormattingController({
    props,
    emit,
    editingText,
    renderProjection: () => textEditorController.renderProjection(),
    updateTextToolbarLayout: updateFloatingToolbarLayout,
    updateArrowToolbarLayout: updateFloatingArrowToolbarLayout,
  })
  const textEditorController = new TextEditorController({
    props,
    emit,
    editingText,
    floatingToolbarLayout,
    textEditor,
    layerBounds,
    canvasPoint,
    resolveCalloutStroke,
    updateToolbarLayout: updateFloatingToolbarLayout,
    emitEditing: () => textFormatting.emitTextEditing(),
    recordCycle: (next) => {
      cycle = next
    },
  })
  const editorTextStyle = textFormatting.editorTextStyle
  const rendererController = new CanvasRendererController({
    props,
    emit,
    scene,
    overlay,
    rendererError,
    editingText,
    outputBounds: viewportOutputBounds,
    documentForScene: documentWithoutGestureLayer,
    previewLayer: gesturePreviewLayer,
    invalidateOverlay,
  })
  const overlayController = new CanvasOverlayController({
    props,
    overlay,
    outputBounds: viewportOutputBounds,
    renderer: rendererController,
    gesture: () => gesture,
    previewNodes: gesturePreviewNodes,
    previewLayer: gesturePreviewLayer,
    selectedLayer,
    drawDrafts: (context) => {
      drawDraft(context)
      drawCalloutDraft(context)
      drawPrecisionDraft(context)
    },
    drawCrop: drawCropOverlay,
    layerBounds,
    worldHandlePositions: worldBoundsHandlePositions,
    transformPoint,
    toLocal,
    loupeSourceCenter,
    moveLoupeSource: moveLoupeSourceMarker,
  })
  const drawDocument = () => rendererController.drawDocument()
  const renderCommittedSceneForGesture = () =>
    rendererController.renderCommittedSceneForGesture()
  const invalidateGesturePreview = () =>
    rendererController.invalidateGesturePreview()
  const eyedropper = new EyedropperController({
    props,
    emit,
    scene,
    viewportRoot,
    scrollContainer,
    outputBounds: viewportOutputBounds,
    canvasPoint,
  })
  const eyedropperLoupe = eyedropper.loupe
  const eyedropperPreview = eyedropper.preview
  const eyedropperSwatch = eyedropper.swatch
  const eyedropperHex = eyedropper.hex
  const eyedropperHint = eyedropper.hint
  const samplingCursor = eyedropper.cursor
  const pointerDownContext = {
    props,
    emit,
    scene,
    scrollContainer,
    isPanning,
    editingText,
    crop: cropController,
    spacePressed: () => spacePressed,
    cycle: () => cycle,
    setCycle: (next: NonNullable<typeof cycle>) => {
      cycle = next
    },
    setGesture: (next: NonNullable<CanvasGesture>) => {
      gesture = next
    },
    clearRulerGuide: () => {
      rulerGuide = undefined
    },
    canvasPoint,
    commitText: () => textEditorController.commit(),
    samplingCursor,
    hideEyedropper: hideEyedropperPreview,
    scheduleEyedropper: scheduleEyedropperPreview,
    sampleScene,
    visibleCanvasCenter,
    selectedLayer,
    loupeSourceHandle: loupeSourceHandleAtPoint,
    calloutHandle: calloutHandleAtPoint,
    arrowHandle: arrowHandleAtPoint,
    intrinsicEndpoint: intrinsicEndpointAtPoint,
    resizeHandle: boundsResizeHandleAtPoint,
    rotationCorner: rotationCornerAtPoint,
    resizeCursor,
    setCursor: setDirectCursor,
    layerBounds,
    transformPoint,
    startText: (input: TextEditorStartInput) =>
      textEditorController.start(input),
    invalidateOverlay,
    renderCommittedScene: renderCommittedSceneForGesture,
  }
  const pointerMoveContext = {
    props,
    emit,
    scrollContainer,
    crop: cropController,
    gesture: () => gesture,
    setGesture: (next: NonNullable<CanvasGesture>) => {
      gesture = next
    },
    setRulerGuide: (next: RulerAngleGuide | undefined) => {
      rulerGuide = next
    },
    canvasPoint,
    samplingCursor,
    scheduleEyedropper: scheduleEyedropperPreview,
    updateHoverCursor,
    snapCandidates,
    invalidateOverlay,
    invalidateGesturePreview,
    renderCommittedScene: renderCommittedSceneForGesture,
  }
  const gestureFinishContext = {
    props,
    emit,
    scene,
    isPanning,
    crop: cropController,
    gesture: () => gesture,
    clearGesture: () => {
      gesture = undefined
    },
    clearRulerGuide: () => {
      rulerGuide = undefined
    },
    precisionLayer: (id: string) => precisionDraftLayer(id),
    samplingError,
    resizeTransform,
    toLocal,
    moveLoupeSource: moveLoupeSourceMarker,
    resolveCalloutStroke,
    startText: startTextEditor,
    canvasPoint,
    updateHoverCursor,
    invalidateOverlay,
    renderCommittedScene: renderCommittedSceneForGesture,
    updateArrowToolbar: updateFloatingArrowToolbarLayout,
  }
  const keyboardController = new KeyboardController({
    props,
    emit,
    scene,
    outputBounds: viewportOutputBounds,
    editingText,
    crop: cropController,
    samplingCursor,
    gesture: () => gesture,
    setGesture: (next: NonNullable<CanvasGesture>) => {
      gesture = next
    },
    setSpacePressed: (pressed: boolean) => {
      spacePressed = pressed
    },
    setRulerGuide: (next: RulerAngleGuide | undefined) => {
      rulerGuide = next
    },
    initialSamplingCursor,
    sampleScene,
    hideEyedropper: hideEyedropperPreview,
    scheduleEyedropper: scheduleEyedropperPreview,
    applyCrop: applyCropDraft,
    cancelCrop: cancelCropDraft,
    cancelText: () => textEditorController.cancel(),
    cancelGesture: () => cancelGesture(),
    invalidateOverlay,
  })
  function scheduleEyedropperPreview(
    point: CanvasPoint,
    client?: Readonly<{ clientX: number; clientY: number }>,
  ): void {
    eyedropper.schedule(point, client)
  }
  function hideEyedropperPreview(): void {
    eyedropper.hide()
  }
  function sampleScene(point: CanvasPoint): void {
    eyedropper.sample(point)
  }
  function initialSamplingCursor(): CanvasPoint | undefined {
    return eyedropper.initialCursor()
  }
  function visibleCanvasCenter(): CanvasPoint | undefined {
    return eyedropper.visibleCanvasCenter()
  }
  function samplingError(english: string, russian: string): string {
    return document.documentElement.lang === 'ru' ? russian : english
  }
  function documentWithoutGestureLayer(): EditorDocumentV1 | undefined {
    const document = props.document
    if (!document) return undefined
    const activeGesture = gesture
    if (activeGesture?.kind === 'loupeSource') {
      return {
        ...document,
        layers: document.layers.map((layer) =>
          layer.id === activeGesture.id && layer.kind === 'loupe'
            ? moveLoupeSourceMarker(layer, activeGesture.current)
            : layer,
        ),
      }
    }
    const previewLayer = gesturePreviewLayer()
    if (previewLayer?.kind === 'loupe') {
      return {
        ...document,
        layers: document.layers.map((layer) =>
          layer.id === previewLayer.id ? previewLayer : layer,
        ),
      }
    }
    const hiddenLayerId =
      gesture &&
      (gesture.kind === 'move' ||
        gesture.kind === 'resize' ||
        gesture.kind === 'intrinsicResize' ||
        gesture.kind === 'rotate' ||
        gesture.kind === 'arrowHandle' ||
        gesture.kind === 'calloutHandle')
        ? gesture.id
        : undefined
    if (!hiddenLayerId) return document
    return {
      ...document,
      layers: document.layers.filter((layer) => layer.id !== hiddenLayerId),
    }
  }
  function fitCanvas(): void {
    const container = scrollContainer.value
    const bounds = viewportOutputBounds.value
    if (!props.fitMode) {
      lastFitZoom = undefined
      return
    }
    if (!container || !bounds) return
    const style = window.getComputedStyle(container)
    const inset = (value: string): number => {
      const parsed = Number.parseFloat(value)
      return Number.isFinite(parsed) ? parsed : 0
    }
    const availableWidth =
      container.clientWidth -
      inset(style.paddingLeft) -
      inset(style.paddingRight)
    const availableHeight =
      container.clientHeight -
      inset(style.paddingTop) -
      inset(style.paddingBottom)
    if (availableWidth <= 0 || availableHeight <= 0) return
    const scale = Math.min(
      availableWidth / bounds.width,
      availableHeight / bounds.height,
    )
    const nextZoom = Math.round(scale * 100)
    if (nextZoom === props.zoom || nextZoom === lastFitZoom) return
    lastFitZoom = nextZoom
    emit('fitZoom', nextZoom)
  }
  function retryRender(): void {
    void drawDocument()
  }
  function selectedLayer() {
    return geometryController.selectedLayer()
  }
  function loupeSourceCenter(
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
  ) {
    return geometryController.loupeSourceCenter(layer)
  }
  function moveLoupeSourceMarker(
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
    point: CanvasPoint,
  ) {
    return geometryController.moveLoupeSourceMarker(layer, point)
  }
  function transformPoint(transform: Transform2D, point: CanvasPoint) {
    return transformCanvasPoint(transform, point)
  }
  function toLocal(layer: LayerNode, point: CanvasPoint) {
    return geometryController.toLocal(layer, point)
  }
  function layerBounds(layer: LayerNode) {
    return canvasLayerBounds(layer)
  }
  function worldBoundsHandlePositions(
    layer: LayerNode,
    transform?: Transform2D,
  ) {
    return geometryController.worldBoundsHandlePositions(layer, transform)
  }
  function snapCandidates(excludingId: string) {
    return geometryController.snapCandidates(excludingId)
  }
  function resizeTransform(
    layer: LayerNode,
    handle: ResizeHandle,
    point: CanvasPoint,
    freeResize: boolean,
    centerResize: boolean,
  ) {
    return geometryController.resizeTransform(
      layer,
      handle,
      point,
      freeResize,
      centerResize,
    )
  }
  function gesturePreviewLayer() {
    return geometryController.gesturePreviewLayer()
  }
  function gesturePreviewNodes() {
    return geometryController.gesturePreviewNodes()
  }
  function drawDraft(context: CanvasRenderingContext2D): void {
    draftController.drawDrawing(context)
  }
  function resolveCalloutStroke(): StrokeStyle {
    return draftController.resolveCalloutStroke()
  }
  function drawCalloutDraft(context: CanvasRenderingContext2D): void {
    draftController.drawCallout(context)
  }
  function precisionDraftLayer(id?: string) {
    return draftController.precisionLayer(id)
  }
  function drawPrecisionDraft(context: CanvasRenderingContext2D): void {
    draftController.drawPrecision(context)
  }
  function ensureCropSession() {
    return cropController.ensureSession()
  }
  function drawCropOverlay(
    context: CanvasRenderingContext2D,
    outputBounds: ViewportOutputBounds,
  ) {
    return cropController.draw(context, outputBounds)
  }
  function drawOverlay(): void {
    overlayController.draw()
  }
  function invalidateOverlay(): void {
    // Interaction state is non-reactive; only the lightweight overlay updates
    // during pointer movement, never the committed scene or Vue tree.
    drawOverlay()
    updateTransientArrowToolbarLayout()
  }
  onMounted(() => {
    rendererController.mount()
    if (scene.value && overlay.value && scrollContainer.value)
      emit('hostsReady', {
        scene: scene.value,
        overlay: overlay.value,
        scrollContainer: scrollContainer.value,
      })
    void drawDocument()
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(fitCanvas)
      if (scrollContainer.value) resizeObserver.observe(scrollContainer.value)
    }
    void nextTick(fitCanvas)
  })
  watch(
    () => [
      props.canvas,
      props.image,
      props.imageLayer,
      props.document,
      props.textureImages,
    ],
    () => void drawDocument(),
  )
  watch(
    () => props.document,
    () => {
      cropController.session = undefined
      if (props.activeTool === 'crop' || props.quickFrameMode)
        ensureCropSession()
      invalidateOverlay()
    },
  )
  watch(
    () => props.activeTool,
    (tool) => {
      cancelGesture()
      cropController.session =
        tool === 'crop' && props.document
          ? createCropSession(props.document)
          : undefined
      invalidateOverlay()
      if (
        tool === 'crop' ||
        tool === 'censor' ||
        tool === 'spotlight' ||
        tool === 'ruler' ||
        tool === 'loupe'
      ) {
        void nextTick(() => scene.value?.focus({ preventScroll: true }))
      }
      void nextTick(() => {
        void drawDocument()
        fitCanvas()
      })
    },
  )
  watch(
    () => props.quickSelectionMode,
    (selecting) => {
      cancelGesture()
      if (selecting) {
        cropController.session = undefined
        cropController.quickDraft = undefined
        setDirectCursor('crosshair')
        void nextTick(() => scene.value?.focus({ preventScroll: true }))
      } else {
        cropController.quickDraft = undefined
        setDirectCursor('')
        if (props.quickFrameMode) ensureCropSession()
      }
      invalidateOverlay()
    },
    { immediate: true },
  )
  watch(
    () => editingText.value?.existing?.id,
    () => void drawDocument(),
  )
  watch(
    () => [props.selectedLayerId, props.selectedLayerIds],
    () => invalidateOverlay(),
  )
  watch(
    () => [
      viewportOutputBounds.value?.width,
      viewportOutputBounds.value?.height,
      props.fitMode,
    ],
    () => void nextTick(fitCanvas),
  )
  watch(
    () => props.zoom,
    async (zoom) => {
      await nextTick()
      invalidateOverlay()
      const anchor = pendingZoomAnchor
      if (!anchor || !scrollContainer.value || !scene.value || !zoom) return
      pendingZoomAnchor = undefined
      const viewport = scrollContainer.value.getBoundingClientRect()
      const scale = zoom / 100
      const bounds = viewportOutputBounds.value
      if (!bounds) return
      scrollContainer.value.scrollLeft = Math.max(
        0,
        (anchor.canvas.x - bounds.x) * scale - (anchor.clientX - viewport.left),
      )
      scrollContainer.value.scrollTop = Math.max(
        0,
        (anchor.canvas.y - bounds.y) * scale - (anchor.clientY - viewport.top),
      )
    },
  )
  function canvasPoint(event: {
    readonly clientX: number
    readonly clientY: number
    readonly pressure?: number
    readonly pointerType?: string
  }) {
    return pointerGeometry.canvasPoint(event)
  }
  function boundsResizeHandleAtPoint(layer: LayerNode, point: CanvasPoint) {
    return pointerGeometry.boundsResizeHandle(layer, point)
  }
  function rotationCornerAtPoint(layer: LayerNode, point: CanvasPoint) {
    return pointerGeometry.rotationCorner(layer, point)
  }
  function intrinsicEndpointAtPoint(layer: LayerNode, point: CanvasPoint) {
    return pointerGeometry.intrinsicEndpoint(layer, point)
  }
  function resizeCursor(handle: ResizeHandle): string {
    return pointerGeometry.resizeCursor(handle)
  }
  function setDirectCursor(cursor: string, rotate = false): void {
    pointerGeometry.setCursor(cursor, rotate)
  }
  function updateHoverCursor(point: CanvasPoint): void {
    pointerGeometry.updateHoverCursor(point)
  }
  function calloutHandleAtPoint(layer: LayerNode, point: CanvasPoint) {
    return pointerGeometry.calloutHandle(layer, point)
  }
  function loupeSourceHandleAtPoint(layer: LayerNode, point: CanvasPoint) {
    return pointerGeometry.loupeSourceHandle(layer, point)
  }
  function arrowHandleAtPoint(layer: LayerNode, point: CanvasPoint) {
    return pointerGeometry.arrowHandle(layer, point)
  }
  function onPointerDown(event: PointerEvent): void {
    handlePointerDown(pointerDownContext, event)
  }
  function startTextEditor(input: TextEditorStartInput): void {
    textEditorController.start(input)
  }
  const onTextEditorInput = () => textEditorController.input()
  const onTextEditorCompositionStart = () =>
    textEditorController.compositionStart()
  const onTextEditorCompositionEnd = () => textEditorController.compositionEnd()
  const onTextEditorPaste = (event: ClipboardEvent) =>
    textEditorController.paste(event)
  const onTextEditorCopy = (event: ClipboardEvent) =>
    textEditorController.copy(event)
  const onTextEditorCut = (event: ClipboardEvent) =>
    textEditorController.cut(event)
  const onTextEditorBlur = (event: FocusEvent) =>
    textEditorController.blur(event)
  const onTextEditorKeydown = (event: KeyboardEvent) =>
    textEditorController.keydown(event)
  const onTextEditorBeforeInput = (event: InputEvent) =>
    textEditorController.beforeInput(event)
  const onDoubleClick = (event: MouseEvent) =>
    textEditorController.doubleClick(event)
  function onPointerMove(event: PointerEvent): void {
    handlePointerMove(pointerMoveContext, event)
  }
  function finishGesture(event: PointerEvent): void {
    finishCanvasGesture(gestureFinishContext, event)
  }
  function cancelGesture(event?: PointerEvent): void {
    cancelCanvasGesture(gestureFinishContext, event)
  }
  function onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const point = canvasPoint(event)
    if (point) {
      pendingZoomAnchor = {
        canvas: point,
        clientX: event.clientX,
        clientY: event.clientY,
      }
    }
    const current = props.zoom ?? 100
    emit('zoom', Math.round(current * (event.deltaY < 0 ? 1.1 : 1 / 1.1)))
  }
  function setCropPresetValue(preset: CropPreset): void {
    const session = ensureCropSession()
    if (!session) return
    cropController.session = setCropPreset(session, preset)
    invalidateOverlay()
  }
  function resetCropDraft(): void {
    const session = ensureCropSession()
    if (!session) return
    cropController.session = resetCrop(session)
    invalidateOverlay()
  }
  function applyCropDraft(): void {
    const session = ensureCropSession()
    if (!session) return
    emit('documentCommand', applyCropSession(session))
  }
  function cancelCropDraft(): void {
    const session = cropController.session
    if (session) cancelCropSession(session)
    cropController.session = undefined
    cancelGesture()
    emit('selectTool', 'select')
  }
  function onWindowKeydown(event: KeyboardEvent): void {
    keyboardController.keydown(event)
  }
  watch(
    () => props.sampling,
    (sampling) => {
      if (!sampling) {
        setDirectCursor('')
        samplingCursor.value = undefined
        hideEyedropperPreview()
        invalidateOverlay()
        return
      }
      setDirectCursor('')
      eyedropper.resetCache(true)
      const initial = initialSamplingCursor()
      samplingCursor.value = initial
      invalidateOverlay()
      void nextTick(() => {
        scene.value?.focus({ preventScroll: true })
        if (initial) scheduleEyedropperPreview(initial)
      })
    },
  )
  watch(
    () => [props.samplingBlocked, props.zoom, viewportOutputBounds.value],
    () => {
      if (!props.sampling || !samplingCursor.value) return
      eyedropper.resetCache()
      void nextTick(() => {
        if (samplingCursor.value) {
          scheduleEyedropperPreview(samplingCursor.value)
        }
      })
    },
  )
  function onWindowKeyup(event: KeyboardEvent): void {
    keyboardController.keyup(event)
  }
  function onWindowBlur(): void {
    keyboardController.blur()
  }
  const onDocumentPointerDown = (event: PointerEvent) =>
    textEditorController.documentPointerDown(event)
  const onDocumentSelectionChange = () =>
    textEditorController.documentSelectionChange()
  onMounted(() => {
    window.addEventListener('keydown', onWindowKeydown)
    window.addEventListener('keyup', onWindowKeyup)
    window.addEventListener('blur', onWindowBlur)
    document.addEventListener('pointerdown', onDocumentPointerDown, true)
    document.addEventListener('selectionchange', onDocumentSelectionChange)
    if (props.sampling) {
      void nextTick(() => {
        const initial = initialSamplingCursor()
        samplingCursor.value = initial
        if (initial) scheduleEyedropperPreview(initial)
        invalidateOverlay()
      })
    }
  })
  onBeforeUnmount(() => {
    hideEyedropperPreview()
    resizeObserver?.disconnect()
    resizeObserver = undefined
    rendererController.dispose()
    window.removeEventListener('keydown', onWindowKeydown)
    window.removeEventListener('keyup', onWindowKeyup)
    window.removeEventListener('blur', onWindowBlur)
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    document.removeEventListener('selectionchange', onDocumentSelectionChange)
  })
  return {
    viewportRoot,
    scrollContainer,
    viewportOutputBounds,
    scene,
    isPanning,
    onPointerDown,
    onPointerMove,
    finishGesture,
    cancelGesture,
    onDoubleClick,
    onWheel,
    editingText,
    textFloatingToolbar,
    floatingToolbarLayout,
    arrowFloatingToolbar,
    floatingArrowToolbarLayout,
    textEditor,
    editorTextStyle,
    cssTextColor,
    cssTextBackground,
    onTextEditorCompositionStart,
    onTextEditorCompositionEnd,
    onTextEditorBeforeInput,
    onTextEditorInput,
    onTextEditorCopy,
    onTextEditorCut,
    onTextEditorPaste,
    onTextEditorKeydown,
    onTextEditorBlur,
    overlay,
    rendererError,
    retryRender,
    eyedropperLoupe,
    eyedropperPreview,
    EYEDROPPER_GRID_SIZE,
    eyedropperSwatch,
    eyedropperHex,
    eyedropperHint,
    applyCropDraft,
    cancelCropDraft,
    resetCropDraft,
    setCropPresetValue,
    refitCanvas: fitCanvas,
  }
}
