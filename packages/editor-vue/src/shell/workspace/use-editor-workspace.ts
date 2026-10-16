import { loadTextFontFamily } from '../../text-fonts'
import {
  computed,
  nextTick,
  watch,
  onBeforeUnmount,
} from 'vue'
import { storeToRefs } from 'pinia'
import {
  darkTheme,
  dateEnUS,
  dateRuRU,
  enUS,
  ruRU,
} from 'naive-ui'
import { t } from '../i18n'
import { useNumericPreview } from './use-numeric-preview'
import { createBrowserDrawingToolPreferencesStorage } from '../preferences'
import { useEditorShellStore } from '../store'
import {
  nextNumberedMarkerSequence,
  type DrawingToolPreferencesV2,
  type ImageLayer,
} from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../contracts'
import { useToolSettingsMemory } from './tool-settings-memory'
import { HighlighterBackgroundController } from './highlighter-background'
import { createSelectionActions } from './selection-actions-controller'
import { createKeyboardController } from './keyboard-controller'
import { createSessionController } from './session-controller'
import { createWorkspaceState } from './workspace-state'
import { createWorkspaceBindings } from './workspace-bindings'
import {
  createWorkspaceEnvironment,
  useWorkspaceLifecycle,
} from './workspace-lifecycle'

function watchMenuTransitions(
  store: ReturnType<typeof useEditorShellStore>,
  workspace: ReturnType<typeof createWorkspaceState>,
  selectionActions: ReturnType<typeof createSelectionActions>,
): void {
  const stopMenuTransitions = store.$onAction(({ name }) => {
    if (name === 'selectTool') workspace.toolActivationRevision.value += 1
    if (name === 'selectTool' || name === 'clearLayerSelection') selectionActions.canvasMenu.value = undefined
  })
  onBeforeUnmount(stopMenuTransitions)
  watch(() => workspace.activeDocument.value?.id, () => {
    selectionActions.canvasMenu.value = undefined
  })
}

function createWorkspaceCore(props: ResolvedEditorShellProps) {
  const store = useEditorShellStore()
  const state = storeToRefs(store)
  const workspace = createWorkspaceState()
  const background = new HighlighterBackgroundController((value) => {
    workspace.highlighterAnalysis.value = value
  })
  watch(
    [() => workspace.activeDocument.value?.id, () => props.sourceImage],
    () => background.reset(),
    { flush: 'sync' },
  )
  onBeforeUnmount(() => background.dispose())
  const onHighlighterFrameReady = (id: string) => {
    if (id === workspace.activeDocument.value?.id) background.start(props.sourceImage)
  }
  const naiveTheme = computed(() => (state.resolvedTheme.value === 'dark' ? darkTheme : null))
  const naiveLocale = computed(() => (store.locale === 'ru' ? ruRU : enUS))
  const naiveDateLocale = computed(() => (store.locale === 'ru' ? dateRuRU : dateEnUS))
  const baseImageLayer = computed(() =>
    workspace.activeDocument.value?.layers.find(
      (layer): layer is ImageLayer => layer.kind === 'image' && layer.payload.role === 'base',
    ))
  const sceneTexturesReady = computed(() => {
    const document = workspace.activeDocument.value
    if (!document) return false
    if (baseImageLayer.value && !props.sourceImage) return false
    return document.layers.every(
      (layer) =>
        layer.kind !== 'image' ||
        layer.payload.role !== 'content' ||
        workspace.textureImages.value.has(layer.payload.blobHash),
    )
  })
  const translate = (key: Parameters<typeof t>[1]) => t(state.locale.value, key)
  const environment = createWorkspaceEnvironment(props)
  const saveDrawingPreferences = (value: DrawingToolPreferencesV2) =>
    createBrowserDrawingToolPreferencesStorage(environment.storage).save(value)
  const memory = useToolSettingsMemory(workspace, store, environment.storage)
  watch(() => workspace.activeDocument.value?.id, () => {
    workspace.markerNextOverride.value = undefined
  }, { flush: 'sync' })
  const bindings = createWorkspaceBindings({
    props,
    store,
    workspace,
    translate,
    saveDrawingPreferences,
    rememberTextDefaults: memory.rememberTextDefaults,
  })
  useNumericPreview(workspace, props, store, bindings)
  watch(() => [store.activeToolId, workspace.textDefaults.value.fontFamily], () => {
    if (store.activeToolId !== 'numberedMarker') return
    void loadTextFontFamily(workspace.textDefaults.value.fontFamily).catch((error: unknown) => {
      workspace.toolError.value = error instanceof Error ? error.message : 'Could not load the marker font'
    })
  }, { immediate: true })
  watch([() => store.activeToolId, () => store.selectedLayerIds.join(','), () => workspace.activeDocument.value?.id], () => {
    workspace.spotlightEditing.value = undefined
  })
  const session = createSessionController({
    props,
    store,
    activeDocument: workspace.activeDocument,
    textDraft: workspace.textDraft,
    translate,
    resolveDocumentTextures: bindings.resolveDocumentTextures,
  })
  const selectionActions = createSelectionActions({
    props,
    store,
    document: workspace.activeDocument,
    error: workspace.toolError,
    rememberedStyles: workspace.rememberedStyles,
    paste: bindings.pasteNativeClipboard,
    undo: session.undoDocument,
    redo: session.redoDocument,
    fit: () => store.enableFit(),
  })
  watchMenuTransitions(store, workspace, selectionActions)
  const { onKeydown } = createKeyboardController({
    selectTool: bindings.selectTool,
    props,
    activeDocument: workspace.activeDocument,
    tools: bindings.tools,
    store,
    undo: session.undoDocument,
    redo: session.redoDocument,
    copySelectedTextLayer: bindings.copySelectedTextLayer,
    pasteNativeClipboard: bindings.pasteNativeClipboard,
    reorderLayer: bindings.reorderLayer,
    moveLayer: bindings.moveLayer,
    selectionActions,
  })
  return {
    props,
    store,
    state,
    workspace,
    environment,
    bindings,
    session,
    selectionActions,
    memory,
    onKeydown,
    naiveTheme,
    naiveLocale,
    naiveDateLocale,
    baseImageLayer,
    sceneTexturesReady,
    onHighlighterFrameReady,
    translate,
  }
}

