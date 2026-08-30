import type { Ref } from 'vue'
import type {
  DrawingDefaults,
  EditorDocumentV1,
  JsonObject,
  LayerNode,
} from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../contracts'
import type { ContextToolbarSchema } from '../types'

type DrawingTool = 'arrow' | 'shape' | 'pencil' | 'marker'
export type DrawingLayerNode = Extract<
  LayerNode,
  { readonly kind: DrawingTool }
>

export interface DrawingSchemaContext {
  readonly props: ResolvedEditorShellProps
  readonly store: {
    readonly selectedLayerIds: readonly string[]
    readonly selectedLayerId: string | undefined
  }
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly drawingDefaults: Ref<DrawingDefaults>
  readonly translate: (key: Parameters<typeof import('../i18n').t>[1]) => string
  readonly hexColor: (value: unknown) => string
}

interface DrawingValues {
  readonly values: JsonObject
  readonly selected: DrawingLayerNode | undefined
  readonly colorDisabled: boolean
  readonly stroke: Record<string, unknown> | undefined
  readonly color: unknown
  readonly width: unknown
}

export function isDrawingTool(value: string | undefined): value is DrawingTool {
  return (
    value === 'arrow' ||
    value === 'shape' ||
    value === 'pencil' ||
    value === 'marker'
  )
}

function selectedDrawingLayer(
  context: DrawingSchemaContext,
): DrawingLayerNode | undefined {
  if (context.store.selectedLayerIds.length !== 1) return undefined
  const layer = context.activeDocument.value?.layers.find(
    (candidate) => candidate.id === context.store.selectedLayerId,
  )
  return layer && isDrawingTool(layer.kind)
    ? (layer as DrawingLayerNode)
    : undefined
}

function resolveValues(
  context: DrawingSchemaContext,
  tool: DrawingTool,
  values: JsonObject,
): DrawingValues {
  const selected = selectedDrawingLayer(context)
  const stroke = values.stroke as Record<string, unknown> | undefined
  return {
    values,
    selected,
    colorDisabled:
      context.props.readOnlyDocument ||
      (selected?.kind === tool && selected.locked),
    stroke,
    color: tool === 'arrow' || tool === 'shape' ? stroke?.color : values.color,
    width: tool === 'arrow' || tool === 'shape' ? stroke?.width : values.width,
  }
}

function arrowSchema(
  context: DrawingSchemaContext,
  state: DrawingValues,
): ContextToolbarSchema {
  const { activeDocument, hexColor, translate } = context
  const { color, colorDisabled, stroke, values, width } = state
  const capOptions = [
    ['none', 'arrowNone'],
    ['lineArrow', 'arrowLine'],
    ['solidArrow', 'arrowSolidArrow'],
    ['triangle', 'arrowTriangle'],
    ['circle', 'arrowCircle'],
    ['diamond', 'arrowDiamond'],
  ].map(([value, key]) => ({
    value: value as
      'none' | 'lineArrow' | 'solidArrow' | 'triangle' | 'circle' | 'diamond',
    label: translate(key as Parameters<typeof translate>[0]),
  }))
  return {
    icon: 'arrow',
    title: translate('toolArrow'),
    hint: translate('arrowHint'),
    controls: [
      {
        kind: 'color',
        id: 'color',
        label: translate('color'),
        value: hexColor(color),
        compact: true,
        disabled: colorDisabled,
        eyedropper: Boolean(activeDocument.value) && !colorDisabled,
      },
      {
        kind: 'arrowStroke',
        id: 'stroke',
        label: translate('arrowStroke'),
        width: typeof width === 'number' ? width : 3,
        style:
          stroke?.style === 'solid' || stroke?.style === 'dotted'
            ? stroke.style
            : 'dashed',
        disabled: colorDisabled,
        solidLabel: translate('arrowSolid'),
        dashedLabel: translate('arrowDashed'),
        dottedLabel: translate('arrowDotted'),
      },
      {
        kind: 'arrowCap',
        id: 'startCap',
        label: translate('arrowTail'),
        value: (typeof values.startCap === 'string'
          ? values.startCap
          : 'none') as (typeof capOptions)[number]['value'],
        disabled: colorDisabled,
        options: capOptions,
      },
      {
        kind: 'arrowPath',
        id: 'arrowPath',
        label: translate('arrowGeometry'),
        value:
          values.path === 'quadratic' || values.path === 'elbow'
            ? values.path
            : 'straight',
        disabled: colorDisabled,
        options: [
          { value: 'straight', label: translate('arrowStraight') },
          { value: 'elbow', label: translate('arrowElbow') },
          { value: 'quadratic', label: translate('arrowQuadratic') },
        ],
      },
      {
        kind: 'arrowCap',
        id: 'endCap',
        label: translate('arrowHead'),
        value: (typeof values.endCap === 'string'
          ? values.endCap
          : 'solidArrow') as (typeof capOptions)[number]['value'],
        disabled: colorDisabled,
        options: capOptions,
      },
    ],
  }
}

