import type { EditorCoreBoundary } from '@cute-screen/editor-core'

export {
  applyEditorCommand,
  CommandManager,
  createFlipCanvasCommand,
  createRenderSceneSnapshot,
  createDocumentRenderScene,
  hitTestDocument,
  hitTestDocumentAll,
  DocumentSpatialIndex,
  snapPoint,
  parseEditorDocument,
  serializeEditorDocument,
  type EditorCommand,
  type EditorDocumentV1,
  type EditorDocumentV2,
  type EditorDocumentV3,
  type EditorDocument,
  type ImageLayer,
  type JsonObject,
  type SrgbColor,
  type BlendMode,
  type LayerNode,
  type RenderImageNode,
  type RenderPolygonNode,
  type RenderPathNode,
  type RenderPaint,
  type RenderGradientStop,
  type RenderBlendMode,
  type Transform2D,
  type SnapCandidate,
  type HitTestResult,
  type EditorSnapshot,
  TransientEditorStateController,
  type ParsedEditorDocument,
  type EditorTransientState,
  createDrawingLayer,
  simplifySampledPoints,
  DEFAULT_DRAWING_DEFAULTS,
  type DrawingDefaults,
  type DrawingTool,
  defaultDrawingToolPreferences,
  parseDrawingToolPreferences,
  rememberDrawingColor,
  type DrawingToolPreferencesV1,
  type DrawingToolPreferencesStorage,
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
  FrameProbe,
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
