import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { storeToRefs } from 'pinia'
import { darkTheme, dateEnUS, dateRuRU, enUS, ruRU } from 'naive-ui'
import { t } from '../i18n'
import {
  createBrowserDrawingToolPreferencesStorage,
  createBrowserPreferencesStorage,
} from '../preferences'
import { useEditorShellStore, type ShellStoreOptions } from '../store'
import type { PrecisionToolDefaults } from '../types'
import type { DocumentSessionSnapshot } from '../../document-session'
import { loadImageWithBinaryFallback } from '../../image-transport'
import {
  createContentImageLayer,
  createDuplicateLayerCommand,
  createTextLayer,
  defaultDrawingToolPreferences,
  DEFAULT_DRAWING_DEFAULTS,
  DEFAULT_RULER_COLOR,
  DEFAULT_RULER_FONT_SIZE,
  DEFAULT_RULER_THICKNESS,
  rememberDrawingColor,
  rebaseRulerLayer,
  type DrawingDefaults,
  type DrawingToolPreferencesV2,
  type EditorDocumentV1,
  type EditorCommand,
  type ImageLayer,
  type JsonObject,
  type LayerNode,
  type CropPreset,
  type Transform2D,
} from '@cute-screen/editor-renderer'
import CanvasViewport, {
  type TextFormattingPatch,
  type TextToolbarSnapshot,
  type TextToolDefaults,
} from '../components/CanvasViewport.vue'
import type { ResolvedEditorShellProps } from '../contracts'
import { createDrawingSchema } from '../tools/drawing-schema'
import { createPrecisionSchema } from '../tools/precision-schema'
import { createTextSchema } from '../tools/text-schema'
import { createContextSchema } from '../tools/context-schema'
import { createToolCatalog } from '../tools/catalog'
import { createPrecisionEffects } from '../tools/effects/precision-effects'
import { createTextEffects } from '../tools/effects/text-effects'
import { createDrawingEffects } from '../tools/effects/drawing-effects'
import { createImageEffects } from '../tools/effects/image-effects'
import { createContextEffects } from '../tools/effects/context-effects'
import { createContextActions } from '../tools/effects/context-actions'

