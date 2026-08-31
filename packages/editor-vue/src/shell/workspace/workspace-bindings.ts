import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import type { DrawingToolPreferencesV2 } from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../contracts'
import type { useEditorShellStore } from '../store'
import { createContextActions } from '../tools/effects/context-actions'
import { createContextEffects } from '../tools/effects/context-effects'
import { createDrawingEffects } from '../tools/effects/drawing-effects'
import { createImageEffects } from '../tools/effects/image-effects'
import { createPrecisionEffects } from '../tools/effects/precision-effects'
import { createTextEffects } from '../tools/effects/text-effects'
import { createToolCatalog } from '../tools/catalog'
import { createContextSchema } from '../tools/context-schema'
import { createDrawingSchema } from '../tools/drawing-schema'
import { createPrecisionSchema } from '../tools/precision-schema'
import { createTextSchema } from '../tools/text-schema'
import { createContentController } from './content-controller'
import { createLayerController } from './layer-controller'
import { createToolUiController } from './tool-ui-controller'
import type { createWorkspaceState } from './workspace-state'

type ShellStore = ReturnType<typeof useEditorShellStore>
type WorkspaceState = ReturnType<typeof createWorkspaceState>
type Translate = (key: Parameters<typeof import('../i18n').t>[1]) => string

export interface WorkspaceBindingsContext {
  readonly props: ResolvedEditorShellProps
  readonly store: ShellStore
  readonly workspace: WorkspaceState
  readonly translate: Translate
  readonly saveDrawingPreferences: (value: DrawingToolPreferencesV2) => void
}

function createSchemas(context: WorkspaceBindingsContext) {
  const { props, store, workspace, translate } = context
  const state = storeToRefs(store)
  const hasInteractiveDocument = computed(
    () => props.documentSession !== undefined || props.fixture === 'ready',
  )
  const { tools } = createToolCatalog({
    quickMode: props.quickMode,
    readOnlyDocument: props.readOnlyDocument,
    contentImageBridgeAvailable: Boolean(props.contentImageBridge),
    contentImageImporting: workspace.contentImageImporting,
    hasInteractiveDocument,
    hasCanvas: computed(() => Boolean(workspace.activeDocument.value)),
  })
  const precision = createPrecisionSchema({
    props,
    state,
    store,
    activeDocument: workspace.activeDocument,
    precisionDefaults: workspace.precisionDefaults,
    translate,
  })
  const drawing = createDrawingSchema({
    props,
    store,
    activeDocument: workspace.activeDocument,
    drawingDefaults: workspace.drawingDefaults,
    translate,
    hexColor: precision.hexColor,
  })
  const text = createTextSchema({
    props,
    store,
    activeToolId: state.activeToolId,
    activeDocument: workspace.activeDocument,
    textDefaults: workspace.textDefaults,
    textDraft: workspace.textDraft,
    translate,
    hexColor: precision.hexColor,
  })
  const contextSchema = createContextSchema({
    store,
    activeToolId: state.activeToolId,
    activeDocument: workspace.activeDocument,
    cropPreset: workspace.cropPreset,
    markerShape: workspace.markerShape,
    textDraft: workspace.textDraft,
    drawingDefaults: workspace.drawingDefaults,
    toolConfigure: workspace.toolConfigure,
    translate,
    precisionText: precision.precisionText,
    hexColor: precision.hexColor,
    selectedPrecisionLayer: precision.selectedPrecisionLayer,
    precisionToolSchema: precision.precisionToolSchema,
    buildTextContextSchema: text.buildTextContextSchema,
    isDrawingTool: drawing.isDrawingTool,
    selectedDrawingLayer: drawing.selectedDrawingLayer,
    drawingControl: drawing.drawingControl,
  })
  return { state, tools, precision, drawing, text, contextSchema }
}

