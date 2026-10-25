export {
  circlingSketch,
  isCirclingKind,
  nextCirclingSequence,
} from './circling-presets'
export { sketchSeed } from './sketch-geometry'
export * from './emoji'
export * from './emoji-catalog'
export {
  SHAPE_CATALOG,
  SHAPE_KINDS,
  isShapeKind,
  shapeGeometry,
  mapShapePath,
  shapePathSvg,
  flattenShapePath,
  type ShapePathCommand,
  type ShapeGeometry,
  type ShapePreset,
} from './shapes'
export {
  classifyHighlighterBackground,
  resolveHighlighterBlend,
  normalizeHighlighterDefaults,
  highlighterModeForLayer,
  isHighlighterMode,
  type HighlighterEffect,
  type HighlighterMode,
} from './highlighter'
export {
  DEFAULT_PRESENTATION_SETTINGS,
  DEFAULT_RULER_COLOR,
  DEFAULT_RULER_FONT_SIZE,
  DEFAULT_RULER_THICKNESS,
  ARROW_CAPS,
  CENSOR_MODES,
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  LAYER_KINDS,
  LOUPE_SHAPES,
  RULER_UNITS,
  RULER_PERCENT_BASES,
  RULER_FONT_SIZE_BOUNDS,
  RULER_THICKNESS_BOUNDS,
  SPOTLIGHT_FEATHER_PRESETS,
  SPOTLIGHT_SHAPES,
  parseEditorDocument,
  serializeEditorDocument,
  createEditorDocumentFromImage,
  createDocumentRenderScene,
  type ArrowLayer,
  type ArrowCap,
  type CalloutLayer,
  type CensorEffect,
  type CensorLayer,
  type CensorLayerPayload,
  type CensorMode,
  type CensorRegion,
  type ColorMetadata,
  type EditorDocumentV1,
  type EditorDocumentV2,
  type EditorDocumentV3,
  type EditorDocumentV4,
  type EditorDocumentV5,
  type EditorDocumentV6,
  type EditorDocumentV7,
  type EditorDocument,
  type BlendMode,
  type SrgbColor,
  type ShadowStyle,
  type FillPaint,
  type GradientStop,
  type StrokeStyle,
  type ArrowLayerPayload,
  type CalloutPayload,
  type CalloutRoute,
  type CalloutFrame,
  type CalloutStyle,
  type CalloutMarker,
  type CalloutAttachment,
  type CalloutMarkerStyle,
  type ShapeLayerPayload,
  type PencilLayerPayload,
  type StraightSegment,
  type MarkerLayerPayload,
  type EmojiLayer,
  type EmojiPayload,
  type EmojiAssetReference,
  type FontWeight,
  type ImageLayer,
  type ImageLayerPayload,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
  type LayerKind,
  type LayerNode,
  type LoupeLayer,
  type LoupeLayerPayload,
  type LoupeLens,
  type LoupeShape,
  type LoupeBorder,
  type MarkerLayer,
  type NumberedMarkerPayload,
  type NumberedMarkerBadge,
  type Matrix2D,
  type NumberedMarkerLayer,
  type ParsedEditorDocument,
  type PencilLayer,
  type Point,
  type PresentationSettingsV1,
  type Rect,
  type RulerLayer,
  type RulerLayerPayload,
  type RulerUnit,
  type RulerPercentBasis,
  type ShapeLayer,
  type SourceImageRef,
  type SpotlightLayer,
  type SpotlightLayerPayload,
  type SpotlightShape,
  type SpotlightFeatherPreset,
  type TextLayer,
  type TextLayerPayload,
  type TextBackground,
  type RichTextContent,
  type RichTextParagraph,
  type RichTextSpan,
  type Transform2D,
} from './document'
export {
  createDrawingLayer,
  simplifySampledPoints,
  DEFAULT_DRAWING_DEFAULTS,
  type DrawingDefaults,
  type DrawingTool,
  type ShapeKind,
} from './drawing'
export {
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
  calloutGeometryBounds,
  type CalloutGeometryContext,
  calloutMarkerRadius,
  calloutLabelContains,
  calloutPathPoints,
  calloutSelectionHandles,
  calloutTextLayout,
  calloutTextRect,
  defaultCalloutRoute,
  rebaseCalloutLayer,
  updateCalloutHandle,
  type CalloutHandleKind,
  type CalloutSelectionHandle,
} from './callout-geometry'
export {
  arrowCapSize,
  arrowEndpointAngles,
  arrowPathPoints,
  arrowSelectionHandles,
  rebaseArrowLayer,
  trimArrowBodyPoints,
  updateArrowHandle,
  type ArrowHandleKind,
  type ArrowSelectionHandle,
} from './arrow-geometry'
export {
  defaultDrawingToolPreferences,
  parseDrawingToolPreferences,
  rememberDrawingColor,
  type DrawingToolPreferences,
  type DrawingToolPreferencesV2,
  type DrawingToolPreferencesStorage,
} from './drawing-preferences'
export {
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
} from './color-picker'
export {
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
  type CropSessionOptions,
} from './crop-session'
export {
  assertValidFreeformPolygon,
  hasFreeformArea,
  pointInPolygon,
  pointsBounds,
} from './tools/precision/polygon'
export { createCensorLayer } from './tools/precision/censor'
export { createSpotlightLayer } from './tools/precision/spotlight'
export {
  createRulerLayer,
  measureRuler,
  rebaseRulerLayer,
  rulerVisualBoundsAreConservative,
  rulerVisualGeometry,
  snapRulerEndpoint,
  type RulerAngleGuide,
  type RulerMeasurement,
  type RulerSnapResult,
  type RulerVisualGeometry,
} from './tools/precision/ruler'
export { createLoupeLayer } from './tools/precision/loupe'
export { precisionLayerHitPart } from './tools/precision/hit-test'
export { assertValidLoupeSourceRegion } from './tools/precision/shared'
export {
  CLIPBOARD_LAYERS_MIME,
  decodeClipboardLayersV2,
  encodeClipboardLayersV2,
  type ClipboardLayersV2,
} from './tools/content/clipboard-codec'
export {
  pasteClipboardLayers,
  routeClipboardSnapshot,
  type ClipboardDispatch,
} from './tools/content/clipboard-route'
export { createTextLayer } from './tools/content/text'
export {
  createNumberedMarkerLayer,
  nextNumberedMarkerSequence,
} from './tools/content/marker'
export { createCalloutLayer } from './tools/content/callout'
export {
  createContentImageLayer,
  createEmojiLayer,
} from './tools/content/media'
export {
  createDuplicateLayerCommand,
  createPasteLayersCommand,
  createTextCommitCommand,
} from './tools/content/commands'
export {
  invertMatrix,
  multiplyMatrices,
  transformPoint,
  transformToMatrix,
} from './geometry'
export { rotateLayerTransform } from './layer-rotation'
export {
  BOUNDS_RESIZE_HANDLES,
  assertLayerEditableScale,
  layerIntrinsicResizeHandles,
  layerResizeCapability,
  normalizeEditableDocumentScales,
  normalizeEditableLayerScale,
  resizeLayerGeometry,
  type BoundsResizeHandle,
  type IntrinsicResizeHandle,
  type LayerResizeCapability,
  type ResizeLayerGeometryOptions,
} from './layer-resize'
export {
  createViewportState,
  fitViewport,
  panViewport,
  zoomAt,
  type ViewportFitMode,
  type ViewportState,
} from './viewport'
export {
  materializeQuickCaptureDocument,
  type QuickCaptureMaterialization,
} from './quick-capture'
export {
  hitTestDocument,
  hitTestDocumentAll,
  DocumentSpatialIndex,
  type HitPart,
  type HitTestResult,
} from './hit-test'
export {
  InteractionController,
  type EditorToolId,
  type InteractionState,
} from './interaction'
export {
  snapPoint,
  type SnapCandidate,
  type SnapResult,
} from './snap'
export { createExpressiveBrushMigrationCommand } from './commands/brush-migration'
export {
  applyEditorCommand,
  CommandManager,
  createFlipCanvasCommand,
  revertEditorCommand,
  type CommandManagerOptions,
  type EditorCommand,
  type EditorSnapshot,
  type IdGenerator,
} from './commands'
export {
  TransientEditorStateController,
  type EditorTransientState,
} from './transient'
export { createRenderSceneSnapshot } from './scene/snapshot'
export {
  type EditorCoreBoundary,
  type RenderEllipseNode,
  type RenderLineNode,
  type RenderPathNode,
  type RenderPolygonNode,
  type RenderVectorNode,
  type RenderImageNode,
  type RenderCensorEffect,
  type RenderCensorNode,
  type RenderCensorRegion,
  type RenderLoupeNode,
  type RenderRulerNode,
  type RenderSpotlightNode,
  type RenderTextNode,
  type RenderTextParagraph,
  type RenderTextRun,
  type RenderTextStyle,
  type RenderPaint,
  type RenderGradientStop,
  type RenderBlendMode,
  type RenderNode,
  type RenderOutputBounds,
  type RenderRectNode,
  type RenderSceneInput,
  type RenderSceneSnapshot,
  type RenderGroupNode,
  type RgbaColor,
} from './scene/contracts'
export {
  DEFAULT_RICH_TEXT_PARAGRAPH_STYLE,
  DEFAULT_RICH_TEXT_SPAN_STYLE,
  applyRichTextParagraphStyle,
  applyRichTextSpanStyle,
  createRichTextEditingState,
  handleRichTextBackspace,
  handleRichTextEnter,
  isUtf16Boundary,
  normalizeRichTextContent,
  normalizeRichTextSelection,
  reconcileRichTextText,
  replaceRichTextSelection,
  richTextParagraphStyleAt,
  richTextSelectionRange,
  richTextSpanStyleAt,
  setRichTextSelection,
  type RichTextEditingState,
  type RichTextParagraphStyle,
  type RichTextRange,
  type RichTextSelection,
  type RichTextSpanStyle,
} from './tools/text'
export {
  creationPolicy,
  extractLayerStyle,
  commonLayerStyle,
  applyLayerStyle,
  styleCommand,
  type LayerStyle,
} from './styles'
export {
  parseToolSettingsPreferences,
  type ToolSettingsPreferencesV3,
} from './tool-preferences'

