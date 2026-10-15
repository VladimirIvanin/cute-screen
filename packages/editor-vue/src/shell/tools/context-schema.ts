import { commonLayerStyle } from '@cute-screen/editor-renderer'
import {
  computed,
  type Ref,
} from 'vue'
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

function highlighterProjection(schemas: readonly (ContextToolbarSchema | undefined)[]): Pick<ContextToolbarSchema, 'highlighter'> {
  const highlighter = schemas[0]?.highlighter
  return highlighter && schemas.every((schema) => Boolean(schema?.highlighter)) ? { highlighter } : {}
}

export interface ContextSchemaContext {
  readonly readOnly?: Ref<boolean>
  readonly quickMode: Ref<boolean>
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
  readonly toolConfigure: Ref<{ readonly toolId: string; readonly anchor: HTMLElement } | undefined>
  readonly translate: (key: Parameters<typeof import('../i18n').t>[1]) => string
  readonly precisionText: (english: string, russian: string) => string
  readonly hexColor: (value: unknown) => string
  readonly selectedPrecisionLayer: () => PrecisionLayer | undefined
  readonly precisionToolSchema: (tool: PrecisionTool, selected?: PrecisionLayer) => ContextToolbarSchema
  readonly buildTextContextSchema: (
    selected: LayerNode | undefined,
    tool: string,
    defaultsOnly?: boolean,
  ) => ContextToolbarSchema | undefined
  readonly isDrawingTool: (value: string | undefined) => value is DrawingTool
  readonly selectedDrawingLayer: () => DrawingLayerNode | undefined
  readonly drawingControl: (tool: DrawingTool, values?: JsonObject, defaultsOnly?: boolean) => ContextToolbarSchema
}

function selectedLayer(context: ContextSchemaContext): LayerNode | undefined {
  if (context.store.selectedLayerIds.length !== 1) return undefined
  return context.activeDocument.value?.layers.find((layer) => layer.id === context.store.selectedLayerId)
}

