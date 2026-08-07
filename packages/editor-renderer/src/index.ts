import type { EditorCoreBoundary } from '@cute-screen/editor-core'

export { createRenderSceneSnapshot } from '@cute-screen/editor-core'

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
