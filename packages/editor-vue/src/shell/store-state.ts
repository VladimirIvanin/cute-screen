import { computed, ref } from 'vue'
import type { CaptureProgressState } from '../platform'
import { defaultPreferences } from './preferences'
import type {
  AsyncActionState,
  DocumentHistoryState,
  FrameSummary,
  LayerSummary,
  ResolvedTheme,
  ShellDocumentState,
} from './types'

export function createShellStoreState() {
  const documentState = ref<ShellDocumentState>({ kind: 'empty' })
  const activeToolId = ref<string>()
  const selectedLayerId = ref<string>()
  const selectedLayerIds = ref<readonly string[]>([])
  const activeFrameId = ref<string>()
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
  return {
    actionState,
    activeFrameId,
    activeToolId,
    canCopyOrExport,
    documentHistory,
    documentState,
    frames,
    frameViewports,
    hasFrames,
    layers,
    layersOpen,
    locale,
    preferences,
    resolvedTheme,
    selectedLayerId,
    selectedLayerIds,
    systemDark,
    zoom,
    zoomMode,
  }
}

export type ShellStoreState = ReturnType<typeof createShellStoreState>

export function setCaptureProgress(
  state: ShellStoreState,
  progress: CaptureProgressState,
): void {
  const current = state.actionState.value
  if (
    current.status === 'pending' &&
    (current.action === 'capture' || current.action === 'captureWindow')
  ) {
    state.actionState.value = {
      status: 'pending',
      action: current.action,
      captureProgress: progress,
    }
  }
}
