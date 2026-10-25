export {
  circlingSketch,
  isCirclingKind,
  nextCirclingSequence,
} from '@cute-screen/editor-core'
export {
  sketchSeed,
  hasFreeformArea,
  pointsBounds,
} from '@cute-screen/editor-core'
export { measureRichTextContent } from './rich-text/measure-content'
export {
  createPlacedEmoji,
  replaceEmoji,
  resizeEmoji,
  emojiResourceId,
  emojiReference,
  EMOJI_CATALOG,
  EMOJI_CATEGORIES,
  EMOJI_PACK_VERSION,
  NOTO_EMOJI_COMMIT,
  QUICK_EMOJI_IDS,
  emojiAssetId,
  findEmoji,
  searchEmoji,
  type EmojiEntry,
} from '@cute-screen/editor-core'
export {
  calloutGeometryContext,
  calloutGeometryBounds,
  createDocumentRenderScene,
  hitTestDocument,
  hitTestDocumentAll,
  DocumentSpatialIndex,
  createCalloutLayer,
  calloutSelectionHandles,
  calloutTextLayout,
  rebaseCalloutLayer,
  updateCalloutHandle,
} from './callout-layout'
export {
  SHAPE_CATALOG,
  SHAPE_KINDS,
  isShapeKind,
  shapeGeometry,
  mapShapePath,
  shapePathSvg,
  type ShapePathCommand,
  type ShapePreset,
} from '@cute-screen/editor-core'
import type { EditorCoreBoundary } from '@cute-screen/editor-core'
export {
  classifyHighlighterBackground,
  resolveHighlighterBlend,
  normalizeHighlighterDefaults,
  highlighterModeForLayer,
  isHighlighterMode,
  type HighlighterEffect,
  type HighlighterMode,
} from '@cute-screen/editor-core'

