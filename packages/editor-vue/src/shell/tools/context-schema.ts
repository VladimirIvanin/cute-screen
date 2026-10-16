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
type PrecisionLayer = Extract<LayerNode, {
  readonly kind: PrecisionTool
}>
function highlighterProjection(schemas: readonly (ContextToolbarSchema | undefined)[]): Pick<ContextToolbarSchema, 'highlighter'> {
  const highlighter = schemas[0]?.highlighter
  return highlighter && schemas.every((schema) => Boolean(schema?.highlighter)) ? {
    highlighter,
  } : {}
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
  readonly toolConfigure: Ref<{
    readonly toolId: string
    readonly anchor: HTMLElement
  } | undefined>
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
  if (context.store.selectedLayerIds.length !== 1)
    return undefined
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
          {
            value: 'free', label: context.precisionText('Free', 'Свободно'),
          },
          {
            value: '1:1', label: '1:1',
          },
          {
            value: '4:3', label: '4:3',
          },
          {
            value: '16:9', label: '16:9',
          },
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
function imageSchema(
  context: ContextSchemaContext,
  layer: Extract<LayerNode, {
    readonly kind: 'image'
  }>,
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
        value: context.hexColor(border?.color ?? {
          red: 0, green: 0, blue: 0, alpha: 1,
        }),
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
function schemaForLayer(
  context: ContextSchemaContext,
  layer: LayerNode,
): ContextToolbarSchema | undefined {
  if (['censor', 'spotlight', 'ruler', 'loupe'].includes(layer.kind))
    return context.precisionToolSchema(layer.kind as PrecisionTool, layer as PrecisionLayer)
  const text = context.buildTextContextSchema(layer, 'select')
  if (text) return text
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
  if (!first || !schemas.every((schema) => schema?.shape))
    return {}
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
function toolSettingsProjection(
  schemas: readonly (ContextToolbarSchema | undefined)[],
  count: number,
): Pick<ContextToolbarSchema, 'toolSettings'> {
  const first = schemas[0]?.toolSettings
  if (!first || !schemas.every((schema) => schema?.toolSettings?.kind === first.kind)) return {}
  return { toolSettings: count === 1 ? first : { kind: first.kind } }
}

function selectionHeading(
  context: ContextSchemaContext,
  layers: readonly LayerNode[],
  first: ContextToolbarSchema,
): Pick<ContextToolbarSchema, 'icon' | 'hint' | 'title'> {
  const homogeneous = layers.every((layer) => layer.kind === layers[0]?.kind)
  return {
    icon: homogeneous ? first.icon : 'select',
    hint: homogeneous ? first.hint : context.precisionText('Common selection properties', 'Общие свойства выделения'),
    title: layers.length > 1 ? `${layers.length} ${context.precisionText('objects', 'объекта')}` : first.title,
  }
}

function markerSelectionProjection(
  text: NonNullable<ContextToolbarSchema['text']>,
  schemas: readonly (ContextToolbarSchema | undefined)[],
  count: number,
): NonNullable<ContextToolbarSchema['text']> {
  if (text.marker && schemas.every((schema) => Boolean(schema?.text?.marker))) {
    text = { ...text, marker: { ...text.marker,
      mode: count > 1 ? 'multiple' : text.marker.mode,
      shape: schemas.every((schema) => schema?.text?.marker?.shape === text?.marker?.shape)
        ? text.marker.shape : null,
      badgeColor: schemas.every((schema) => schema?.text?.marker?.badgeColor === text?.marker?.badgeColor)
        ? text.marker.badgeColor : null,
    } }
  } else if (text.marker) {
    const { marker: _marker, ...plain } = text
    void _marker
    text = { ...plain, kind: 'text' }
  }
  return text
}

function selectionSchemaFor(context: ContextSchemaContext): ContextToolbarSchema | undefined {
  if (
    context.activeToolId.value !== 'select' ||
    context.textDraft.value ||
    context.toolConfigure.value
  )
    return undefined
  const layers = context.activeDocument.value?.layers.filter(
    (layer) => context.store.selectedLayerIds.includes(layer.id),
  ) ?? []
  const schemas = layers.map((layer) => schemaForLayer(context, layer))
  const first = schemas[0]
  if (!first)
    return undefined
  const disabled = Boolean(context.readOnly?.value) || layers.some((layer) => layer.locked)
  const controls = first.controls
    .filter((control) => layers.length === 1 || control.id !== 'spotlightShape')
    .filter((control) => schemas.every(
      (schema) => schema?.controls.some((other) => other.id === control.id && other.kind === control.kind),
    ))
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
    controls.push({
      kind: 'range', id: 'width', label: context.precisionText('Width', 'Толщина'), value: typeof common.width === 'number' ? common.width : 1, min: 1, max: layers.some((layer) => layer.kind === 'ruler') ? 12 : 24, step: 1, disabled, mixed: common.width === null,
    })
  }
  let text = first.text ? {
    ...first.text,
  } : undefined
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
        Object.assign(text, {
          [key]: null,
        })
    }
    text = markerSelectionProjection(text, schemas, layers.length)
    if (disabled)
      text = {
        ...text,
        disabledReason: context.precisionText('Unlock the entire selection to edit', 'Разблокируйте всё выделение для редактирования'),
      }
  } else
    text = undefined
  return {
    disabled,
    ...toolSettingsProjection(schemas, layers.length),
    ...highlighterProjection(schemas),
    ...shapeProjection(schemas),
    ...(disabled
      ? {
          disabledReason: context.precisionText('Unlock the selection or open an editable document', 'Разблокируйте выделение или откройте редактируемый документ'),
        } : {}),
    ...selectionHeading(context, layers, first),
    controls,
    ...(text ? {
      text,
    } : {}),
  }
}

export function createContextSchema(context: ContextSchemaContext) {
  const floatingArrowToolbarSchema = computed(() => {
    if ((context.activeToolId.value ?? 'select') !== 'select')
      return undefined
    const layer = selectedLayer(context)
    if (layer?.kind !== 'arrow')
      return undefined
    const schema = context.drawingControl('arrow', layer.payload)
    return {
      controls: schema.controls, title: schema.title,
    }
  })
  const selectionSchema = computed(() => selectionSchemaFor(context))
  const toolConfigureSchema = computed(() => {
    const tool = context.toolConfigure.value?.toolId
    if (!tool)
      return undefined
    if (tool === 'arrow')
      return context.drawingControl('arrow', context.drawingDefaults.value.arrow, true)
    if (context.isDrawingTool(tool))
      return context.drawingControl(tool, context.drawingDefaults.value[tool], true)
    if (['censor', 'spotlight', 'ruler', 'loupe'].includes(tool))
      return context.precisionToolSchema(tool as PrecisionTool)
    if (tool === 'crop')
      return cropSchema(context)
    const text = context.buildTextContextSchema(undefined, tool, true)
    return text
  })
  return {
    contextSchema: computed(() => (!context.toolConfigure.value && context.activeToolId.value === 'crop' ? cropSchema(context) : undefined)),
    floatingArrowToolbarSchema,
    selectionSchema,
    toolConfigureSchema,
    toolConfigureArrowSchema: computed(() => context.toolConfigure.value?.toolId === 'arrow' ? toolConfigureSchema.value : undefined),
  }
}
