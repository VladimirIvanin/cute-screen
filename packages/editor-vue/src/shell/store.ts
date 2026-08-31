import { createPinia, defineStore } from 'pinia'
import { createActionActions } from './store-actions'
import type { ShellStoreOptions } from './store-contracts'
import {
  createPreferenceActions,
  createSnapshotActions,
} from './store-mutations'
import {
  createSelectionActions,
  createViewportActions,
} from './store-navigation'
import { createShellStoreState, setCaptureProgress } from './store-state'

export type { ShellStoreOptions } from './store-contracts'
export { ActionCancelledError } from './store-actions'

export const useEditorShellStore = defineStore(
  'cute-screen-editor-shell',
  () => {
    const state = createShellStoreState()
    let options: ShellStoreOptions | undefined
    const preferences = createPreferenceActions(
      state,
      (next) => {
        options = next
      },
      () => options,
    )
    const snapshots = createSnapshotActions(state)
    const selection = createSelectionActions(state)
    const viewport = createViewportActions(state)
    const actions = createActionActions(state, state.locale, () => options)
    return {
      activeFrameId: state.activeFrameId,
      activeToolId: state.activeToolId,
      actionState: state.actionState,
      canCopyOrExport: state.canCopyOrExport,
      clearFeedback: actions.clearFeedback,
      clearLayerSelection: selection.clearLayerSelection,
      cancelAction: actions.cancelAction,
      documentState: state.documentState,
      documentHistory: state.documentHistory,
      frames: state.frames,
      hasFrames: state.hasFrames,
      initialize: preferences.initialize,
      layers: state.layers,
      layersOpen: state.layersOpen,
      locale: state.locale,
      preferences: state.preferences,
      resolvedTheme: state.resolvedTheme,
      runAction: actions.runAction,
      selectFrame: viewport.selectFrame,
      selectLayer: selection.selectLayer,
      selectTool: selection.selectTool,
      selectedLayerId: state.selectedLayerId,
      selectedLayerIds: state.selectedLayerIds,
      setDocumentState: snapshots.setDocumentState,
      setDocumentHistory: snapshots.setDocumentHistory,
      setCaptureProgress: (
        progress: Parameters<typeof setCaptureProgress>[1],
      ) => setCaptureProgress(state, progress),
      enableFit: viewport.enableFit,
      setFitZoom: viewport.setFitZoom,
      setFixture: snapshots.setFixture,
      setFrames: snapshots.setFrames,
      setLayers: snapshots.setLayers,
      setLayersOpen: snapshots.setLayersOpen,
      setLocale: preferences.setLocale,
      setSystemDark: preferences.setSystemDark,
      setTheme: preferences.setTheme,
      setZoom: viewport.setZoom,
      toggleLayers: snapshots.toggleLayers,
      zoom: state.zoom,
      zoomMode: state.zoomMode,
    }
  },
)

export function createEditorShellPinia() {
  return createPinia()
}
