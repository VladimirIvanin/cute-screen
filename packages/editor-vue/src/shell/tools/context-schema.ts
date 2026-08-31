import { computed, type Ref } from 'vue'
import type {
  CropPreset,
  DrawingDefaults,
  EditorDocumentV1,
  JsonObject,
  LayerNode,
} from '@cute-screen/editor-renderer'
import type { ContextToolbarSchema } from '../types'
import type { TextDraft } from './text-schema'
import type { DrawingLayerNode } from './drawing-schema'
import type { PrecisionTool } from './precision-schema'

type DrawingTool = 'arrow' | 'shape' | 'pencil' | 'marker'
type PrecisionLayer = Extract<LayerNode, { readonly kind: PrecisionTool }>

export interface ContextSchemaContext {
  readonly store: {
    readonly selectedLayerIds: readonly string[]
    readonly selectedLayerId: string | undefined
  }
  readonly activeToolId: Ref<string | undefined>
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly cropPreset: Ref<CropPreset>
  readonly markerShape: Ref<'circle' | 'square' | 'diamond' | 'star'>
  readonly textDraft: Ref<TextDraft | undefined>
  readonly drawingDefaults: Ref<DrawingDefaults>
  readonly toolConfigure: Ref<
    { readonly toolId: string; readonly anchor: HTMLElement } | undefined
  >
  readonly translate: (key: Parameters<typeof import('../i18n').t>[1]) => string
  readonly precisionText: (english: string, russian: string) => string
  readonly hexColor: (value: unknown) => string
  readonly selectedPrecisionLayer: () => PrecisionLayer | undefined
  readonly precisionToolSchema: (
    tool: PrecisionTool,
    selected?: PrecisionLayer,
  ) => ContextToolbarSchema
  readonly buildTextContextSchema: (
    selected: LayerNode | undefined,
    tool: string,
  ) => ContextToolbarSchema | undefined
  readonly isDrawingTool: (value: string | undefined) => value is DrawingTool
  readonly selectedDrawingLayer: () => DrawingLayerNode | undefined
  readonly drawingControl: (
    tool: DrawingTool,
    values?: JsonObject,
  ) => ContextToolbarSchema
}

function selectedLayer(context: ContextSchemaContext): LayerNode | undefined {
  if (context.store.selectedLayerIds.length !== 1) return undefined
  return context.activeDocument.value?.layers.find(
    (layer) => layer.id === context.store.selectedLayerId,
  )
}

function cropSchema(context: ContextSchemaContext): ContextToolbarSchema {
  return {
    icon: 'crop',
    title: context.translate('toolCrop'),
    hint: context.precisionText(
      'Enter applies · Escape cancels',
      'Enter применяет · Escape отменяет',
    ),
    controls: [
      {
        kind: 'select',
        id: 'cropPreset',
        label: context.precisionText('Preset', 'Пропорции'),
        value: context.cropPreset.value,
        options: [
          { value: 'free', label: context.precisionText('Free', 'Свободно') },
          { value: '1:1', label: '1:1' },
          { value: '4:3', label: '4:3' },
          { value: '16:9', label: '16:9' },
          {
            value: 'original',
            label: context.precisionText('Original', 'Оригинал'),
          },
        ],
      },
      {
        kind: 'action',
        id: 'cropReset',
        label: context.precisionText('Reset', 'Сбросить'),
      },
      {
        kind: 'action',
        id: 'cropApply',
        label: context.precisionText('Apply', 'Применить'),
      },
      {
        kind: 'action',
        id: 'cropCancel',
        label: context.translate('cancel'),
      },
    ],
  }
}

function numberedMarkerSchema(
  context: ContextSchemaContext,
): ContextToolbarSchema {
  return {
    icon: 'plus',
    title: context.translate('toolNumberedMarker'),
    hint: context.translate('canvasViewport'),
    controls: [
      {
        kind: 'select',
        id: 'markerShape',
        label: 'Shape',
        value: context.markerShape.value,
        options: ['circle', 'square', 'diamond', 'star'].map((shape) => ({
          value: shape,
          label: shape,
        })),
      },
    ],
  }
}

