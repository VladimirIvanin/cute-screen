import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import {
  resizeLayerGeometry,
  type EditorDocumentV1,
  type LayerNode,
  type Transform2D,
  createDrawingLayer,
  updateArrowHandle,
  updateCalloutHandle,
  type StrokeStyle,
  applyCropSession,
  cancelCropSession,
  createCropSession,
  nudgeCrop,
  resetCrop,
  setCropPreset,
  snapRulerEndpoint,
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
  DEFAULT_PRECISION_TOOLS,
  DEFAULT_TEXT_TOOL,
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
import {
  PointerGeometryController,
  calloutTextEditorOrigin,
} from './pointer-geometry-controller'
import { handlePointerDown } from './pointer-down-controller'
import { handlePointerMove } from './pointer-move-controller'

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
  const calloutEditorOrigin = calloutTextEditorOrigin
  function arrowHandleAtPoint(layer: LayerNode, point: CanvasPoint) {
    return pointerGeometry.arrowHandle(layer, point)
  }
  function onPointerDown(event: PointerEvent): void {
    handlePointerDown(pointerDownContext, event)
  }
  function startTextEditor(input: TextEditorStartInput): void {
    textEditorController.start(input)
  }
  const cancelTextEditor = () => textEditorController.cancel()
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
    const completed = gesture
    let completedPrecisionLayer: LayerNode | undefined
    if (completed?.kind === 'precision') {
      try {
        completedPrecisionLayer = precisionDraftLayer(crypto.randomUUID())
      } catch (error) {
        emit(
          'toolError',
          error instanceof Error
            ? error.message
            : samplingError(
                'The tool gesture could not be created',
                'Не удалось создать элемент',
              ),
        )
      }
    }
    gesture = undefined
    isPanning.value = false
    rulerGuide = undefined
    if (scene.value?.hasPointerCapture(event.pointerId)) {
      scene.value.releasePointerCapture(event.pointerId)
    }
    if (completed?.kind === 'move') {
      const deltaX = completed.current.x - completed.start.x
      const deltaY = completed.current.y - completed.start.y
      if (deltaX !== 0 || deltaY !== 0) {
        emit('moveLayer', completed.id, deltaX, deltaY)
      }
    }
    if (
      completed?.kind === 'crop' &&
      cropController.session &&
      props.quickFrameMode
    ) {
      const before = completed.initial.crop
      const after = cropController.session.crop
      if (
        before.x !== after.x ||
        before.y !== after.y ||
        before.width !== after.width ||
        before.height !== after.height
      ) {
        emit('documentCommand', applyCropSession(cropController.session))
      }
    }
    if (
      completed?.kind === 'quickSelect' &&
      cropController.quickDraft &&
      completed.current.x !== completed.start.x &&
      completed.current.y !== completed.start.y
    ) {
      const crop = { ...cropController.quickDraft }
      emit('documentCommand', {
        type: 'setCrop',
        before: null,
        after: crop,
      })
      emit('quickSelectionComplete', crop)
    } else if (completed?.kind === 'quickSelect') {
      cropController.quickDraft = undefined
      invalidateOverlay()
    }
    if (completed?.kind === 'resize') {
      const layer = props.document?.layers.find(
        (candidate) => candidate.id === completed.id,
      )
      if (
        layer &&
        (completed.current.x !== completed.start.x ||
          completed.current.y !== completed.start.y)
      ) {
        const transform = resizeTransform(
          layer,
          completed.handle,
          completed.current,
          completed.freeResize,
          completed.centerResize,
        )
        emit('transformLayer', completed.id, transform)
      }
    }
    if (
      completed?.kind === 'intrinsicResize' &&
      (completed.current.x !== completed.start.x ||
        completed.current.y !== completed.start.y)
    ) {
      try {
        const after = resizeLayerGeometry(
          completed.initial,
          completed.handle,
          completed.current,
          {
            preserveAspect: completed.preserveAspect,
            fromCenter: completed.centerResize,
            ...(props.document === undefined
              ? {}
              : { canvas: props.document.canvas }),
          },
        )
        if (JSON.stringify(after) !== JSON.stringify(completed.initial)) {
          emit('documentCommand', {
            type: 'updateLayer',
            before: completed.initial,
            after,
          })
        }
      } catch (error) {
        emit(
          'toolError',
          error instanceof Error
            ? error.message
            : samplingError(
                'The layer geometry could not be resized',
                'Не удалось изменить геометрию слоя',
              ),
        )
      }
    }
    if (
      completed?.kind === 'rotate' &&
      completed.currentAngle !== completed.initial.rotation
    ) {
      emit('transformLayer', completed.id, {
        ...completed.initial,
        rotation: completed.currentAngle,
      })
    }
    if (completed?.kind === 'arrowHandle') {
      const layer = props.document?.layers.find(
        (candidate) => candidate.id === completed.id,
      )
      if (
        layer?.kind === 'arrow' &&
        (completed.current.x !== completed.start.x ||
          completed.current.y !== completed.start.y)
      ) {
        const after = updateArrowHandle(
          layer,
          completed.handle,
          toLocal(layer, completed.current),
        )
        emit('documentCommand', {
          type: 'updateLayer',
          before: layer,
          after,
        })
      }
    }
    if (completed?.kind === 'calloutHandle') {
      const layer = props.document?.layers.find(
        (candidate) => candidate.id === completed.id,
      )
      if (
        layer?.kind === 'callout' &&
        (completed.current.x !== completed.start.x ||
          completed.current.y !== completed.start.y)
      ) {
        const after = updateCalloutHandle(
          layer,
          completed.handle,
          toLocal(layer, completed.current),
        )
        emit('documentCommand', {
          type: 'updateLayer',
          before: layer,
          after,
        })
      }
    }
    if (
      completed?.kind === 'loupeSource' &&
      (completed.current.x !== completed.start.x ||
        completed.current.y !== completed.start.y)
    ) {
      const after = moveLoupeSourceMarker(completed.initial, completed.current)
      if (JSON.stringify(after) !== JSON.stringify(completed.initial)) {
        emit('documentCommand', {
          type: 'updateLayer',
          before: completed.initial,
          after,
        })
      }
    }
    if (completed?.kind === 'calloutDraw') {
      if (
        completed.start.x !== completed.current.x ||
        completed.start.y !== completed.current.y
      ) {
        const stroke = resolveCalloutStroke()
        startTextEditor({
          origin: calloutEditorOrigin(
            completed.current,
            stroke,
            props.textDefaults?.fontSize ?? DEFAULT_TEXT_TOOL.fontSize,
          ),
          kind: 'callout',
          calloutDraft: {
            target: completed.start,
            label: completed.current,
          },
          calloutStroke: stroke,
        })
      }
    }
    if (completed?.kind === 'draw') {
      const layer = createDrawingLayer({
        id: crypto.randomUUID(),
        tool: completed.tool,
        start: completed.start,
        end: completed.current,
        ...(props.drawingDefaults === undefined
          ? {}
          : { defaults: props.drawingDefaults }),
        constrainAngle: completed.constrainAngle,
        drawFromCenter: completed.drawFromCenter,
        points: completed.points,
      })
      if (layer) emit('addLayer', layer)
    }
    if (completed?.kind === 'precision' && completedPrecisionLayer) {
      emit(
        'addLayer',
        completedPrecisionLayer,
        completedPrecisionLayer.kind === 'loupe',
      )
    }
    if (completed?.kind === 'text') {
      const width = Math.abs(completed.current.x - completed.start.x)
      const fixedWidth = width >= 4
      startTextEditor({
        origin: fixedWidth
          ? {
              x: Math.min(completed.start.x, completed.current.x),
              y: Math.min(completed.start.y, completed.current.y),
            }
          : completed.start,
        ...(fixedWidth ? { width, fixedWidth: true } : {}),
      })
    }
    invalidateOverlay()
    const hoverPoint = canvasPoint(event)
    if (hoverPoint) updateHoverCursor(hoverPoint)
    if (
      completed?.kind === 'move' ||
      completed?.kind === 'resize' ||
      completed?.kind === 'intrinsicResize' ||
      completed?.kind === 'rotate' ||
      completed?.kind === 'arrowHandle' ||
      completed?.kind === 'calloutHandle' ||
      completed?.kind === 'loupeSource'
    ) {
      void nextTick(() => {
        renderCommittedSceneForGesture()
        updateFloatingArrowToolbarLayout()
      })
    }
  }
  function cancelGesture(event?: PointerEvent): void {
    const cancelledCrop = gesture?.kind === 'crop' ? gesture.initial : undefined
    const cancelledQuickSelection = gesture?.kind === 'quickSelect'
    const restoreCommittedScene =
      gesture?.kind === 'move' ||
      gesture?.kind === 'resize' ||
      gesture?.kind === 'intrinsicResize' ||
      gesture?.kind === 'rotate' ||
      gesture?.kind === 'arrowHandle' ||
      gesture?.kind === 'calloutHandle' ||
      gesture?.kind === 'loupeSource'
    gesture = undefined
    isPanning.value = false
    if (cancelledCrop) cropController.session = cancelledCrop
    if (cancelledQuickSelection) cropController.quickDraft = undefined
    rulerGuide = undefined
    if (event && scene.value?.hasPointerCapture(event.pointerId)) {
      scene.value.releasePointerCapture(event.pointerId)
    }
    if (event) {
      const hoverPoint = canvasPoint(event)
      if (hoverPoint) updateHoverCursor(hoverPoint)
    }
    invalidateOverlay()
    if (restoreCommittedScene) {
      void nextTick(() => {
        renderCommittedSceneForGesture()
        updateFloatingArrowToolbarLayout()
      })
    }
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
    if (props.sampling && scene.value && props.canvas) {
      const bounds = viewportOutputBounds.value ?? {
        x: 0,
        y: 0,
        width: props.canvas.width,
        height: props.canvas.height,
      }
      const initial = samplingCursor.value ??
        initialSamplingCursor() ?? { x: 0, y: 0 }
      const step = event.shiftKey ? 10 : 1
      const moves: Record<string, readonly [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        sampleScene(initial)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        samplingCursor.value = undefined
        hideEyedropperPreview()
        emit('colorSampleCancel')
        return
      }
      const move = moves[event.key]
      if (move) {
        event.preventDefault()
        const next = {
          x: Math.max(
            bounds.x,
            Math.min(bounds.x + bounds.width - 1, initial.x + move[0]),
          ),
          y: Math.max(
            bounds.y,
            Math.min(bounds.y + bounds.height - 1, initial.y + move[1]),
          ),
        }
        samplingCursor.value = next
        scheduleEyedropperPreview(next)
        invalidateOverlay()
        return
      }
    }
    if (props.activeTool === 'crop' && ensureCropSession()) {
      const directions = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      } as const
      const direction = directions[event.key as keyof typeof directions]
      if (direction) {
        event.preventDefault()
        cropController.session = nudgeCrop(
          cropController.session!,
          direction,
          event.shiftKey ? 10 : 1,
        )
        invalidateOverlay()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        applyCropDraft()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelCropDraft()
        return
      }
    }
    if (event.key === 'Alt' && gesture?.kind === 'move') {
      gesture = { ...gesture, guidesVisible: true }
      invalidateOverlay()
    }
    if (event.key === 'Alt' && gesture?.kind === 'precision') {
      gesture = { ...gesture, guidesHeld: true }
      const defaults = props.precisionDefaults ?? DEFAULT_PRECISION_TOOLS
      if (gesture.tool === 'ruler' && defaults.ruler.snap) {
        const snapped = snapRulerEndpoint(
          gesture.start,
          gesture.current,
          defaults.ruler.snapAngleIncrementDegrees,
        )
        gesture = { ...gesture, current: snapped.end }
        rulerGuide = snapped.guide
        invalidateOverlay()
      }
    }
    if (
      event.code === 'Space' &&
      !(event.target instanceof HTMLInputElement) &&
      !(event.target instanceof HTMLTextAreaElement) &&
      !(event.target instanceof HTMLElement && event.target.isContentEditable)
    ) {
      spacePressed = true
    }
    if (event.key === 'Escape') {
      if (editingText.value) {
        cancelTextEditor()
        return
      }
      if (gesture?.kind === 'draw') {
        cancelGesture()
      } else if (gesture?.kind === 'calloutDraw') {
        cancelGesture()
      } else if (
        props.activeTool === 'arrow' ||
        props.activeTool === 'shape' ||
        props.activeTool === 'pencil' ||
        props.activeTool === 'marker' ||
        props.activeTool === 'censor' ||
        props.activeTool === 'spotlight' ||
        props.activeTool === 'ruler' ||
        props.activeTool === 'loupe'
      ) {
        cancelGesture()
        emit('selectTool', 'select')
      }
    }
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
    if (event.code === 'Space') spacePressed = false
    if (event.key === 'Alt' && gesture?.kind === 'move') {
      gesture = { ...gesture, guidesVisible: false }
      invalidateOverlay()
    }
    if (event.key === 'Alt' && gesture?.kind === 'precision') {
      gesture = { ...gesture, guidesHeld: false }
      rulerGuide = undefined
      invalidateOverlay()
    }
  }
  function onWindowBlur(): void {
    spacePressed = false
    rulerGuide = undefined
    cancelGesture()
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
