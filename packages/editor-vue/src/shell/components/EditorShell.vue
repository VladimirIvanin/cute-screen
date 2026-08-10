<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'

import { t } from '../i18n'
import {
  createBrowserDrawingToolPreferencesStorage,
  createBrowserPreferencesStorage,
} from '../preferences'
import { useEditorShellStore, type ShellStoreOptions } from '../store'
import type { CaptureProgressState } from '../../platform'
import type {
  CanvasViewportHosts,
  FrameSummary,
  ShellDocumentState,
  ShellActionAdapter,
  ToolDescriptor,
} from '../types'
import type {
  DocumentSessionController,
  DocumentSessionSnapshot,
} from '../../document-session'
import {
  TextureResourceResolver,
  type TextureFillBridge,
} from '../../texture-fill'
import {
  createFlipCanvasCommand,
  defaultDrawingToolPreferences,
  DEFAULT_DRAWING_DEFAULTS,
  rememberDrawingColor,
  type DrawingDefaults,
  type EditorDocumentV1,
  type ImageLayer,
  type JsonObject,
  type LayerNode,
  type Transform2D,
} from '@cute-screen/editor-renderer'
import ActionFeedback from './ActionFeedback.vue'
import CanvasViewport from './CanvasViewport.vue'
import ContextToolbar from './ContextToolbar.vue'
import LayersPanel from './LayersPanel.vue'
import SeriesFilmstrip from './SeriesFilmstrip.vue'
import ToolRail from './ToolRail.vue'
import TopBar from './TopBar.vue'
import ZoomControls from './ZoomControls.vue'

type DrawingLayerNode = Extract<
  LayerNode,
  { readonly kind: 'arrow' | 'shape' | 'pencil' | 'marker' }
>