function cropSchema(context: ContextSchemaContext): ContextToolbarSchema {
  return {
    icon: 'crop',
    title: context.translate('toolCrop'),
    hint: context.precisionText('Enter applies · Escape cancels', 'Enter применяет · Escape отменяет'),
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

function numberedMarkerSchema(context: ContextSchemaContext): ContextToolbarSchema {
  return {
    icon: 'numberedMarker',
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
        max: Math.min(128, (layer.localBounds?.width ?? 0) / 2, (layer.localBounds?.height ?? 0) / 2),
        step: 1,
      },
      {
        kind: 'color',
        id: 'imageBorderColor',
        label: 'Border',
        value: context.hexColor(border?.color ?? { red: 0, green: 0, blue: 0, alpha: 1 }),
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

function documentSchema(context: ContextSchemaContext): ContextToolbarSchema | undefined {
  if (context.quickMode.value || !context.activeDocument.value) return undefined
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
  const selected = tool === 'select' ? context.selectedPrecisionLayer() : undefined
  const precisionTool =
    tool === 'censor' || tool === 'spotlight' || tool === 'ruler' || tool === 'loupe'
      ? tool
      : tool === 'select'
        ? selected?.kind
        : undefined
  return precisionTool ? context.precisionToolSchema(precisionTool, selected) : undefined
}

function drawingSchema(
  context: ContextSchemaContext,
  tool: string,
): ContextToolbarSchema | undefined {
  if (context.isDrawingTool(tool)) {
    if (tool === 'arrow') return undefined
    return context.drawingControl(tool, context.drawingDefaults.value[tool], true)
  }
  const selected = tool === 'select' ? context.selectedDrawingLayer() : undefined
  if (!selected || !context.isDrawingTool(selected.kind)) return undefined
  return selected.kind === 'arrow' ? undefined : context.drawingControl(selected.kind, selected.payload)
}

function contextSchemaFor(context: ContextSchemaContext): ContextToolbarSchema | undefined {
  const tool = context.activeToolId.value ?? 'select'
  if (tool === 'crop') return cropSchema(context)
  if (tool === 'select') return context.store.selectedLayerIds.length ? undefined : documentSchema(context)
  const precision = precisionSchema(context, tool)
  if (precision) return precision
  const selected = tool === 'select' ? selectedLayer(context) : undefined
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

function schemaForLayer(
  context: ContextSchemaContext,
  layer: LayerNode,
): ContextToolbarSchema | undefined {
  if (['censor', 'spotlight', 'ruler', 'loupe'].includes(layer.kind))
    return context.precisionToolSchema(layer.kind as PrecisionTool, layer as PrecisionLayer)
  const text = context.buildTextContextSchema(layer, 'select')
  if (text)
    return layer.kind === 'numberedMarker'
      ? {
          ...text,
          controls: [
            {
              kind: 'select' as const,
              id: 'markerShape',
              label: context.precisionText('Shape', 'Форма'),
              value: layer.payload.badge.shape,
              options: ['circle', 'square', 'diamond', 'star'].map((value) => ({ value, label: value })),
            },
          ],
        }
      : text
  if (context.isDrawingTool(layer.kind))
    return context.drawingControl(layer.kind, {
      ...layer.payload,
      layerOpacity: 'opacity' in layer ? layer.opacity : 1,
      blendMode: 'blendMode' in layer ? layer.blendMode : 'normal',
    })
  return layer.kind === 'image' ? imageSchema(context, layer) : undefined
}

function shapeProjection(schemas: readonly (ContextToolbarSchema | undefined)[]): Pick<ContextToolbarSchema, 'shape'> {
  const first = schemas[0]?.shape
  if (!first || !schemas.every((schema) => schema?.shape)) return {}
  return {
    shape: {
      fill: schemas.every((schema) => JSON.stringify(schema?.shape?.fill) === JSON.stringify(first.fill))
        ? first.fill
        : null,
      fillSupported: schemas.every((schema) => schema?.shape?.fillSupported !== false),
      fillColorEditable: schemas.every((schema) => schema?.shape?.fillColorEditable),
      fillOpacityEditable: schemas.every((schema) => schema?.shape?.fillOpacityEditable),
    },
  }
}

export function createContextSchema(context: ContextSchemaContext) {
  const floatingArrowToolbarSchema = computed(() => {
    if ((context.activeToolId.value ?? 'select') !== 'select') return undefined
    const layer = selectedLayer(context)
    if (layer?.kind !== 'arrow') return undefined
    const schema = context.drawingControl('arrow', layer.payload)
    return { controls: schema.controls, title: schema.title }
  })
  const selectionSchema = computed(() => {
    if (
      context.activeToolId.value !== 'select' ||
      context.textDraft.value ||
      context.toolConfigure.value
    )
      return undefined
    const layers =
      context.activeDocument.value?.layers.filter((layer) => context.store.selectedLayerIds.includes(layer.id)) ?? []
    const schemas = layers.map((layer) => schemaForLayer(context, layer))
    const first = schemas[0]
    if (!first) return undefined
    const disabled = Boolean(context.readOnly?.value) || layers.some((layer) => layer.locked)
    const controls = first.controls
      .filter((control) =>
        schemas.every((schema) =>
          schema?.controls.some((other) => other.id === control.id && other.kind === control.kind)))
      .map((control) => {
        const mixed = schemas.some(
          (schema) =>
            JSON.stringify(schema?.controls.find((other) => other.id === control.id)) !== JSON.stringify(control),
        )
        return {
          ...control,
          disabled: disabled || Boolean(control.disabled),
          mixed,
        }
      })
    const common = commonLayerStyle(layers)
    if ('width' in common && !controls.some((control) => ['width', 'stroke'].includes(control.id))) {
      controls.push({ kind: 'range', id: 'width', label: context.precisionText('Width', 'Толщина'), value: typeof common.width === 'number' ? common.width : 1, min: 1, max: layers.some((layer) => layer.kind === 'ruler') ? 12 : 24, step: 1, disabled, mixed: common.width === null })
    }
    let text = first.text ? { ...first.text } : undefined
    if (text && schemas.every((schema) => Boolean(schema?.text))) {
      for (const key of [
        'color',
        'fontFamily',
        'fontSize',
        'bold',
        'italic',
        'strikethrough',
        'listKind',
        'alignment',
      ] as const) {
        if (schemas.some((schema) => JSON.stringify(schema?.text?.[key]) !== JSON.stringify(text?.[key])))
          Object.assign(text, { [key]: null })
      }
      if (disabled)
        text = {
          ...text,
          disabledReason: context.precisionText(
            'Unlock the entire selection to edit',
            'Разблокируйте всё выделение для редактирования',
          ),
        }
    } else text = undefined
    return {
      disabled,
      ...highlighterProjection(schemas),
      ...shapeProjection(schemas),
      ...(disabled
        ? {
            disabledReason: context.precisionText(
              'Unlock the selection or open an editable document',
              'Разблокируйте выделение или откройте редактируемый документ',
            ),
          }
        : {}),
      icon: first.icon,
      hint: first.hint,
      title: layers.length > 1 ? `${layers.length} ${context.precisionText('objects', 'объекта')}` : first.title,
      controls,
      ...(text ? { text } : {}),
    }
  })
  const toolConfigureSchema = computed(() => {
    const tool = context.toolConfigure.value?.toolId
    if (!tool) return undefined
    if (tool === 'arrow') return context.drawingControl('arrow', context.drawingDefaults.value.arrow, true)
    if (context.isDrawingTool(tool)) return context.drawingControl(tool, context.drawingDefaults.value[tool], true)
    if (['censor', 'spotlight', 'ruler', 'loupe'].includes(tool))
      return context.precisionToolSchema(tool as PrecisionTool)
    if (tool === 'crop') return cropSchema(context)
    const text = context.buildTextContextSchema(undefined, tool, true)
    return tool === 'numberedMarker' && text ? { ...text, controls: numberedMarkerSchema(context).controls } : text
  })
  return {
    contextSchema: computed(() => (context.toolConfigure.value ? undefined : contextSchemaFor(context))),
    floatingArrowToolbarSchema,
    selectionSchema,
    toolConfigureSchema,
    toolConfigureArrowSchema: computed(() =>
      context.toolConfigure.value?.toolId === 'arrow' ? toolConfigureSchema.value : undefined),
  }
}
