import type { EditorCoreBoundary } from '@cute-screen/editor-core'

export {
  applyEditorCommand,
  CommandManager,
  createRenderSceneSnapshot,
  parseEditorDocument,
  serializeEditorDocument,
  type EditorCommand,
  type EditorDocumentV1,
  type EditorSnapshot,
  type ParsedEditorDocument,
} from '@cute-screen/editor-core'

export {
  Canvas2DRenderer,
  drawNodes2D,
  type Canvas2DLike,
  type Canvas2DRendererOptions,
} from './canvas2d'
export {
  CanvasKitRenderer,
  drawNodesCanvasKit,
  renderHeadlessCanvasKitPng,
  type CanvasKitApi,
} from './canvaskit'
export { loadBundledCanvasKit } from './bundled-canvaskit'
export {
  ImageResourceManager,
  selectImageVariant,
  type ImageResourceKey,
  type ImageResourceLease,
  type ImageResourceManagerOptions,
  type ImageVariant,
  type ImageVariantSelection,
  type ManagedImageResource,
} from './image-resource-manager'
export { RendererRuntime, type RendererRuntimeOptions } from './runtime'
export {
  FrameScheduler,
  INVALIDATION_REASONS,
  type InvalidationReason,
  type ScheduledFrame,
} from './scheduler'
export type {
  CanvasStack,
  FrameMetric,
  ImageResource,
  ImageResourceInput,
  Renderer,
  RendererBackend,
  RendererRuntimeState,
} from './types'

/** Compile-time marker for the renderer-to-core dependency boundary. */
export type EditorRendererBoundary = Readonly<{
  core: EditorCoreBoundary
  package: 'editor-renderer'
}>