function createWorkspaceUiActions(core: ReturnType<typeof createWorkspaceCore>) {
  async function copyCaptureFallback(): Promise<void> {
    const command = core.props.captureFallbackCommand
    if (!command || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(command)
      core.workspace.fallbackCopied.value = true
      if (core.workspace.fallbackCopiedTimer.value) {
        window.clearTimeout(core.workspace.fallbackCopiedTimer.value)
      }
      core.workspace.fallbackCopiedTimer.value = window.setTimeout(() => {
        core.workspace.fallbackCopied.value = false
        core.workspace.fallbackCopiedTimer.value = undefined
      }, 3_000)
    } catch (error) {
      console.warn('cute-screen fallback command copy failed', error)
    }
  }
  function dismissCaptureFallback(): void {
    core.workspace.fallbackVisible.value = false
    core.workspace.fallbackCopied.value = false
    if (core.workspace.fallbackCopiedTimer.value) {
      window.clearTimeout(core.workspace.fallbackCopiedTimer.value)
    }
    core.workspace.fallbackCopiedTimer.value = undefined
  }
  function fitCanvas(): void {
    core.store.enableFit()
    void nextTick(() => window.requestAnimationFrame(() => core.workspace.canvasViewport.value?.refitCanvas()))
  }
  return { copyCaptureFallback, dismissCaptureFallback, fitCanvas }
}

