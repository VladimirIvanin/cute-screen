/**
 * Test-only facade that keeps the desktop shell dependent on editor-vue while
 * the M01 diagnostic screen exercises the lower renderer boundaries.
 */
export {
  Canvas2DRenderer,
  CanvasKitRenderer,
  RendererRuntime,
  createRenderSceneSnapshot,
  loadBundledCanvasKit,
  type FrameMetric,
  type RendererRuntimeState,
} from '@cute-screen/editor-renderer'