export {
  resolveFreehandGeometry,
  changePencilBrush,
  normalizePencilDefaults,
  rebaseFreehandLayer,
} from './tools/freehand'
export {
  addSpotlightAperture,
  updateSpotlightAperture,
  removeSpotlightAperture,
  spotlightWithApertures,
  spotlightApertureAt,
} from './tools/precision/spotlight'

export type { SpotlightAperture } from './document/types'

export {
  rulerCanvasBounds,
  constrainRulerEndpoint,
  constrainRulerMove,
  constrainRulerTransform,
} from './ruler-constraints'

export {
  numberedMarkerLabelBounds,
  numberedMarkerCaption,
  numberedMarkerNumberContent,
  setNumberedMarkerCaption,
  numberedMarkerCaptionBounds,
  numberedMarkerGeometryBounds,
  rebaseNumberedMarkerLayer,
  setNumberedMarkerSequence,
} from './numbered-marker'

export {
  beginStroke,
  moveStroke,
  setStrokeStraight,
  type StrokeState,
} from './tools/straight-stroke'
export { imagePlacement } from './image-placement'

export {
  LAYER_INTERACTION_POLICIES,
  SELECTION_DRAG_THRESHOLD_CSS,
  SMALL_SELECTION_SIZE_CSS,
  type LayerInteractionPolicy,
} from './interaction-policy'
export {
  resolveSelectionTarget,
  selectionFrame,
  nearestSelectionHandle,
  type SelectionHandle,
  type SelectionFrame,
  type SelectionTarget,
} from './selection-target'
export {
  type HitTestOptions,
  layerHitBounds,
} from './hit-test'

export { layerSelectionHandles } from './selection-handles'

export {
  parseCalloutPayload,
  parseCalloutStyle,
} from './document/codec/callout'

export {
  annotationTool,
  resolveLineEndpoint,
  type AnnotationTool,
  type LineAxis,
} from './line'

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
} from './gradient'

export * from './composition'
export type { EditorDocumentV8 } from './document/types'

export {
  encodeClipboardLayersV3,
  decodeClipboardLayersV3,
  type ClipboardLayersV3,
} from './tools/content/clipboard-codec'
export {
  snapFrameMove,
  snapFrameResizePoint,
  type FrameMoveSnapState,
} from './frame-snap'
export {
  createAgentEditCommand,
  type AgentEdit,
} from './agent-edits'
