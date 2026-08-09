import type { EditorRendererBoundary } from '@cute-screen/editor-renderer'
import './shell/shell.css'

export {
  ImageTransportError,
  loadImageWithBinaryFallback,
  type ImageTransportBridge,
  type ImageTransportErrorCode,
  type LoadedImageResource,
  type LoadImageOptions,
  type ObjectUrlLifecycle,
  type StagedImageMetadata,
} from './image-transport'

export type {
  CaptureResult,
  CaptureCapabilities,
  ClipboardCapabilities,
  DialogCapabilities,
  HotkeyCapabilities,
  LibraryCapabilities,
  PlatformAdapter,
  PlatformCapabilities,
  PortalCapabilityProbe,
  WindowCapabilities,
} from './platform'

export { default as EditorShell } from './shell/components/EditorShell.vue'
export { default as TopBar } from './shell/components/TopBar.vue'
export { default as ToolRail } from './shell/components/ToolRail.vue'
export { default as CanvasViewport } from './shell/components/CanvasViewport.vue'
export { default as ContextToolbar } from './shell/components/ContextToolbar.vue'
export { default as LayersPanel } from './shell/components/LayersPanel.vue'
export { default as SeriesFilmstrip } from './shell/components/SeriesFilmstrip.vue'
export { default as ZoomControls } from './shell/components/ZoomControls.vue'
export {
  DocumentSessionController,
  parsePersistedDocument,
  type DocumentPersistenceBridge,
  type DocumentSaveState,
  type DocumentSessionSnapshot,
  type PersistedDocumentRecord,
} from './document-session'
export { createEditorShellPinia, useEditorShellStore } from './shell/store'
export { assertLocaleCompleteness, resolveSystemLocale, t } from './shell/i18n'
export {
  createBrowserPreferencesStorage,
  defaultPreferences,
  parsePreferences,
} from './shell/preferences'
export type {
  AsyncActionState,
  CanvasViewportHosts,
  ContextToolbarSchema,
  FrameSummary,
  LayerSummary,
  ShellActionAdapter,
  ShellDocumentState,
  SupportedLocale,
  ThemePreference,
  ToolDescriptor,
  UiPreferencesV1,
} from './shell/types'

/** Compile-time marker that keeps the declared package dependency exercised. */
export type EditorVueBoundary = Readonly<{
  package: 'editor-vue'
  renderer: EditorRendererBoundary
}>