function createWorkspaceViewModel(
  core: ReturnType<typeof createWorkspaceCore>,
  ui: ReturnType<typeof createWorkspaceUiActions>,
) {
  const { bindings, session, workspace } = core
  return {
    naiveTheme: core.naiveTheme,
    naiveLocale: core.naiveLocale,
    naiveDateLocale: core.naiveDateLocale,
    store: core.store,
    ...core.selectionActions,
    ...core.memory,
    state: core.state,
    translate: core.translate,
    fallbackCopied: workspace.fallbackCopied,
    fallbackVisible: workspace.fallbackVisible,
    copyCaptureFallback: ui.copyCaptureFallback,
    dismissCaptureFallback: ui.dismissCaptureFallback,
    tools: bindings.tools,
    selectTool: bindings.selectTool,
    openToolConfigure: bindings.openToolConfigure,
    closeToolConfigure: bindings.closeToolConfigure,
    activeDocument: workspace.activeDocument,
    spotlightEditing: workspace.spotlightEditing,
    displayDocument: computed(() => workspace.numericPreviewDocument.value ?? workspace.activeDocument.value),
    contextSchema: bindings.contextSchema,
    creationSchema: bindings.creationSchema,
    toolActivationRevision: workspace.toolActivationRevision,
    onCreationChange: bindings.onCreationChange,
    selectionSchema: bindings.selectionSchema,
    toolConfigureSchema: bindings.toolConfigureSchema,
    drawingPreferences: workspace.drawingPreferences,
    onContextAction: bindings.onContextAction,
    onContextChange: bindings.onContextChange,
    onColorChange: bindings.onColorChange,
    startEyedropper: bindings.startEyedropper,
    canvasViewport: workspace.canvasViewport,
    textureImages: workspace.textureImages,
    baseImageLayer: core.baseImageLayer,
    sceneTexturesReady: core.sceneTexturesReady,
    highlighterAnalysis: workspace.highlighterAnalysis,
    onHighlighterFrameReady: core.onHighlighterFrameReady,
    samplingControl: workspace.samplingControl,
    drawingDefaults: workspace.drawingDefaults,
    precisionDefaults: workspace.precisionDefaults,
    textDefaults: workspace.textDefaults,
    calloutStroke: workspace.calloutStroke,
    textFormatting: workspace.textFormatting,
    floatingTextToolbarSchema: bindings.floatingTextToolbarSchema,
    floatingArrowToolbarSchema: bindings.floatingArrowToolbarSchema,
    markerShape: workspace.markerShape,
    nextMarkerSequence: computed(() => workspace.markerNextOverride.value ??
      nextNumberedMarkerSequence(workspace.activeDocument.value?.layers ?? [])),
    markerPreviewBlocked: computed(() => Boolean(
      workspace.toolConfigure.value || workspace.textDraft.value || core.store.actionState.status === 'pending',
    )),
    markerStyle: computed(() => {
      const d = workspace.textDefaults.value
      return { fontFamily: d.fontFamily, fontSize: d.fontSize, weight: d.weight, italic: d.italic,
        strikethrough: d.strikethrough, alignment: d.alignment, listKind: 'none', textColor: { ...d.color },
        badgeColor: { ...(d.background?.color ?? { red: 0, green: 0, blue: 0, alpha: 1 }) } }
    }),
    selectLayer: bindings.selectLayer,
    moveLayer: bindings.moveLayer,
    transformLayer: bindings.transformLayer,
    updateLayerPayload: bindings.updateLayerPayload,
    addLayer: (layer: Parameters<typeof bindings.addLayer>[0], selectAfter?: boolean) => {
      bindings.addLayer(layer, selectAfter)
      if (layer.kind === 'numberedMarker' && workspace.activeDocument.value?.layers.some((entry) => entry.id === layer.id))
        workspace.markerNextOverride.value = undefined
    },
    executeDocumentCommand: bindings.executeDocumentCommand,
    setTextDraft: session.setTextDraft,
    importContentImage: bindings.importContentImage,
    onColorSample: bindings.onColorSample,
    onColorSampleError: bindings.onColorSampleError,
    onColorSampleCancel: bindings.onColorSampleCancel,
    toolError: workspace.toolError,
    updateLayerProperty: bindings.updateLayerProperty,
    onLayerOpacity: bindings.onLayerOpacity,
    onLayerRotation: bindings.onLayerRotation,
    onLayerReorderTo: bindings.onLayerReorderTo,
    toolConfigureArrowSchema: bindings.toolConfigureArrowSchema,
    toolConfigureLayout: workspace.toolConfigureLayout,
    toolConfigure: workspace.toolConfigure,
    onToolConfigureChange: bindings.onToolConfigureChange,
    eyedropperFeedback: workspace.eyedropperFeedback,
    eyedropperColor: workspace.eyedropperColor,
    undoDocument: session.undoDocument,
    redoDocument: session.redoDocument,
    retryDocumentSave: session.retryDocumentSave,
    exportDocumentRecovery: session.exportDocumentRecovery,
    fitCanvas: ui.fitCanvas,
  }
}

export function useEditorWorkspace(props: ResolvedEditorShellProps) {
  const core = createWorkspaceCore(props)
  const ui = createWorkspaceUiActions(core)
  useWorkspaceLifecycle({
    props: core.props,
    store: core.store,
    workspace: core.workspace,
    environment: core.environment,
    activeToolId: core.state.activeToolId,
    resolvedTheme: core.state.resolvedTheme,
    locale: core.state.locale,
    onKeydown: core.onKeydown,
    onToolConfigureOutsidePointer: core.bindings.onToolConfigureOutsidePointer,
    onToolConfigureKeydown: core.bindings.onToolConfigureKeydown,
    loadFixture: core.session.loadFixture,
    applyDocumentSnapshot: core.session.applyDocumentSnapshot,
    resolveDocumentTextures: core.bindings.resolveDocumentTextures,
  })
  return createWorkspaceViewModel(core, ui)
}
