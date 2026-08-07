import type { EditorRendererBoundary } from '@cute-screen/editor-renderer'

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

/** Compile-time marker that keeps the declared package dependency exercised. */
export type EditorVueBoundary = Readonly<{
  package: 'editor-vue'
  renderer: EditorRendererBoundary
}>
