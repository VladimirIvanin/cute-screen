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
    const activeFrameId = ref<string | undefined>()
    const zoom = ref(100)
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
      activeFrameId.value = value.frames?.find((frame) => frame.selected)?.id
    }
    function setFrames(value: readonly FrameSummary[]): void {
      frames.value = value
      activeFrameId.value = value.find((frame) => frame.selected)?.id
    }
    function selectTool(id: string): void {
      activeToolId.value = id
    }
    function selectLayer(id: string): void {
      selectedLayerId.value = id
    }
    function selectFrame(id: string): void {
      activeFrameId.value = id
    }
    function setLayersOpen(value: boolean): void {
      layersOpen.value = value
    }
    function toggleLayers(): void {
      layersOpen.value = !layersOpen.value
    }
    function setZoom(value: number): void {
      zoom.value = Math.max(25, Math.min(400, value))
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
      setDocumentState,
      setDocumentHistory,
      setCaptureProgress,
      setFixture,
      setFrames,
      setLayersOpen,
      setLocale,
      setSystemDark,
      setTheme,
      setZoom,
      toggleLayers,
      zoom,
    }
  },
)

export function createEditorShellPinia() {
  return createPinia()
}