const props = withDefaults(
  defineProps<{
    actions?: ShellActionAdapter | undefined
    documentSession?: DocumentSessionController | undefined
    fixture?: 'empty' | 'error' | 'loading' | 'ready'
    initialDocumentState?: ShellDocumentState | undefined
    readOnlyDocument?: boolean
    captureAvailable?: boolean
    captureUnavailableReason?: string | undefined
    captureFallbackCommand?: string | undefined
    captureProgress?: CaptureProgressState | undefined
    frames?: readonly FrameSummary[] | undefined
    sourceImage?: HTMLImageElement | undefined
    textureBridge?: TextureFillBridge | undefined
  }>(),
  {
    actions: undefined,
    documentSession: undefined,
    fixture: 'empty',
    initialDocumentState: undefined,
    readOnlyDocument: false,
    captureAvailable: true,
    captureUnavailableReason: undefined,
    captureFallbackCommand: undefined,
    captureProgress: undefined,
    frames: undefined,
    sourceImage: undefined,
    textureBridge: undefined,
  },
)
const emit = defineEmits<{
  hostsReady: [hosts: CanvasViewportHosts]
  retryLoad: []
}>()
const store = useEditorShellStore()
const state = storeToRefs(store)
const fallbackCopied = ref(false)
const drawingDefaults = ref<DrawingDefaults>(
  structuredClone(DEFAULT_DRAWING_DEFAULTS),
)
let drawingPreferences = defaultDrawingToolPreferences()
let textureResolver: TextureResourceResolver | undefined
const textureImages = ref<ReadonlyMap<string, HTMLImageElement>>(new Map())
const activeDocument = ref<EditorDocumentV1>()
const baseImageLayer = computed(() =>
  activeDocument.value?.layers.find(
    (layer): layer is ImageLayer =>
      layer.kind === 'image' && layer.payload.role === 'base',
  ),
)
const translate = (key: Parameters<typeof t>[1]) => t(state.locale.value, key)
const hasInteractiveDocument = computed(
  () => props.documentSession !== undefined || props.fixture === 'ready',
)
const tools = computed<readonly ToolDescriptor[]>(() => [
  {
    id: 'select',
    group: 'canvas',
    icon: 'select',
    labelKey: 'toolSelect',
    shortcut: 'V',
    disabled: !hasInteractiveDocument.value,
  },
  {
    id: 'hand',
    group: 'canvas',
    icon: 'hand',
    labelKey: 'toolHand',
    shortcut: 'H',
    disabled: !hasInteractiveDocument.value,
  },
  {
    id: 'crop',
    group: 'canvas',
    icon: 'crop',
    labelKey: 'toolCrop',
    shortcut: 'C',
    disabled: true,
  },
  {
    id: 'arrow',
    group: 'annotate',
    icon: 'arrow',
    labelKey: 'toolArrow',
    shortcut: 'A',
    disabled: !hasInteractiveDocument.value,
  },
  {
    id: 'shape',
    group: 'annotate',
    icon: 'shape',
    labelKey: 'toolShape',
    shortcut: 'S',
    disabled: !hasInteractiveDocument.value,
  },
  {
    id: 'pencil',
    group: 'annotate',
    icon: 'pencil',
    labelKey: 'toolPencil',
    shortcut: 'P',
    disabled: !hasInteractiveDocument.value,
  },
  {
    id: 'marker',
    group: 'annotate',
    icon: 'marker',
    labelKey: 'toolMarker',
    shortcut: 'M',
    disabled: !hasInteractiveDocument.value,
  },
  {
    id: 'text',
    group: 'annotate',
    icon: 'text',
    labelKey: 'toolText',
    shortcut: 'T',
    disabled: true,
  },
  {
    id: 'privacy',
    group: 'more',
    icon: 'privacy',
    labelKey: 'toolPrivacy',
    disabled: true,
  },
  {
    id: 'spotlight',
    group: 'more',
    icon: 'spotlight',
    labelKey: 'toolSpotlight',
    disabled: true,
  },
])
function hexColor(value: unknown): string {
  if (!value || typeof value !== 'object') return '#e5484d'
  const color = value as Record<string, unknown>
  const channel = (name: string) =>
    typeof color[name] === 'number'
      ? Math.round(Math.max(0, Math.min(1, color[name] as number)) * 255)
      : 0
  return `#${[channel('red'), channel('green'), channel('blue')]
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('')}`
}
function isDrawingTool(
  value: string | undefined,
): value is 'arrow' | 'shape' | 'pencil' | 'marker' {
  return (
    value === 'arrow' ||
    value === 'shape' ||
    value === 'pencil' ||
    value === 'marker'
  )
}
function selectedDrawingLayer(): DrawingLayerNode | undefined {
  if (store.selectedLayerIds.length !== 1) return undefined
  const layer = activeDocument.value?.layers.find(
    (candidate) => candidate.id === store.selectedLayerId,
  )
  return layer && isDrawingTool(layer.kind)
    ? (layer as DrawingLayerNode)
    : undefined
}
function drawingControl(
  tool: 'arrow' | 'shape' | 'pencil' | 'marker',
  values: JsonObject = drawingDefaults.value[tool],
) {
  const stroke = values.stroke as Record<string, unknown> | undefined
  const color =
    tool === 'arrow' || tool === 'shape' ? stroke?.color : values.color
  const width =
    tool === 'arrow' || tool === 'shape' ? stroke?.width : values.width
  const shapeFill =
    tool === 'shape' && values.fill && typeof values.fill === 'object'
      ? (values.fill as Record<string, unknown>)
      : undefined
  const shapeFillKind =
    typeof shapeFill?.kind === 'string' ? shapeFill.kind : 'none'
  return {
    icon:
      tool === 'shape'
        ? ('shape' as const)
        : (tool as 'arrow' | 'pencil' | 'marker'),
    title: translate(
      tool === 'arrow'
        ? 'toolArrow'
        : tool === 'shape'
          ? 'toolShape'
          : tool === 'pencil'
            ? 'toolPencil'
            : 'toolMarker',
    ),
    hint:
      tool === 'arrow' ? translate('arrowHint') : translate('canvasViewport'),
    controls: [
      {
        kind: 'color' as const,
        id: 'color',
        label: translate('color'),
        value: hexColor(color),
      },
      {
        kind: 'range' as const,
        id: 'width',
        label: translate('width'),
        value: typeof width === 'number' ? width : 3,
        min: 1,
        max: tool === 'marker' ? 96 : 48,
        step: 1,
      },
      {
        kind: 'range' as const,
        id: 'layerOpacity',
        label: 'Opacity',
        value:
          selectedDrawingLayer()?.kind === tool
            ? selectedDrawingLayer()!.opacity * 100
            : typeof values.layerOpacity === 'number'
              ? values.layerOpacity * 100
              : tool === 'marker'
                ? 35
                : 100,
        min: 0,
        max: 100,
        step: 1,
      },
      {
        kind: 'select' as const,
        id: 'blendMode',
        label: 'Blend',
        value:
          selectedDrawingLayer()?.kind === tool
            ? (selectedDrawingLayer()!.blendMode ?? 'normal')
            : typeof values.blendMode === 'string'
              ? values.blendMode
              : tool === 'marker'
                ? 'multiply'
                : 'normal',
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
      ...(tool === 'arrow'
        ? [
            {
              kind: 'select' as const,
              id: 'arrowPath',
              label: 'Path',
              value: values.path === 'quadratic' ? 'quadratic' : 'straight',
              options: [
                { value: 'straight', label: 'Straight' },
                { value: 'quadratic', label: 'Curved' },
              ],
            },
            {
              kind: 'select' as const,
              id: 'startCap',
              label: 'Start cap',
              value:
                typeof values.startCap === 'string' ? values.startCap : 'none',
              options: ['none', 'chevron', 'triangle', 'circle'].map(
                (value) => ({ value, label: value }),
              ),
            },
            {
              kind: 'select' as const,
              id: 'endCap',
              label: 'End cap',
              value:
                typeof values.endCap === 'string' ? values.endCap : 'triangle',
              options: ['none', 'chevron', 'triangle', 'circle'].map(
                (value) => ({ value, label: value }),
              ),
            },
          ]
        : []),
      ...(tool === 'shape'
        ? [
            {
              kind: 'select' as const,
              id: 'shapeKind',
              label: 'Shape',
              value:
                typeof values.shape === 'string' ? values.shape : 'rectangle',
              options: ['rectangle', 'circle', 'oval', 'diamond', 'star'].map(
                (value) => ({ value, label: value }),
              ),
            },
            {
              kind: 'range' as const,
              id: 'cornerRadius',
              label: 'Radius',
              value:
                typeof values.cornerRadius === 'number'
                  ? values.cornerRadius
                  : 0,
              min: 0,
              max: 200,
              step: 1,
            },
            {
              kind: 'range' as const,
              id: 'starPoints',
              label: 'Star points',
              value:
                typeof values.starPoints === 'number' ? values.starPoints : 5,
              min: 3,
              max: 32,
              step: 1,
            },
            {
              kind: 'range' as const,
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
              kind: 'select' as const,
              id: 'fillKind',
              label: 'Fill',
              value: shapeFillKind,
              options: [
                { value: 'none', label: 'None' },
                { value: 'solid', label: 'Solid' },
                { value: 'linearGradient', label: 'Linear gradient' },
                { value: 'radialGradient', label: 'Radial gradient' },
              ],
            },
            {
              kind: 'range' as const,
              id: 'fillOpacity',
              label: 'Fill opacity',
              value:
                values.fill &&
                typeof values.fill === 'object' &&
                typeof (values.fill as Record<string, unknown>).opacity ===
                  'number'
                  ? ((values.fill as Record<string, unknown>)
                      .opacity as number) * 100
                  : 100,
              min: 0,
              max: 100,
              step: 1,
            },
            {
              kind: 'action' as const,
              id: 'importTexture',
              label: 'Import texture',
            },
            ...(selectedDrawingLayer()?.kind === 'shape' &&
            (selectedDrawingLayer()!.payload.fill as Record<string, unknown>)
              ?.kind === 'imageTexture'
              ? [
                  {
                    kind: 'action' as const,
                    id: 'removeTexture',
                    label: 'Remove texture',
                  },
                ]
              : []),
          ]
        : []),
      ...(tool === 'pencil'
        ? [
            {
              kind: 'select' as const,
              id: 'brush',
              label: 'Brush',
              value: typeof values.brush === 'string' ? values.brush : 'pen',
              options: ['pen', 'pencil', 'brush'].map((value) => ({
                value,
                label: value,
              })),
            },
          ]
        : []),
      ...(tool === 'marker'
        ? [
            {
              kind: 'select' as const,
              id: 'markerMode',
              label: 'Mode',
              value: values.mode === 'darken' ? 'darken' : 'highlight',
              options: [
                { value: 'highlight', label: 'Highlight' },
                { value: 'darken', label: 'Darken' },
              ],
            },
          ]
        : []),
    ],
  }
}
const contextSchema = computed(() => {
  const tool = state.activeToolId.value
  if (isDrawingTool(tool)) {
    return drawingControl(tool)
  }
  const selected = tool === 'select' ? selectedDrawingLayer() : undefined
  if (selected && isDrawingTool(selected.kind)) {
    return drawingControl(selected.kind, selected.payload)
  }
  return activeDocument.value
    ? {
        icon: 'select' as const,
        title: translate('canvasActions'),
        hint: translate('canvasViewport'),
        controls: [
          {
            kind: 'action' as const,
            id: 'flipHorizontal',
            label: translate('flipHorizontal'),
          },
          {
            kind: 'action' as const,
            id: 'flipVertical',
            label: translate('flipVertical'),
          },
        ],
      }
    : undefined
})
async function onContextAction(id: string): Promise<void> {
  if (id === 'importTexture') {
    if (!props.textureBridge) return
    textureResolver ??= new TextureResourceResolver({
      bridge: props.textureBridge,
      correlationId: () => crypto.randomUUID(),
    })
    const imported = await textureResolver.import()
    if (imported.kind !== 'imported') return
    const resource = textureResolver.get(imported.blobHash)
    if (resource?.kind === 'ready') {
      textureImages.value = new Map(textureImages.value).set(
        imported.blobHash,
        resource.image,
      )
    }
    const selected = selectedDrawingLayer()
    const target = selected?.kind === 'shape' ? selected : undefined
    const current = target ? target.payload : drawingDefaults.value.shape
    const payload: JsonObject = {
      ...current,
      fill: {
        kind: 'imageTexture',
        blobHash: imported.blobHash,
        format: imported.format,
        intrinsicWidth: imported.width,
        intrinsicHeight: imported.height,
        fit: 'fit',
        transform: { scale: 1, rotation: 0, offsetX: 0, offsetY: 0 },
        opacity: 1,
      },
    }
    if (target) {
      if (!props.documentSession || target.locked) return
      props.documentSession.execute({
        type: 'updateLayer',
        before: target,
        after: { ...target, payload },
      })
    } else {
      drawingDefaults.value = { ...drawingDefaults.value, shape: payload }
      drawingPreferences = {
        ...drawingPreferences,
        defaults: drawingDefaults.value,
      }
      createBrowserDrawingToolPreferencesStorage(browserStorage()).save(
        drawingPreferences,
      )
    }
    return
  }
  if (id === 'removeTexture') {
    const selected = selectedDrawingLayer()
    if (!selected || selected.kind !== 'shape' || !props.documentSession) return
    const fill = selected.payload.fill as Record<string, unknown> | undefined
    if (fill?.kind !== 'imageTexture') return
    textureResolver?.remove(String(fill.blobHash))
    const nextImages = new Map(textureImages.value)
    nextImages.delete(String(fill.blobHash))
    textureImages.value = nextImages
    props.documentSession.execute({
      type: 'updateLayer',
      before: selected,
      after: {
        ...selected,
        payload: { ...selected.payload, fill: { kind: 'none' } },
      },
    })
    return
  }
  const document = activeDocument.value
  if (!document || !props.documentSession) return
  if (id === 'flipHorizontal' || id === 'flipVertical') {
    props.documentSession.execute(
      createFlipCanvasCommand(
        document,
        id === 'flipHorizontal' ? 'horizontal' : 'vertical',
      ),
    )
  }
}
function onContextChange(id: string, value: string): void {
  const activeTool = state.activeToolId.value
  const selected = activeTool === 'select' ? selectedDrawingLayer() : undefined
  const tool = isDrawingTool(activeTool)
    ? activeTool
    : selected && isDrawingTool(selected.kind)
      ? selected.kind
      : undefined
  if (
    ![
      'color',
      'width',
      'cornerRadius',
      'starPoints',
      'starInnerRatio',
      'shapeKind',
      'arrowPath',
      'startCap',
      'endCap',
      'brush',
      'markerMode',
      'layerOpacity',
      'blendMode',
      'fillKind',
      'fillOpacity',
    ].includes(id) ||
    !tool
  )
    return
  const current = selected ? selected.payload : drawingDefaults.value[tool]
  let payload: JsonObject
  if (id === 'layerOpacity') {
    const opacity = Number(value) / 100
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) return
    payload = { ...current, layerOpacity: opacity }
  } else if (id === 'blendMode') {
    if (
      ![
        'normal',
        'multiply',
        'screen',
        'overlay',
        'darken',
        'lighten',
        'softLight',
        'hardLight',
      ].includes(value)
    )
      return
    payload = { ...current, blendMode: value }
  } else if (id === 'shapeKind') {
    if (
      tool !== 'shape' ||
      !['rectangle', 'circle', 'oval', 'diamond', 'star'].includes(value)
    )
      return
    payload = { ...current, shape: value }
  } else if (id === 'arrowPath') {
    if (tool !== 'arrow' || (value !== 'straight' && value !== 'quadratic'))
      return
    payload =
      value === 'quadratic'
        ? {
            ...current,
            path: value,
            ...(selected && current.bend === undefined
              ? {
                  bend: {
                    x: selected.localBounds
                      ? selected.localBounds.width / 2
                      : 0.5,
                    y: selected.localBounds ? 0 : 0,
                  },
                }
              : {}),
          }
        : { ...current, path: value }
  } else if (id === 'startCap' || id === 'endCap') {
    if (
      tool !== 'arrow' ||
      !['none', 'chevron', 'triangle', 'circle'].includes(value)
    )
      return
    payload = { ...current, [id]: value }
  } else if (id === 'brush') {
    if (tool !== 'pencil' || !['pen', 'pencil', 'brush'].includes(value)) return
    payload = { ...current, brush: value }
  } else if (id === 'markerMode') {
    if (tool !== 'marker' || (value !== 'highlight' && value !== 'darken'))
      return
    payload = { ...current, mode: value }
  } else if (id === 'fillKind') {
    if (
      tool !== 'shape' ||
      !['none', 'solid', 'linearGradient', 'radialGradient'].includes(value)
    )
      return
    const candidateStrokeColor = (
      current.stroke as Record<string, unknown> | undefined
    )?.color
    const strokeColor: JsonObject =
      candidateStrokeColor && typeof candidateStrokeColor === 'object'
        ? (candidateStrokeColor as JsonObject)
        : { red: 0.898, green: 0.282, blue: 0.302, alpha: 1 }
    payload = {
      ...current,
      fill:
        value === 'none'
          ? { kind: 'none' }
          : value === 'solid'
            ? { kind: 'solid', color: strokeColor, opacity: 1 }
            : value === 'linearGradient'
              ? {
                  kind: 'linearGradient',
                  start: { x: 0, y: 0 },
                  end: { x: 1, y: 1 },
                  opacity: 1,
                  stops: [
                    { position: 0, color: strokeColor },
                    {
                      position: 1,
                      color: { red: 1, green: 1, blue: 1, alpha: 0 },
                    },
                  ],
                }
              : {
                  kind: 'radialGradient',
                  center: { x: 0.5, y: 0.5 },
                  radius: 0.5,
                  opacity: 1,
                  stops: [
                    { position: 0, color: strokeColor },
                    {
                      position: 1,
                      color: { red: 1, green: 1, blue: 1, alpha: 0 },
                    },
                  ],
                },
    }
  } else if (id === 'fillOpacity') {
    if (tool !== 'shape') return
    const opacity = Number(value) / 100
    const fill = current.fill
    if (
      !Number.isFinite(opacity) ||
      opacity < 0 ||
      opacity > 1 ||
      !fill ||
      typeof fill !== 'object' ||
      (fill as Record<string, unknown>).kind === 'none'
    )
      return
    payload = {
      ...current,
      fill: { ...(fill as Record<string, unknown>), opacity },
    }
  } else if (
    id === 'width' ||
    id === 'cornerRadius' ||
    id === 'starPoints' ||
    id === 'starInnerRatio'
  ) {
    const width = Number(value)
    if (
      !Number.isFinite(width) ||
      (id === 'width' && width <= 0) ||
      (id === 'cornerRadius' && width < 0) ||
      (id === 'starPoints' &&
        (!Number.isInteger(width) || width < 3 || width > 32)) ||
      (id === 'starInnerRatio' && (width <= 0 || width >= 1))
    )
      return
    if (id === 'cornerRadius') {
      if (tool !== 'shape' || width < 0) return
      payload = { ...current, cornerRadius: width }
    } else if (id === 'starPoints' || id === 'starInnerRatio') {
      if (tool !== 'shape') return
      payload = { ...current, [id]: width }
    } else {
      payload =
        tool === 'arrow' || tool === 'shape'
          ? {
              ...current,
              stroke: { ...(current.stroke as Record<string, unknown>), width },
            }
          : { ...current, width }
    }
  } else {
    const match = /^#([0-9a-f]{6})$/iu.exec(value)
    if (!match) return
    const hex = match[1]!
    const color = {
      red: Number.parseInt(hex.slice(0, 2), 16) / 255,
      green: Number.parseInt(hex.slice(2, 4), 16) / 255,
      blue: Number.parseInt(hex.slice(4, 6), 16) / 255,
      alpha: 1,
    }
    payload =
      tool === 'arrow' || tool === 'shape'
        ? {
            ...current,
            stroke: { ...(current.stroke as Record<string, unknown>), color },
          }
        : { ...current, color }
  }
  if (selected) {
    if (!props.documentSession || selected.locked) return
    props.documentSession.execute({
      type: 'updateLayer',
      before: selected,
      after: {
        ...selected,
        ...(id === 'layerOpacity'
          ? { opacity: payload.layerOpacity as number }
          : {}),
        ...(id === 'blendMode'
          ? {
              blendMode:
                payload.blendMode as import('@cute-screen/editor-renderer').BlendMode,
            }
          : {}),
        ...(id === 'layerOpacity' || id === 'blendMode' ? {} : { payload }),
        ...(id === 'markerMode'
          ? {
              blendMode:
                value === 'darken'
                  ? ('darken' as const)
                  : ('multiply' as const),
            }
          : {}),
      },
    })
    return
  }
  drawingDefaults.value = { ...drawingDefaults.value, [tool]: payload }
  drawingPreferences = {
    ...drawingPreferences,
    defaults: drawingDefaults.value,
  }
  if (id === 'color') {
    const candidate =
      tool === 'arrow' || tool === 'shape'
        ? (payload.stroke as Record<string, unknown> | undefined)?.color
        : payload.color
    if (candidate && typeof candidate === 'object') {
      drawingPreferences = rememberDrawingColor(
        drawingPreferences,
        candidate as import('@cute-screen/editor-renderer').SrgbColor,
      )
    }
  }
  createBrowserDrawingToolPreferencesStorage(browserStorage()).save(
    drawingPreferences,
  )
}
function updateLayerProperty(
  id: string,
  property: 'visible' | 'locked' | 'opacity' | 'rotation',
  value?: number,
): void {
  const layer = activeDocument.value?.layers.find(
    (candidate) => candidate.id === id,
  )
  if (
    !layer ||
    !props.documentSession ||
    (layer.locked && property !== 'locked')
  )
    return
  props.documentSession.execute({
    type: 'updateLayer',
    before: layer,
    after:
      property === 'visible'
        ? { ...layer, visible: !layer.visible }
        : property === 'locked'
          ? { ...layer, locked: !layer.locked }
          : property === 'opacity'
            ? {
                ...layer,
                opacity: Math.max(0, Math.min(1, value ?? layer.opacity)),
              }
            : {
                ...layer,
                transform: {
                  ...layer.transform,
                  rotation: value ?? layer.transform.rotation,
                },
              },
  })
}
function reorderLayer(id: string, direction: 'up' | 'down'): void {
  const layers = activeDocument.value?.layers
  if (!layers || !props.documentSession) return
  const fromIndex = layers.findIndex((layer) => layer.id === id)
  const toIndex = fromIndex + (direction === 'up' ? 1 : -1)
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    toIndex >= layers.length ||
    layers[fromIndex]?.locked
  )
    return
  props.documentSession.execute({
    type: 'reorderLayer',
    layerId: id,
    fromIndex,
    toIndex,
  })
}
function onLayerOpacity(id: string, opacity: number): void {
  updateLayerProperty(id, 'opacity', opacity)
}
function onLayerRotation(id: string, rotation: number): void {
  updateLayerProperty(id, 'rotation', rotation)
}
function onLayerReorder(id: string, direction: 'up' | 'down'): void {
  reorderLayer(id, direction)
}
function onLayerReorderTo(id: string, targetId: string): void {
  const layers = activeDocument.value?.layers
  if (!layers || !props.documentSession) return
  const fromIndex = layers.findIndex((layer) => layer.id === id)
  const targetIndex = layers.findIndex((layer) => layer.id === targetId)
  if (
    fromIndex < 0 ||
    targetIndex < 0 ||
    layers[fromIndex]?.locked ||
    fromIndex === targetIndex
  )
    return
  props.documentSession.execute({
    type: 'reorderLayer',
    layerId: id,
    fromIndex,
    toIndex: targetIndex,
  })
}
function moveLayer(id: string, deltaX: number, deltaY: number): void {
  const selected = new Set(store.selectedLayerIds)
  const layers = activeDocument.value?.layers.filter((layer) =>
    selected.has(layer.id),
  )
  if (
    !layers?.length ||
    !props.documentSession ||
    !selected.has(id) ||
    layers.some((layer) => layer.locked)
  ) {
    return
  }
  const commands = layers.map((layer) => ({
    type: 'updateLayer' as const,
    before: layer,
    after: {
      ...layer,
      transform: {
        ...layer.transform,
        translateX: layer.transform.translateX + deltaX,
        translateY: layer.transform.translateY + deltaY,
      },
    },
  }))
  props.documentSession.execute(
    commands.length === 1 ? commands[0]! : { type: 'batch', commands },
  )
}
function selectLayer(id: string, toggle = false, range = false): void {
  store.selectLayer(id, toggle, range)
}
function transformLayer(id: string, transform: Transform2D): void {
  const layer = activeDocument.value?.layers.find(
    (candidate) => candidate.id === id,
  )
  if (
    !layer ||
    layer.kind === 'image' ||
    layer.locked ||
    !props.documentSession
  )
    return
  props.documentSession.execute({
    type: 'updateLayer',
    before: layer,
    after: { ...layer, transform },
  })
}
function updateLayerPayload(id: string, payload: JsonObject): void {
  const layer = activeDocument.value?.layers.find(
    (candidate) => candidate.id === id,
  )
  if (!layer || layer.locked || !props.documentSession) return
  props.documentSession.execute({
    type: 'updateLayer',
    before: layer,
    after: { ...layer, payload } as LayerNode,
  })
}
function addLayer(
  layer: import('@cute-screen/editor-renderer').LayerNode,
): void {
  if (!props.documentSession || props.readOnlyDocument) return
  props.documentSession.execute({ type: 'addLayer', layer })
}
const media: Pick<
  MediaQueryList,
  'matches' | 'addEventListener' | 'removeEventListener'
