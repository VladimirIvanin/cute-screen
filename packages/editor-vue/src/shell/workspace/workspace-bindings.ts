import { measuredNumberedMarkerLayer } from '@cute-screen/editor-renderer'
import {
  changeNumberedMarkerSetting,
  markerColorChange,
  markerShapeCommand,
} from './numbered-marker-settings'
import { computed } from 'vue'
import {
  applyLayerStyle,
  extractLayerStyle,
  styleCommand,
  type JsonObject,
  type EditorCommand,
  type LayerNode,
} from '@cute-screen/editor-renderer'
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
  readonly rememberTextDefaults: (layer: LayerNode) => void
  readonly props: ResolvedEditorShellProps
  readonly store: ShellStore
  readonly workspace: WorkspaceState
  readonly translate: Translate
  readonly saveDrawingPreferences: (value: DrawingToolPreferencesV2) => void
}

function createSchemas(context: WorkspaceBindingsContext) {
  const { props, store, workspace, translate } = context
  const state = storeToRefs(store)
  const hasInteractiveDocument = computed(() => props.documentSession !== undefined || props.fixture === 'ready')
  const { tools } = createToolCatalog({
    quickMode: props.quickMode,
    readOnlyDocument: props.readOnlyDocument,
    contentImageBridgeAvailable: Boolean(props.contentImageBridge),
    contentImageImporting: workspace.contentImageImporting,
    hasInteractiveDocument,
    hasCanvas: computed(() => Boolean(workspace.activeDocument.value)),
  })
  const precision = createPrecisionSchema({
    spotlightEditing: workspace.spotlightEditing,
    props,
    state,
    store,
    activeDocument: workspace.activeDocument,
    precisionDefaults: workspace.precisionDefaults,
    translate,
  })
  const drawing = createDrawingSchema({
    highlighterAnalysis: workspace.highlighterAnalysis,
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
    calloutStroke: workspace.calloutStroke,
    markerShape: workspace.markerShape,
    markerNextOverride: workspace.markerNextOverride,
    recentColors: computed(() => workspace.drawingPreferences.value.recentColors),
    textDraft: workspace.textDraft,
    translate,
    hexColor: precision.hexColor,
  })
  const contextSchema = createContextSchema({
    quickMode: computed(() => props.quickMode),
    readOnly: computed(() => props.readOnlyDocument),
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

function isSelectionStyleTarget(
  context: WorkspaceBindingsContext,
  layers: readonly LayerNode[],
): boolean {
  return !context.workspace.configureDefaultsTool.value && !context.workspace.textDraft.value && context.store.activeToolId === 'select' && layers.length > 0
}
function createSettingsTarget(context: WorkspaceBindingsContext) {
  const { props, store, workspace } = context
  let captured: EditorCommand[] | undefined
  const settingsStore = {
    get selectedLayerIds() {
      if (
        workspace.configureDefaultsTool.value ||
        (!workspace.settingsLayerId.value &&
          store.activeToolId !== 'select')
      )
        return []
      return workspace.settingsLayerId.value ? [workspace.settingsLayerId.value] : store.selectedLayerIds
    },
    get selectedLayerId() {
      return this.selectedLayerIds[0]
    },
  }
  const settingsTool = computed(
    () => workspace.configureDefaultsTool.value ?? (workspace.settingsLayerId.value ? 'select' : store.activeToolId),
  )
  const selected = () =>
    workspace.activeDocument.value?.layers.find((layer) => layer.id === settingsStore.selectedLayerId)
  const effectProps = new Proxy(props, {
    get(
      target,
      key,
    ) {
      const value = Reflect.get(target, key)
      if (key !== 'documentSession' || !value) return value
      return new Proxy(value, {
        get(
          session,
          property,
        ) {
          if (property === 'execute')
            return (command: EditorCommand) => (captured ? captured.push(command) : session.execute(command))
          const member = Reflect.get(session, property, session)
          return typeof member === 'function' ? member.bind(session) : member
        },
      })
    },
  })
  return { settingsStore, settingsTool, selected, effectProps, capture: (commands: EditorCommand[]) => {
    captured = commands
  }, release: () => {
    captured = undefined
  } }
}

function createEffects(
  context: WorkspaceBindingsContext,
  schemas: ReturnType<typeof createSchemas>,
) {
  const { store, workspace } = context
  const target = createSettingsTarget(context)
  const { settingsStore, settingsTool, selected, effectProps } = target
  const precision = createPrecisionEffects({
    apertureId: () => workspace.spotlightEditing.value?.apertureId,
    props: effectProps,
    activeDocument: workspace.activeDocument,
    precisionDefaults: workspace.precisionDefaults,
    selectedPrecisionLayer: () => {
      const layer = selected()
      return layer && ['censor', 'spotlight', 'ruler', 'loupe'].includes(layer.kind)
        ? (layer as ReturnType<typeof schemas.precision.selectedPrecisionLayer>)
        : undefined
    },
  })
  const text = createTextEffects({
    props: effectProps,
    store: settingsStore,
    activeDocument: workspace.activeDocument,
    textDefaults: workspace.textDefaults,
    calloutStroke: workspace.calloutStroke,
    configuringCallout: () =>
      workspace.configureDefaultsTool.value === 'callout' ||
      (!workspace.settingsLayerId.value && store.activeToolId === 'callout'),
    textFormatting: workspace.textFormatting,
    textDraft: computed(() => (workspace.configureDefaultsTool.value ? undefined : workspace.textDraft.value)),
  })
  const drawing = createDrawingEffects({
    highlighterAnalysis: workspace.highlighterAnalysis,
    props: effectProps,
    activeToolId: settingsTool,
    configureDefaultsTool: workspace.configureDefaultsTool,
    drawingDefaults: workspace.drawingDefaults,
    drawingPreferences: workspace.drawingPreferences,
    isDrawingTool: schemas.drawing.isDrawingTool,
    selectedDrawingLayer: () => {
      const layer = selected()
      return layer && schemas.drawing.isDrawingTool(layer.kind)
        ? (layer as ReturnType<typeof schemas.drawing.selectedDrawingLayer>)
        : undefined
    },
    savePreferences: context.saveDrawingPreferences,
  })
  const image = createImageEffects({
    props: effectProps,
    selectedLayerId: computed(() => settingsStore.selectedLayerId),
    activeDocument: workspace.activeDocument,
  })
  const contextEffects = createContextEffects({
    activeToolId: settingsTool,
    cropPreset: workspace.cropPreset,
    markerShape: workspace.markerShape,
    canvas: workspace.canvasViewport,
    applyTextChange: text.applyV7TextChange,
    applyCalloutChange: text.applyCalloutStrokeChange,
    applyPrecisionChange: precision.applyPrecisionChange,
    applyImageChange: image.applyImageChange,
    applyDrawingChange: drawing.applyDrawingChange,
  })
  function numericCommands(
    id: string,
    value: string,
  ): EditorCommand[] {
    const layers =
      workspace.activeDocument.value?.layers.filter((layer) => store.selectedLayerIds.includes(layer.id)) ?? []
    if (context.props.readOnlyDocument || layers.some((layer) => layer.locked)) return []
    const resolve = (key: string): EditorCommand | undefined => {
      const textCommand = text.resolveChange(key, value)
      if (textCommand) return textCommand
      const effects = [
        drawing.resolveChange(key, value),
        precision.resolveChange(key, value),
        image.resolveChange(key, value),
      ]
      for (const effect of effects) {
        if (effect.kind === 'command') return effect.command
      }
      return undefined
    }
    if (!isSelectionStyleTarget(context, layers)) {
      const command = resolve(id)
      return command ? [command] : []
    }
    const commands: EditorCommand[] = []
    try {
      for (const layer of layers) {
        workspace.settingsLayerId.value = layer.id
        const command = resolve(id === 'width' && layer.kind === 'ruler' ? 'rulerThickness' : id)
        if (command) commands.push(command)
      }
    } finally {
      workspace.settingsLayerId.value = undefined
    }
    return commands
  }
  return {
    precision,
    numericCommands,
    previewInline: text.previewInline,
    contextEffects: createSelectionSettingsChange(context, contextEffects, target),
  }
}

function createSelectionSettingsChange(
  context: WorkspaceBindingsContext,
  contextEffects: { onContextChange(id: string, value: string): void },
  target: ReturnType<typeof createSettingsTarget>,
) {
  const { props, store, workspace } = context
  const { capture, release } = target
  function onContextChange(
    id: string,
    value: string,
  ): void {
    const colour = markerColorChange(context, id, value)
    id = colour.id
    value = colour.value
    if (changeNumberedMarkerSetting(props, workspace, store, id, value)) return
    const layers =
      workspace.activeDocument.value?.layers.filter((layer) => store.selectedLayerIds.includes(layer.id)) ?? []
    if (!isSelectionStyleTarget(context, layers)) {
      const tool = workspace.configureDefaultsTool.value ?? store.activeToolId
      if (
        !workspace.textDraft.value &&
        tool &&
        tool !== 'select' &&
        workspace.rememberedStyles.value[tool as LayerNode['kind']]
      ) workspace.rememberedStyles.value = { ...workspace.rememberedStyles.value, [tool]: {} }
      contextEffects.onContextChange(id, value)
      return
    }
    if (props.readOnlyDocument || layers.some((layer) => layer.locked)) return
    const textBefore = workspace.textDefaults.value
    const commands: EditorCommand[] = []
    capture(commands)
    try {
      for (const layer of layers) {
        workspace.settingsLayerId.value = layer.id
        const markerCommand = markerShapeCommand(layer, id, value)
        if (markerCommand) commands.push(markerCommand)
        else contextEffects.onContextChange(id === 'width' && layer.kind === 'ruler' ? 'rulerThickness' : id, value)
      }
    } finally {
      workspace.settingsLayerId.value = undefined
      release()
      workspace.textDefaults.value = textBefore
    }
    const changed = commands.filter(
      (command) => command.type !== 'updateLayer' || JSON.stringify(command.before) !== JSON.stringify(command.after),
    )
    if (!changed.length) return
    props.documentSession?.execute(changed.length === 1 ? changed[0]! : { type: 'batch', commands: changed })
    if (layers.every((layer) => layer.kind === layers[0]!.kind)) {
      workspace.configureDefaultsTool.value = layers[0]!.kind
      try {
        contextEffects.onContextChange(id, value)
      } finally {
        workspace.configureDefaultsTool.value = undefined
      }
      const command = changed.find((entry) => entry.type === 'updateLayer')
      if (command?.type === 'updateLayer') {
        const before = extractLayerStyle(command.before)
        const after = extractLayerStyle(command.after)
        const patch = Object.fromEntries(
          Object.entries(after).filter(([key, entry]) => JSON.stringify(entry) !== JSON.stringify(before[key])),
        )
        workspace.rememberedStyles.value = {
          ...workspace.rememberedStyles.value,
          [command.after.kind]: {
            ...workspace.rememberedStyles.value[command.after.kind],
            ...patch,
          },
        }
      }
    }
  }
  return { onContextChange }
}

function applyTextureFill(
  context: WorkspaceBindingsContext,
  fill: JsonObject,
): void {
  const { props, store, workspace } = context
  if (props.readOnlyDocument) return
  const document = workspace.activeDocument.value
  const selection = store.activeToolId === 'select' && !workspace.toolConfigure.value
    ? document?.layers.filter((layer) => store.selectedLayerIds.includes(layer.id)) ?? []
    : []
  if (selection.some((layer) => layer.kind !== 'shape' || layer.locked)) return
  if (selection.length) {
    const command = styleCommand(selection, { fill }, document?.canvas)
    if (!command) return
    props.documentSession?.execute(command)
  }
  workspace.rememberedStyles.value = {
    ...workspace.rememberedStyles.value,
    shape: { ...workspace.rememberedStyles.value.shape, fill },
  }
  workspace.drawingDefaults.value = {
    ...workspace.drawingDefaults.value,
    shape: { ...workspace.drawingDefaults.value.shape, fill },
  }
}

function createControllers(
  context: WorkspaceBindingsContext,
  schemas: ReturnType<typeof createSchemas>,
  effects: ReturnType<typeof createEffects>,
) {
  const { props, store, workspace, translate } = context
  const actions = createContextActions({
    spotlightEditing: workspace.spotlightEditing,
    selectedLayerId: () => store.selectedLayerIds.length === 1 ? store.selectedLayerId : undefined,
    locale: () => schemas.state.locale.value,
    reportFeedback: (message) => {
      workspace.eyedropperFeedback.value = message
    },
    props,
    canvas: workspace.canvasViewport,
    cropPreset: workspace.cropPreset,
    activeDocument: workspace.activeDocument,
    textureImages: workspace.textureImages,
    applyTextureFill: (fill) => applyTextureFill(context, fill),
    reportResourceError: (message) => {
      workspace.toolError.value = message
    },
  })
  const finishTextEditing = (continuation: () => void) => {
    if (workspace.canvasViewport.value) workspace.canvasViewport.value.finishTextEditing(continuation)
    else continuation()
  }
  const toolUi = createToolUiController({
    finishTextEditing,
    props,
    store,
    activeToolId: schemas.state.activeToolId,
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
    onContextChange: (id, value) => id === 'markerSample' ? toolUi.startEyedropper(value) : effects.contextEffects.onContextChange(id, value),
    translate,
    saveDrawingPreferences: context.saveDrawingPreferences,
  })
  const layers = createLayerController({
    finishTextEditing,
    props,
    activeDocument: workspace.activeDocument,
    store,
    prepareLayer: (layer) => {
      // Modern ink freezes every setting, including pressure source, at pointerdown.
      if (layer.kind === 'numberedMarker') return measuredNumberedMarkerLayer(layer)
      if (layer.kind === 'pencil' && layer.payload.strokeVersion === 2) return layer
      const style = workspace.rememberedStyles.value[layer.kind]
      if (style && layer.kind === 'marker') {
        // The gesture already resolved Auto for this source. A remembered resolved
        // blend from another screenshot must never replace that frozen decision.
        const { blendMode: _blend, highlighterMode: _mode, ...appearance } = style
        void _blend
        void _mode
        return applyLayerStyle(layer, appearance, workspace.activeDocument.value?.canvas)
      }
      return style && !['text', 'callout'].includes(layer.kind)
        ? applyLayerStyle(layer, style, workspace.activeDocument.value?.canvas)
        : layer
    },
  })
  const content = createContentController({
    error: workspace.toolError,
    props,
    activeDocument: workspace.activeDocument,
    contentImageImporting: workspace.contentImageImporting,
    textureImages: workspace.textureImages,
    textDefaults: workspace.textDefaults,
    selectedLayerId: schemas.state.selectedLayerId,
    addLayer: layers.addLayer,
    rememberTextDefaults: context.rememberTextDefaults,
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
    selectionSchema: schemas.contextSchema.selectionSchema,
    creationSchema: schemas.contextSchema.creationSchema,
    toolConfigureSchema: schemas.contextSchema.toolConfigureSchema,
    floatingArrowToolbarSchema: schemas.contextSchema.floatingArrowToolbarSchema,
    toolConfigureArrowSchema: schemas.contextSchema.toolConfigureArrowSchema,
    onContextChange: (id: string, value: string) => id === 'markerSample' ? controllers.toolUi.startEyedropper(value) : effects.contextEffects.onContextChange(id, value),
    numericCommands: effects.numericCommands,
    previewInline: effects.previewInline,
    ...controllers.actions,
    ...controllers.toolUi,
    ...controllers.layers,
    ...controllers.content,
  }
}
