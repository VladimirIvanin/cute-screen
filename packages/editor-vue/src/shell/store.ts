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
} from './types'

export interface ShellStoreOptions {
  readonly preferences: UiPreferencesStorage
  readonly languages: readonly string[]
  readonly systemDark: () => boolean
  readonly actions?: ShellActionAdapter | undefined
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
      controller = new AbortController()
      actionState.value = { status: 'pending', action }
      try {
        const message = await options.actions.run(action, controller.signal)
        actionState.value = { status: 'success', action, message }
      } catch (error) {
        if (controller.signal.aborted) {
          actionState.value = { status: 'idle' }
          return
        }
        actionState.value = {
          status: 'error',
          action,
          message: error instanceof Error ? error.message : String(error),
        }
      } finally {
        controller = undefined
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
      setFixture,
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