function imageSchema(
  context: ContextSchemaContext,
  layer: Extract<LayerNode, { readonly kind: 'image' }>,
): ContextToolbarSchema {
  const border = layer.payload.border
  return {
    icon: 'image',
    title: 'Image',
    hint: context.translate('canvasViewport'),
    controls: [
      {
        kind: 'range',
        id: 'imageRadius',
        label: 'Radius',
        value: layer.payload.radius ?? 0,
        min: 0,
        max: Math.min(
          128,
          (layer.localBounds?.width ?? 0) / 2,
          (layer.localBounds?.height ?? 0) / 2,
        ),
        step: 1,
      },
      {
        kind: 'color',
        id: 'imageBorderColor',
        label: 'Border',
        value: context.hexColor(
          border?.color ?? { red: 0, green: 0, blue: 0, alpha: 1 },
        ),
        disabled: layer.locked,
        eyedropper: Boolean(context.activeDocument.value) && !layer.locked,
      },
      {
        kind: 'range',
        id: 'imageBorderWidth',
        label: 'Border width',
        value: border?.width ?? 0,
        min: 0,
        max: 16,
        step: 1,
      },
      {
        kind: 'range',
        id: 'imageOpacity',
        label: 'Opacity',
        value: layer.opacity,
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
  }
}

function documentSchema(
  context: ContextSchemaContext,
): ContextToolbarSchema | undefined {
  if (!context.activeDocument.value) return undefined
  return {
    icon: 'select',
    title: context.translate('canvasActions'),
    hint: context.translate('canvasViewport'),
    controls: [
      {
        kind: 'action',
        id: 'flipHorizontal',
        label: context.translate('flipHorizontal'),
      },
      {
        kind: 'action',
        id: 'flipVertical',
        label: context.translate('flipVertical'),
      },
    ],
  }
}

function precisionSchema(
  context: ContextSchemaContext,
  tool: string,
): ContextToolbarSchema | undefined {
  const selected = context.selectedPrecisionLayer()
  const precisionTool =
    tool === 'censor' ||
    tool === 'spotlight' ||
    tool === 'ruler' ||
    tool === 'loupe'
      ? tool
      : tool === 'select'
        ? selected?.kind
        : undefined
  return precisionTool
    ? context.precisionToolSchema(precisionTool, selected)
    : undefined
}

function drawingSchema(
  context: ContextSchemaContext,
  tool: string,
): ContextToolbarSchema | undefined {
  if (context.isDrawingTool(tool)) {
    if (tool === 'arrow') return undefined
    const selected = context.selectedDrawingLayer()
    return context.drawingControl(
      tool,
      selected?.kind === tool
        ? selected.payload
        : context.drawingDefaults.value[tool],
    )
  }
  const selected =
    tool === 'select' ? context.selectedDrawingLayer() : undefined
  if (!selected || !context.isDrawingTool(selected.kind)) return undefined
  return selected.kind === 'arrow'
    ? undefined
    : context.drawingControl(selected.kind, selected.payload)
}

function contextSchemaFor(
  context: ContextSchemaContext,
): ContextToolbarSchema | undefined {
  const tool = context.activeToolId.value ?? 'select'
  if (tool === 'crop') return cropSchema(context)
  const precision = precisionSchema(context, tool)
  if (precision) return precision
  const selected = selectedLayer(context)
  const text = context.buildTextContextSchema(selected, tool)
  if (text) {
    return context.textDraft.value
      ? {
          icon: text.icon,
          title: text.title,
          hint: text.hint,
          controls: text.controls,
        }
      : text
  }
  if (tool === 'numberedMarker') return numberedMarkerSchema(context)
  const drawing = drawingSchema(context, tool)
  if (drawing) return drawing
  if (
    tool === 'select' &&
    selected?.kind === 'image' &&
    selected.payload.role === 'content'
  ) {
    return imageSchema(context, selected)
  }
  return documentSchema(context)
}

export function createContextSchema(context: ContextSchemaContext) {
  const floatingArrowToolbarSchema = computed(() => {
    if ((context.activeToolId.value ?? 'select') !== 'select') return undefined
    const layer = selectedLayer(context)
    if (layer?.kind !== 'arrow') return undefined
    const schema = context.drawingControl('arrow', layer.payload)
    return { controls: schema.controls, title: schema.title }
  })
  const toolConfigureArrowSchema = computed(() => {
    if (context.toolConfigure.value?.toolId !== 'arrow') return undefined
    const schema = context.drawingControl(
      'arrow',
      context.drawingDefaults.value.arrow,
    )
    return { controls: schema.controls, title: schema.title }
  })
  return {
    contextSchema: computed(() => contextSchemaFor(context)),
    floatingArrowToolbarSchema,
    toolConfigureArrowSchema,
  }
}
