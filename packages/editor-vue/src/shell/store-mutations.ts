import { defaultPreferences } from './preferences'
import type { ShellStoreOptions } from './store-contracts'
import type { ShellStoreState } from './store-state'
import type {
  DocumentHistoryState,
  FrameSummary,
  LayerSummary,
  ShellDocumentState,
  SupportedLocale,
  ThemePreference,
} from './types'

export function createPreferenceActions(
  state: ShellStoreState,
  setOptions: (options: ShellStoreOptions) => void,
  getOptions: () => ShellStoreOptions | undefined,
) {
  function initialize(options: ShellStoreOptions): void {
    setOptions(options)
    state.preferences.value =
      options.preferences.load() ?? defaultPreferences(options.languages)
    state.systemDark.value = options.systemDark()
  }
  function updatePreferences(
    partial: Partial<
      Pick<(typeof state.preferences)['value'], 'locale' | 'theme'>
    >,
  ): void {
    state.preferences.value = {
      ...state.preferences.value,
      ...partial,
      schemaVersion: 1,
    }
    getOptions()?.preferences.save(state.preferences.value)
  }
  return {
    initialize,
    setLocale: (locale: SupportedLocale) => updatePreferences({ locale }),
    setSystemDark: (value: boolean) => {
      state.systemDark.value = value
    },
    setTheme: (theme: ThemePreference) => updatePreferences({ theme }),
  }
}

export function createSnapshotActions(state: ShellStoreState) {
  function setFixture(value: {
    document: ShellDocumentState
    layers?: readonly LayerSummary[]
    frames?: readonly FrameSummary[]
    activeToolId?: string
    selectedLayerId?: string
  }): void {
    state.documentState.value = value.document
    state.layers.value = value.layers ?? []
    state.frames.value = value.frames ?? []
    state.activeToolId.value = value.activeToolId
    state.selectedLayerId.value = value.selectedLayerId
    state.selectedLayerIds.value = value.selectedLayerId
      ? [value.selectedLayerId]
      : []
    state.activeFrameId.value = value.frames?.find(
      (frame) => frame.selected,
    )?.id
  }
  return {
    setDocumentHistory: (value: DocumentHistoryState) => {
      state.documentHistory.value = value
    },
    setDocumentState: (value: ShellDocumentState) => {
      state.documentState.value = value
    },
    setFixture,
    setFrames: (value: readonly FrameSummary[]) => {
      state.frames.value = value
      state.activeFrameId.value = value.find((frame) => frame.selected)?.id
    },
    setLayers: (value: readonly LayerSummary[]) => {
      state.layers.value = value
    },
    setLayersOpen: (value: boolean) => {
      state.layersOpen.value = value
    },
    toggleLayers: () => {
      state.layersOpen.value = !state.layersOpen.value
    },
  }
}