export {
  applyEditorCommand,
  CommandManager,
  createFlipCanvasCommand,
  createExpressiveBrushMigrationCommand,
  rotateLayerTransform,
  createEditorDocumentFromImage,
  materializeQuickCaptureDocument,
  createRenderSceneSnapshot,
  snapPoint,
  BOUNDS_RESIZE_HANDLES,
  assertLayerEditableScale,
  layerIntrinsicResizeHandles,
  layerResizeCapability,
  normalizeEditableDocumentScales,
  normalizeEditableLayerScale,
  resizeLayerGeometry,
  parseEditorDocument,
  serializeEditorDocument,
  type EditorCommand,
  type EditorDocumentV7,
  type EditorDocumentV1,
  type EditorDocumentV2,
  type EditorDocumentV3,
  type EditorDocumentV5,
  type EditorDocumentV6,
  type EditorDocument,
  type ArrowLayer,
  type ArrowCap,
  type ImageLayer,
  type CalloutLayer,
  type NumberedMarkerLayer,
  type TextLayer,
  type TextBackground,
  type JsonObject,
  type SrgbColor,
  type StrokeStyle,
  type FillPaint,
  type GradientStop,
  type BlendMode,
  type LayerNode,
  type RenderImageNode,
  type RenderPolygonNode,
  type RenderVectorNode,
  type RenderPathNode,
  type RenderPaint,
  type RenderGradientStop,
  type RenderBlendMode,
  type RenderTextNode,
  type RenderTextParagraph,
  type RenderTextRun,
  type RenderTextStyle,
  type Transform2D,
  type SnapCandidate,
  type BoundsResizeHandle,
  type IntrinsicResizeHandle,
  type LayerResizeCapability,
  type ResizeLayerGeometryOptions,
  type HitTestResult,
  type EditorSnapshot,
  TransientEditorStateController,
  type ParsedEditorDocument,
  type EditorTransientState,
  createDrawingLayer,
  createTextLayer,
  createTextCommitCommand,
  createNumberedMarkerLayer,
  createContentImageLayer,
  createDuplicateLayerCommand,
  nextNumberedMarkerSequence,
  simplifySampledPoints,
  DEFAULT_DRAWING_DEFAULTS,
  type DrawingDefaults,
  type DrawingTool,
  arrowCapSize,
  arrowEndpointAngles,
  arrowPathPoints,
  arrowSelectionHandles,
  rebaseArrowLayer,
  DEFAULT_CALLOUT_FRAME,
  DEFAULT_CALLOUT_STYLE,
  defaultCalloutAttachment,
  calloutRoutePreset,
  calloutStyleForPayload,
  calloutBackground,
  calloutFrameBackground,
  withCalloutBackground,
  calloutEndpointSize,
  addCalloutStep,
  removeCalloutStep,
  removeCalloutStepAt,
  canRemoveCalloutStep,
  calloutHasLabel,
  resolvedCalloutAttachment,
  calloutAccentSide,
  resetCalloutRoute,
  type CalloutPayload,
  type CalloutStyle,
  type CalloutFrame,
  type CalloutRoute,
  type CalloutMarker,
  type CalloutMarkerStyle,
  type CalloutAttachment,
  calloutMarkerRadius,
  calloutLabelContains,
  calloutPathPoints,
  defaultCalloutRoute,
  type CalloutHandleKind,
  type CalloutGeometryContext,
  trimArrowBodyPoints,
  updateArrowHandle,
  type ArrowHandleKind,
  defaultDrawingToolPreferences,
  parseDrawingToolPreferences,
  rememberDrawingColor,
  type DrawingToolPreferences,
  type DrawingToolPreferencesV2,
  type DrawingToolPreferencesStorage,
  colorPalette,
  colorSuggestions,
  contrastRatio,
  hexToSrgb,
  hsvToSrgb,
  normalizeHex,
  srgbToHex,
  srgbToHsv,
  type ColorSuggestion,
  type HsvColor,
  type FontWeight,
  type ShadowStyle,
  CROP_PRESETS,
  CROP_RESIZE_HANDLES,
  applyCropSession,
  cancelCropSession,
  createCropSession,
  moveCrop,
  nudgeCrop,
  resetCrop,
  resizeCrop,
  setCropPreset,
  type CropNudgeDirection,
  type CropPreset,
  type CropResizeHandle,
  type CropSession,
  createCensorLayer,
  createLoupeLayer,
  createRulerLayer,
  createSpotlightLayer,
  rebaseRulerLayer,
  DEFAULT_RULER_COLOR,
  DEFAULT_RULER_FONT_SIZE,
  DEFAULT_RULER_THICKNESS,
  RULER_FONT_SIZE_BOUNDS,
  RULER_THICKNESS_BOUNDS,
  snapRulerEndpoint,
  type CensorLayer,
  type LoupeLayer,
  type RulerAngleGuide,
  type RulerLayer,
  type SpotlightLayer,
  type SpotlightFeatherPreset,
  type SpotlightShape,
  type RulerUnit,
  type RulerPercentBasis,
  DEFAULT_RICH_TEXT_PARAGRAPH_STYLE,
  DEFAULT_RICH_TEXT_SPAN_STYLE,
  applyRichTextParagraphStyle,
  applyRichTextSpanStyle,
  createRichTextEditingState,
  handleRichTextBackspace,
  handleRichTextEnter,
  normalizeRichTextContent,
  normalizeRichTextSelection,
  reconcileRichTextText,
  replaceRichTextSelection,
  richTextSelectionRange,
  setRichTextSelection,
  type RichTextContent,
  type RichTextEditingState,
  type RichTextParagraph,
  type RichTextParagraphStyle,
  type RichTextSelection,
  type RichTextSpanStyle,
} from '@cute-screen/editor-core'

export { Canvas2DRenderer } from './backends/canvas2d/renderer'
export { drawNodes2D } from './backends/canvas2d/nodes'
export type {
  Canvas2DLike,
  Canvas2DRendererOptions,
} from './backends/canvas2d/contracts'
export {
  CanvasKitRenderer,
  renderHeadlessCanvasKitPng,
} from './backends/canvaskit/renderer'
export { drawNodesCanvasKit } from './backends/canvaskit/nodes'
export type {
  CanvasKitApi,
  CanvasKitFontData,
} from './backends/canvaskit/contracts'
export { loadBundledCanvasKit } from './bundled-canvaskit'
export { layoutRichText } from './rich-text/layout'
export type {
  RichTextBullet,
  RichTextLayout,
  RichTextLayoutFragment,
  RichTextLayoutLine,
  RichTextMeasure,
  RichTextMeasureResult,
  RichTextStrike,
} from './rich-text/contracts'
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
export {
  RendererRuntime,
  type RendererRuntimeOptions,
} from './runtime'
export { formatRulerDisplayLabel } from './precision-rendering'
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
  RenderExportOptions,
  PrepareEffectsOptions,
  EffectPreparationRenderer,
  RendererRuntimeState,
} from './types'

