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
import {
  defaultDrawingToolPreferences,
  DEFAULT_DRAWING_DEFAULTS,
  DEFAULT_RULER_COLOR,
  DEFAULT_RULER_FONT_SIZE,
  DEFAULT_RULER_THICKNESS,
  type DrawingDefaults,
  type DrawingToolPreferencesV2,
  type EditorDocumentV1,
  type ImageLayer,
  type CropPreset,
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
import { createLayerController } from './layer-controller'
import { createContentController } from './content-controller'
import { createToolUiController } from './tool-ui-controller'
import { createKeyboardController } from './keyboard-controller'
import { createSessionController } from './session-controller'

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
  const {
    onColorChange,
    startEyedropper,
    onColorSample,
    onColorSampleError,
    onColorSampleCancel,
    onToolConfigureOutsidePointer,
    openToolConfigure,
    onToolConfigureChange,
    selectTool,
  } = createToolUiController({
    props,
    store,
    locale: state.locale,
    drawingPreferences,
    samplingControl,
    eyedropperFeedback,
    eyedropperColor,
    toolError,
    toolConfigure,
    toolConfigureLayout,
    configureDefaultsTool,
    precisionChangeBlocked,
    onContextChange,
    translate,
    saveDrawingPreferences: (value) =>
      createBrowserDrawingToolPreferencesStorage(browserStorage()).save(value),
  })
  const {
    updateLayerProperty,
    reorderLayer,
    onLayerOpacity,
    onLayerRotation,
    onLayerReorderTo,
    moveLayer,
    selectLayer,
    transformLayer,
    updateLayerPayload,
    addLayer,
  } = createLayerController({ props, activeDocument, store })
  const {
    importContentImage,
    pasteNativeClipboard,
    copySelectedTextLayer,
    executeDocumentCommand,
  } = createContentController({
    props,
    activeDocument,
    contentImageImporting,
    textureImages,
    textDefaults,
    selectedLayerId: state.selectedLayerId,
  })
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
  const {
    loadFixture,
    applyDocumentSnapshot,
    setTextDraft,
    undoDocument,
    redoDocument,
    retryDocumentSave,
    exportDocumentRecovery,
  } = createSessionController({
    props,
    store,
    activeDocument,
    textDraft,
    translate,
    resolveDocumentTextures,
  })
  const { onKeydown } = createKeyboardController({
    props,
    activeDocument,
    tools,
    store,
    undo: undoDocument,
    redo: redoDocument,
    copySelectedTextLayer,
    pasteNativeClipboard,
    reorderLayer,
    moveLayer,
  })
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
