import type { EditorRendererBoundary } from '@cute-screen/editor-renderer'
import type { EditorDocumentV1 } from '@cute-screen/editor-renderer'
import './fonts'
import './shell/shell.css'

export {
  Canvas2DRenderer,
  CanvasKitRenderer,
  createRenderSceneSnapshot,
  loadBundledCanvasKit,
  RendererRuntime,
  type FrameMetric,
  type FrameProbe,
} from '@cute-screen/editor-renderer'

export {
  ImageTransportError,
  loadImageWithBinaryFallback,
  type ImageTransportBridge,
  type ClipboardBridge,
  type NativeClipboardSnapshot,
  type ClipboardBitmapSnapshot,
  type ImageTransportErrorCode,
  type LoadedImageResource,
  type LoadImageOptions,
  type ObjectUrlLifecycle,
  type StagedImageMetadata,
} from './image-transport'
export type { SystemFontCatalogBridge, SystemFontFace } from './font-catalog'
export {
  TextureResourceResolver,
  type ContentImageBridge,
  type TextureFillBridge,
  type TextureImportOutcome,
  type TextureResourceState,
} from './texture-fill'

export type {
  CaptureResult,
  CaptureAction,
  CaptureCapabilities,
  CaptureOutcomeV1,
  CaptureProgressState,
  CaptureProgressV1,
  CaptureRequestV1,
  CaptureTerminalOutcome,
  ShortcutBindingResult,
  ShortcutSpec,
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
  describeError,
  parsePersistedDocument,
  type DocumentPersistenceBridge,
  type DocumentFlushOutcome,
  type DocumentRecoveryExportOutcome,
  type DocumentSaveState,
  type DocumentSessionSnapshot,
  type PersistedDocumentRecord,
} from './document-session'
export {
  DocumentSessionCoordinator,
  type CoordinatedDocumentRecord,
  type DocumentHandoffOutcome,
} from './document-session-coordinator'
export {
  ActionCancelledError,
  createEditorShellPinia,
  useEditorShellStore,
} from './shell/store'
export { assertLocaleCompleteness, resolveSystemLocale, t } from './shell/i18n'
export {
  createBrowserPreferencesStorage,
  defaultPreferences,
  parsePreferences,
} from './shell/preferences'
export {
  RichTextEditorController,
  type BrowserTextReconcileResult,
} from './rich-text-editor'
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

export type { EditorDocumentV1 }
