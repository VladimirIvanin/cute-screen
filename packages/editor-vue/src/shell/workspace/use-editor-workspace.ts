import { computed, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { darkTheme, dateEnUS, dateRuRU, enUS, ruRU } from 'naive-ui'
import { t } from '../i18n'
import { createBrowserDrawingToolPreferencesStorage } from '../preferences'
import { useEditorShellStore } from '../store'
import {
  type DrawingToolPreferencesV2,
  type ImageLayer,
} from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../contracts'
import { createKeyboardController } from './keyboard-controller'
import { createSessionController } from './session-controller'
import { createWorkspaceState } from './workspace-state'
import { createWorkspaceBindings } from './workspace-bindings'
import {
  createWorkspaceEnvironment,
  useWorkspaceLifecycle,
} from './workspace-lifecycle'

function createWorkspaceCore(props: ResolvedEditorShellProps) {
  const store = useEditorShellStore()
  const state = storeToRefs(store)
  const workspace = createWorkspaceState()
  const naiveTheme = computed(() =>
    state.resolvedTheme.value === 'dark' ? darkTheme : null,
  )
  const naiveLocale = computed(() => (store.locale === 'ru' ? ruRU : enUS))
  const naiveDateLocale = computed(() =>
    store.locale === 'ru' ? dateRuRU : dateEnUS,
  )
  const baseImageLayer = computed(() =>
    workspace.activeDocument.value?.layers.find(
      (layer): layer is ImageLayer =>
        layer.kind === 'image' && layer.payload.role === 'base',
    ),
  )
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
  const bindings = createWorkspaceBindings({
    props,
    store,
    workspace,
    translate,
    saveDrawingPreferences,
  })
  const session = createSessionController({
    props,
    store,
    activeDocument: workspace.activeDocument,
    textDraft: workspace.textDraft,
    translate,
    resolveDocumentTextures: bindings.resolveDocumentTextures,
  })
  const { onKeydown } = createKeyboardController({
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
  })
  return {
    props,
    store,
    state,
    workspace,
    environment,
    bindings,
    session,
    onKeydown,
    naiveTheme,
    naiveLocale,
    naiveDateLocale,
    baseImageLayer,
    sceneTexturesReady,
    translate,
  }
}

function createWorkspaceUiActions(
  core: ReturnType<typeof createWorkspaceCore>,
) {
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
    void nextTick(() =>
      window.requestAnimationFrame(() =>
        core.workspace.canvasViewport.value?.refitCanvas(),
      ),
    )
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
    state: core.state,
    translate: core.translate,
    fallbackCopied: workspace.fallbackCopied,
    fallbackVisible: workspace.fallbackVisible,
    copyCaptureFallback: ui.copyCaptureFallback,
    dismissCaptureFallback: ui.dismissCaptureFallback,
    tools: bindings.tools,
    selectTool: bindings.selectTool,
    openToolConfigure: bindings.openToolConfigure,
    activeDocument: workspace.activeDocument,
    contextSchema: bindings.contextSchema,
    drawingPreferences: workspace.drawingPreferences,
    onContextAction: bindings.onContextAction,
    onContextChange: bindings.onContextChange,
    onColorChange: bindings.onColorChange,
    startEyedropper: bindings.startEyedropper,
    canvasViewport: workspace.canvasViewport,
    textureImages: workspace.textureImages,
    baseImageLayer: core.baseImageLayer,
    sceneTexturesReady: core.sceneTexturesReady,
    samplingControl: workspace.samplingControl,
    drawingDefaults: workspace.drawingDefaults,
    precisionDefaults: workspace.precisionDefaults,
    textDefaults: workspace.textDefaults,
    textFormatting: workspace.textFormatting,
    floatingTextToolbarSchema: bindings.floatingTextToolbarSchema,
    floatingArrowToolbarSchema: bindings.floatingArrowToolbarSchema,
    markerShape: workspace.markerShape,
    selectLayer: bindings.selectLayer,
    moveLayer: bindings.moveLayer,
    transformLayer: bindings.transformLayer,
    updateLayerPayload: bindings.updateLayerPayload,
    addLayer: bindings.addLayer,
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
    loadFixture: core.session.loadFixture,
    applyDocumentSnapshot: core.session.applyDocumentSnapshot,
    resolveDocumentTextures: core.bindings.resolveDocumentTextures,
  })
  return createWorkspaceViewModel(core, ui)
}
