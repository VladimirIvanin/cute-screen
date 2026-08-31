import {
  computed,
  markRaw,
  nextTick,
  onBeforeUnmount,
  onMounted,
  watch,
} from 'vue'
import {
  RichTextEditorController,
  readRichTextDomSelection,
  readRichTextProjection,
  renderRichTextProjection,
  restoreRichTextDomSelection,
} from '../../rich-text-editor'
import {
  Canvas2DRenderer,
  createDocumentRenderScene,
  createRenderSceneSnapshot,
  drawNodes2D,
  hitTestDocument,
  hitTestDocumentAll,
  BOUNDS_RESIZE_HANDLES,
  layerIntrinsicResizeHandles,
  resizeLayerGeometry,
  snapPoint,
  type EditorDocumentV1,
  type LayerNode,
  type SnapCandidate,
  type Transform2D,
  type ImageResource,
  type SrgbColor,
  createDrawingLayer,
  arrowSelectionHandles,
  updateArrowHandle,
  createTextLayer,
  createTextCommitCommand,
  createNumberedMarkerLayer,
  createCalloutLayer,
  calloutSelectionHandles,
  updateCalloutHandle,
  calloutPathPoints,
  calloutMarkerRadius,
  calloutTextLayout,
  defaultCalloutRoute,
  rebaseCalloutLayer,
  type ArrowHandleKind,
  type CalloutHandleKind,
  type RichTextContent,
  type RichTextParagraphStyle,
  type StrokeStyle,
  type TextBackground,
  type RichTextSpanStyle,
  richTextSelectionRange,
  applyCropSession,
  cancelCropSession,
  createCropSession,
  moveCrop,
  nudgeCrop,
  resetCrop,
  resizeCrop,
  setCropPreset,
  createCensorLayer,
  createLoupeLayer,
  createRulerLayer,
  createSpotlightLayer,
  snapRulerEndpoint,
  type CropPreset,
  type CropResizeHandle,
  type CropSession,
  type RulerAngleGuide,
} from '@cute-screen/editor-renderer'
import { drawClampedHandleSquare } from '../overlay-handle-bounds'
import { overlayVisualScale } from '../overlay-visual-scale'
import type {
  CanvasPoint,
  CanvasViewportProps,
  TextToolbarSnapshot,
  TextToolDefaults,
  ViewportOutputBounds,
} from '../canvas/contracts'
import type { CanvasViewportEmit } from './contracts'
import {
  EyedropperController,
  EYEDROPPER_GRID_SIZE,
} from './eyedropper-controller'
import {
  createCanvasWorkspaceState,
  DEFAULT_CALLOUT_STROKE,
  DEFAULT_PRECISION_TOOLS,
  DEFAULT_TEXT_TOOL,
  type CanvasGesture,
  type EditableTextLayer,
  type FloatingToolbarLayout,
  type ResizeHandle,
} from './workspace-state'

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
  let renderer: Canvas2DRenderer | undefined
  let rendererInitialization: Promise<Canvas2DRenderer | undefined> | undefined
  let rendererSceneReady = false
  let drawRevision = 0
  let imageResources = new Map<
    string,
    { readonly key: string; readonly resource: ImageResource }
  >()
  let resizeObserver: ResizeObserver | undefined
  let componentMounted = false
  let textToolbarPointerDown = false
  const FLOATING_TOOLBAR_SELECTOR =
    '.cs-context-toolbar, .cs-text-floating-toolbar, .cs-arrow-floating-toolbar, .cs-arrow-formatting-toolbar, .cs-text-size-popover, .cs-text-background-popover, .cs-text-overflow-popover, .cs-arrow-toolbar-popover'
  function isFloatingToolbarTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      target.closest(FLOATING_TOOLBAR_SELECTOR) !== null
    )
  }
  function canvasSurfaceElement(
    host: HTMLElement | undefined,
  ): HTMLElement | undefined {
    if (host?.offsetParent instanceof HTMLElement) return host.offsetParent
    const surface = scrollContainer.value?.querySelector('.cs-canvas-surface')
    return surface instanceof HTMLElement ? surface : undefined
  }
  function updateFloatingToolbarLayout(): void {
    const editor = textEditor.value
    const toolbarHost = textFloatingToolbar.value
    const surface = canvasSurfaceElement(editor ?? toolbarHost)
    if (!editor || !surface || !editingText.value || !props.textToolbarSchema) {
      floatingToolbarLayout.value = undefined
      return
    }
    const editorRect = editor.getBoundingClientRect()
    const surfaceRect = surface.getBoundingClientRect()
    const toolbarHeight = toolbarHost?.offsetHeight ?? 44
    const toolbarWidth = toolbarHost?.offsetWidth ?? 320
    const gap = 10
    const centerX = editorRect.left - surfaceRect.left + editorRect.width / 2
    const minLeft = toolbarWidth / 2 + 4
    const maxLeft = Math.max(
      minLeft,
      surface.clientWidth - toolbarWidth / 2 - 4,
    )
    const left = Math.max(minLeft, Math.min(maxLeft, centerX))
    const aboveTop = editorRect.top - surfaceRect.top - toolbarHeight - gap
    let top = aboveTop
    let placement: 'above' | 'below' = 'above'
    if (aboveTop < 4) {
      top = editorRect.bottom - surfaceRect.top + gap
      placement = 'below'
    }
    floatingToolbarLayout.value = Object.freeze({ left, top, placement })
  }
  function floatingArrowToolbarLayoutFor(
    layer: LayerNode | undefined,
    toolbarHost: HTMLElement | undefined,
  ): FloatingToolbarLayout | undefined {
    const surface = canvasSurfaceElement(toolbarHost)
    if (
      !layer ||
      layer.kind !== 'arrow' ||
      !surface ||
      !props.arrowToolbarSchema
    ) {
      return undefined
    }
    const bounds = layerBounds(layer)
    const topCenter = transformPoint(layer.transform, {
      x: bounds.x + bounds.width / 2,
      y: bounds.y,
    })
    const outputBounds = viewportOutputBounds.value
    const scale = (props.zoom ?? 100) / 100
    const canvasX = (topCenter.x - (outputBounds?.x ?? 0)) * scale
    const canvasY = (topCenter.y - (outputBounds?.y ?? 0)) * scale
    const toolbarHeight = toolbarHost?.offsetHeight ?? 44
    const toolbarWidth = toolbarHost?.offsetWidth ?? 320
    const gap = 10
    const minLeft = toolbarWidth / 2 + 4
    const maxLeft = Math.max(
      minLeft,
      surface.clientWidth - toolbarWidth / 2 - 4,
    )
    const left = Math.max(minLeft, Math.min(maxLeft, canvasX))
    const aboveTop = canvasY - toolbarHeight - gap
    let top = aboveTop
    let placement: 'above' | 'below' = 'above'
    if (aboveTop < 4) {
      top = canvasY + gap
      placement = 'below'
    }
    return Object.freeze({ left, top, placement })
  }
  function updateFloatingArrowToolbarLayout(): void {
    floatingArrowToolbarLayout.value = floatingArrowToolbarLayoutFor(
      selectedLayer(),
      arrowFloatingToolbar.value,
    )
  }
  function updateTransientArrowToolbarLayout(): void {
    const toolbarHost = arrowFloatingToolbar.value
    const selected = selectedLayer()
    const preview = gesturePreviewLayer()
    if (
      !toolbarHost ||
      preview?.id !== selected?.id ||
      preview?.kind !== 'arrow'
    ) {
      return
    }
    const layout = floatingArrowToolbarLayoutFor(preview, toolbarHost)
    if (!layout) return
    // Pointer moves must not update Vue state: the overlay and this host both
    // consume the same transient layer geometry directly.
    toolbarHost.style.left = `${layout.left}px`
    toolbarHost.style.top = `${layout.top}px`
    toolbarHost.style.transform = 'translateX(-50%)'
    toolbarHost.style.visibility = ''
    toolbarHost.dataset.placement = layout.placement
  }
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
  let cropSession: CropSession | undefined
  let quickSelectionDraft:
    { x: number; y: number; width: number; height: number } | undefined
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

  function cssTextColor(color: SrgbColor): string {
    return `rgba(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)}, ${color.alpha})`
  }
  function cssTextBackground(
    background: TextBackground | null,
  ): string | undefined {
    return background ? cssTextColor(background.color) : undefined
  }
  const editorTextStyle = computed(() => {
    return (
      editingText.value?.controller.state.typingStyle ??
      props.textDefaults ??
      DEFAULT_TEXT_TOOL
    )
  })
  function copyTextStyle(value: TextToolDefaults): TextToolDefaults {
    // Props may be Vue proxies; structuredClone deliberately rejects them.
    return JSON.parse(JSON.stringify(value)) as TextToolDefaults
  }
  function spanStyleFromDefaults(
    defaults: TextToolDefaults,
  ): RichTextSpanStyle {
    return {
      fontFamily: defaults.fontFamily,
      fontSize: defaults.fontSize,
      color: defaults.color,
      weight: defaults.weight,
      italic: defaults.italic,
      strikethrough: defaults.strikethrough,
    }
  }
  function paragraphStyleFromDefaults(
    defaults: TextToolDefaults,
  ): RichTextParagraphStyle {
    return {
      alignment: defaults.alignment,
      listKind: defaults.listKind,
    }
  }
  function common<T>(
    values: readonly T[],
    equal: (left: T, right: T) => boolean,
  ): T | null {
    const first = values[0]
    return first !== undefined && values.every((value) => equal(first, value))
      ? first
      : null
  }
  function toolbarSnapshot(): TextToolbarSnapshot {
    const editing = editingText.value
    if (!editing)
      throw new Error('text toolbar snapshot requires editing state')
    const state = editing.controller.state
    const range = richTextSelectionRange(state.selection)
    const spans =
      range.start === range.end
        ? [state.typingStyle]
        : state.content.spans.filter(
            (span) => span.start < range.end && span.end > range.start,
          )
    const paragraphs =
      range.start === range.end
        ? [state.paragraphStyle]
        : state.content.paragraphs.filter(
            (paragraph) =>
              paragraph.start < range.end && paragraph.end > range.start,
          )
    const sameColor = (left: SrgbColor, right: SrgbColor) =>
      left.red === right.red &&
      left.green === right.green &&
      left.blue === right.blue &&
      left.alpha === right.alpha
    return Object.freeze({
      fontFamily: common(
        spans.map((span) => span.fontFamily),
        (a, b) => a === b,
      ),
      fontSize: common(
        spans.map((span) => span.fontSize),
        (a, b) => a === b,
      ),
      color: common(
        spans.map((span) => span.color),
        sameColor,
      ),
      weight: common(
        spans.map((span) => span.weight),
        (a, b) => a === b,
      ),
      italic: common(
        spans.map((span) => span.italic),
        (a, b) => a === b,
      ),
      strikethrough: common(
        spans.map((span) => span.strikethrough),
        (a, b) => a === b,
      ),
      alignment: common(
        paragraphs.map((paragraph) => paragraph.alignment),
        (a, b) => a === b,
      ),
      listKind: common(
        paragraphs.map((paragraph) => paragraph.listKind),
        (a, b) => a === b,
      ),
      background: editing.background,
    })
  }
  function emitTextEditing(): void {
    const editing = editingText.value
    emit(
      'textEditing',
      editing
        ? { id: editing.id, kind: editing.kind, snapshot: toolbarSnapshot() }
        : undefined,
    )
  }
  watch(
    () => props.textFormatting,
    (patch) => {
      const editing = editingText.value
      if (!editing || !patch) return
      if (patch.span) editing.controller.applySpanStyle(patch.span)
      if (patch.paragraph)
        editing.controller.applyParagraphStyle(patch.paragraph)
      if (patch.background !== undefined) editing.background = patch.background
      renderTextEditorProjection()
      emitTextEditing()
    },
  )
  watch(
    () => props.zoom,
    () => {
      if (editingText.value) {
        void nextTick(() => {
          renderTextEditorProjection()
          updateFloatingToolbarLayout()
        })
      }
    },
  )
  watch(
    () => props.textToolbarSchema,
    () => {
      if (editingText.value) void nextTick(updateFloatingToolbarLayout)
    },
  )
  watch(
    () => [
      props.selectedLayerId,
      props.selectedLayerIds,
      props.arrowToolbarSchema,
      props.zoom,
    ],
    () => {
      void nextTick(updateFloatingArrowToolbarLayout)
    },
    { immediate: true },
  )
  async function ensureRenderer(): Promise<Canvas2DRenderer | undefined> {
    if (!scene.value || !overlay.value || !props.canvas) return undefined
    if (renderer) return renderer
    if (rendererInitialization) return rendererInitialization
    const next = new Canvas2DRenderer()
    const initialization = (async () => {
      await next.initialize({
        scene: scene.value!,
        overlay: overlay.value!,
        dpr: window.devicePixelRatio || 1,
        correlationId: 'editor-viewport',
      })
      if (!componentMounted) {
        next.dispose()
        return undefined
      }
      renderer = next
      rendererSceneReady = false
      return next
    })()
    rendererInitialization = initialization
    try {
      return await initialization
    } catch (error) {
      if (renderer === next) renderer = undefined
      rendererSceneReady = false
      next.dispose()
      throw error
    } finally {
      if (rendererInitialization === initialization) {
        rendererInitialization = undefined
      }
    }
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
  function setCommittedScene(runtime: Canvas2DRenderer): void {
    const document = documentWithoutGestureLayer()
    if (!document) return
    const documentScene = createDocumentRenderScene(
      (props.activeTool === 'crop' || props.quickFrameMode) && document.crop
        ? { ...document, crop: null }
        : document,
    )
    const editing = editingText.value
    if (!editing?.existing) {
      runtime.setScene(documentScene)
      rendererSceneReady = true
      return
    }
    // The contenteditable owns the text projection during direct editing.
    // Keep non-text callout/marker container nodes in the committed scene.
    const hiddenNodeIds =
      editing.existing.kind === 'text'
        ? new Set([editing.id, `${editing.id}:background`])
        : editing.existing.kind === 'callout'
          ? new Set([`${editing.id}:text`, `${editing.id}:background`])
          : new Set([`${editing.id}:label`])
    runtime.setScene(
      createRenderSceneSnapshot({
        width: documentScene.width,
        height: documentScene.height,
        outputBounds: documentScene.outputBounds,
        nodes: documentScene.nodes.filter(
          (candidate) => !hiddenNodeIds.has(candidate.id),
        ),
      }),
    )
    rendererSceneReady = true
  }
  function renderCommittedSceneForGesture(): void {
    if (renderer && rendererSceneReady) {
      setCommittedScene(renderer)
      renderer.render(['scene'])
    }
    if (componentMounted) invalidateOverlay()
  }
  function invalidateGesturePreview(): void {
    if (gesturePreviewLayer()?.kind === 'loupe') {
      renderCommittedSceneForGesture()
      return
    }
    invalidateOverlay()
  }
  async function drawDocument(): Promise<void> {
    const revision = ++drawRevision
    let readyDocumentId: string | undefined
    const bounds = viewportOutputBounds.value
    if (!scene.value || !props.canvas || !bounds) return
    rendererError.value = undefined
    scene.value.width = Math.max(1, Math.round(bounds.width))
    scene.value.height = Math.max(1, Math.round(bounds.height))
    if (overlay.value) {
      overlay.value.width = Math.max(1, Math.round(bounds.width))
      overlay.value.height = Math.max(1, Math.round(bounds.height))
    }
    const layer = props.imageLayer
    if (!props.document) {
      const context = scene.value.getContext('2d')
      context?.clearRect(0, 0, scene.value.width, scene.value.height)
      invalidateOverlay()
      return
    }
    try {
      const runtime = await ensureRenderer()
      if (!runtime || !componentMounted || revision !== drawRevision) return
      const imageInputs = new Map<string, HTMLImageElement>([
        ...(layer && props.image
          ? ([[layer.payload.blobHash, props.image]] as const)
          : []),
        ...(props.textureImages ?? new Map()),
      ])
      for (const [id, image] of imageInputs) {
        const key = `${id}:${image.currentSrc || image.src}`
        if (imageResources.get(id)?.key === key) continue
        imageResources.get(id)?.resource.dispose()
        const resource = await runtime.createImageResource({
          id,
          width: image.naturalWidth,
          height: image.naturalHeight,
          source: image,
        })
        if (!componentMounted || revision !== drawRevision) {
          resource.dispose()
          return
        }
        imageResources.set(id, { key, resource })
      }
      for (const [id, resource] of imageResources) {
        if (imageInputs.has(id)) continue
        resource.resource.dispose()
        imageResources.delete(id)
      }
      setCommittedScene(runtime)
      runtime.render(['scene'])
      readyDocumentId = props.document.id
    } catch (error) {
      if (revision !== drawRevision) return
      renderer?.dispose()
      renderer = undefined
      rendererSceneReady = false
      imageResources = new Map()
      rendererError.value =
        error instanceof Error ? error.message : String(error)
    }
    if (componentMounted && revision === drawRevision) {
      invalidateOverlay()
      if (readyDocumentId) emit('frameReady', readyDocumentId)
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
  function selectedLayer(): LayerNode | undefined {
    return props.document?.layers.find(
      (layer) => layer.id === props.selectedLayerId,
    )
  }
  function loupeSourceCenter(
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
  ): CanvasPoint {
    const { sourceRegion } = layer.payload
    return {
      x: sourceRegion.x + sourceRegion.width / 2,
      y: sourceRegion.y + sourceRegion.height / 2,
    }
  }
  function moveLoupeSourceMarker(
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
    point: CanvasPoint,
  ): Extract<LayerNode, { readonly kind: 'loupe' }> {
    const canvas = props.canvas
    if (!canvas) return layer
    const center = {
      x: Math.max(0, Math.min(canvas.width, point.x)),
      y: Math.max(0, Math.min(canvas.height, point.y)),
    }
    const source = layer.payload.sourceRegion
    return Object.freeze({
      ...layer,
      payload: Object.freeze({
        ...layer.payload,
        sourceRegion: Object.freeze({
          x: center.x - source.width / 2,
          y: center.y - source.height / 2,
          width: source.width,
          height: source.height,
        }),
      }),
    })
  }
  function transformPoint(
    transform: Transform2D,
    point: CanvasPoint,
  ): CanvasPoint {
    const radians = (transform.rotation * Math.PI) / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    return {
      x:
        point.x * transform.scaleX * cosine -
        point.y * transform.scaleY * sine +
        transform.translateX,
      y:
        point.x * transform.scaleX * sine +
        point.y * transform.scaleY * cosine +
        transform.translateY,
    }
  }
  function toLocal(layer: LayerNode, point: CanvasPoint): CanvasPoint {
    const radians = (-layer.transform.rotation * Math.PI) / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    const x = point.x - layer.transform.translateX
    const y = point.y - layer.transform.translateY
    return {
      x: (x * cosine - y * sine) / layer.transform.scaleX,
      y: (x * sine + y * cosine) / layer.transform.scaleY,
    }
  }
  function layerBounds(layer: LayerNode) {
    return layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
  }
  function localBoundsHandlePositions(
    bounds: ReturnType<typeof layerBounds>,
  ): Readonly<Record<ResizeHandle, CanvasPoint>> {
    return {
      nw: { x: bounds.x, y: bounds.y },
      n: { x: bounds.x + bounds.width / 2, y: bounds.y },
      ne: { x: bounds.x + bounds.width, y: bounds.y },
      e: {
        x: bounds.x + bounds.width,
        y: bounds.y + bounds.height / 2,
      },
      se: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      s: {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height,
      },
      sw: { x: bounds.x, y: bounds.y + bounds.height },
      w: { x: bounds.x, y: bounds.y + bounds.height / 2 },
    }
  }
  function worldBoundsHandlePositions(
    layer: LayerNode,
    transform: Transform2D = layer.transform,
  ): Readonly<Record<ResizeHandle, CanvasPoint>> {
    const local = localBoundsHandlePositions(layerBounds(layer))
    return Object.fromEntries(
      BOUNDS_RESIZE_HANDLES.map((handle) => [
        handle,
        transformPoint(transform, local[handle]),
      ]),
    ) as Readonly<Record<ResizeHandle, CanvasPoint>>
  }
  function snapCandidates(excludingId: string): readonly SnapCandidate[] {
    const document = props.document
    if (!document) return []
    const candidates: SnapCandidate[] = [
      { id: 'canvas-top-left', x: 0, y: 0 },
      {
        id: 'canvas-center',
        x: document.canvas.width / 2,
        y: document.canvas.height / 2,
      },
      {
        id: 'canvas-bottom-right',
        x: document.canvas.width,
        y: document.canvas.height,
      },
    ]
    if (document.crop) {
      candidates.push(
        { id: 'crop-top-left', x: document.crop.x, y: document.crop.y },
        {
          id: 'crop-bottom-right',
          x: document.crop.x + document.crop.width,
          y: document.crop.y + document.crop.height,
        },
        {
          id: 'crop-center',
          x: document.crop.x + document.crop.width / 2,
          y: document.crop.y + document.crop.height / 2,
        },
      )
    }
    for (const layer of document.layers) {
      if (layer.id === excludingId || !layer.visible) continue
      const bounds = layerBounds(layer)
      candidates.push(
        {
          id: `${layer.id}:start`,
          x: transformPoint(layer.transform, { x: bounds.x, y: bounds.y }).x,
          y: transformPoint(layer.transform, { x: bounds.x, y: bounds.y }).y,
        },
        {
          id: `${layer.id}:center`,
          x: transformPoint(layer.transform, {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2,
          }).x,
          y: transformPoint(layer.transform, {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2,
          }).y,
        },
        {
          id: `${layer.id}:end`,
          x: transformPoint(layer.transform, {
            x: bounds.x + bounds.width,
            y: bounds.y + bounds.height,
          }).x,
          y: transformPoint(layer.transform, {
            x: bounds.x + bounds.width,
            y: bounds.y + bounds.height,
          }).y,
        },
      )
    }
    return candidates
  }
  function resizeTransform(
    layer: LayerNode,
    handle: ResizeHandle,
    point: CanvasPoint,
    freeResize: boolean,
    centerResize: boolean,
  ): Transform2D {
    const bounds = layerBounds(layer)
    const local = toLocal(layer, point)
    const resizesX = handle.includes('w') || handle.includes('e')
    const resizesY = handle.includes('n') || handle.includes('s')
    const opposite = centerResize
      ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      : {
          x: handle.includes('w') ? bounds.x + bounds.width : bounds.x,
          y: handle.includes('n') ? bounds.y + bounds.height : bounds.y,
        }
    const corner = {
      x: handle.includes('w') ? bounds.x : bounds.x + bounds.width,
      y: handle.includes('n') ? bounds.y : bounds.y + bounds.height,
    }
    const minScale = 1 / Math.max(bounds.width, bounds.height)
    let factorX = resizesX
      ? (local.x - opposite.x) / (corner.x - opposite.x)
      : 1
    let factorY = resizesY
      ? (local.y - opposite.y) / (corner.y - opposite.y)
      : 1
    factorX = Math.max(minScale, factorX)
    factorY = Math.max(minScale, factorY)
    if (layer.kind === 'image' && !freeResize) {
      const factor =
        resizesX && !resizesY
          ? factorX
          : !resizesX && resizesY
            ? factorY
            : Math.abs(factorX - 1) >= Math.abs(factorY - 1)
              ? factorX
              : factorY
      factorX = factor
      factorY = factor
    }
    const nextScaleX = layer.transform.scaleX * factorX
    const nextScaleY = layer.transform.scaleY * factorY
    const anchor = transformPoint(layer.transform, opposite)
    const rotation = (layer.transform.rotation * Math.PI) / 180
    const cosine = Math.cos(rotation)
    const sine = Math.sin(rotation)
    return {
      scaleX: nextScaleX,
      scaleY: nextScaleY,
      rotation: layer.transform.rotation,
      translateX:
        anchor.x -
        opposite.x * nextScaleX * cosine +
        opposite.y * nextScaleY * sine,
      translateY:
        anchor.y -
        opposite.x * nextScaleX * sine -
        opposite.y * nextScaleY * cosine,
    }
  }
  function previewTransform(layer: LayerNode): Transform2D {
    if (
      !gesture ||
      gesture.kind === 'pan' ||
      gesture.kind === 'draw' ||
      gesture.kind === 'calloutDraw' ||
      gesture.kind === 'text' ||
      gesture.kind === 'precision' ||
      gesture.kind === 'crop' ||
      gesture.kind === 'quickSelect' ||
      gesture.id !== layer.id
    ) {
      return layer.transform
    }
    if (gesture.kind === 'move') {
      return {
        ...layer.transform,
        translateX:
          layer.transform.translateX + gesture.current.x - gesture.start.x,
        translateY:
          layer.transform.translateY + gesture.current.y - gesture.start.y,
      }
    }
    if (gesture.kind === 'resize') {
      return resizeTransform(
        layer,
        gesture.handle,
        gesture.current,
        gesture.freeResize,
        gesture.centerResize,
      )
    }
    if (gesture.kind === 'rotate') {
      return { ...gesture.initial, rotation: gesture.currentAngle }
    }
    return layer.transform
  }
  function gesturePreviewLayer(): LayerNode | undefined {
    if (
      !gesture ||
      gesture.kind === 'pan' ||
      gesture.kind === 'draw' ||
      gesture.kind === 'calloutDraw' ||
      gesture.kind === 'text' ||
      gesture.kind === 'precision' ||
      gesture.kind === 'crop' ||
      gesture.kind === 'quickSelect' ||
      gesture.kind === 'loupeSource'
    ) {
      return undefined
    }
    const activeGesture = gesture
    const layer = props.document?.layers.find(
      (candidate) => candidate.id === activeGesture.id,
    )
    if (!layer) return undefined
    if (activeGesture.kind === 'intrinsicResize') {
      return resizeLayerGeometry(
        layer,
        activeGesture.handle,
        activeGesture.current,
        {
          preserveAspect: activeGesture.preserveAspect,
          fromCenter: activeGesture.centerResize,
          ...(props.document === undefined
            ? {}
            : { canvas: props.document.canvas }),
        },
      )
    }
    if (activeGesture.kind === 'arrowHandle') {
      return layer.kind === 'arrow'
        ? updateArrowHandle(
            layer,
            activeGesture.handle,
            toLocal(layer, activeGesture.current),
          )
        : undefined
    }
    if (activeGesture.kind === 'calloutHandle') {
      return layer.kind === 'callout'
        ? updateCalloutHandle(
            layer,
            activeGesture.handle,
            toLocal(layer, activeGesture.current),
          )
        : undefined
    }
    return { ...layer, transform: previewTransform(layer) }
  }
  function gesturePreviewNodes() {
    const layer = gesturePreviewLayer()
    // Loupe rendering needs the ordered scene surface to sample layers beneath
    // it. Its transient geometry is therefore rendered in the scene, never the
    // generic overlay node list.
    if (!layer || layer.kind === 'loupe' || !props.document) return []
    return createDocumentRenderScene({
      ...props.document,
      layers: [layer],
    }).nodes
  }
  function drawDraft(context: CanvasRenderingContext2D): void {
    if (!gesture || gesture.kind !== 'draw') return
    const layer = createDrawingLayer({
      id: '__drawing-draft__',
      tool: gesture.tool,
      start: gesture.start,
      end: gesture.current,
      ...(props.drawingDefaults === undefined
        ? {}
        : { defaults: props.drawingDefaults }),
      constrainAngle: gesture.constrainAngle,
      drawFromCenter: gesture.drawFromCenter,
      points: gesture.points,
    })
    if (!layer || !props.document) return
    drawNodes2D(
      context,
      createDocumentRenderScene({ ...props.document, layers: [layer] }).nodes,
    )
  }
  function resolveCalloutStroke(): StrokeStyle {
    const arrowStroke = props.drawingDefaults?.arrow?.stroke
    if (arrowStroke && typeof arrowStroke === 'object') {
      return arrowStroke as StrokeStyle
    }
    return DEFAULT_CALLOUT_STROKE
  }
  function drawCalloutDraft(context: CanvasRenderingContext2D): void {
    let target: CanvasPoint | undefined
    let label: CanvasPoint | undefined
    let stroke = resolveCalloutStroke()
    if (gesture?.kind === 'calloutDraw') {
      target = gesture.start
      label = gesture.current
    } else {
      const editing = editingText.value
      if (
        editing?.kind !== 'callout' ||
        editing.existing ||
        !editing.calloutDraft
      ) {
        return
      }
      target = editing.calloutDraft.target
      label = editing.calloutDraft.label
      stroke = editing.calloutStroke ?? stroke
    }
    if (!target || !label || (target.x === label.x && target.y === label.y)) {
      return
    }
    const route = defaultCalloutRoute(target, label)
    const points = calloutPathPoints({
      target,
      label,
      route,
      stroke,
      content: {
        text: '',
        wrap: 'autoSize',
        spans: [],
        paragraphs: [],
      },
      background: null,
      targetMarker: 'circle',
      labelMarker: 'circle',
    })
    const markerRadius = calloutMarkerRadius(stroke.width)
    const scale = 1 / ((props.zoom ?? 100) / 100)
    context.save()
    context.strokeStyle = `rgba(${Math.round(stroke.color.red * 255)}, ${Math.round(stroke.color.green * 255)}, ${Math.round(stroke.color.blue * 255)}, ${stroke.color.alpha})`
    context.lineWidth = stroke.width * scale
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    context.moveTo(points[0]!.x, points[0]!.y)
    for (const point of points.slice(1)) {
      context.lineTo(point.x, point.y)
    }
    context.stroke()
    context.fillStyle = context.strokeStyle
    for (const point of [points[0]!, points[points.length - 1]!]) {
      context.beginPath()
      context.arc(point.x, point.y, markerRadius, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }
  function rectFromPoints(start: CanvasPoint, end: CanvasPoint) {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    }
  }
  function freeformDraftPoints(
    points: readonly CanvasPoint[],
    start: CanvasPoint,
    end: CanvasPoint,
  ): readonly CanvasPoint[] {
    if (points.length >= 3) {
      const area = points.reduce((sum, point, index) => {
        const next = points[(index + 1) % points.length]!
        return sum + point.x * next.y - next.x * point.y
      }, 0)
      if (Math.abs(area) > 0.5) return points
    }
    const bounds = rectFromPoints(start, end)
    return [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height },
    ]
  }
  function precisionDraftLayer(
    id = '__precision-draft__',
  ): LayerNode | undefined {
    if (!gesture || gesture.kind !== 'precision') return undefined
    const defaults = props.precisionDefaults ?? DEFAULT_PRECISION_TOOLS
    const bounds = rectFromPoints(gesture.start, gesture.current)
    if (gesture.tool === 'censor') {
      if (bounds.width < 1 || bounds.height < 1) return undefined
      const effect =
        defaults.censor.mode === 'pixelate'
          ? ({
              mode: 'pixelate',
              blockSize: defaults.censor.blockSize,
            } as const)
          : defaults.censor.mode === 'blur'
            ? ({
                mode: 'blur',
                strength: defaults.censor.blurStrength,
              } as const)
            : ({ mode: 'solid', color: defaults.censor.solidColor } as const)
      return createCensorLayer({
        id,
        region:
          defaults.censor.region === 'freeform'
            ? {
                kind: 'freeform',
                points: freeformDraftPoints(
                  gesture.points,
                  gesture.start,
                  gesture.current,
                ),
              }
            : { kind: 'rectangle', bounds },
        effect,
      })
    }
    if (gesture.tool === 'spotlight') {
      if (bounds.width < 1 || bounds.height < 1) return undefined
      return createSpotlightLayer({
        id,
        bounds,
        shape: defaults.spotlight.shape,
        dimColor: defaults.spotlight.dimColor,
        dimOpacity: defaults.spotlight.dimOpacity,
        feather: defaults.spotlight.feather,
      })
    }
    if (gesture.tool === 'ruler') {
      if (!props.canvas) return undefined
      if (
        gesture.start.x === gesture.current.x &&
        gesture.start.y === gesture.current.y
      ) {
        return undefined
      }
      return createRulerLayer({
        id,
        canvas: props.canvas,
        start: gesture.start,
        end: gesture.current,
        unit: defaults.ruler.unit,
        snapAngleIncrementDegrees: defaults.ruler.snapAngleIncrementDegrees,
        color: defaults.ruler.color,
        thickness: defaults.ruler.thickness,
        fontSize: defaults.ruler.fontSize,
      })
    }
    if (!props.canvas) return undefined
    const zoom = defaults.loupe.zoom
    const maximumSourceSize = Math.min(props.canvas.width, props.canvas.height)
    const size = Math.min(defaults.loupe.size, maximumSourceSize * zoom)
    const sourceSize = size / zoom
    const sourceX = Math.max(
      0,
      Math.min(
        props.canvas.width - sourceSize,
        gesture.start.x - sourceSize / 2,
      ),
    )
    const sourceY = Math.max(
      0,
      Math.min(
        props.canvas.height - sourceSize,
        gesture.start.y - sourceSize / 2,
      ),
    )
    return createLoupeLayer({
      id,
      canvas: props.canvas,
      sourceRegion: {
        x: sourceX,
        y: sourceY,
        width: sourceSize,
        height: sourceSize,
      },
      destination: {
        x: gesture.current.x - size / 2,
        y: gesture.current.y - size / 2,
      },
      zoom,
      size,
      shape: defaults.loupe.shape,
      borderColor: defaults.loupe.borderColor,
      borderWidth: defaults.loupe.borderWidth,
      shadow: defaults.loupe.shadow
        ? {
            color: { red: 0, green: 0, blue: 0, alpha: 0.35 },
            offsetX: 0,
            offsetY: 6,
            blur: 14,
          }
        : null,
    })
  }
  function drawPrecisionDraft(context: CanvasRenderingContext2D): void {
    if (!gesture || gesture.kind !== 'precision') return
    const defaults = props.precisionDefaults ?? DEFAULT_PRECISION_TOOLS
    const bounds = rectFromPoints(gesture.start, gesture.current)
    const scale = (props.zoom ?? 100) / 100
    context.save()
    context.strokeStyle = '#d9773b'
    context.fillStyle = 'rgba(217, 119, 59, 0.14)'
    context.lineWidth = 2 / scale
    context.setLineDash([5 / scale, 3 / scale])
    context.beginPath()
    if (gesture.tool === 'censor' && defaults.censor.region === 'freeform') {
      const points = freeformDraftPoints(
        gesture.points,
        gesture.start,
        gesture.current,
      )
      const first = points[0]
      if (first) {
        context.moveTo(first.x, first.y)
        for (const point of points.slice(1)) context.lineTo(point.x, point.y)
        context.closePath()
      }
    } else if (gesture.tool === 'ruler') {
      context.moveTo(gesture.start.x, gesture.start.y)
      context.lineTo(gesture.current.x, gesture.current.y)
    } else if (gesture.tool === 'loupe') {
      const sourceSize = defaults.loupe.size / defaults.loupe.zoom
      context.moveTo(gesture.current.x, gesture.current.y)
      context.lineTo(gesture.start.x, gesture.start.y)
      context.rect(
        gesture.start.x - sourceSize / 2,
        gesture.start.y - sourceSize / 2,
        sourceSize,
        sourceSize,
      )
      if (defaults.loupe.shape === 'circle') {
        context.moveTo(
          gesture.current.x + defaults.loupe.size / 2,
          gesture.current.y,
        )
        context.arc(
          gesture.current.x,
          gesture.current.y,
          defaults.loupe.size / 2,
          0,
          Math.PI * 2,
        )
      } else {
        context.rect(
          gesture.current.x - defaults.loupe.size / 2,
          gesture.current.y - defaults.loupe.size / 2,
          defaults.loupe.size,
          defaults.loupe.size,
        )
      }
    } else if (
      gesture.tool === 'spotlight' &&
      defaults.spotlight.shape === 'ellipse'
    ) {
      context.ellipse(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
        bounds.width / 2,
        bounds.height / 2,
        0,
        0,
        Math.PI * 2,
      )
    } else if (
      gesture.tool === 'spotlight' &&
      defaults.spotlight.shape === 'diamond'
    ) {
      context.moveTo(bounds.x + bounds.width / 2, bounds.y)
      context.lineTo(bounds.x + bounds.width, bounds.y + bounds.height / 2)
      context.lineTo(bounds.x + bounds.width / 2, bounds.y + bounds.height)
      context.lineTo(bounds.x, bounds.y + bounds.height / 2)
      context.closePath()
    } else {
      context.rect(bounds.x, bounds.y, bounds.width, bounds.height)
    }
    context.fill()
    context.stroke()
    context.restore()
    if (!rulerGuide) return
    context.save()
    context.strokeStyle = '#d9773b'
    context.lineWidth = 1 / ((props.zoom ?? 100) / 100)
    context.setLineDash([4, 3])
    context.beginPath()
    context.moveTo(rulerGuide.start.x, rulerGuide.start.y)
    context.lineTo(rulerGuide.end.x, rulerGuide.end.y)
    context.stroke()
    context.restore()
  }
  function ensureCropSession(): CropSession | undefined {
    if (props.quickSelectionMode) return undefined
    if (
      (props.activeTool !== 'crop' && !props.quickFrameMode) ||
      !props.document
    )
      return undefined
    if (!cropSession) {
      try {
        cropSession = createCropSession(props.document)
      } catch (error) {
        rendererError.value =
          error instanceof Error ? error.message : String(error)
        return undefined
      }
    }
    return cropSession
  }
  function cropHandlePositions(session: CropSession) {
    const { x, y, width, height } = session.crop
    return [
      ['northWest', { x, y }],
      ['north', { x: x + width / 2, y }],
      ['northEast', { x: x + width, y }],
      ['east', { x: x + width, y: y + height / 2 }],
      ['southEast', { x: x + width, y: y + height }],
      ['south', { x: x + width / 2, y: y + height }],
      ['southWest', { x, y: y + height }],
      ['west', { x, y: y + height / 2 }],
    ] as const
  }
  function cropHandleAtPoint(
    session: CropSession,
    point: CanvasPoint,
  ): CropResizeHandle | undefined {
    const tolerance = 9 / cropOverlayScale()
    return cropHandlePositions(session).find(
      ([, position]) =>
        Math.hypot(position.x - point.x, position.y - point.y) <= tolerance,
    )?.[0]
  }
  function cropOverlayScale(): number {
    const canvas = overlay.value ?? scene.value
    const fallback = (props.zoom ?? 100) / 100
    if (!canvas) return fallback
    const rect = canvas.getBoundingClientRect()
    return overlayVisualScale(
      {
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        clientWidth: rect.width,
        clientHeight: rect.height,
      },
      fallback,
    )
  }
  function drawCropOverlay(
    context: CanvasRenderingContext2D,
    outputBounds: ViewportOutputBounds,
  ): boolean {
    const session = props.quickSelectionMode ? undefined : ensureCropSession()
    const crop = props.quickSelectionMode ? quickSelectionDraft : session?.crop
    if (
      (!props.quickSelectionMode &&
        (!session || (props.activeTool !== 'crop' && !props.quickFrameMode))) ||
      !props.canvas
    )
      return false
    context.save()
    context.fillStyle = 'rgba(8, 12, 18, 0.58)'
    if (!crop) {
      context.fillRect(0, 0, props.canvas.width, props.canvas.height)
      context.restore()
      return true
    }
    const { x, y, width, height } = crop
    const right = x + width
    const bottom = y + height
    context.fillRect(0, 0, props.canvas.width, y)
    context.fillRect(
      0,
      bottom,
      props.canvas.width,
      props.canvas.height - bottom,
    )
    context.fillRect(0, y, x, height)
    context.fillRect(right, y, props.canvas.width - right, height)
    context.strokeStyle = '#ffffff'
    const zoomScale = cropOverlayScale()
    context.lineWidth = 1 / zoomScale
    context.setLineDash(
      props.quickFrameMode ? [7 / zoomScale, 5 / zoomScale] : [],
    )
    context.strokeRect(x, y, width, height)
    context.setLineDash([])
    if (!props.quickFrameMode) {
      context.strokeStyle = 'rgba(255,255,255,0.72)'
      context.beginPath()
      for (const fraction of [1 / 3, 2 / 3]) {
        context.moveTo(x + width * fraction, y)
        context.lineTo(x + width * fraction, bottom)
        context.moveTo(x, y + height * fraction)
        context.lineTo(right, y + height * fraction)
      }
      context.stroke()
    } else {
      const label = `${Math.round(width)} × ${Math.round(height)}`
      const badgeHeight = 28 / zoomScale
      const badgeWidth = (label.length * 8 + 18) / zoomScale
      const badgeX = Math.max(
        6 / zoomScale,
        Math.min(x, props.canvas.width - badgeWidth - 6 / zoomScale),
      )
      const above = y - badgeHeight - 7 / zoomScale
      const badgeY = above >= 6 / zoomScale ? above : y + 7 / zoomScale
      context.fillStyle = 'rgba(24, 26, 30, 0.94)'
      context.beginPath()
      if (typeof context.roundRect === 'function') {
        context.roundRect(
          badgeX,
          badgeY,
          badgeWidth,
          badgeHeight,
          8 / zoomScale,
        )
        context.fill()
      } else {
        context.fillRect(badgeX, badgeY, badgeWidth, badgeHeight)
      }
      context.fillStyle = '#ffffff'
      context.font = `${13 / zoomScale}px Roboto, sans-serif`
      context.textBaseline = 'middle'
      context.fillText(label, badgeX + 9 / zoomScale, badgeY + badgeHeight / 2)
    }
    if (session) {
      const half = 4 / zoomScale
      context.fillStyle = '#ffffff'
      context.strokeStyle = '#d9773b'
      for (const [, position] of cropHandlePositions(session)) {
        drawClampedHandleSquare(context, position, half, outputBounds)
      }
    }
    context.restore()
    return true
  }
  function drawOverlay(): void {
    const outputBounds = viewportOutputBounds.value
    if (!overlay.value || !props.canvas || !outputBounds) return
    const context = overlay.value.getContext('2d')
    if (!context || typeof context.clearRect !== 'function') return
    const previewNodes = gesturePreviewNodes()
    if (renderer && rendererSceneReady) {
      renderer.setOverlay(previewNodes)
      renderer.render(['overlay'])
    } else {
      context.setTransform?.(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, overlay.value.width, overlay.value.height)
    }
    // Overlay primitives are expressed in document canvas coordinates even
    // though the visible bitmap is output-local after a committed crop.
    context.setTransform?.(1, 0, 0, 1, -outputBounds.x, -outputBounds.y)
    if (!renderer) drawNodes2D(context, previewNodes)
    drawDraft(context)
    drawCalloutDraft(context)
    drawPrecisionDraft(context)
    if (drawCropOverlay(context, outputBounds)) return
    const committedLayer = selectedLayer()
    const previewLayer = gesturePreviewLayer()
    const layer =
      previewLayer && previewLayer.id === committedLayer?.id
        ? previewLayer
        : committedLayer
    if (!layer || !layer.visible) return
    // `gesturePreviewLayer` already includes the transient transform. Applying
    // `previewTransform` again made the selection frame drift by a second delta.
    const transform = layer.transform
    const bounds = layerBounds(layer)
    context.save()
    context.translate(transform.translateX, transform.translateY)
    context.rotate((transform.rotation * Math.PI) / 180)
    context.scale(transform.scaleX, transform.scaleY)
    context.lineWidth =
      1 / Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY), 1)
    context.strokeStyle = '#d9773b'
    context.setLineDash([4, 3])
    context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
    context.setLineDash([])
    context.restore()
    if (layer.locked) return
    const handleHalfSize = 3 / ((props.zoom ?? 100) / 100)
    context.fillStyle = '#fff'
    context.strokeStyle = '#d9773b'
    const intrinsicHandles = layerIntrinsicResizeHandles(layer).filter(
      (handle): handle is ResizeHandle =>
        handle !== 'start' && handle !== 'end',
    )
    const resizeHandles =
      layer.kind === 'image' ? BOUNDS_RESIZE_HANDLES : intrinsicHandles
    const handlesToDraw =
      resizeHandles.length > 0
        ? resizeHandles
        : (['nw', 'ne', 'se', 'sw'] as const)
    const boundsPositions = worldBoundsHandlePositions(layer, transform)
    for (const handle of handlesToDraw) {
      drawClampedHandleSquare(
        context,
        boundsPositions[handle],
        handleHalfSize,
        outputBounds,
      )
    }
    if (layer.kind === 'callout') {
      for (const { kind: name, point: saved } of calloutSelectionHandles(
        layer,
      )) {
        const local =
          gesture?.kind === 'calloutHandle' &&
          gesture.id === layer.id &&
          gesture.handle === name
            ? toLocal(layer, gesture.current)
            : saved
        const position = transformPoint(transform, local)
        context.beginPath()
        context.arc(position.x, position.y, handleHalfSize + 2, 0, Math.PI * 2)
        context.fill()
        context.stroke()
      }
    }
    if (layer.kind === 'arrow') {
      for (const { kind: name, point: saved } of arrowSelectionHandles(layer)) {
        const local =
          gesture?.kind === 'arrowHandle' &&
          gesture.id === layer.id &&
          gesture.handle === name
            ? toLocal(layer, gesture.current)
            : saved
        const position = transformPoint(transform, local)
        context.beginPath()
        context.arc(position.x, position.y, handleHalfSize + 2, 0, Math.PI * 2)
        context.fill()
        context.stroke()
      }
    }
    if (layer.kind === 'ruler') {
      for (const saved of [layer.payload.start, layer.payload.end]) {
        const position = transformPoint(transform, saved)
        context.beginPath()
        context.arc(position.x, position.y, handleHalfSize + 2, 0, Math.PI * 2)
        context.fill()
        context.stroke()
      }
    }
    if (layer.kind === 'loupe') {
      const source =
        gesture?.kind === 'loupeSource' && gesture.id === layer.id
          ? loupeSourceCenter(moveLoupeSourceMarker(layer, gesture.current))
          : undefined
      drawSelectedLoupeOverlay(context, layer, transform, source)
    }
    if (gesture?.kind === 'move' && gesture.guidesVisible) {
      context.save()
      context.strokeStyle = '#d9773b'
      context.lineWidth = 1 / ((props.zoom ?? 100) / 100)
      context.setLineDash([
        3 / ((props.zoom ?? 100) / 100),
        3 / ((props.zoom ?? 100) / 100),
      ])
      for (const guide of gesture.guides) {
        context.beginPath()
        context.moveTo(guide.x, 0)
        context.lineTo(guide.x, props.canvas.height)
        context.moveTo(0, guide.y)
        context.lineTo(props.canvas.width, guide.y)
        context.stroke()
      }
      context.restore()
    }
  }
  function roundedOverlayPath(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    const right = x + width
    const bottom = y + height
    const safeRadius = Math.min(radius, width / 2, height / 2)
    context.beginPath()
    context.moveTo(x + safeRadius, y)
    context.lineTo(right - safeRadius, y)
    context.quadraticCurveTo(right, y, right, y + safeRadius)
    context.lineTo(right, bottom - safeRadius)
    context.quadraticCurveTo(right, bottom, right - safeRadius, bottom)
    context.lineTo(x + safeRadius, bottom)
    context.quadraticCurveTo(x, bottom, x, bottom - safeRadius)
    context.lineTo(x, y + safeRadius)
    context.quadraticCurveTo(x, y, x + safeRadius, y)
    context.closePath()
  }
  function drawSelectedLoupeOverlay(
    context: CanvasRenderingContext2D,
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
    transform: Transform2D,
    sourceOverride?: CanvasPoint,
  ): void {
    const scale = (props.zoom ?? 100) / 100
    const source = sourceOverride ?? loupeSourceCenter(layer)
    const markerHalf = 4 / scale
    context.save()
    context.fillStyle = '#ffffff'
    context.strokeStyle = '#d9773b'
    context.lineWidth = 1.5 / scale
    context.fillRect(
      source.x - markerHalf,
      source.y - markerHalf,
      markerHalf * 2,
      markerHalf * 2,
    )
    context.strokeRect(
      source.x - markerHalf,
      source.y - markerHalf,
      markerHalf * 2,
      markerHalf * 2,
    )

    const bounds = layerBounds(layer)
    const lensBottom = transformPoint(transform, {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height,
    })
    const lensTop = transformPoint(transform, {
      x: bounds.x + bounds.width / 2,
      y: bounds.y,
    })
    const labels = [
      `${String(layer.payload.zoom).replace(/\.0$/, '')}×`,
      `${Math.round(layer.payload.lens.size)}`,
    ]
    context.font = `600 ${11 / scale}px system-ui, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const height = 18 / scale
    const gap = 6 / scale
    const widths = labels.map(
      (label) => context.measureText(label).width + 14 / scale,
    )
    const totalWidth = widths[0]! + widths[1]! + gap
    const belowY = lensBottom.y + 8 / scale
    const y =
      belowY + height <= (props.canvas?.height ?? Number.POSITIVE_INFINITY)
        ? belowY
        : lensTop.y - 8 / scale - height
    let x = lensBottom.x - totalWidth / 2
    for (const [index, label] of labels.entries()) {
      const width = widths[index]!
      roundedOverlayPath(context, x, y, width, height, height / 2)
      context.fillStyle = '#ffffff'
      context.strokeStyle = '#d9773b'
      context.fill()
      context.stroke()
      context.fillStyle = '#d9773b'
      context.fillText(label, x + width / 2, y + height / 2)
      x += width + gap
    }
    context.restore()
  }
  function invalidateOverlay(): void {
    // Interaction state is non-reactive; only the lightweight overlay updates
    // during pointer movement, never the committed scene or Vue tree.
    drawOverlay()
    updateTransientArrowToolbarLayout()
  }
  onMounted(() => {
    componentMounted = true
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
      cropSession = undefined
      if (props.activeTool === 'crop' || props.quickFrameMode)
        ensureCropSession()
      invalidateOverlay()
    },
  )
  watch(
    () => props.activeTool,
    (tool) => {
      cancelGesture()
      cropSession =
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
        cropSession = undefined
        quickSelectionDraft = undefined
        setDirectCursor('crosshair')
        void nextTick(() => scene.value?.focus({ preventScroll: true }))
      } else {
        quickSelectionDraft = undefined
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
  }): CanvasPoint | undefined {
    const bounds = viewportOutputBounds.value
    if (!scene.value || !props.document || !bounds) return undefined
    const rect = scene.value.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return undefined
    return {
      x:
        bounds.x +
        ((event.clientX - rect.left) * scene.value.width) / rect.width,
      y:
        bounds.y +
        ((event.clientY - rect.top) * scene.value.height) / rect.height,
      pressure:
        event.pointerType === 'pen' &&
        typeof event.pressure === 'number' &&
        Number.isFinite(event.pressure)
          ? Math.max(0, Math.min(1, event.pressure))
          : 0.5,
    }
  }
  function boundsResizeHandleAtPoint(
    layer: LayerNode,
    point: CanvasPoint,
  ): ResizeHandle | undefined {
    const handles =
      layer.kind === 'image'
        ? BOUNDS_RESIZE_HANDLES
        : layerIntrinsicResizeHandles(layer).filter(
            (handle): handle is ResizeHandle =>
              handle !== 'start' && handle !== 'end',
          )
    const positions = worldBoundsHandlePositions(layer)
    const tolerance = 9 / ((props.zoom ?? 100) / 100)
    for (const handle of handles) {
      const position = positions[handle]
      if (Math.hypot(position.x - point.x, position.y - point.y) <= tolerance) {
        return handle
      }
    }
    return undefined
  }
  function rotationCornerAtPoint(
    layer: LayerNode,
    point: CanvasPoint,
  ): ResizeHandle | undefined {
    const positions = worldBoundsHandlePositions(layer)
    const bounds = layerBounds(layer)
    const center = transformPoint(layer.transform, {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    })
    const cornerHandles = ['nw', 'ne', 'se', 'sw'] as const
    const resizeCorners = new Set(
      (layer.kind === 'image'
        ? BOUNDS_RESIZE_HANDLES
        : layerIntrinsicResizeHandles(layer)
      ).filter((handle) => cornerHandles.includes(handle as never)),
    )
    const tolerance = 9 / ((props.zoom ?? 100) / 100)
    const offset = 14 / ((props.zoom ?? 100) / 100)
    for (const handle of cornerHandles) {
      const corner = positions[handle]
      const length = Math.hypot(corner.x - center.x, corner.y - center.y) || 1
      const target = resizeCorners.has(handle)
        ? {
            x: corner.x + ((corner.x - center.x) / length) * offset,
            y: corner.y + ((corner.y - center.y) / length) * offset,
          }
        : corner
      if (Math.hypot(target.x - point.x, target.y - point.y) <= tolerance) {
        return handle
      }
    }
    return undefined
  }
  function intrinsicEndpointAtPoint(
    layer: LayerNode,
    point: CanvasPoint,
  ): 'start' | 'end' | undefined {
    if (layer.kind !== 'ruler') return undefined
    const tolerance = 9 / ((props.zoom ?? 100) / 100)
    for (const handle of ['start', 'end'] as const) {
      const candidate = transformPoint(layer.transform, layer.payload[handle])
      if (
        Math.hypot(candidate.x - point.x, candidate.y - point.y) <= tolerance
      ) {
        return handle
      }
    }
    return undefined
  }
  function resizeCursor(handle: ResizeHandle): string {
    if (handle === 'n' || handle === 's') return 'ns-resize'
    if (handle === 'e' || handle === 'w') return 'ew-resize'
    return handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize'
  }
  function setDirectCursor(cursor: string, rotate = false): void {
    if (!scene.value) return
    scene.value.classList.toggle('cs-canvas-rotate-cursor', rotate)
    scene.value.style.cursor = cursor
  }
  function updateHoverCursor(point: CanvasPoint): void {
    const canvas = scene.value
    const document = props.document
    if (props.quickSelectionMode) {
      setDirectCursor('crosshair')
      return
    }
    if (
      !canvas ||
      !document ||
      props.activeTool === 'hand' ||
      props.activeTool === 'crop'
    )
      return
    const layer = selectedLayer()
    if (!layer || layer.locked || !layer.visible) {
      setDirectCursor('')
      return
    }
    if (
      calloutHandleAtPoint(layer, point) ||
      arrowHandleAtPoint(layer, point) ||
      intrinsicEndpointAtPoint(layer, point) ||
      loupeSourceHandleAtPoint(layer, point)
    ) {
      setDirectCursor('crosshair')
      return
    }
    const resize = boundsResizeHandleAtPoint(layer, point)
    if (resize) {
      setDirectCursor(resizeCursor(resize))
      return
    }
    if (rotationCornerAtPoint(layer, point)) {
      setDirectCursor('', true)
      return
    }
    setDirectCursor(hitTestDocument(document, point) ? 'move' : '')
  }
  function calloutHandleAtPoint(
    layer: LayerNode,
    point: CanvasPoint,
  ): CalloutHandleKind | undefined {
    if (layer.kind !== 'callout') return undefined
    const tolerance = 9 / ((props.zoom ?? 100) / 100)
    return calloutSelectionHandles(layer).find(({ point: local }) => {
      const candidate = transformPoint(layer.transform, local)
      return (
        Math.hypot(candidate.x - point.x, candidate.y - point.y) <= tolerance
      )
    })?.kind
  }
  function loupeSourceHandleAtPoint(
    layer: LayerNode,
    point: CanvasPoint,
  ): boolean {
    if (layer.kind !== 'loupe') return false
    const source = loupeSourceCenter(layer)
    const tolerance = 9 / ((props.zoom ?? 100) / 100)
    return Math.hypot(source.x - point.x, source.y - point.y) <= tolerance
  }
  function calloutEditorOrigin(
    label: CanvasPoint,
    stroke: StrokeStyle,
    fontSize: number,
  ): CanvasPoint {
    const markerRadius = calloutMarkerRadius(stroke.width)
    return {
      x: label.x + markerRadius + 6,
      y: label.y - (fontSize * 1.25) / 2,
    }
  }
  function arrowHandleAtPoint(
    layer: LayerNode,
    point: CanvasPoint,
  ): ArrowHandleKind | undefined {
    if (layer.kind !== 'arrow') return undefined
    const tolerance = 9 / ((props.zoom ?? 100) / 100)
    return arrowSelectionHandles(layer).find(({ point: local }) => {
      const candidate = transformPoint(layer.transform, local)
      return (
        Math.hypot(candidate.x - point.x, candidate.y - point.y) <= tolerance
      )
    })?.kind
  }
  function onPointerDown(event: PointerEvent): void {
    // A canvas click is the direct confirmation gesture for the transient text
    // editor. Commit it before starting another canvas gesture so the next text
    // session cannot replace this one while its blur handler is still pending.
    if (editingText.value) {
      if (event.button === 0 && !editingText.value.controller.composing) {
        event.preventDefault()
        commitTextEditor()
      }
      return
    }
    const point = canvasPoint(event)
    if (!point || !scene.value || !props.document) return
    if (props.sampling) {
      event.preventDefault()
      if (event.button > 0) {
        samplingCursor.value = undefined
        hideEyedropperPreview()
        emit('colorSampleCancel')
        return
      }
      samplingCursor.value = point
      scheduleEyedropperPreview(point, {
        clientX: event.clientX,
        clientY: event.clientY,
      })
      sampleScene(point)
      return
    }
    const pan =
      event.button === 1 || props.activeTool === 'hand' || spacePressed
    if (pan && scrollContainer.value) {
      event.preventDefault()
      scene.value.setPointerCapture(event.pointerId)
      isPanning.value = true
      gesture = {
        kind: 'pan',
        clientX: event.clientX,
        clientY: event.clientY,
        scrollLeft: scrollContainer.value.scrollLeft,
        scrollTop: scrollContainer.value.scrollTop,
      }
      return
    }
    if (event.button !== 0) return
    if (props.quickSelectionMode) {
      event.preventDefault()
      scene.value.setPointerCapture(event.pointerId)
      quickSelectionDraft = {
        x: point.x,
        y: point.y,
        width: 1,
        height: 1,
      }
      gesture = { kind: 'quickSelect', start: point, current: point }
      emit('quickFrameChange', { ...quickSelectionDraft })
      invalidateOverlay()
      return
    }
    if (props.activeTool === 'crop' || props.quickFrameMode) {
      const session = ensureCropSession()
      if (!session) return
      const handle = cropHandleAtPoint(session, point)
      const inside =
        point.x >= session.crop.x &&
        point.x <= session.crop.x + session.crop.width &&
        point.y >= session.crop.y &&
        point.y <= session.crop.y + session.crop.height
      const tolerance = 7 / ((props.zoom ?? 100) / 100)
      const nearBorder =
        inside &&
        Math.min(
          Math.abs(point.x - session.crop.x),
          Math.abs(point.x - session.crop.x - session.crop.width),
          Math.abs(point.y - session.crop.y),
          Math.abs(point.y - session.crop.y - session.crop.height),
        ) <= tolerance
      if (handle || (props.quickFrameMode ? nearBorder : inside)) {
        event.preventDefault()
        scene.value.setPointerCapture(event.pointerId)
        gesture = {
          kind: 'crop',
          action: handle ? 'resize' : 'move',
          ...(handle ? { handle } : {}),
          start: point,
          initial: session,
        }
        return
      }
      if (props.activeTool === 'crop') return
    }
    const selected = selectedLayer()
    const loupeSource =
      selected?.kind === 'loupe' && !selected.locked
        ? loupeSourceHandleAtPoint(selected, point)
        : false
    if (selected?.kind === 'loupe' && loupeSource) {
      event.preventDefault()
      scene.value.setPointerCapture(event.pointerId)
      setDirectCursor('crosshair')
      gesture = {
        kind: 'loupeSource',
        id: selected.id,
        start: point,
        current: point,
        initial: selected,
      }
      renderCommittedSceneForGesture()
      return
    }
    if (
      props.activeTool === 'censor' ||
      props.activeTool === 'spotlight' ||
      props.activeTool === 'ruler' ||
      props.activeTool === 'loupe'
    ) {
      event.preventDefault()
      scene.value.setPointerCapture(event.pointerId)
      gesture = {
        kind: 'precision',
        tool: props.activeTool,
        start: point,
        current: point,
        points: [point],
        guidesHeld: event.altKey,
      }
      rulerGuide = undefined
      invalidateOverlay()
      return
    }
    if (props.activeTool === 'image') {
      event.preventDefault()
      const center = visibleCanvasCenter() ?? point
      emit('requestImageImport', { x: center.x, y: center.y })
      return
    }
    if (props.activeTool === 'numberedMarker') {
      event.preventDefault()
      const sequence = props.nextMarkerSequence ?? 1
      emit(
        'addLayer',
        createNumberedMarkerLayer({
          id: crypto.randomUUID(),
          sequence,
          origin: point,
          shape: props.markerShape ?? 'circle',
        }),
      )
      return
    }
    if (props.activeTool === 'callout') {
      event.preventDefault()
      scene.value.setPointerCapture(event.pointerId)
      gesture = {
        kind: 'calloutDraw',
        start: point,
        current: point,
        constrainAngle: event.shiftKey,
      }
      invalidateOverlay()
      return
    }
    if (props.activeTool === 'text') {
      event.preventDefault()
      const text = props.document.layers.find(
        (layer) =>
          layer.id === hitTestDocument(props.document!, point)?.nodeId &&
          (layer.kind === 'text' ||
            layer.kind === 'callout' ||
            layer.kind === 'numberedMarker'),
      )
      if (
        text?.kind === 'text' ||
        text?.kind === 'callout' ||
        text?.kind === 'numberedMarker'
      ) {
        const layout =
          text.kind === 'callout' ? calloutTextLayout(text.payload) : undefined
        const bounds = layerBounds(text)
        startTextEditor({
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
      } else {
        scene.value.setPointerCapture(event.pointerId)
        gesture = { kind: 'text', start: point, current: point }
      }
      return
    }
    if (
      props.activeTool === 'arrow' ||
      props.activeTool === 'shape' ||
      props.activeTool === 'pencil' ||
      props.activeTool === 'marker'
    ) {
      event.preventDefault()
      scene.value.setPointerCapture(event.pointerId)
      gesture = {
        kind: 'draw',
        tool: props.activeTool,
        start: point,
        current: point,
        constrainAngle: event.shiftKey,
        drawFromCenter: event.altKey,
        points: [point],
      }
      invalidateOverlay()
      return
    }
    const calloutHandle =
      selected?.kind === 'callout' && !selected.locked
        ? calloutHandleAtPoint(selected, point)
        : undefined
    if (selected && calloutHandle) {
      scene.value.setPointerCapture(event.pointerId)
      gesture = {
        kind: 'calloutHandle',
        id: selected.id,
        handle: calloutHandle,
        start: point,
        current: point,
      }
      renderCommittedSceneForGesture()
      return
    }
    const arrowHandle =
      selected && !selected.locked
        ? arrowHandleAtPoint(selected, point)
        : undefined
    if (selected && arrowHandle) {
      scene.value.setPointerCapture(event.pointerId)
      gesture = {
        kind: 'arrowHandle',
        id: selected.id,
        handle: arrowHandle,
        start: point,
        current: point,
      }
      renderCommittedSceneForGesture()
      return
    }
    const intrinsicEndpoint =
      selected && !selected.locked
        ? intrinsicEndpointAtPoint(selected, point)
        : undefined
    if (selected && intrinsicEndpoint) {
      scene.value.setPointerCapture(event.pointerId)
      setDirectCursor('crosshair')
      gesture = {
        kind: 'intrinsicResize',
        id: selected.id,
        handle: intrinsicEndpoint,
        start: point,
        current: point,
        initial: selected,
        preserveAspect: false,
        centerResize: false,
      }
      renderCommittedSceneForGesture()
      return
    }
    const resizeHandle =
      selected && !selected.locked
        ? boundsResizeHandleAtPoint(selected, point)
        : undefined
    if (selected && resizeHandle) {
      scene.value.setPointerCapture(event.pointerId)
      setDirectCursor(resizeCursor(resizeHandle))
      if (selected.kind === 'image') {
        gesture = {
          kind: 'resize',
          id: selected.id,
          handle: resizeHandle,
          start: point,
          current: point,
          initial: selected.transform,
          freeResize: event.shiftKey,
          centerResize: event.altKey,
        }
      } else {
        gesture = {
          kind: 'intrinsicResize',
          id: selected.id,
          handle: resizeHandle,
          start: point,
          current: point,
          initial: selected,
          preserveAspect:
            event.shiftKey ||
            selected.kind === 'emoji' ||
            selected.kind === 'loupe',
          centerResize: event.altKey,
        }
      }
      renderCommittedSceneForGesture()
      return
    }
    const rotationCorner =
      selected && !selected.locked
        ? rotationCornerAtPoint(selected, point)
        : undefined
    if (selected && rotationCorner) {
      scene.value.setPointerCapture(event.pointerId)
      setDirectCursor('', true)
      const bounds = layerBounds(selected)
      const center = transformPoint(selected.transform, {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      })
      const angle = Math.atan2(point.y - center.y, point.x - center.x)
      gesture = {
        kind: 'rotate',
        id: selected.id,
        center,
        startAngle: angle,
        initial: selected.transform,
        currentAngle: selected.transform.rotation,
      }
      renderCommittedSceneForGesture()
      return
    }
    const hits = hitTestDocumentAll(props.document, point)
    const key = hits.map((hit) => hit.nodeId).join(':')
    const now = performance.now()
    const previousCycle = cycle
    const shouldCycle =
      event.detail > 1 &&
      previousCycle !== undefined &&
      previousCycle.key === key &&
      now - previousCycle.at <= 1000
    const index =
      hits.length === 0
        ? 0
        : shouldCycle
          ? (previousCycle.index + 1) % hits.length
          : 0
    cycle = { key, at: now, index }
    const hit = hits[index] ?? hitTestDocument(props.document, point)
    if (!hit) return
    emit('selectLayer', hit.nodeId, event.metaKey || event.ctrlKey)
    scene.value.setPointerCapture(event.pointerId)
    gesture = {
      kind: 'move',
      id: hit.nodeId,
      start: point,
      current: point,
      guides: [],
      guidesVisible: false,
    }
    renderCommittedSceneForGesture()
  }
  function startTextEditor(input: {
    readonly origin: CanvasPoint
    readonly existing?: EditableTextLayer
    readonly kind?: 'text' | 'callout'
    readonly width?: number
    readonly fixedWidth?: boolean
    readonly calloutDraft?: {
      readonly target: CanvasPoint
      readonly label: CanvasPoint
    }
    readonly calloutStroke?: StrokeStyle
  }): void {
    const bounds = input.existing ? layerBounds(input.existing) : undefined
    const defaults = copyTextStyle(props.textDefaults ?? DEFAULT_TEXT_TOOL)
    const fixedWidth =
      input.fixedWidth ??
      (input.existing?.kind === 'text'
        ? input.existing.payload.content.wrap === 'fixedWidth'
        : false)
    const existingContent =
      input.existing?.kind === 'numberedMarker'
        ? input.existing.payload.label
        : input.existing?.payload.content
    const initialContent: RichTextContent =
      existingContent ??
      Object.freeze({
        text: '',
        wrap: fixedWidth ? ('fixedWidth' as const) : ('autoSize' as const),
        ...(fixedWidth
          ? {
              fixedWidth:
                input.width ??
                Math.max(
                  160,
                  props.canvas?.width ? props.canvas.width / 3 : 160,
                ),
            }
          : {}),
        spans: Object.freeze([]),
        paragraphs: Object.freeze([]),
      })
    editingText.value = {
      id: input.existing?.id ?? crypto.randomUUID(),
      origin: input.origin,
      width:
        input.width ??
        bounds?.width ??
        Math.max(160, props.canvas?.width ? props.canvas.width / 3 : 160),
      fixedWidth,
      controller: markRaw(
        new RichTextEditorController(
          initialContent,
          {
            anchor: initialContent.text.length,
            focus: initialContent.text.length,
          },
          {
            typingStyle: spanStyleFromDefaults(defaults),
            paragraphStyle: paragraphStyleFromDefaults(defaults),
          },
        ),
      ),
      background:
        input.existing?.kind === 'text'
          ? input.existing.payload.background
          : input.existing?.kind === 'callout'
            ? input.existing.payload.background
            : input.existing?.kind === 'numberedMarker'
              ? {
                  color: input.existing.payload.badge.color,
                  padding: 0,
                  radius: 0,
                }
              : defaults.background,
      kind: input.existing?.kind ?? input.kind ?? 'text',
      ...(input.existing === undefined ? {} : { existing: input.existing }),
      ...(input.calloutDraft === undefined
        ? {}
        : { calloutDraft: input.calloutDraft }),
      ...(input.calloutStroke === undefined
        ? {}
        : { calloutStroke: input.calloutStroke }),
    }
    emitTextEditing()
    void nextTick(() => {
      const editor = textEditor.value
      if (!editor || !editingText.value) return
      // The DOM is a short-lived editing projection. The document continues to
      // store only plain Unicode and typed ranges, never HTML.
      editor.focus()
      renderTextEditorProjection()
      void nextTick(updateFloatingToolbarLayout)
    })
  }
  function syncTextEditorSelection(): void {
    const editor = textEditor.value
    const editing = editingText.value
    if (!editor || !editing) return
    editing.controller.setSelection(readRichTextDomSelection(editor))
    emitTextEditing()
    void nextTick(updateFloatingToolbarLayout)
  }
  function renderTextEditorProjection(): void {
    const editor = textEditor.value
    const editing = editingText.value
    if (!editor || !editing) return
    renderRichTextProjection(
      editor,
      editing.controller.state,
      (props.zoom ?? 100) / 100,
    )
    restoreRichTextDomSelection(editor, editing.controller.state.selection)
    void nextTick(updateFloatingToolbarLayout)
  }
  function readEditorText(): string {
    const editor = textEditor.value
    if (!editor) return editingText.value?.controller.state.content.text ?? ''
    return readRichTextProjection(editor)
  }
  function onTextEditorInput(): void {
    const editing = editingText.value
    if (!editing) return
    const editor = textEditor.value
    if (!editor) return
    const result = editing.controller.reconcileBrowserText(
      readEditorText(),
      readRichTextDomSelection(editor),
    )
    if (result === 'applied') renderTextEditorProjection()
    emitTextEditing()
  }
  function onTextEditorCompositionStart(): void {
    editingText.value?.controller.compositionStart()
  }
  function onTextEditorCompositionEnd(): void {
    const editing = editingText.value
    const editor = textEditor.value
    if (!editing || !editor) return
    editing.controller.compositionEnd(
      readEditorText(),
      readRichTextDomSelection(editor),
    )
    renderTextEditorProjection()
    emitTextEditing()
  }
  function onTextEditorPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain')
    if (text === undefined) return
    event.preventDefault()
    syncTextEditorSelection()
    editingText.value?.controller.replaceSelectionPlainText(text)
    renderTextEditorProjection()
    emitTextEditing()
  }
  function onTextEditorCopy(event: ClipboardEvent): void {
    const editing = editingText.value
    if (!editing || !event.clipboardData) return
    syncTextEditorSelection()
    event.preventDefault()
    event.clipboardData.clearData()
    event.clipboardData.setData(
      'text/plain',
      editing.controller.selectedPlainText(),
    )
  }
  function onTextEditorCut(event: ClipboardEvent): void {
    const editing = editingText.value
    if (!editing || !event.clipboardData) return
    onTextEditorCopy(event)
    editing.controller.replaceSelectionPlainText('')
    renderTextEditorProjection()
    emitTextEditing()
  }
  function onTextEditorBlur(event: FocusEvent): void {
    // A toolbar click belongs to the active editing session, not to the canvas.
    // Capture relatedTarget before Vue updates the toolbar: a formatting change
    // can replace the focused control before this deferred check runs.
    const movedIntoToolbar =
      textToolbarPointerDown || isFloatingToolbarTarget(event.relatedTarget)
    window.setTimeout(() => {
      if (!editingText.value) return
      const active = document.activeElement
      if (movedIntoToolbar || isFloatingToolbarTarget(active)) {
        return
      }
      commitTextEditor()
    }, 0)
  }
  function onDocumentPointerDown(event: PointerEvent): void {
    textToolbarPointerDown = isFloatingToolbarTarget(event.target)
    window.setTimeout(() => {
      textToolbarPointerDown = false
    }, 0)
  }
  function commitTextEditor(): void {
    const editing = editingText.value
    if (!editing || editing.controller.composing) return
    editingText.value = undefined
    floatingToolbarLayout.value = undefined
    emitTextEditing()
    const content = editing.controller.state.content
    const style = content.spans[0] ?? editing.controller.state.typingStyle
    const paragraph =
      content.paragraphs[0] ?? editing.controller.state.paragraphStyle
    const existing = editing.existing
    if (content.text.length === 0) {
      if (!existing) return
      const index = props.document?.layers.findIndex(
        (layer) => layer.id === existing.id,
      )
      if (index === undefined || index < 0) return
      emit(
        'documentCommand',
        createTextCommitCommand({ existing, next: null, index }),
      )
      return
    }

    let next: EditableTextLayer | null = null
    if (existing?.kind === 'numberedMarker') {
      next = {
        ...existing,
        payload: {
          ...existing.payload,
          label: content,
          badge: editing.background
            ? { ...existing.payload.badge, color: editing.background.color }
            : existing.payload.badge,
        },
      }
    } else if (existing?.kind === 'callout') {
      next = rebaseCalloutLayer(existing, {
        ...existing.payload,
        content,
        background: editing.background ?? existing.payload.background,
      })
    } else if (editing.kind === 'callout') {
      const draft = editing.calloutDraft
      if (!draft) return
      const layer = createCalloutLayer({
        id: editing.id,
        text: content.text,
        target: draft.target,
        label: draft.label,
        fontFamily: style.fontFamily,
        color: style.color,
        background: editing.background,
        stroke: editing.calloutStroke ?? resolveCalloutStroke(),
      })
      next = layer ? { ...layer, payload: { ...layer.payload, content } } : null
    } else {
      const draft = createTextLayer({
        id: editing.id,
        text: content.text,
        origin: existing
          ? {
              x: existing.transform.translateX,
              y: existing.transform.translateY,
            }
          : editing.origin,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        weight: style.weight,
        italic: style.italic,
        strikethrough: style.strikethrough,
        alignment: paragraph.alignment,
        listKind: paragraph.listKind,
        ...(editing.fixedWidth ? { fixedWidth: editing.width } : {}),
        color: style.color,
        background: editing.background,
      })
      if (draft) {
        next = {
          ...draft,
          ...(existing
            ? { id: existing.id, transform: existing.transform }
            : {}),
          payload: { ...draft.payload, content },
        }
      }
    }
    if (!next) return
    emit(
      'documentCommand',
      createTextCommitCommand(existing ? { existing, next } : { next }),
    )
  }
  function cancelTextEditor(): void {
    editingText.value = undefined
    floatingToolbarLayout.value = undefined
    emitTextEditing()
    emit('textEditingCancelled', 'escape')
  }
  function onTextEditorKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancelTextEditor()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      commitTextEditor()
      return
    }
    if (event.key === 'Enter' || event.key === 'Backspace') {
      syncTextEditorSelection()
      if (editingText.value?.controller.keydown(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        renderTextEditorProjection()
        emitTextEditing()
      }
    }
  }
  function onTextEditorBeforeInput(event: InputEvent): void {
    if (editingText.value?.controller.composing) return
    const key =
      event.inputType === 'insertParagraph' ||
      event.inputType === 'insertLineBreak'
        ? 'Enter'
        : event.inputType === 'deleteContentBackward'
          ? 'Backspace'
          : undefined
    if (!key) return
    syncTextEditorSelection()
    if (editingText.value?.controller.keydown(key)) {
      event.preventDefault()
      renderTextEditorProjection()
      emitTextEditing()
    }
  }
  function onDoubleClick(event: MouseEvent): void {
    const point = canvasPoint(event)
    if (!point || !props.document) return
    const hits = hitTestDocumentAll(props.document, point)
    const text = props.document.layers.find(
      (layer) =>
        layer.id === hits[0]?.nodeId &&
        (layer.kind === 'text' ||
          layer.kind === 'callout' ||
          layer.kind === 'numberedMarker'),
    )
    if (
      text?.kind === 'text' ||
      text?.kind === 'callout' ||
      text?.kind === 'numberedMarker'
    ) {
      event.preventDefault()
      const bounds = layerBounds(text)
      startTextEditor({
        origin: {
          x: text.transform.translateX + bounds.x,
          y: text.transform.translateY + bounds.y,
        },
        existing: text,
        kind: 'text',
      })
      return
    }
    if (hits.length < 2) return
    const key = hits.map((hit) => hit.nodeId).join(':')
    const currentIndex = hits.findIndex(
      (hit) => hit.nodeId === props.selectedLayerId,
    )
    const index = currentIndex < 0 ? 0 : (currentIndex + 1) % hits.length
    cycle = { key, at: performance.now(), index }
    emit('selectLayer', hits[index]!.nodeId, event.metaKey || event.ctrlKey)
  }
  function onPointerMove(event: PointerEvent): void {
    const point = canvasPoint(event)
    if (!point) return
    if (props.sampling) {
      samplingCursor.value = point
      scheduleEyedropperPreview(point, {
        clientX: event.clientX,
        clientY: event.clientY,
      })
      invalidateOverlay()
      return
    }
    if (!gesture) {
      updateHoverCursor(point)
      return
    }
    if (gesture.kind === 'pan' && scrollContainer.value) {
      scrollContainer.value.scrollLeft =
        gesture.scrollLeft - (event.clientX - gesture.clientX)
      scrollContainer.value.scrollTop =
        gesture.scrollTop - (event.clientY - gesture.clientY)
      return
    }
    if (gesture.kind === 'quickSelect') {
      quickSelectionDraft = {
        x: Math.min(gesture.start.x, point.x),
        y: Math.min(gesture.start.y, point.y),
        width: Math.max(1, Math.abs(point.x - gesture.start.x)),
        height: Math.max(1, Math.abs(point.y - gesture.start.y)),
      }
      gesture = { ...gesture, current: point }
      emit('quickFrameChange', { ...quickSelectionDraft })
      invalidateOverlay()
      return
    }
    if (gesture.kind === 'crop') {
      const delta = {
        x: point.x - gesture.start.x,
        y: point.y - gesture.start.y,
      }
      cropSession =
        gesture.action === 'move'
          ? moveCrop(gesture.initial, delta)
          : resizeCrop(gesture.initial, gesture.handle!, delta)
      if (props.quickFrameMode) {
        emit('quickFrameChange', { ...cropSession.crop })
      }
      invalidateOverlay()
      return
    }
    if (gesture.kind === 'precision') {
      const defaults = props.precisionDefaults ?? DEFAULT_PRECISION_TOOLS
      let current = point
      rulerGuide = undefined
      if (
        gesture.tool === 'ruler' &&
        defaults.ruler.snap &&
        (event.altKey || gesture.guidesHeld)
      ) {
        const snapped = snapRulerEndpoint(
          gesture.start,
          point,
          defaults.ruler.snapAngleIncrementDegrees,
        )
        current = snapped.end
        rulerGuide = snapped.guide
      }
      const previous = gesture.points[gesture.points.length - 1]
      gesture = {
        ...gesture,
        current,
        guidesHeld: event.altKey,
        points:
          gesture.tool === 'censor' &&
          defaults.censor.region === 'freeform' &&
          (!previous ||
            Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.5)
            ? [...gesture.points, point]
            : gesture.points,
      }
      invalidateOverlay()
      return
    }
    if (gesture.kind === 'move') {
      const result = snapPoint(
        point,
        snapCandidates(gesture.id),
        (props.zoom ?? 100) / 100,
        !event.ctrlKey && !event.metaKey,
      )
      gesture = {
        ...gesture,
        current: { x: result.x, y: result.y },
        guides: result.guides,
        guidesVisible: event.altKey,
      }
      invalidateGesturePreview()
      return
    }
    if (gesture.kind === 'resize') {
      gesture = {
        ...gesture,
        current: point,
        freeResize: event.shiftKey,
        centerResize: event.altKey,
      }
      invalidateGesturePreview()
      return
    }
    if (gesture.kind === 'intrinsicResize') {
      gesture = {
        ...gesture,
        current: point,
        preserveAspect:
          event.shiftKey ||
          gesture.initial.kind === 'emoji' ||
          gesture.initial.kind === 'loupe',
        centerResize:
          gesture.handle === 'start' || gesture.handle === 'end'
            ? false
            : event.altKey,
      }
      invalidateGesturePreview()
      return
    }
    if (gesture.kind === 'rotate') {
      const angle = Math.atan2(
        point.y - gesture.center.y,
        point.x - gesture.center.x,
      )
      let rotation =
        gesture.initial.rotation +
        ((angle - gesture.startAngle) * 180) / Math.PI
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15
      gesture = { ...gesture, currentAngle: rotation }
      invalidateGesturePreview()
      return
    }
    if (gesture.kind === 'arrowHandle') {
      gesture = { ...gesture, current: point }
      invalidateOverlay()
      return
    }
    if (gesture.kind === 'calloutHandle') {
      gesture = { ...gesture, current: point }
      invalidateOverlay()
      return
    }
    if (gesture.kind === 'loupeSource') {
      gesture = { ...gesture, current: point }
      renderCommittedSceneForGesture()
      return
    }
    if (gesture.kind === 'calloutDraw') {
      gesture = { ...gesture, current: point, constrainAngle: event.shiftKey }
      invalidateOverlay()
      return
    }
    if (gesture.kind === 'draw') {
      const coalesced = event.getCoalescedEvents?.() ?? [event]
      const samples: CanvasPoint[] = []
      if (gesture.tool === 'pencil' || gesture.tool === 'marker') {
        let previous = gesture.points[gesture.points.length - 1]
        for (const sample of coalesced) {
          const candidate = canvasPoint(sample)
          if (
            candidate &&
            (!previous ||
              Math.hypot(candidate.x - previous.x, candidate.y - previous.y) >=
                0.5)
          ) {
            samples.push(candidate)
            previous = candidate
          }
        }
      }
      gesture = {
        ...gesture,
        current: point,
        constrainAngle: event.shiftKey,
        drawFromCenter: event.altKey,
        points:
          samples.length > 0 ? [...gesture.points, ...samples] : gesture.points,
      }
      invalidateOverlay()
      return
    }
    if (gesture.kind === 'text') {
      gesture = { ...gesture, current: point }
    }
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
    if (completed?.kind === 'crop' && cropSession && props.quickFrameMode) {
      const before = completed.initial.crop
      const after = cropSession.crop
      if (
        before.x !== after.x ||
        before.y !== after.y ||
        before.width !== after.width ||
        before.height !== after.height
      ) {
        emit('documentCommand', applyCropSession(cropSession))
      }
    }
    if (
      completed?.kind === 'quickSelect' &&
      quickSelectionDraft &&
      completed.current.x !== completed.start.x &&
      completed.current.y !== completed.start.y
    ) {
      const crop = { ...quickSelectionDraft }
      emit('documentCommand', {
        type: 'setCrop',
        before: null,
        after: crop,
      })
      emit('quickSelectionComplete', crop)
    } else if (completed?.kind === 'quickSelect') {
      quickSelectionDraft = undefined
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
    if (cancelledCrop) cropSession = cancelledCrop
    if (cancelledQuickSelection) quickSelectionDraft = undefined
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
    cropSession = setCropPreset(session, preset)
    invalidateOverlay()
  }
  function resetCropDraft(): void {
    const session = ensureCropSession()
    if (!session) return
    cropSession = resetCrop(session)
    invalidateOverlay()
  }
  function applyCropDraft(): void {
    const session = ensureCropSession()
    if (!session) return
    emit('documentCommand', applyCropSession(session))
  }
  function cancelCropDraft(): void {
    const session = cropSession
    if (session) cancelCropSession(session)
    cropSession = undefined
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
        cropSession = nudgeCrop(
          cropSession!,
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
  function onDocumentSelectionChange(): void {
    const editor = textEditor.value
    const selection = window.getSelection()
    if (
      editor &&
      selection?.anchorNode &&
      selection.focusNode &&
      editor.contains(selection.anchorNode) &&
      editor.contains(selection.focusNode)
    ) {
      syncTextEditorSelection()
    }
  }
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
    componentMounted = false
    drawRevision += 1
    resizeObserver?.disconnect()
    resizeObserver = undefined
    for (const { resource } of imageResources.values()) resource.dispose()
    imageResources.clear()
    renderer?.dispose()
    renderer = undefined
    rendererSceneReady = false
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