function createEffects(
  context: WorkspaceBindingsContext,
  schemas: ReturnType<typeof createSchemas>,
) {
  const { props, store, workspace } = context
  const precision = createPrecisionEffects({
    props,
    activeDocument: workspace.activeDocument,
    precisionDefaults: workspace.precisionDefaults,
    selectedPrecisionLayer: schemas.precision.selectedPrecisionLayer,
  })
  const text = createTextEffects({
    props,
    store,
    activeDocument: workspace.activeDocument,
    textDefaults: workspace.textDefaults,
    textFormatting: workspace.textFormatting,
    textDraft: workspace.textDraft,
  })
  const drawing = createDrawingEffects({
    props,
    activeToolId: schemas.state.activeToolId,
    configureDefaultsTool: workspace.configureDefaultsTool,
    drawingDefaults: workspace.drawingDefaults,
    drawingPreferences: workspace.drawingPreferences,
    isDrawingTool: schemas.drawing.isDrawingTool,
    selectedDrawingLayer: schemas.drawing.selectedDrawingLayer,
    savePreferences: context.saveDrawingPreferences,
  })
  const image = createImageEffects({
    props,
    selectedLayerId: schemas.state.selectedLayerId,
    activeDocument: workspace.activeDocument,
  })
  const contextEffects = createContextEffects({
    activeToolId: schemas.state.activeToolId,
    cropPreset: workspace.cropPreset,
    markerShape: workspace.markerShape,
    canvas: workspace.canvasViewport,
    applyTextChange: text.applyV7TextChange,
    applyCalloutChange: text.applyCalloutStrokeChange,
    applyPrecisionChange: precision.applyPrecisionChange,
    applyImageChange: image.applyImageChange,
    applyDrawingChange: drawing.applyDrawingChange,
  })
  return { precision, contextEffects }
}

function createControllers(
  context: WorkspaceBindingsContext,
  schemas: ReturnType<typeof createSchemas>,
  effects: ReturnType<typeof createEffects>,
) {
  const { props, store, workspace, translate } = context
  const actions = createContextActions({
    props,
    canvas: workspace.canvasViewport,
    cropPreset: workspace.cropPreset,
    activeDocument: workspace.activeDocument,
    textureImages: workspace.textureImages,
    drawingDefaults: workspace.drawingDefaults,
    drawingPreferences: workspace.drawingPreferences,
    selectedDrawingLayer: schemas.drawing.selectedDrawingLayer,
    saveDrawingPreferences: context.saveDrawingPreferences,
  })
  const toolUi = createToolUiController({
    props,
    store,
    locale: schemas.state.locale,
    drawingPreferences: workspace.drawingPreferences,
    samplingControl: workspace.samplingControl,
    eyedropperFeedback: workspace.eyedropperFeedback,
    eyedropperColor: workspace.eyedropperColor,
    toolError: workspace.toolError,
    toolConfigure: workspace.toolConfigure,
    toolConfigureLayout: workspace.toolConfigureLayout,
    configureDefaultsTool: workspace.configureDefaultsTool,
    precisionChangeBlocked: effects.precision.precisionChangeBlocked,
    onContextChange: effects.contextEffects.onContextChange,
    translate,
    saveDrawingPreferences: context.saveDrawingPreferences,
  })
  const layers = createLayerController({
    props,
    activeDocument: workspace.activeDocument,
    store,
  })
  const content = createContentController({
    props,
    activeDocument: workspace.activeDocument,
    contentImageImporting: workspace.contentImageImporting,
    textureImages: workspace.textureImages,
    textDefaults: workspace.textDefaults,
    selectedLayerId: schemas.state.selectedLayerId,
  })
  return { actions, toolUi, layers, content }
}

export function createWorkspaceBindings(context: WorkspaceBindingsContext) {
  const schemas = createSchemas(context)
  const effects = createEffects(context, schemas)
  const controllers = createControllers(context, schemas, effects)
  return {
    tools: schemas.tools,
    floatingTextToolbarSchema: schemas.text.floatingTextToolbarSchema,
    contextSchema: schemas.contextSchema.contextSchema,
    floatingArrowToolbarSchema:
      schemas.contextSchema.floatingArrowToolbarSchema,
    toolConfigureArrowSchema: schemas.contextSchema.toolConfigureArrowSchema,
    onContextChange: effects.contextEffects.onContextChange,
    ...controllers.actions,
    ...controllers.toolUi,
    ...controllers.layers,
    ...controllers.content,
  }
}