> =
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : {
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }
const onMediaChange = (event: MediaQueryListEvent) =>
  store.setSystemDark(event.matches)
function browserStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch (error) {
    void error
    return undefined
  }
}
const preferencesOptions: ShellStoreOptions = {
  ...(props.actions ? { actions: props.actions } : {}),
  languages:
    import.meta.env.VITE_TEST_HARNESS === 'true'
      ? (['en'] as const)
      : navigator.languages,
  preferences: createBrowserPreferencesStorage(
    browserStorage(),
    import.meta.env.VITE_TEST_HARNESS === 'true'
      ? (['en'] as const)
      : navigator.languages,
  ),
  systemDark: () => media.matches,
}

function loadFixture(): void {
  if (props.fixture === 'loading') {
    store.setDocumentState({ kind: 'loading' })
    return
  }
  if (props.fixture === 'error') {
    store.setDocumentState({
      kind: 'error',
      message: translate('readyLoadError'),
    })
    return
  }
  if (props.fixture === 'ready') {
    store.setFixture({
      document: {
        kind: 'ready',
        title: 'Landing-page redesign',
        dimensions: '1440 × 900',
      },
      activeToolId: 'arrow',
      selectedLayerId: 'arrow-1',
      layers: [
        {
          id: 'text-1',
          icon: 'text',
          name: 'CTA comment',
          visible: true,
          locked: false,
          opacity: 1,
          rotation: 0,
        },
        {
          id: 'arrow-1',
          icon: 'arrow',
          name: 'Arrow to button',
          visible: true,
          locked: false,
          opacity: 1,
          rotation: 0,
        },
        {
          id: 'marker-1',
          icon: 'marker',
          name: 'Title highlight',
          visible: true,
          locked: true,
          opacity: 1,
          rotation: 0,
        },
      ],
      frames: [
        { id: 'frame-1', label: '1', selected: true },
        { id: 'frame-2', label: '2', selected: false },
        { id: 'frame-3', label: '3', selected: false },
      ],
    })
    store.setLayersOpen(true)
    return
  }
  store.setFixture({ document: { kind: 'empty' } })
}