function baseControls(
  context: DrawingSchemaContext,
  tool: Exclude<DrawingTool, 'arrow'>,
  state: DrawingValues,
): ContextToolbarSchema['controls'] {
  const selected = state.selected?.kind === tool ? state.selected : undefined
  return [
    {
      kind: 'color',
      id: 'color',
      label: context.translate('color'),
      value: context.hexColor(state.color),
      disabled: state.colorDisabled,
      eyedropper: Boolean(context.activeDocument.value) && !state.colorDisabled,
    },
    {
      kind: 'range',
      id: 'width',
      label: context.translate('width'),
      value: typeof state.width === 'number' ? state.width : 3,
      min: 1,
      max: tool === 'marker' ? 96 : 48,
      step: 1,
    },
    {
      kind: 'range',
      id: 'layerOpacity',
      label: 'Opacity',
      value:
        selected !== undefined
          ? selected.opacity * 100
          : typeof state.values.layerOpacity === 'number'
            ? state.values.layerOpacity * 100
            : tool === 'marker'
              ? 35
              : 100,
      min: 0,
      max: 100,
      step: 1,
    },
    {
      kind: 'select',
      id: 'blendMode',
      label: 'Blend',
      value:
        selected?.blendMode ??
        (typeof state.values.blendMode === 'string'
          ? state.values.blendMode
          : tool === 'marker'
            ? 'multiply'
            : 'normal'),
      options: [
        'normal',
        'multiply',
        'screen',
        'overlay',
        'darken',
        'lighten',
        'softLight',
        'hardLight',
      ].map((value) => ({ value, label: value })),
    },
  ]
}

function shapeControls(state: DrawingValues): ContextToolbarSchema['controls'] {
  const values = state.values
  const fill =
    values.fill && typeof values.fill === 'object'
      ? (values.fill as Record<string, unknown>)
      : undefined
  const selectedFill =
    state.selected?.kind === 'shape'
      ? (state.selected.payload.fill as Record<string, unknown>)
      : undefined
  const controls: ContextToolbarSchema['controls'] = [
    {
      kind: 'select',
      id: 'shapeKind',
      label: 'Shape',
      value: typeof values.shape === 'string' ? values.shape : 'rectangle',
      options: ['rectangle', 'circle', 'oval', 'diamond', 'star'].map(
        (value) => ({
          value,
          label: value,
        }),
      ),
    },
    {
      kind: 'range',
      id: 'cornerRadius',
      label: 'Radius',
      value: typeof values.cornerRadius === 'number' ? values.cornerRadius : 0,
      min: 0,
      max: 200,
      step: 1,
    },
    {
      kind: 'range',
      id: 'starPoints',
      label: 'Star points',
      value: typeof values.starPoints === 'number' ? values.starPoints : 5,
      min: 3,
      max: 32,
      step: 1,
    },
    {
      kind: 'range',
      id: 'starInnerRatio',
      label: 'Star inner',
      value:
        typeof values.starInnerRatio === 'number'
          ? values.starInnerRatio
          : 0.45,
      min: 0.1,
      max: 0.9,
      step: 0.01,
    },
    {
      kind: 'select',
      id: 'fillKind',
      label: 'Fill',
      value: typeof fill?.kind === 'string' ? fill.kind : 'none',
      options: [
        { value: 'none', label: 'None' },
        { value: 'solid', label: 'Solid' },
        { value: 'linearGradient', label: 'Linear gradient' },
        { value: 'radialGradient', label: 'Radial gradient' },
      ],
    },
    {
      kind: 'range',
      id: 'fillOpacity',
      label: 'Fill opacity',
      value: typeof fill?.opacity === 'number' ? fill.opacity * 100 : 100,
      min: 0,
      max: 100,
      step: 1,
    },
    { kind: 'action', id: 'importTexture', label: 'Import texture' },
  ]
  if (selectedFill?.kind === 'imageTexture') {
    return [
      ...controls,
      { kind: 'action', id: 'removeTexture', label: 'Remove texture' },
    ]
  }
  return controls
}

function specializedControls(
  tool: Exclude<DrawingTool, 'arrow'>,
  values: JsonObject,
): ContextToolbarSchema['controls'] {
  if (tool === 'pencil') {
    return [
      {
        kind: 'select',
        id: 'brush',
        label: 'Brush',
        value: typeof values.brush === 'string' ? values.brush : 'pen',
        options: ['pen', 'pencil', 'brush'].map((value) => ({
          value,
          label: value,
        })),
      },
    ]
  }
  if (tool !== 'marker') return []
  return [
    {
      kind: 'select',
      id: 'markerMode',
      label: 'Mode',
      value: values.mode === 'darken' ? 'darken' : 'highlight',
      options: [
        { value: 'highlight', label: 'Highlight' },
        { value: 'darken', label: 'Darken' },
      ],
    },
  ]
}

function standardSchema(
  context: DrawingSchemaContext,
  tool: Exclude<DrawingTool, 'arrow'>,
  state: DrawingValues,
): ContextToolbarSchema {
  return {
    icon: tool === 'shape' ? 'shape' : tool,
    title: context.translate(
      tool === 'shape'
        ? 'toolShape'
        : tool === 'pencil'
          ? 'toolPencil'
          : 'toolMarker',
    ),
    hint: context.translate('canvasViewport'),
    controls: [
      ...baseControls(context, tool, state),
      ...(tool === 'shape' ? shapeControls(state) : []),
      ...specializedControls(tool, state.values),
    ],
  }
}

function drawingControl(
  context: DrawingSchemaContext,
  tool: DrawingTool,
  values = context.drawingDefaults.value[tool],
): ContextToolbarSchema {
  const state = resolveValues(context, tool, values)
  return tool === 'arrow'
    ? arrowSchema(context, state)
    : standardSchema(context, tool, state)
}

export function createDrawingSchema(context: DrawingSchemaContext) {
  return {
    drawingControl: (tool: DrawingTool, values?: JsonObject) =>
      drawingControl(context, tool, values),
    isDrawingTool,
    selectedDrawingLayer: () => selectedDrawingLayer(context),
  }
}
