import type { EditorRendererBoundary } from '@cute-screen/editor-renderer'

export type {
  CaptureCapabilities,
  ClipboardCapabilities,
  DialogCapabilities,
  HotkeyCapabilities,
  LibraryCapabilities,
  PlatformAdapter,
  WindowCapabilities,
} from './platform'

/** Compile-time marker that keeps the declared package dependency exercised. */
export type EditorVueBoundary = Readonly<{
  package: 'editor-vue'
  renderer: EditorRendererBoundary
}>