function onKeydown(event: KeyboardEvent): void {
  const target = event.target
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return
  }
  const modifier = event.metaKey || event.ctrlKey
  if (modifier && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redoDocument()
    else undoDocument()
    return
  }
  if (modifier && event.key.toLowerCase() === 'd' && store.selectedLayerId) {
    const source = activeDocument.value?.layers.find(
      (layer) => layer.id === store.selectedLayerId,
    )
    if (source && !source.locked) {
      event.preventDefault()
      props.documentSession?.execute({
        type: 'duplicateLayer',
        sourceId: source.id,
        layer: {
          ...source,
          id: crypto.randomUUID(),
          transform: {
            ...source.transform,
            translateX: source.transform.translateX + 10,
            translateY: source.transform.translateY + 10,
          },
        },
      })
    }
    return
  }
  if (
    modifier &&
    (event.key === '[' || event.key === ']') &&
    store.selectedLayerId
  ) {
    event.preventDefault()
    reorderLayer(store.selectedLayerId, event.key === ']' ? 'up' : 'down')
    return
  }
  const arrowDeltas: Record<string, readonly [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }
  const delta = arrowDeltas[event.key]
  if (delta && store.selectedLayerIds.length > 0) {
    const selected = new Set(store.selectedLayerIds)
    const layers = activeDocument.value?.layers.filter((layer) =>
      selected.has(layer.id),
    )
    if (layers?.length && !layers.some((layer) => layer.locked)) {
      event.preventDefault()
      const multiplier = event.shiftKey ? 10 : 1
      const commands = layers.map((layer) => ({
        type: 'updateLayer' as const,
        before: layer,
        after: {
          ...layer,
          transform: {
            ...layer.transform,
            translateX: layer.transform.translateX + delta[0] * multiplier,
            translateY: layer.transform.translateY + delta[1] * multiplier,
          },
        },
      }))
      props.documentSession?.execute(
        commands.length === 1 ? commands[0]! : { type: 'batch', commands },
      )
    }
    return
  }
  if (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    store.selectedLayerId
  ) {
    const layer = activeDocument.value?.layers.find(
      (candidate) => candidate.id === store.selectedLayerId,
    )
    if (layer && !layer.locked) {
      event.preventDefault()
      props.documentSession?.execute({
        type: 'removeLayer',
        layer,
        index: activeDocument.value?.layers.indexOf(layer) ?? -1,
      })
    }
    return
  }
  if (event.key === 'Escape') {
    store.clearFeedback()
    store.setLayersOpen(false)
    store.clearLayerSelection()
  }
}
function applyDocumentSnapshot(snapshot: DocumentSessionSnapshot): void {
  activeDocument.value = snapshot.core.document
  if (
    store.selectedLayerIds.some((id) => {
      const layer = snapshot.core.document.layers.find(
        (candidate) => candidate.id === id,
      )
      return !layer || !layer.visible || layer.locked
    })
  ) {
    store.clearLayerSelection()
  }
  store.setDocumentState({
    kind: 'ready',
    title: `Document ${snapshot.core.document.id.slice(0, 8)}`,
    dimensions: `${snapshot.core.document.canvas.width} × ${snapshot.core.document.canvas.height}`,
  })
  store.setDocumentHistory({
    canUndo: snapshot.core.canUndo,
    canRedo: snapshot.core.canRedo,
    saveState: snapshot.saveState,
    ...(snapshot.error ? { error: snapshot.error } : {}),
  })
  store.setLayers(
    [...snapshot.core.document.layers].reverse().map((layer) => ({
      id: layer.id,
      icon: layer.kind === 'image' ? 'image' : 'shape',
      name:
        layer.kind === 'image' && layer.payload.role === 'base'
          ? translate('baseImage')
          : layer.kind,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      rotation: layer.transform.rotation,
    })),
  )
  void resolveDocumentTextures(snapshot.core.document)
}
function undoDocument(): void {
  props.documentSession?.undo()
}
function redoDocument(): void {
  props.documentSession?.redo()
}
async function copyCaptureFallback(): Promise<void> {
  const command = props.captureFallbackCommand
  if (!command || !navigator.clipboard) return
  try {
    await navigator.clipboard.writeText(command)
    fallbackCopied.value = true
  } catch (error) {
    console.warn('cute-screen fallback command copy failed', error)
  }
}
function retryDocumentSave(): void {
  void props.documentSession?.retry()
}
async function exportDocumentRecovery(): Promise<void> {
  const outcome = await props.documentSession?.exportRecoveryBundle()
  if (outcome?.kind === 'failed') {
    store.setDocumentHistory({
      ...store.documentHistory,
      saveState: 'error',
      error: outcome.error,
    })
  }
}

