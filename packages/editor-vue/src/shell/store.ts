import { createPinia, defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { t } from './i18n'
import { defaultPreferences, type UiPreferencesStorage } from './preferences'
import type {
  AsyncActionName,
  AsyncActionState,
  FrameSummary,
  LayerSummary,
  ResolvedTheme,
  ShellActionAdapter,
  ShellDocumentState,
  SupportedLocale,
  ThemePreference,
  DocumentHistoryState,
} from './types'
import type { CaptureProgressState } from '../platform'

export interface ShellStoreOptions {
  readonly preferences: UiPreferencesStorage
  readonly languages: readonly string[]
  readonly systemDark: () => boolean
  readonly actions?: ShellActionAdapter | undefined
}

/** Expected terminal outcome from a native selector or portal. */
export class ActionCancelledError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActionCancelledError'
  }
}

export const useEditorShellStore = defineStore(
  'cute-screen-editor-shell',
  () => {
    const documentState = ref<ShellDocumentState>({ kind: 'empty' })
    const activeToolId = ref<string | undefined>()
    const selectedLayerId = ref<string | undefined>()
    const selectedLayerIds = ref<readonly string[]>([])
    const activeFrameId = ref<string | undefined>()
    const zoom = ref(100)
    const zoomMode = ref<'fit' | 'custom'>('fit')
    const frameViewports = new Map<
      string,
      { readonly zoom: number; readonly mode: 'fit' | 'custom' }
    >()
    const layersOpen = ref(false)
    const preferences = ref(defaultPreferences(navigator.languages))
    const systemDark = ref(false)
    const actionState = ref<AsyncActionState>({ status: 'idle' })
    const layers = ref<readonly LayerSummary[]>([])
    const frames = ref<readonly FrameSummary[]>([])
    const documentHistory = ref<DocumentHistoryState>({
      canUndo: false,
      canRedo: false,
      saveState: 'saved',
    })
    let options: ShellStoreOptions | undefined
    let controller: AbortController | undefined

    const locale = computed(() => preferences.value.locale)
    const resolvedTheme = computed<ResolvedTheme>(() =>
      preferences.value.theme === 'system'
        ? systemDark.value
          ? 'dark'
          : 'light'
        : preferences.value.theme,
    )
    const hasFrames = computed(() => frames.value.length > 0)
    const canCopyOrExport = computed(() => documentState.value.kind === 'ready')

    function initialize(next: ShellStoreOptions): void {
      options = next
      preferences.value =
        next.preferences.load() ?? defaultPreferences(next.languages)
      systemDark.value = next.systemDark()
    }

    function setSystemDark(value: boolean): void {
      systemDark.value = value
    }
    function setTheme(theme: ThemePreference): void {
      updatePreferences({ theme })
    }
    function setLocale(localeValue: SupportedLocale): void {
      updatePreferences({ locale: localeValue })
    }
    function updatePreferences(
      partial: Partial<Pick<typeof preferences.value, 'locale' | 'theme'>>,
    ): void {
      preferences.value = { ...preferences.value, ...partial, schemaVersion: 1 }
      options?.preferences.save(preferences.value)
    }
    function setDocumentState(value: ShellDocumentState): void {
      documentState.value = value
    }
    function setDocumentHistory(value: DocumentHistoryState): void {
      documentHistory.value = value
    }
    function setFixture(value: {
      document: ShellDocumentState
      layers?: readonly LayerSummary[]
      frames?: readonly FrameSummary[]
      activeToolId?: string
      selectedLayerId?: string
    }): void {
      documentState.value = value.document
      layers.value = value.layers ?? []
      frames.value = value.frames ?? []
      activeToolId.value = value.activeToolId
      selectedLayerId.value = value.selectedLayerId
      selectedLayerIds.value = value.selectedLayerId
        ? [value.selectedLayerId]
        : []
      activeFrameId.value = value.frames?.find((frame) => frame.selected)?.id
    }
    function setFrames(value: readonly FrameSummary[]): void {
      frames.value = value
      activeFrameId.value = value.find((frame) => frame.selected)?.id
    }
    function setLayers(value: readonly LayerSummary[]): void {
      layers.value = value
    }
    function selectTool(id: string): void {
      activeToolId.value = id
    }
    function selectLayer(id: string, toggle = false, range = false): void {
      const anchor = selectedLayerId.value
      const anchorIndex = anchor
        ? layers.value.findIndex((layer) => layer.id === anchor)
        : -1
      const targetIndex = layers.value.findIndex((layer) => layer.id === id)
      const selected =
        range && anchorIndex >= 0 && targetIndex >= 0
          ? layers.value
              .slice(
                Math.min(anchorIndex, targetIndex),
                Math.max(anchorIndex, targetIndex) + 1,
              )
              .map((layer) => layer.id)
          : toggle
            ? selectedLayerIds.value.includes(id)
              ? selectedLayerIds.value.filter((value) => value !== id)
              : [...selectedLayerIds.value, id]
            : [id]
      selectedLayerIds.value = selected
      selectedLayerId.value = range && anchor ? anchor : selected[0]
    }
    function clearLayerSelection(): void {
      selectedLayerId.value = undefined
      selectedLayerIds.value = []
    }
    function selectFrame(id: string): void {
      if (activeFrameId.value) {
        frameViewports.set(activeFrameId.value, {
          zoom: zoom.value,
          mode: zoomMode.value,
        })
      }
      activeFrameId.value = id
      const preserved = frameViewports.get(id)
      if (preserved) {
        zoom.value = preserved.zoom
        zoomMode.value = preserved.mode
      }
    }
    function setLayersOpen(value: boolean): void {
      layersOpen.value = value
    }
    function toggleLayers(): void {
      layersOpen.value = !layersOpen.value
    }
    function setZoom(value: number): void {
      zoom.value = Math.max(10, Math.min(1600, value))
      zoomMode.value = 'custom'
      if (activeFrameId.value) {
        frameViewports.set(activeFrameId.value, {
          zoom: zoom.value,
          mode: zoomMode.value,
        })
      }
    }
    function setFitZoom(value: number): void {
      zoom.value = Math.max(10, Math.min(1600, value))
      zoomMode.value = 'fit'
      if (activeFrameId.value) {
        frameViewports.set(activeFrameId.value, {
          zoom: zoom.value,
          mode: zoomMode.value,
        })
      }
    }
    function enableFit(): void {
      zoomMode.value = 'fit'
      if (activeFrameId.value) {
        frameViewports.set(activeFrameId.value, {
          zoom: zoom.value,
          mode: zoomMode.value,
        })
      }
    }
    function clearFeedback(): void {
      actionState.value = { status: 'idle' }
    }
    function cancelAction(): void {
      controller?.abort()
    }
    function setCaptureProgress(progress: CaptureProgressState): void {
      if (
        actionState.value.status === 'pending' &&
        actionState.value.action === 'capture'
      ) {
        actionState.value = {
          status: 'pending',
          action: 'capture',
          captureProgress: progress,
        }
      }
    }

    async function runAction(action: AsyncActionName): Promise<void> {
      if (!options?.actions) {
        const key =
          action === 'capture'
            ? 'captureUnavailable'
            : action === 'copy'
              ? 'copyUnavailable'
              : 'exportUnavailable'
        actionState.value = {
          status: 'error',
          action,
          message: t(locale.value, key),
        }
        return
      }
      controller?.abort()
      const actionController = new AbortController()
      controller = actionController
      actionState.value =
        action === 'capture'
          ? { status: 'pending', action, captureProgress: 'probing' }
          : { status: 'pending', action }
      try {
        const message = await options.actions.run(
          action,
          actionController.signal,
          action === 'capture' ? setCaptureProgress : undefined,
        )
        actionState.value = { status: 'success', action, message }
      } catch (error) {
        if (
          actionController.signal.aborted ||
          error instanceof ActionCancelledError
        ) {
          actionState.value = {
            status: 'cancelled',
            action,
            message:
              error instanceof ActionCancelledError
                ? error.message
                : t(locale.value, 'captureCancelled'),
          }
          return
        }
        actionState.value = {
          status: 'error',
          action,
          message: error instanceof Error ? error.message : String(error),
        }
      } finally {
        if (controller === actionController) controller = undefined
      }
    }

    return {
      activeFrameId,
      activeToolId,
      actionState,
      canCopyOrExport,
      clearFeedback,
      clearLayerSelection,
      cancelAction,
      documentState,
      documentHistory,
      frames,
      hasFrames,
      initialize,
      layers,
      layersOpen,
      locale,
      preferences,
      resolvedTheme,
      runAction,
      selectFrame,
      selectLayer,
      selectTool,
      selectedLayerId,
      selectedLayerIds,
      setDocumentState,
      setDocumentHistory,
      setCaptureProgress,
      enableFit,
      setFitZoom,
      setFixture,
      setFrames,
      setLayers,
      setLayersOpen,
      setLocale,
      setSystemDark,
      setTheme,
      setZoom,
      toggleLayers,
      zoom,
      zoomMode,
    }
  },
)

export function createEditorShellPinia() {
  return createPinia()
}