export function useEditorWorkspace(props: ResolvedEditorShellProps) {
  const store = useEditorShellStore()
  const state = storeToRefs(store)
  const canvasViewport = ref<InstanceType<typeof CanvasViewport>>()
  const naiveTheme = computed(() =>
    state.resolvedTheme.value === 'dark' ? darkTheme : null,
  )
  const naiveLocale = computed(() => (store.locale === 'ru' ? ruRU : enUS))
  const naiveDateLocale = computed(() =>
    store.locale === 'ru' ? dateRuRU : dateEnUS,
  )
  const fallbackCopied = ref(false)
  const fallbackVisible = ref(true)
  let fallbackCopiedTimer: number | undefined
  const drawingDefaults = ref<DrawingDefaults>(
    structuredClone(DEFAULT_DRAWING_DEFAULTS),
  )
  const textDefaults = shallowRef<TextToolDefaults>({
    fontFamily: 'Roboto',
    fontSize: 24,
    weight: 400,
    italic: false,
    strikethrough: false,
    alignment: 'start',
    listKind: 'none',
    color: { red: 0, green: 0, blue: 0, alpha: 1 },
    background: null,
  })
  const textFormatting = shallowRef<TextFormattingPatch>()
  const textDraft = ref<
    | {
        readonly id: string
        readonly kind: 'text' | 'callout' | 'numberedMarker'
        readonly snapshot: TextToolbarSnapshot
      }
    | undefined
  >()
  const toolConfigure = ref<
    | {
        readonly toolId: string
        readonly anchor: HTMLElement
      }
    | undefined
  >()
  const toolConfigureLayout = ref<
    | {
        readonly left: number
        readonly top: number
      }
    | undefined
  >()
  const configureDefaultsTool = ref<'arrow' | undefined>()
  const markerShape = ref<'circle' | 'square' | 'diamond' | 'star'>('circle')
  const cropPreset = ref<CropPreset>('free')
  const precisionDefaults = shallowRef<PrecisionToolDefaults>({
    censor: {
      region: 'rectangle',
      mode: 'pixelate',
      blockSize: 12,
      blurStrength: 12,
      solidColor: { red: 0, green: 0, blue: 0, alpha: 1 },
    },
    spotlight: {
      shape: 'rectangle',
      dimColor: { red: 0, green: 0, blue: 0, alpha: 1 },
      dimOpacity: 0.65,
      feather: 'soft',
    },
    ruler: {
      unit: 'pixels',
      snap: true,
      snapAngleIncrementDegrees: 15,
      color: DEFAULT_RULER_COLOR,
      thickness: DEFAULT_RULER_THICKNESS,
      fontSize: DEFAULT_RULER_FONT_SIZE,
    },
    loupe: {
      zoom: 2,
      size: 120,
      shape: 'circle',
      borderColor: { red: 1, green: 1, blue: 1, alpha: 1 },
      borderWidth: 3,
      shadow: true,
    },
  })
  const contentImageImporting = ref(false)
  const drawingPreferences = shallowRef<DrawingToolPreferencesV2>(
    defaultDrawingToolPreferences(),
  )
  const samplingControl = ref<string>()
  const eyedropperFeedback = ref<string>()
  const eyedropperColor = ref<string>()
  const toolError = ref<string>()
  const textureImages = ref<ReadonlyMap<string, HTMLImageElement>>(new Map())
  const activeDocument = ref<EditorDocumentV1>()
  const baseImageLayer = computed(() =>
    activeDocument.value?.layers.find(
      (layer): layer is ImageLayer =>
        layer.kind === 'image' && layer.payload.role === 'base',
    ),
  )
  const sceneTexturesReady = computed(() => {
    const document = activeDocument.value
    if (!document) return false
    if (baseImageLayer.value && !props.sourceImage) return false
    return document.layers.every(
      (layer) =>
        layer.kind !== 'image' ||
        layer.payload.role !== 'content' ||
        textureImages.value.has(layer.payload.blobHash),
    )
  })
  const translate = (key: Parameters<typeof t>[1]) => t(state.locale.value, key)
  const hasInteractiveDocument = computed(
    () => props.documentSession !== undefined || props.fixture === 'ready',
  )
  const { tools } = createToolCatalog({
    quickMode: props.quickMode,
    readOnlyDocument: props.readOnlyDocument,
    contentImageBridgeAvailable: Boolean(props.contentImageBridge),
    contentImageImporting,
    hasInteractiveDocument,
    hasCanvas: computed(() => Boolean(activeDocument.value)),
  })
  const {
    hexColor,
    precisionText,
    precisionToolSchema,
    selectedPrecisionLayer,
  } = createPrecisionSchema({
    props,
    state,
    store,
    activeDocument,
    precisionDefaults,
    translate,
  })
  const { drawingControl, isDrawingTool, selectedDrawingLayer } =
    createDrawingSchema({
      props,
      store,
      activeDocument,
      drawingDefaults,
      translate,
      hexColor,
    })
  const { buildTextContextSchema, floatingTextToolbarSchema } =
    createTextSchema({
      props,
      store,
      activeToolId: state.activeToolId,
      activeDocument,
      textDefaults,
      textDraft,
      translate,
      hexColor,
    })
  const {
    contextSchema,
    floatingArrowToolbarSchema,
    toolConfigureArrowSchema,
  } = createContextSchema({
    store,
    activeToolId: state.activeToolId,
    activeDocument,
    cropPreset,
    markerShape,
    textDraft,
    drawingDefaults,
    toolConfigure,
    translate,
    precisionText,
    hexColor,
    selectedPrecisionLayer,
    precisionToolSchema,
    buildTextContextSchema,
    isDrawingTool,
    selectedDrawingLayer,
    drawingControl,
  })
  const { applyPrecisionChange, precisionChangeBlocked } =
    createPrecisionEffects({
      props,
      activeDocument,
      precisionDefaults,
      selectedPrecisionLayer,
    })
  const { applyV7TextChange, applyCalloutStrokeChange } = createTextEffects({
    props,
    store,
    activeDocument,
    textDefaults,
    textFormatting,
    textDraft,
  })
  const { applyDrawingChange } = createDrawingEffects({
    props,
    activeToolId: state.activeToolId,
    configureDefaultsTool,
    drawingDefaults,
    drawingPreferences,
    isDrawingTool,
    selectedDrawingLayer,
    savePreferences: (value) =>
      createBrowserDrawingToolPreferencesStorage(browserStorage()).save(value),
  })
  const { applyImageChange } = createImageEffects({
    props,
    selectedLayerId: state.selectedLayerId,
    activeDocument,
  })
  const { onContextChange } = createContextEffects({
    activeToolId: state.activeToolId,
    cropPreset,
    markerShape,
    canvas: canvasViewport,
    applyTextChange: applyV7TextChange,
    applyCalloutChange: applyCalloutStrokeChange,
    applyPrecisionChange,
    applyImageChange,
    applyDrawingChange,
  })
  const { onContextAction, resolveDocumentTextures } = createContextActions({
    props,
    canvas: canvasViewport,
    cropPreset,
    activeDocument,
    textureImages,
    drawingDefaults,
    drawingPreferences,
    selectedDrawingLayer,
    saveDrawingPreferences: (value) =>
      createBrowserDrawingToolPreferencesStorage(browserStorage()).save(value),
  })
  function rememberColor(value: string): void {
    const match = /^#([\da-f]{6})$/iu.exec(value)
    if (!match) return
    const hex = match[1]!
    drawingPreferences.value = rememberDrawingColor(drawingPreferences.value, {
      red: Number.parseInt(hex.slice(0, 2), 16) / 255,
      green: Number.parseInt(hex.slice(2, 4), 16) / 255,
      blue: Number.parseInt(hex.slice(4, 6), 16) / 255,
      alpha: 1,
    })
    createBrowserDrawingToolPreferencesStorage(browserStorage()).save(
      drawingPreferences.value,
    )
  }
  function onColorChange(id: string, value: string): void {
    if (precisionChangeBlocked(id)) return
    onContextChange(id, value)
    rememberColor(value)
  }
  function startEyedropper(id: string): void {
    if (precisionChangeBlocked(id)) return
    samplingControl.value = id
    eyedropperColor.value = undefined
    eyedropperFeedback.value = undefined
  }
  async function onColorSample(value: string): Promise<void> {
    const normalized = value.toUpperCase()
    const target = samplingControl.value
    if (target && precisionChangeBlocked(target)) {
      samplingControl.value = undefined
      eyedropperColor.value = undefined
      eyedropperFeedback.value = translate('readOnlyDocument')
      return
    }
    if (target) onColorChange(target, normalized)
    else rememberColor(normalized)
    samplingControl.value = undefined
    eyedropperColor.value = normalized
    eyedropperFeedback.value =
      state.locale.value === 'ru'
        ? `Цвет выбран: ${normalized}`
        : `Colour selected: ${normalized}`
    try {
      if (props.clipboardBridge?.writeClipboardText) {
        await props.clipboardBridge.writeClipboardText(
          normalized,
          crypto.randomUUID(),
        )
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(normalized)
      }
    } catch (error) {
      console.warn('cute-screen eyedropper clipboard write failed', error)
      eyedropperFeedback.value =
        state.locale.value === 'ru'
          ? `Цвет выбран: ${normalized}. Не удалось скопировать HEX.`
          : `Colour selected: ${normalized}. HEX could not be copied.`
    }
  }
  function onColorSampleError(message: string): void {
    eyedropperFeedback.value = message
  }
  function onColorSampleCancel(): void {
    samplingControl.value = undefined
    eyedropperColor.value = undefined
    eyedropperFeedback.value =
      state.locale.value === 'ru'
        ? 'Выбор цвета отменён'
        : 'Colour sampling cancelled'
  }
  function onToolConfigureOutsidePointer(event: PointerEvent): void {
    if (!toolConfigure.value) return
    const target = event.target
    if (!(target instanceof Node)) return
    if (
      toolConfigure.value.anchor.contains(target) ||
      (target instanceof HTMLElement &&
        target.closest(
          '.cs-tool-configure-popover-host, .cs-arrow-toolbar-popover',
        ))
    ) {
      return
    }
    closeToolConfigure()
  }
  function openToolConfigure(toolId: string, anchor: HTMLElement): void {
    if (toolId !== 'arrow') return
    const rect = anchor.getBoundingClientRect()
    toolConfigure.value = { toolId, anchor }
    toolConfigureLayout.value = {
      left: rect.left + rect.width / 2,
      top: rect.top,
    }
  }
  function closeToolConfigure(): void {
    toolConfigure.value = undefined
    toolConfigureLayout.value = undefined
  }
  function onToolConfigureChange(id: string, value: string): void {
    configureDefaultsTool.value = 'arrow'
    try {
      onContextChange(id, value)
    } finally {
      configureDefaultsTool.value = undefined
    }
  }
  function selectTool(id: string): void {
    toolError.value = undefined
    store.selectTool(id)
    if (id === 'eyedropper') {
      eyedropperColor.value = undefined
      eyedropperFeedback.value = undefined
    }
  }
  function canonicalizeLayerTransform(
    layer: LayerNode,
    transform: Transform2D,
  ): LayerNode {
    const canvas = activeDocument.value?.canvas
    if (layer.kind !== 'ruler' || !canvas) return { ...layer, transform }
    return rebaseRulerLayer({ ...layer, transform }, layer.payload, canvas)
  }
  function updateLayerProperty(
    id: string,
    property: 'visible' | 'locked' | 'opacity' | 'rotation',
    value?: number,
  ): void {
    const layer = activeDocument.value?.layers.find(
      (candidate) => candidate.id === id,
    )
    if (
      !layer ||
      !props.documentSession ||
      (layer.locked && property !== 'locked')
    )
      return
    if (property === 'opacity') {
      if (
        layer.kind === 'text' ||
        layer.kind === 'callout' ||
        layer.kind === 'numberedMarker'
      )
        return
      props.documentSession.execute({
        type: 'updateLayer',
        before: layer,
        after: {
          ...layer,
          opacity: Math.max(0, Math.min(1, value ?? layer.opacity)),
        },
      })
      return
    }
    const after =
      property === 'visible'
        ? { ...layer, visible: !layer.visible }
        : property === 'locked'
          ? { ...layer, locked: !layer.locked }
          : canonicalizeLayerTransform(layer, {
              ...layer.transform,
              rotation: value ?? layer.transform.rotation,
            })
    props.documentSession.execute({
      type: 'updateLayer',
      before: layer,
      after,
    })
  }
  function reorderLayer(id: string, direction: 'up' | 'down'): void {
    const layers = activeDocument.value?.layers
    if (!layers || !props.documentSession) return
    const fromIndex = layers.findIndex((layer) => layer.id === id)
    const toIndex = fromIndex + (direction === 'up' ? 1 : -1)
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      toIndex >= layers.length ||
      layers[fromIndex]?.locked
    )
      return
    props.documentSession.execute({
      type: 'reorderLayer',
      layerId: id,
      fromIndex,
      toIndex,
    })
  }
  function onLayerOpacity(id: string, opacity: number): void {
    updateLayerProperty(id, 'opacity', opacity)
  }
  function onLayerRotation(id: string, rotation: number): void {
    updateLayerProperty(id, 'rotation', rotation)
  }
  function resolveLayerReorderToIndex(
    layerCount: number,
    fromIndex: number,
    targetIndex: number,
    place: 'before' | 'after',
  ): number {
    const sourceDisplay = layerCount - 1 - fromIndex
    const targetDisplay = layerCount - 1 - targetIndex
    let insertDisplay = place === 'before' ? targetDisplay : targetDisplay + 1
    if (sourceDisplay < insertDisplay) {
      insertDisplay -= 1
    }
    return layerCount - 1 - insertDisplay
  }
  function onLayerReorderTo(
    id: string,
    targetId: string,
    place: 'before' | 'after',
  ): void {
    const layers = activeDocument.value?.layers
    if (!layers || !props.documentSession) return
    const fromIndex = layers.findIndex((layer) => layer.id === id)
    const targetIndex = layers.findIndex((layer) => layer.id === targetId)
    if (
      fromIndex < 0 ||
      targetIndex < 0 ||
      layers[fromIndex]?.locked ||
      fromIndex === targetIndex
    )
      return
    const toIndex = resolveLayerReorderToIndex(
      layers.length,
      fromIndex,
      targetIndex,
      place,
    )
    if (fromIndex === toIndex) return
    props.documentSession.execute({
      type: 'reorderLayer',
      layerId: id,
      fromIndex,
      toIndex,
    })
  }
  function moveLayer(id: string, deltaX: number, deltaY: number): void {
    const selected = new Set(store.selectedLayerIds)
    const layers = activeDocument.value?.layers.filter((layer) =>
      selected.has(layer.id),
    )
    if (
      !layers?.length ||
      !props.documentSession ||
      !selected.has(id) ||
      layers.some((layer) => layer.locked)
    ) {
      return
    }
    const commands = layers.map((layer) => ({
      type: 'updateLayer' as const,
      before: layer,
      after: canonicalizeLayerTransform(layer, {
        ...layer.transform,
        translateX: layer.transform.translateX + deltaX,
        translateY: layer.transform.translateY + deltaY,
      }),
    }))
    props.documentSession.execute(
      commands.length === 1 ? commands[0]! : { type: 'batch', commands },
    )
  }
  function selectLayer(id: string, toggle = false, range = false): void {
    store.selectLayer(id, toggle, range)
  }
  function transformLayer(id: string, transform: Transform2D): void {
    const layer = activeDocument.value?.layers.find(
      (candidate) => candidate.id === id,
    )
    if (!layer || layer.locked || !props.documentSession) return
    props.documentSession.execute({
      type: 'updateLayer',
      before: layer,
      after: canonicalizeLayerTransform(layer, transform),
    })
  }
  function updateLayerPayload(id: string, payload: JsonObject): void {
    const layer = activeDocument.value?.layers.find(
      (candidate) => candidate.id === id,
    )
    if (!layer || layer.locked || !props.documentSession) return
    props.documentSession.execute({
      type: 'updateLayer',
      before: layer,
      after: { ...layer, payload } as LayerNode,
    })
  }
  function addLayer(
    layer: import('@cute-screen/editor-renderer').LayerNode,
    selectAfter = false,
  ): void {
    if (!props.documentSession || props.readOnlyDocument) return
    props.documentSession.execute({ type: 'addLayer', layer })
    if (selectAfter && layer.kind === 'loupe') store.selectLayer(layer.id)
  }
  async function importContentImage(origin: {
    readonly x: number
    readonly y: number
  }): Promise<void> {
    if (
      contentImageImporting.value ||
      !props.contentImageBridge ||
      !props.documentSession ||
      props.readOnlyDocument
    ) {
      return
    }
    contentImageImporting.value = true
    try {
      const imported = await props.contentImageBridge.importContentImage(
        crypto.randomUUID(),
      )
      if (imported.kind !== 'imported') return
      const resource = await loadImageWithBinaryFallback({
        token: imported.resourceToken,
        correlationId: crypto.randomUUID(),
        bridge: props.contentImageBridge,
        createResource: async (image) => image,
      })
      textureImages.value = new Map(textureImages.value).set(
        imported.blobHash,
        resource.resource,
      )
      const layer = createContentImageLayer({
        id: crypto.randomUUID(),
        blobHash: imported.blobHash,
        format: imported.format,
        intrinsicWidth: imported.width,
        intrinsicHeight: imported.height,
        origin: {
          x: origin.x - imported.width / 2,
          y: origin.y - imported.height / 2,
        },
      })
      // New content deliberately remains unselected; the active Image tool stays
      // active so repeated imports retain the same interaction contract.
      props.documentSession.execute({ type: 'addLayer', layer })
    } finally {
      contentImageImporting.value = false
    }
  }
  async function pasteNativeClipboard(): Promise<void> {
    const bridge = props.clipboardBridge
    const document = activeDocument.value
    if (
      !bridge ||
      !document ||
      !props.documentSession ||
      props.readOnlyDocument
    )
      return
    try {
      const snapshot = await bridge.readClipboardSnapshot(crypto.randomUUID())
      const center = {
        x: document.canvas.width / 2,
        y: document.canvas.height / 2,
      }
      if (snapshot.bitmap) {
        const bitmap = snapshot.bitmap
        const loaded = await loadImageWithBinaryFallback({
          token: bitmap.resourceToken,
          correlationId: crypto.randomUUID(),
          bridge,
          createResource: async (image) => image,
        })
        textureImages.value = new Map(textureImages.value).set(
          bitmap.blobHash,
          loaded.resource,
        )
        props.documentSession.execute({
          type: 'addLayer',
          layer: createContentImageLayer({
            id: crypto.randomUUID(),
            blobHash: bitmap.blobHash,
            format: bitmap.format,
            intrinsicWidth: bitmap.width,
            intrinsicHeight: bitmap.height,
            origin: {
              x: center.x - bitmap.width / 2,
              y: center.y - bitmap.height / 2,
            },
          }),
        })
        return
      }
      if (!snapshot.text) return
      const layer = createTextLayer({
        id: crypto.randomUUID(),
        text: snapshot.text,
        origin: center,
        fontFamily: textDefaults.value.fontFamily,
        fontSize: textDefaults.value.fontSize,
        weight: textDefaults.value.weight,
        italic: textDefaults.value.italic,
        strikethrough: textDefaults.value.strikethrough,
        alignment: textDefaults.value.alignment,
        listKind: textDefaults.value.listKind,
        color: textDefaults.value.color,
        background: textDefaults.value.background,
      })
      if (layer) props.documentSession.execute({ type: 'addLayer', layer })
    } catch (error) {
      console.warn('cute-screen native clipboard paste failed', error)
    }
  }
  async function copySelectedTextLayer(cut: boolean): Promise<void> {
    const bridge = props.clipboardBridge
    const document = activeDocument.value
    const layerId = store.selectedLayerId
    if (
      !bridge?.writeClipboardText ||
      !document ||
      !layerId ||
      !props.documentSession ||
      props.readOnlyDocument
    )
      return
    const index = document.layers.findIndex((layer) => layer.id === layerId)
    const layer = document.layers[index]
    if (!layer || layer.kind !== 'text' || layer.locked) return
    try {
      await bridge.writeClipboardText(
        layer.payload.content.text,
        crypto.randomUUID(),
      )
      if (cut) {
        props.documentSession.execute({ type: 'removeLayer', layer, index })
      }
    } catch (error) {
      console.warn('cute-screen native text clipboard write failed', error)
    }
  }
  function executeDocumentCommand(command: unknown): void {
    if (!props.documentSession || props.readOnlyDocument) return
    props.documentSession.execute(command as EditorCommand)
  }
  const media: Pick<
    MediaQueryList,
    'matches' | 'addEventListener' | 'removeEventListener'
  > =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : {
          matches: false,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }
  const onMediaChange = (event: MediaQueryListEvent) =>
    store.setSystemDark(event.matches)
  function browserStorage(): Storage | undefined {
    try {
      return window.localStorage
    } catch (error) {
      void error
      return undefined
    }
  }
  const preferencesOptions: ShellStoreOptions = {
    ...(props.actions ? { actions: props.actions } : {}),
    languages:
      import.meta.env.VITE_TEST_HARNESS === 'true'
        ? (['en'] as const)
        : navigator.languages,
    preferences: createBrowserPreferencesStorage(
      browserStorage(),
      import.meta.env.VITE_TEST_HARNESS === 'true'
        ? (['en'] as const)
        : navigator.languages,
    ),
    systemDark: () => media.matches,
  }
  function loadFixture(): void {
    if (props.fixture === 'loading') {
      store.setDocumentState({ kind: 'loading' })
      return
    }
    if (props.fixture === 'error') {
      store.setDocumentState({
        kind: 'error',
        message: translate('readyLoadError'),
      })
      return
    }
    if (props.fixture === 'ready') {
      store.setFixture({
        document: {
          kind: 'ready',
          title: 'Landing-page redesign',
          dimensions: '1440 × 900',
        },
        activeToolId: 'arrow',
        selectedLayerId: 'arrow-1',
        layers: [
          {
            id: 'text-1',
            icon: 'text',
            name: 'CTA comment',
            visible: true,
            locked: false,
            opacity: 1,
            rotation: 0,
            opacityEditable: false,
          },
          {
            id: 'arrow-1',
            icon: 'arrow',
            name: 'Arrow to button',
            visible: true,
            locked: false,
            opacity: 1,
            rotation: 0,
            opacityEditable: true,
          },
          {
            id: 'marker-1',
            icon: 'marker',
            name: 'Title highlight',
            visible: true,
            locked: true,
            opacity: 1,
            rotation: 0,
            opacityEditable: true,
          },
        ],
        frames: [
          { id: 'frame-1', label: '1', selected: true },
          { id: 'frame-2', label: '2', selected: false },
          { id: 'frame-3', label: '3', selected: false },
        ],
      })
      store.setLayersOpen(true)
      return
    }
    store.setFixture({ document: { kind: 'empty' } })
  }
  function onKeydown(event: KeyboardEvent): void {
    const target = event.target
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('[role="slider"]')))
    ) {
      return
    }
    const modifier = event.metaKey || event.ctrlKey
    if (!modifier && !event.altKey) {
      const shortcut = event.key.toLowerCase()
      const tool = tools.value.find(
        (candidate) =>
          !candidate.disabled && candidate.shortcut?.toLowerCase() === shortcut,
      )
      if (tool) {
        event.preventDefault()
        store.selectTool(tool.id)
        return
      }
    }
    if (modifier && event.key.toLowerCase() === 'o') {
      if (props.openImageAvailable) {
        event.preventDefault()
        void store.runAction('openImage')
      }
      return
    }
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) redoDocument()
      else undoDocument()
      return
    }
    if (modifier && event.key.toLowerCase() === 'd' && store.selectedLayerId) {
      const source = activeDocument.value?.layers.find(
        (layer) => layer.id === store.selectedLayerId,
      )
      if (source && !source.locked) {
        event.preventDefault()
        props.documentSession?.execute(
          createDuplicateLayerCommand(source, {
            id: crypto.randomUUID(),
            zoom: Math.max(0.01, store.zoom / 100),
            cascadeIndex: 1,
          }),
        )
      }
      return
    }
    if (
      modifier &&
      (event.key.toLowerCase() === 'c' || event.key.toLowerCase() === 'x') &&
      store.selectedLayerId
    ) {
      if (props.clipboardBridge?.writeClipboardText) {
        event.preventDefault()
        void copySelectedTextLayer(event.key.toLowerCase() === 'x')
      }
      return
    }
    if (modifier && event.key.toLowerCase() === 'v') {
      if (
        props.clipboardBridge &&
        activeDocument.value &&
        props.documentSession
      ) {
        event.preventDefault()
        void pasteNativeClipboard()
      }
      return
    }
    if (
      modifier &&
      (event.key === '[' || event.key === ']') &&
      store.selectedLayerId
    ) {
      event.preventDefault()
      reorderLayer(store.selectedLayerId, event.key === ']' ? 'up' : 'down')
      return
    }
    const arrowDeltas: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const delta = arrowDeltas[event.key]
    if (delta && store.selectedLayerIds.length > 0) {
      const selected = new Set(store.selectedLayerIds)
      const layers = activeDocument.value?.layers.filter((layer) =>
        selected.has(layer.id),
      )
      if (layers?.length && !layers.some((layer) => layer.locked)) {
        event.preventDefault()
        const multiplier = event.shiftKey ? 10 : 1
        const commands = layers.map((layer) => ({
          type: 'updateLayer' as const,
          before: layer,
          after: canonicalizeLayerTransform(layer, {
            ...layer.transform,
            translateX: layer.transform.translateX + delta[0] * multiplier,
            translateY: layer.transform.translateY + delta[1] * multiplier,
          }),
        }))
        props.documentSession?.execute(
          commands.length === 1 ? commands[0]! : { type: 'batch', commands },
        )
      }
      return
    }
    if (
      (event.key === 'Delete' || event.key === 'Backspace') &&
      store.selectedLayerId
    ) {
      const layer = activeDocument.value?.layers.find(
        (candidate) => candidate.id === store.selectedLayerId,
      )
      if (layer && !layer.locked) {
        event.preventDefault()
        props.documentSession?.execute({
          type: 'removeLayer',
          layer,
          index: activeDocument.value?.layers.indexOf(layer) ?? -1,
        })
      }
      return
    }
    if (event.key === 'Escape') {
      store.clearFeedback()
      store.setLayersOpen(false)
      store.clearLayerSelection()
    }
  }
  function applyDocumentSnapshot(snapshot: DocumentSessionSnapshot): void {
    activeDocument.value = snapshot.core.document
    if (
      store.selectedLayerIds.some((id) => {
        const layer = snapshot.core.document.layers.find(
          (candidate) => candidate.id === id,
        )
        return !layer || !layer.visible
      })
    ) {
      store.clearLayerSelection()
    }
    store.setDocumentState({
      kind: 'ready',
      title: `Document ${snapshot.core.document.id.slice(0, 8)}`,
      dimensions: `${snapshot.core.document.canvas.width} × ${snapshot.core.document.canvas.height}`,
    })
    store.setDocumentHistory({
      canUndo: snapshot.core.canUndo,
      canRedo: snapshot.core.canRedo,
      saveState: snapshot.saveState,
      ...(snapshot.error ? { error: snapshot.error } : {}),
    })
    syncLayerSummaries(snapshot.core.document)
    void resolveDocumentTextures(snapshot.core.document)
  }
  function syncLayerSummaries(document: EditorDocumentV1): void {
    store.setLayers([
      ...(textDraft.value
        ? [
            {
              id: textDraft.value.id,
              icon: 'text' as const,
              name: 'Text · Editing…',
              visible: true,
              locked: true,
              opacity: 1,
              rotation: 0,
              opacityEditable: false,
              transient: true,
            },
          ]
        : []),
      ...[...document.layers].reverse().map((layer) => ({
        id: layer.id,
        icon: (layer.kind === 'image' ? 'image' : 'shape') as 'image' | 'shape',
        name:
          layer.kind === 'image' && layer.payload.role === 'base'
            ? translate('baseImage')
            : layer.kind,
        visible: layer.visible,
        locked: layer.locked,
        opacity: 'opacity' in layer ? layer.opacity : 1,
        rotation: layer.transform.rotation,
        opacityEditable:
          layer.kind !== 'text' &&
          layer.kind !== 'callout' &&
          layer.kind !== 'numberedMarker',
      })),
    ])
  }
  function setTextDraft(
    draft:
      | {
          readonly id: string
          readonly kind: 'text' | 'callout' | 'numberedMarker'
          readonly snapshot: TextToolbarSnapshot
        }
      | undefined,
  ): void {
    textDraft.value = draft
    if (activeDocument.value) syncLayerSummaries(activeDocument.value)
  }
  function undoDocument(): void {
    props.documentSession?.undo()
  }
  function redoDocument(): void {
    props.documentSession?.redo()
  }
  async function copyCaptureFallback(): Promise<void> {
    const command = props.captureFallbackCommand
    if (!command || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(command)
      fallbackCopied.value = true
      if (fallbackCopiedTimer) window.clearTimeout(fallbackCopiedTimer)
      fallbackCopiedTimer = window.setTimeout(() => {
        fallbackCopied.value = false
        fallbackCopiedTimer = undefined
      }, 3_000)
    } catch (error) {
      console.warn('cute-screen fallback command copy failed', error)
    }
  }
  function dismissCaptureFallback(): void {
    fallbackVisible.value = false
    fallbackCopied.value = false
    if (fallbackCopiedTimer) window.clearTimeout(fallbackCopiedTimer)
    fallbackCopiedTimer = undefined
  }
  function fitCanvas(): void {
    store.enableFit()
    void nextTick(() =>
      window.requestAnimationFrame(() => canvasViewport.value?.refitCanvas()),
    )
  }
  function retryDocumentSave(): void {
    void props.documentSession?.retry()
  }
  async function exportDocumentRecovery(): Promise<void> {
    const outcome = await props.documentSession?.exportRecoveryBundle()
    if (outcome?.kind === 'failed') {
      store.setDocumentHistory({
        ...store.documentHistory,
        saveState: 'error',
        error: outcome.error,
      })
    }
  }
  watch(
    () => props.textureBridge,
    () => {
      if (activeDocument.value)
        void resolveDocumentTextures(activeDocument.value)
    },
  )
  watch(
    () => state.activeToolId.value,
    (tool, previous) => {
      if (tool === 'crop' && previous !== 'crop') cropPreset.value = 'free'
    },
  )
  onMounted(() => {
    drawingPreferences.value = createBrowserDrawingToolPreferencesStorage(
      browserStorage(),
    ).load() as DrawingToolPreferencesV2
    drawingDefaults.value = drawingPreferences.value.defaults
    store.initialize(preferencesOptions)
    if (!props.documentSession) {
      store.setDocumentState(props.initialDocumentState ?? { kind: 'empty' })
      if (!props.initialDocumentState) loadFixture()
      if (props.readOnlyDocument) {
        store.setDocumentHistory({
          canUndo: false,
          canRedo: false,
          saveState: 'readOnly',
        })
      }
    }
    media.addEventListener('change', onMediaChange)
    window.addEventListener('keydown', onKeydown)
    document.addEventListener(
      'pointerdown',
      onToolConfigureOutsidePointer,
      true,
    )
  })
  watch(
    () => props.frames,
    (frames) => {
      if (frames) store.setFrames(frames)
    },
    { immediate: true },
  )
  watch(
    () => props.documentSession,
    (session, _previous, onCleanup) => {
      if (!session) return
      const unsubscribe = session.subscribe(applyDocumentSnapshot)
      onCleanup(unsubscribe)
    },
    { immediate: true },
  )
  watch(
    () => props.captureProgress,
    (progress) => {
      if (progress) store.setCaptureProgress(progress)
    },
  )
  watch(
    () => props.initialDocumentState,
    (state) => {
      if (!props.documentSession && state) store.setDocumentState(state)
    },
  )
  watch(
    () => props.readOnlyDocument,
    (readOnly) => {
      if (!props.documentSession && readOnly) {
        store.setDocumentHistory({
          canUndo: false,
          canRedo: false,
          saveState: 'readOnly',
        })
      }
    },
  )
  onBeforeUnmount(() => {
    // Navigation/remount must not leave the coalesced save behind.
    void props.documentSession?.flush()
    props.documentSession?.dispose()
    if (fallbackCopiedTimer) window.clearTimeout(fallbackCopiedTimer)
    media.removeEventListener('change', onMediaChange)
    window.removeEventListener('keydown', onKeydown)
    document.removeEventListener(
      'pointerdown',
      onToolConfigureOutsidePointer,
      true,
    )
  })
  watch(
    [state.resolvedTheme, state.locale],
    ([theme, locale]) => {
      document.documentElement.dataset.theme = theme
      document.documentElement.lang = locale
    },
    { immediate: true },
  )
  return {
    naiveTheme,
    naiveLocale,
    naiveDateLocale,
    store,
    state,
    translate,
    fallbackCopied,
    fallbackVisible,
    copyCaptureFallback,
    dismissCaptureFallback,
    tools,
    selectTool,
    openToolConfigure,
    activeDocument,
    contextSchema,
    drawingPreferences,
    onContextAction,
    onContextChange,
    onColorChange,
    startEyedropper,
    canvasViewport,
    textureImages,
    baseImageLayer,
    sceneTexturesReady,
    samplingControl,
    drawingDefaults,
    precisionDefaults,
    textDefaults,
    textFormatting,
    floatingTextToolbarSchema,
    floatingArrowToolbarSchema,
    markerShape,
    selectLayer,
    moveLayer,
    transformLayer,
    updateLayerPayload,
    addLayer,
    executeDocumentCommand,
    setTextDraft,
    importContentImage,
    onColorSample,
    onColorSampleError,
    onColorSampleCancel,
    toolError,
    updateLayerProperty,
    onLayerOpacity,
    onLayerRotation,
    onLayerReorderTo,
    toolConfigureArrowSchema,
    toolConfigureLayout,
    onToolConfigureChange,
    eyedropperFeedback,
    eyedropperColor,
    undoDocument,
    redoDocument,
    retryDocumentSave,
    exportDocumentRecovery,
    fitCanvas,
  }
}