async function resolveDocumentTextures(
  document: EditorDocumentV1,
): Promise<void> {
  if (!props.textureBridge) return
  textureResolver ??= new TextureResourceResolver({
    bridge: props.textureBridge,
    correlationId: () => crypto.randomUUID(),
  })
  const nextImages = new Map(textureImages.value)
  for (const layer of document.layers) {
    if (layer.kind !== 'shape') continue
    const fill = layer.payload.fill as Record<string, unknown> | undefined
    if (fill?.kind !== 'imageTexture' || typeof fill.blobHash !== 'string')
      continue
    const resource = await textureResolver.resolve(fill.blobHash)
    if (resource.kind === 'ready') nextImages.set(fill.blobHash, resource.image)
    else nextImages.delete(fill.blobHash)
  }
  textureImages.value = nextImages
}

watch(
  () => props.textureBridge,
  () => {
    if (activeDocument.value) void resolveDocumentTextures(activeDocument.value)
  },
)
onMounted(() => {
  drawingPreferences = createBrowserDrawingToolPreferencesStorage(
    browserStorage(),
  ).load() as typeof drawingPreferences
  drawingDefaults.value = drawingPreferences.defaults
  store.initialize(preferencesOptions)
  if (!props.documentSession) {
    store.setDocumentState(props.initialDocumentState ?? { kind: 'empty' })
    if (!props.initialDocumentState) loadFixture()
    if (props.readOnlyDocument) {
      store.setDocumentHistory({
        canUndo: false,
        canRedo: false,
        saveState: 'readOnly',
      })
    }
  }
  media.addEventListener('change', onMediaChange)
  window.addEventListener('keydown', onKeydown)
})
watch(
  () => props.frames,
  (frames) => {
    if (frames) store.setFrames(frames)
  },
  { immediate: true },
)
watch(
  () => props.documentSession,
  (session, _previous, onCleanup) => {
    if (!session) return
    const unsubscribe = session.subscribe(applyDocumentSnapshot)
    onCleanup(unsubscribe)
  },
  { immediate: true },
)
watch(
  () => props.captureProgress,
  (progress) => {
    if (progress) store.setCaptureProgress(progress)
  },
)
watch(
  () => props.initialDocumentState,
  (state) => {
    if (!props.documentSession && state) store.setDocumentState(state)
  },
)
watch(
  () => props.readOnlyDocument,
  (readOnly) => {
    if (!props.documentSession && readOnly) {
      store.setDocumentHistory({
        canUndo: false,
        canRedo: false,
        saveState: 'readOnly',
      })
    }
  },
)
onBeforeUnmount(() => {
  // Navigation/remount must not leave the coalesced save behind.
  void props.documentSession?.flush()
  props.documentSession?.dispose()
  media.removeEventListener('change', onMediaChange)
  window.removeEventListener('keydown', onKeydown)
})
watch(
  [state.resolvedTheme, state.locale],
  ([theme, locale]) => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = locale
  },
  { immediate: true },
)
</script>

