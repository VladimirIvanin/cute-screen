import { loadToolSettings } from './tool-settings-memory'
import {
  onBeforeUnmount,
  onMounted,
  watch,
  type Ref,
} from 'vue'
import type { DrawingToolPreferencesV2 } from '@cute-screen/editor-renderer'
import {
  createBrowserDrawingToolPreferencesStorage,
  createBrowserPreferencesStorage,
} from '../preferences'
import type { ResolvedEditorShellProps } from '../contracts'
import type {
  ShellStoreOptions,
  useEditorShellStore,
} from '../store'
import type { createWorkspaceState } from './workspace-state'
import type { DocumentSessionSnapshot } from '../../document-session'

type ShellStore = ReturnType<typeof useEditorShellStore>
type WorkspaceState = ReturnType<typeof createWorkspaceState>

export interface WorkspaceEnvironment {
  readonly storage: Storage | undefined
  readonly media: Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>
  readonly preferencesOptions: ShellStoreOptions
}

export function createWorkspaceEnvironment(props: ResolvedEditorShellProps): WorkspaceEnvironment {
  let storage: Storage | undefined
  try {
    storage = window.localStorage
  } catch (error) {
    void error
  }
  const media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : {
          matches: false,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }
  const languages = import.meta.env.VITE_TEST_HARNESS === 'true' ? (['en'] as const) : navigator.languages
  return {
    storage,
    media,
    preferencesOptions: {
      ...(props.actions ? { actions: props.actions } : {}),
      languages,
      preferences: createBrowserPreferencesStorage(storage, languages),
      systemDark: () => media.matches,
    },
  }
}

export interface WorkspaceLifecycleContext {
  readonly props: ResolvedEditorShellProps
  readonly store: ShellStore
  readonly workspace: WorkspaceState
  readonly environment: WorkspaceEnvironment
  readonly activeToolId: Ref<string | undefined>
  readonly resolvedTheme: Ref<'dark' | 'light'>
  readonly locale: Ref<'en' | 'ru'>
  readonly onKeydown: (event: KeyboardEvent) => void
  readonly onToolConfigureOutsidePointer: (event: PointerEvent) => void
  readonly onToolConfigureKeydown: (event: KeyboardEvent) => void
  readonly loadFixture: () => void
  readonly applyDocumentSnapshot: (snapshot: DocumentSessionSnapshot) => void
  readonly resolveDocumentTextures: (document: NonNullable<WorkspaceState['activeDocument']['value']>) => Promise<void>
}

function registerResourceWatches(context: WorkspaceLifecycleContext): void {
  watch(
    () => context.props.textureBridge,
    () => {
      const document = context.workspace.activeDocument.value
      if (document) void context.resolveDocumentTextures(document)
    },
  )
  watch(context.activeToolId, (tool, previous) => {
    if (tool === 'crop' && previous !== 'crop') {
      context.workspace.cropPreset.value = 'free'
    }
  })
  watch(
    [context.resolvedTheme, context.locale],
    ([theme, locale]) => {
      document.documentElement.dataset.theme = theme
      document.documentElement.lang = locale
    },
    { immediate: true },
  )
}

function registerPropWatches(context: WorkspaceLifecycleContext): void {
  watch(
    () => context.props.frames,
    (frames) => {
      if (frames) context.store.setFrames(frames)
    },
    { immediate: true },
  )
  watch(
    () => context.props.documentSession,
    (session, _previous, onCleanup) => {
      if (!session) return
      onCleanup(session.subscribe(context.applyDocumentSnapshot))
    },
    { immediate: true },
  )
  watch(
    () => context.props.captureProgress,
    (progress) => {
      if (progress) context.store.setCaptureProgress(progress)
    },
  )
  watch(
    () => context.props.initialDocumentState,
    (state) => {
      if (!context.props.documentSession && state) {
        context.store.setDocumentState(state)
      }
    },
  )
  watch(
    () => context.props.readOnlyDocument,
    (readOnly) => {
      if (!context.props.documentSession && readOnly) {
        context.store.setDocumentHistory({
          canUndo: false,
          canRedo: false,
          saveState: 'readOnly',
        })
      }
    },
  )
}

function mountWorkspace(
  context: WorkspaceLifecycleContext,
  onMediaChange: (event: MediaQueryListEvent) => void,
): void {
  onMounted(() => {
    let preferences = createBrowserDrawingToolPreferencesStorage(
      context.environment.storage,
    ).load() as DrawingToolPreferencesV2
    try {
      preferences = loadToolSettings(context.environment.storage).drawing
    } catch (error) {
      console.warn('Tool preference migration failed', error)
    }
    context.workspace.drawingPreferences.value = preferences
    context.workspace.drawingDefaults.value = preferences.defaults
    context.store.initialize(context.environment.preferencesOptions)
    if (!context.props.documentSession) {
      context.store.setDocumentState(context.props.initialDocumentState ?? { kind: 'empty' })
      if (!context.props.initialDocumentState) context.loadFixture()
      if (context.props.readOnlyDocument) {
        context.store.setDocumentHistory({
          canUndo: false,
          canRedo: false,
          saveState: 'readOnly',
        })
      }
    }
    context.environment.media.addEventListener('change', onMediaChange)
    window.addEventListener('keydown', context.onKeydown)
    document.addEventListener('keydown', context.onToolConfigureKeydown, true)
    document.addEventListener('pointerdown', context.onToolConfigureOutsidePointer, true)
  })
}

function unmountWorkspace(
  context: WorkspaceLifecycleContext,
  onMediaChange: (event: MediaQueryListEvent) => void,
): void {
  onBeforeUnmount(() => {
    void context.props.documentSession?.flush()
    context.props.documentSession?.dispose()
    if (context.workspace.fallbackCopiedTimer.value) {
      window.clearTimeout(context.workspace.fallbackCopiedTimer.value)
    }
    context.environment.media.removeEventListener('change', onMediaChange)
    window.removeEventListener('keydown', context.onKeydown)
    document.removeEventListener('keydown', context.onToolConfigureKeydown, true)
    document.removeEventListener('pointerdown', context.onToolConfigureOutsidePointer, true)
  })
}

export function useWorkspaceLifecycle(context: WorkspaceLifecycleContext) {
  const stopToolSampling = context.store.$onAction(({ name }) => {
    if (name !== 'selectTool') return
    // Observe the intent, including reselecting the same tool via a shortcut.
    // Watching activeToolId alone misses those explicit cancellations.
    context.workspace.samplingControl.value = undefined
    context.workspace.eyedropperColor.value = undefined
    context.workspace.eyedropperFeedback.value = undefined
  })
  onBeforeUnmount(stopToolSampling)
  const onMediaChange = (event: MediaQueryListEvent) => context.store.setSystemDark(event.matches)
  registerResourceWatches(context)
  registerPropWatches(context)
  mountWorkspace(context, onMediaChange)
  unmountWorkspace(context, onMediaChange)
}