/** Compile-time marker for the renderer-to-core dependency boundary. */
export type EditorRendererBoundary = Readonly<{
  core: EditorCoreBoundary
  package: 'editor-renderer'
}>
export {
  creationPolicy,
  extractLayerStyle,
  commonLayerStyle,
  applyLayerStyle,
  styleCommand,
  type LayerStyle,
} from '@cute-screen/editor-core'
export {
  parseToolSettingsPreferences,
  type ToolSettingsPreferencesV3,
} from '@cute-screen/editor-core'

export {
  resolveFreehandGeometry,
  changePencilBrush,
  normalizePencilDefaults,
  rebaseFreehandLayer,
  addSpotlightAperture,
  updateSpotlightAperture,
  removeSpotlightAperture,
  spotlightWithApertures,
  spotlightApertureAt,
  measureRuler,
  type SpotlightAperture,
} from '@cute-screen/editor-core'

export {
  rulerCanvasBounds,
  constrainRulerEndpoint,
  constrainRulerMove,
  constrainRulerTransform,
} from '@cute-screen/editor-core'

export {
  numberedMarkerLabelBounds,
  numberedMarkerCaption,
  numberedMarkerNumberContent,
  setNumberedMarkerCaption,
  rebaseNumberedMarkerLayer,
  setNumberedMarkerSequence,
} from '@cute-screen/editor-core'

export {
  measuredNumberedMarkerLayer,
  numberedMarkerCaptionBounds,
  numberedMarkerGeometryBounds,
  createPreparedNumberedMarker,
} from './numbered-marker-layout'

export {
  beginStroke,
  moveStroke,
  setStrokeStraight,
  type StrokeState,
} from '@cute-screen/editor-core'
export { imagePlacement } from '@cute-screen/editor-core'

export {
  LAYER_INTERACTION_POLICIES,
  SELECTION_DRAG_THRESHOLD_CSS,
  SMALL_SELECTION_SIZE_CSS,
  resolveSelectionTarget,
  selectionFrame,
  nearestSelectionHandle,
  layerHitBounds,
  type SelectionTarget,
  type SelectionFrame,
  type SelectionHandle,
  type LayerInteractionPolicy,
  type HitTestOptions,
} from '@cute-screen/editor-core'

export { layerSelectionHandles } from '@cute-screen/editor-core'

export {
  transformPoint,
  transformToMatrix,
} from '@cute-screen/editor-core'

export {
  parseCalloutPayload,
  parseCalloutStyle,
} from '@cute-screen/editor-core'

export {
  annotationTool,
  resolveLineEndpoint,
  type AnnotationTool,
  type LineAxis,
} from '@cute-screen/editor-core'

export {
  DEFAULT_GRADIENT_FILL,
  DEFAULT_GRADIENT_DEFAULTS,
  isGradientLayer,
  gradientFrame,
  gradientPoints,
  snapGradientPoint,
  snapGradientMove,
  type GradientMoveSnapState,
  fitGradientLayer,
  placeGradientLayer,
  type GradientPlacement,
  updateGradientHandle,
  rotateGradientFill,
  type LinearGradientPaint,
  type ShapeLayer,
  type Point,
} from '@cute-screen/editor-core'

export { prepareCompositionScene } from './composition/freeform'
export {
  DEFAULT_PRESENTATION_SETTINGS,
  createComposition,
  createCardShadowOptions,
  type CardShadowOptions,
  compositionInteractionSpace,
  createCardBackground,
  createCardBranding,
  cardColor,
  compositionPreset,
  resolveBrandingYear,
  resolveCompositionLayout,
  contentToCard,
  cardToContent,
  rasterizeFreeform,
  type CompositionSettings,
  type CompositionStart,
  type CompositionLayout,
  type CardBackground,
  type CardBranding,
  type CardFrame,
  type CardLayout,
  type CardColor,
  type CardImage,
  type CardPoint,
  type CardStop,
  type FreeformPoint,
  type EditorDocumentV8,
} from '@cute-screen/editor-core'

export { brandingNodes } from '@cute-screen/editor-core'
export { compositionBlobHashes } from '@cute-screen/editor-core'

export { parseComposition } from '@cute-screen/editor-core'
export {
  snapFrameMove,
  snapFrameResizePoint,
  type FrameMoveSnapState,
} from '@cute-screen/editor-core'

export {
  createAgentEditCommand,
  type AgentEdit,
} from '@cute-screen/editor-core'
export type { Rect } from '@cute-screen/editor-core'