<template>
  <div class="cs-editor-shell">
    <TopBar
      :locale="store.locale"
      :theme="store.preferences.theme"
      :can-copy-or-export="store.canCopyOrExport"
      :can-undo="store.documentHistory.canUndo"
      :can-redo="store.documentHistory.canRedo"
      :save-state="store.documentHistory.saveState"
      :save-error="store.documentHistory.error"
      :pending="store.actionState.status === 'pending'"
      :capture-available="props.captureAvailable"
      :capture-unavailable-reason="
        props.captureUnavailableReason ?? translate('captureUnavailable')
      "
      :t="translate"
      @action="store.runAction"
      @undo="undoDocument"
      @redo="redoDocument"
      @retry-save="retryDocumentSave"
      @export-recovery="exportDocumentRecovery"
      @locale="store.setLocale"
      @theme="store.setTheme"
    />
    <div
      v-if="props.captureFallbackCommand"
      class="cs-capture-fallback"
      role="status"
    >
      <span>{{ translate('captureFallback') }}</span>
      <code>{{ props.captureFallbackCommand }}</code>
      <button
        type="button"
        :aria-label="translate('copyCaptureFallback')"
        @click="copyCaptureFallback"
      >
        {{
          fallbackCopied
            ? translate('captureFallbackCopied')
            : translate('copyCaptureFallback')
        }}
      </button>
    </div>
    <div class="cs-workbench">
      <ToolRail
        :tools="tools"
        :active-tool-id="store.activeToolId"
        :t="translate"
        @select="store.selectTool"
      />
      <CanvasViewport
        :document-state="store.documentState"
        :canvas="activeDocument?.canvas"
        :image="props.sourceImage"
        :texture-images="textureImages"
        :image-layer="baseImageLayer"
        :document="activeDocument"
        :selected-layer-id="store.selectedLayerId"
        :selected-layer-ids="store.selectedLayerIds"
        :active-tool="store.activeToolId"
        :drawing-defaults="drawingDefaults"
        :zoom="store.zoom"
        :fit-mode="store.zoomMode === 'fit'"
        :t="translate"
        @hosts-ready="emit('hostsReady', $event)"
        @select-layer="selectLayer"
        @move-layer="moveLayer"
        @transform-layer="transformLayer"
        @update-layer-payload="updateLayerPayload"
        @add-layer="addLayer"
        @select-tool="store.selectTool"
        @zoom="store.setZoom"
        @fit-zoom="store.setFitZoom"
        @retry="emit('retryLoad')"
      />
      <LayersPanel
        :layers="store.layers"
        :open="store.layersOpen"
        :selected-layer-id="store.selectedLayerId"
        :selected-layer-ids="store.selectedLayerIds"
        :t="translate"
        @select="selectLayer"
        @toggle="store.toggleLayers"
        @visibility="updateLayerProperty($event, 'visible')"
        @lock="updateLayerProperty($event, 'locked')"
        @opacity="onLayerOpacity"
        @rotation="onLayerRotation"
        @reorder="onLayerReorder"
        @reorder-to="onLayerReorderTo"
      />
      <ZoomControls
        :zoom="store.zoom"
        :t="translate"
        @zoom="store.setZoom"
        @fit="store.enableFit"
      />
      <ContextToolbar
        :schema="contextSchema"
        :label="translate('toolSettings')"
        @action="onContextAction"
        @change="onContextChange"
      />
    </div>
    <SeriesFilmstrip
      :frames="store.frames"
      :active-frame-id="store.activeFrameId"
      :t="translate"
      @select="store.selectFrame"
    />
    <ActionFeedback
      :state="store.actionState"
      :t="translate"
      @cancel="store.cancelAction"
      @retry="
        store.runAction(
          store.actionState.status === 'error'
            ? store.actionState.action
            : 'capture',
        )
      "
    />
  </div>
</template>
