<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { storeToRefs } from 'pinia'
import {
  NConfigProvider,
  darkTheme,
  dateEnUS,
  dateRuRU,
  enUS,
  ruRU,
} from 'naive-ui'

import { t } from '../i18n'
import { UiIcon } from '../icon'
import {
  createBrowserDrawingToolPreferencesStorage,
  createBrowserPreferencesStorage,
} from '../preferences'
import {
  createBrowserTextStylePresetsStorage,
  type UserTextStylePreset,
} from '../../text-style-presets'
import { useEditorShellStore, type ShellStoreOptions } from '../store'
import type { CaptureProgressState } from '../../platform'
import type {
  CanvasViewportHosts,
  ContextToolbarSchema,
  FrameSummary,
  ShellDocumentState,
  ShellActionAdapter,
  ToolDescriptor,
} from '../types'
import type {
  DocumentSessionController,
  DocumentSessionSnapshot,
} from '../../document-session'
import { loadImageWithBinaryFallback } from '../../image-transport'
import type { ClipboardBridge } from '../../image-transport'
import type { SystemFontFace } from '../../font-catalog'
import {
  TextureResourceResolver,
  type ContentImageBridge,
  type TextureFillBridge,
} from '../../texture-fill'
import {
  createFlipCanvasCommand,
  createContentImageLayer,
  createDuplicateLayerCommand,
  createTextLayer,
  nextNumberedMarkerSequence,
  defaultDrawingToolPreferences,
  DEFAULT_DRAWING_DEFAULTS,
  rememberDrawingColor,
  rebaseArrowLayer,
  type DrawingDefaults,
  type DrawingToolPreferencesV2,
  type BlendMode,
  type EditorDocumentV1,
  type EditorCommand,
  type ImageLayer,
  type JsonObject,
  type LayerNode,
  type SrgbColor,
  type ShadowStyle,
  type TextBackground,
  type Transform2D,
} from '@cute-screen/editor-renderer'
import ActionFeedback from './ActionFeedback.vue'
import CanvasViewport, { type TextToolDefaults } from './CanvasViewport.vue'
import ContextToolbar from './ContextToolbar.vue'
import LayersPanel from './LayersPanel.vue'
import SeriesFilmstrip from './SeriesFilmstrip.vue'
import ToolRail from './ToolRail.vue'
import TopBar from './TopBar.vue'
import ZoomControls from './ZoomControls.vue'
import { cuteScreenThemeOverrides } from '../ui/theme'

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
    openImageAvailable?: boolean
    captureFallbackCommand?: string | undefined
    captureProgress?: CaptureProgressState | undefined
    frames?: readonly FrameSummary[] | undefined
    sourceImage?: HTMLImageElement | undefined
    textureBridge?: TextureFillBridge | undefined
    contentImageBridge?: ContentImageBridge | undefined
    clipboardBridge?: ClipboardBridge | undefined
    systemFonts?: readonly SystemFontFace[] | undefined
  }>(),
  {
    actions: undefined,
    documentSession: undefined,
    fixture: 'empty',
    initialDocumentState: undefined,
    readOnlyDocument: false,
    captureAvailable: true,
    captureUnavailableReason: undefined,
    openImageAvailable: false,
    captureFallbackCommand: undefined,
    captureProgress: undefined,
    frames: undefined,
    sourceImage: undefined,
    textureBridge: undefined,
    contentImageBridge: undefined,
    clipboardBridge: undefined,
    systemFonts: undefined,
  },
)
const emit = defineEmits<{
  hostsReady: [hosts: CanvasViewportHosts]
  retryLoad: []
}>()
const store = useEditorShellStore()
const state = storeToRefs(store)
const canvasViewport = ref<InstanceType<typeof CanvasViewport>>()
const naiveTheme = computed(() =>
  state.resolvedTheme.value === 'dark' ? darkTheme : null,
)
const naiveLocale = computed(() => (store.locale === 'ru' ? ruRU : enUS))
const naiveDateLocale = computed(() =>
  store.locale === 'ru' ? dateRuRU : dateEnUS,
)
const fallbackCopied = ref(false)
const fallbackVisible = ref(true)
let fallbackCopiedTimer: number | undefined
const drawingDefaults = ref<DrawingDefaults>(
  structuredClone(DEFAULT_DRAWING_DEFAULTS),
)
const textDefaults = shallowRef<TextToolDefaults>({
  font: {
    source: 'bundled',
    family: 'Roboto',
    weight: 400,
    style: 'normal',
  },
  fontSize: 16,
  weight: 400,
  italic: false,
  underline: false,
  letterSpacing: 0,
  alignment: 'start',
  lineHeight: 1.25,
  color: { red: 0, green: 0, blue: 0, alpha: 1 },
  fill: {
    kind: 'solid',
    color: { red: 0, green: 0, blue: 0, alpha: 1 },
    opacity: 1,
  },
  outline: null,
  background: null,
  opacity: 1,
  blendMode: 'normal',
  shadows: [],
})
const activeTextPreset = ref('plain')
const textStyleRevision = ref(0)
const textDraft = ref<
  { readonly id: string; readonly kind: 'text' | 'callout' } | undefined
>()
const personalTextPreset = shallowRef<UserTextStylePreset>()
const TEXT_BLEND_OPTIONS: readonly {
  readonly value: BlendMode
  readonly label: string
}[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'softLight', label: 'Soft light' },
  { value: 'hardLight', label: 'Hard light' },
]
watch(textDefaults, () => {
  textStyleRevision.value += 1
})
const textFontOptions = computed(() => {
  const families = new Set<string>()
  const options: Array<{ readonly value: string; readonly label: string }> = [
    { value: 'bundled:Roboto', label: 'Roboto · bundled' },
  ]
  for (const face of props.systemFonts ?? []) {
    if (families.has(face.family)) continue
    families.add(face.family)
    options.push({
      value: `system:${face.family}`,
      label: `${face.family} · system`,
    })
  }
  return options
})
function textFontOptionValue(font: TextToolDefaults['font']): string {
  return font.source === 'bundled' ? 'bundled:Roboto' : `system:${font.family}`
}
function closestSystemFontFace(
  faces: readonly SystemFontFace[],
  family: string,
  weight: TextToolDefaults['weight'],
  italic: boolean,
): SystemFontFace | undefined {
  const candidates = faces.filter((face) => face.family === family)
  if (candidates.length === 0) return undefined
  const desiredStyle = italic ? 'italic' : 'normal'
  return [...candidates].sort((left, right) => {
    const leftStyle = left.style === desiredStyle ? 0 : 1
    const rightStyle = right.style === desiredStyle ? 0 : 1
    if (leftStyle !== rightStyle) return leftStyle - rightStyle
    return Math.abs(left.weight - weight) - Math.abs(right.weight - weight)
  })[0]
}
function textFillPreset(
  kind: 'solid' | 'linearGradient' | 'radialGradient' | 'pattern',
  color: SrgbColor,
): TextToolDefaults['fill'] {
  if (kind === 'solid') {
    return { kind: 'solid', color, opacity: 1 }
  }
  if (kind === 'linearGradient') {
    return {
      kind,
      stops: [
        { position: 0, color },
        { position: 1, color: { red: 0.3, green: 0.6, blue: 1, alpha: 1 } },
      ],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
      opacity: 1,
    }
  }
  if (kind === 'radialGradient') {
    return {
      kind,
      stops: [
        { position: 0, color },
        { position: 1, color: { red: 0.84, green: 0.35, blue: 0.8, alpha: 1 } },
      ],
      center: { x: 0.5, y: 0.5 },
      radius: 0.5,
      opacity: 1,
    }
  }
  return {
    kind: 'pattern',
    pattern: 'diagonal',
    color,
    background: { red: 1, green: 1, blue: 1, alpha: 1 },
    transform: { scale: 1, rotation: 0, offsetX: 0, offsetY: 0 },
    opacity: 1,
  }
}
function textOutlinePreset(
  value: 'none' | 'white' | 'black',
): TextToolDefaults['outline'] {
  if (value === 'none') return null
  const channel = value === 'white' ? 1 : 0
  return {
    stroke: {
      color: { red: channel, green: channel, blue: channel, alpha: 1 },
      width: 2,
      style: 'solid',
      cap: 'round',
      join: 'round',
    },
    position: 'center',
  }
}
function textOutlineOption(outline: TextToolDefaults['outline']): string {
  if (!outline) return 'none'
  if (JSON.stringify(outline) === JSON.stringify(textOutlinePreset('white')))
    return 'white'
  if (JSON.stringify(outline) === JSON.stringify(textOutlinePreset('black')))
    return 'black'
  return 'none'
}
const TEXT_BACKGROUND_PRESETS: Readonly<Record<string, TextBackground | null>> =
  Object.freeze({
    none: null,
    yellow: {
      fill: {
        kind: 'solid',
        color: { red: 1, green: 0.87, blue: 0.3, alpha: 1 },
        opacity: 1,
      },
      padding: 6,
      radius: 4,
    },
    blue: {
      fill: {
        kind: 'solid',
        color: { red: 0.55, green: 0.78, blue: 1, alpha: 1 },
        opacity: 1,
      },
      padding: 6,
      radius: 4,
    },
    pink: {
      fill: {
        kind: 'solid',
        color: { red: 1, green: 0.68, blue: 0.78, alpha: 1 },
        opacity: 1,
      },
      padding: 6,
      radius: 4,
    },
  })
function textBackgroundPreset(background: TextBackground | null): string {
  if (!background) return 'none'
  return (
    Object.entries(TEXT_BACKGROUND_PRESETS).find(([, candidate]) => {
      if (!candidate) return false
      return JSON.stringify(background) === JSON.stringify(candidate)
    })?.[0] ?? 'none'
  )
}
const TEXT_SHADOW_PRESETS: Readonly<Record<string, readonly ShadowStyle[]>> =
  Object.freeze({
    none: [],
    drop: [
      {
        color: { red: 0, green: 0, blue: 0, alpha: 0.35 },
        offsetX: 2,
        offsetY: 3,
        blur: 3,
      },
    ],
    soft: [
      {
        color: { red: 0.08, green: 0.12, blue: 0.2, alpha: 0.28 },
        offsetX: 0,
        offsetY: 4,
        blur: 10,
      },
    ],
    neon: [
      {
        color: { red: 0.1, green: 0.95, blue: 1, alpha: 0.9 },
        offsetX: 0,
        offsetY: 0,
        blur: 12,
      },
    ],
  })
function textShadowPreset(shadows: readonly ShadowStyle[]): string {
  return (
    Object.entries(TEXT_SHADOW_PRESETS).find(
      ([, candidate]) =>
        candidate.length === shadows.length &&
        candidate.every(
          (shadow, index) =>
            JSON.stringify(shadow) === JSON.stringify(shadows[index]),
        ),
    )?.[0] ?? 'none'
  )
}
const TEXT_PRESET_OPTIONS: readonly {
  readonly value: string
  readonly label: string
}[] = [
  { value: 'plain', label: 'Plain' },
  { value: 'label', label: 'Label' },
  { value: 'sticker', label: 'Sticker' },
  { value: 'outline', label: 'Outline' },
  { value: 'shadow', label: 'Shadow' },
  { value: 'neon', label: 'Neon' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'texture', label: 'Texture' },
  { value: 'custom', label: 'Custom' },
]
const textPresetOptions = computed(() => {
  const options = [...TEXT_PRESET_OPTIONS]
  if (personalTextPreset.value) {
    options.splice(options.length - 1, 0, {
      value: personalTextPreset.value.id,
      label: personalTextPreset.value.label,
    })
  }
  return options
})
function applyTextPreset(value: string): boolean {
  const current = textDefaults.value
  const black: SrgbColor = { red: 0, green: 0, blue: 0, alpha: 1 }
  const white: SrgbColor = { red: 1, green: 1, blue: 1, alpha: 1 }
  let next: TextToolDefaults
  switch (value) {
    case 'plain':
      next = {
        ...current,
        fontSize: 16,
        weight: 400,
        italic: false,
        color: black,
        fill: textFillPreset('solid', black),
        outline: null,
        background: null,
        opacity: 1,
        blendMode: 'normal',
        shadows: [],
      }
      break
    case 'label':
      next = {
        ...current,
        fontSize: 16,
        weight: 700,
        color: black,
        fill: textFillPreset('solid', black),
        outline: null,
        background: structuredClone(TEXT_BACKGROUND_PRESETS.yellow!),
        opacity: 1,
        blendMode: 'normal',
        shadows: [],
      }
      break
    case 'sticker':
      next = {
        ...current,
        fontSize: 24,
        weight: 700,
        color: white,
        fill: textFillPreset('solid', white),
        outline: textOutlinePreset('black'),
        background: structuredClone(TEXT_BACKGROUND_PRESETS.pink!),
        opacity: 1,
        blendMode: 'normal',
        shadows: [],
      }
      break
    case 'outline':
      next = {
        ...current,
        fontSize: 24,
        weight: 700,
        color: white,
        fill: textFillPreset('solid', white),
        outline: textOutlinePreset('black'),
        background: null,
        opacity: 1,
        blendMode: 'normal',
        shadows: [],
      }
      break
    case 'shadow':
      next = {
        ...current,
        fontSize: 24,
        weight: 700,
        color: black,
        fill: textFillPreset('solid', black),
        outline: null,
        background: null,
        opacity: 1,
        blendMode: 'normal',
        shadows: structuredClone(TEXT_SHADOW_PRESETS.drop ?? []),
      }
      break
    case 'neon': {
      const cyan: SrgbColor = { red: 0.1, green: 0.95, blue: 1, alpha: 1 }
      next = {
        ...current,
        fontSize: 24,
        weight: 700,
        color: cyan,
        fill: textFillPreset('solid', cyan),
        outline: null,
        background: {
          fill: {
            kind: 'solid',
            color: { red: 0.04, green: 0.07, blue: 0.12, alpha: 1 },
            opacity: 1,
          },
          padding: 6,
          radius: 4,
        },
        opacity: 1,
        blendMode: 'screen',
        shadows: structuredClone(TEXT_SHADOW_PRESETS.neon ?? []),
      }
      break
    }
    case 'gradient': {
      const blue: SrgbColor = { red: 0.2, green: 0.5, blue: 1, alpha: 1 }
      next = {
        ...current,
        fontSize: 24,
        weight: 700,
        color: blue,
        fill: textFillPreset('linearGradient', blue),
        outline: null,
        background: null,
        opacity: 1,
        blendMode: 'normal',
        shadows: [],
      }
      break
    }
    default:
      return false
  }
  textDefaults.value = {
    ...next,
    underline: false,
    letterSpacing: 0,
    font: {
      ...current.font,
      weight: next.weight,
      style: next.italic ? 'italic' : 'normal',
    },
  }
  activeTextPreset.value = value
  return true
}
const markerShape = ref<'circle' | 'square' | 'diamond' | 'star'>('circle')
const contentImageImporting = ref(false)
const drawingPreferences = shallowRef<DrawingToolPreferencesV2>(
  defaultDrawingToolPreferences(),
)
const samplingControl = ref<string>()
const eyedropperFeedback = ref<string>()
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
const textFontHint = computed(() => {
  const font = textDefaults.value.font
  if (font.source !== 'system') return undefined
  const exactFace = props.systemFonts?.some(
    (face) =>
      face.family === font.family &&
      face.weight === textDefaults.value.weight &&
      face.style === (textDefaults.value.italic ? 'italic' : 'normal'),
  )
  return exactFace
    ? undefined
    : `Missing ${font.family} face; preview may use a substitute.`
})
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
    disabled: !hasInteractiveDocument.value || props.readOnlyDocument,
  },
  {
    id: 'numberedMarker',
    group: 'annotate',
    icon: 'plus',
    labelKey: 'toolNumberedMarker',
    shortcut: 'N',
    disabled: !hasInteractiveDocument.value || props.readOnlyDocument,
  },
  {
    id: 'callout',
    group: 'annotate',
    icon: 'text',
    labelKey: 'toolCallout',
    shortcut: 'O',
    disabled: !hasInteractiveDocument.value || props.readOnlyDocument,
  },
  {
    id: 'image',
    group: 'annotate',
    icon: 'image',
    labelKey: 'toolImage',
    disabled:
      !hasInteractiveDocument.value ||
      props.readOnlyDocument ||
      !props.contentImageBridge ||
      contentImageImporting.value,
  },
  {
    id: 'eyedropper',
    group: 'more',
    icon: 'eyedropper',
    labelKey: 'toolEyedropper',
    shortcut: 'I',
    disabled: !hasInteractiveDocument.value,
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
): ContextToolbarSchema {
  const selected = selectedDrawingLayer()
  const colorDisabled =
    props.readOnlyDocument || (selected?.kind === tool && selected.locked)
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
  if (tool === 'arrow') {
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
      icon: 'arrow' as const,
      title: translate('toolArrow'),
      hint: translate('arrowHint'),
      controls: [
        {
          kind: 'color' as const,
          id: 'color',
          label: translate('color'),
          value: hexColor(color),
          compact: true,
          disabled: colorDisabled,
          eyedropper: Boolean(activeDocument.value) && !colorDisabled,
        },
        {
          kind: 'arrowStroke' as const,
          id: 'stroke' as const,
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
          kind: 'arrowCap' as const,
          id: 'startCap' as const,
          label: translate('arrowTail'),
          value: (typeof values.startCap === 'string'
            ? values.startCap
            : 'none') as
            | 'none'
            | 'lineArrow'
            | 'solidArrow'
            | 'triangle'
            | 'circle'
            | 'diamond',
          disabled: colorDisabled,
          options: capOptions,
        },
        {
          kind: 'arrowPath' as const,
          id: 'arrowPath' as const,
          label: translate('arrowGeometry'),
          value:
            values.path === 'quadratic' || values.path === 'elbow'
              ? values.path
              : 'straight',
          disabled: colorDisabled,
          options: [
            { value: 'straight' as const, label: translate('arrowStraight') },
            { value: 'elbow' as const, label: translate('arrowElbow') },
            { value: 'quadratic' as const, label: translate('arrowQuadratic') },
          ],
        },
        {
          kind: 'arrowCap' as const,
          id: 'endCap' as const,
          label: translate('arrowHead'),
          value: (typeof values.endCap === 'string'
            ? values.endCap
            : 'solidArrow') as
            | 'none'
            | 'lineArrow'
            | 'solidArrow'
            | 'triangle'
            | 'circle'
            | 'diamond',
          disabled: colorDisabled,
          options: capOptions,
        },
      ],
    }
  }
  return {
    icon: tool === 'shape' ? ('shape' as const) : (tool as 'pencil' | 'marker'),
    title: translate(
      tool === 'shape'
        ? 'toolShape'
        : tool === 'pencil'
          ? 'toolPencil'
          : 'toolMarker',
    ),
    hint: translate('canvasViewport'),
    controls: [
      {
        kind: 'color' as const,
        id: 'color',
        label: translate('color'),
        value: hexColor(color),
        disabled: colorDisabled,
        eyedropper: Boolean(activeDocument.value) && !colorDisabled,
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
  if (tool === 'text') {
    return {
      icon: 'text' as const,
      title: translate('toolText'),
      hint: textFontHint.value ?? translate('canvasViewport'),
      controls: [
        {
          kind: 'select' as const,
          id: 'textPreset',
          label: 'Preset',
          value: activeTextPreset.value,
          options: props.textureBridge
            ? textPresetOptions.value
            : textPresetOptions.value.filter(
                ({ value }) => value !== 'texture',
              ),
        },
        {
          kind: 'action' as const,
          id: 'saveTextPreset',
          label: 'Save personal preset',
        },
        {
          kind: 'select' as const,
          id: 'textFont',
          label: 'Font',
          value: textFontOptionValue(textDefaults.value.font),
          options: textFontOptions.value,
        },
        {
          kind: 'select' as const,
          id: 'textFontSize',
          label: 'Size',
          value: String(textDefaults.value.fontSize),
          options: [12, 16, 20, 24, 32, 48, 64].map((size) => ({
            value: String(size),
            label: `${size}px`,
          })),
        },
        {
          kind: 'select' as const,
          id: 'textItalic',
          label: 'Style',
          value: textDefaults.value.italic ? 'italic' : 'normal',
          options: [
            { value: 'normal', label: 'Normal' },
            { value: 'italic', label: 'Italic' },
          ],
        },
        {
          kind: 'select' as const,
          id: 'textUnderline',
          label: 'Underline',
          value: textDefaults.value.underline ? 'on' : 'off',
          options: [
            { value: 'off', label: 'Off' },
            { value: 'on', label: 'On' },
          ],
        },
        {
          kind: 'select' as const,
          id: 'textLetterSpacing',
          label: 'Spacing',
          value: String(textDefaults.value.letterSpacing),
          options: [-2, 0, 1, 2, 4].map((spacing) => ({
            value: String(spacing),
            label: `${spacing}px`,
          })),
        },
        {
          kind: 'color' as const,
          id: 'textColor',
          label: 'Color',
          value: hexColor(textDefaults.value.color),
          eyedropper: Boolean(activeDocument.value),
        },
        {
          kind: 'select' as const,
          id: 'textFill',
          label: 'Fill',
          value: textDefaults.value.fill.kind,
          options: [
            { value: 'solid', label: 'Solid' },
            { value: 'linearGradient', label: 'Gradient' },
            { value: 'radialGradient', label: 'Radial' },
            { value: 'pattern', label: 'Pattern' },
          ],
        },
        ...(props.textureBridge
          ? [
              {
                kind: 'action' as const,
                id: 'textImportTexture',
                label: 'Import texture',
              },
            ]
          : []),
        {
          kind: 'select' as const,
          id: 'textOutline',
          label: 'Outline',
          value: textOutlineOption(textDefaults.value.outline),
          options: [
            { value: 'none', label: 'None' },
            { value: 'white', label: 'White' },
            { value: 'black', label: 'Black' },
          ],
        },
        {
          kind: 'select' as const,
          id: 'textBackground',
          label: 'Background',
          value: textBackgroundPreset(textDefaults.value.background),
          options: [
            { value: 'none', label: 'None' },
            { value: 'yellow', label: 'Yellow' },
            { value: 'blue', label: 'Blue' },
            { value: 'pink', label: 'Pink' },
          ],
        },
        {
          kind: 'select' as const,
          id: 'textShadow',
          label: 'Shadow',
          value: textShadowPreset(textDefaults.value.shadows),
          options: [
            { value: 'none', label: 'None' },
            { value: 'drop', label: 'Drop' },
            { value: 'soft', label: 'Soft' },
            { value: 'neon', label: 'Neon' },
          ],
        },
        {
          kind: 'select' as const,
          id: 'textWeight',
          label: 'Weight',
          value: String(textDefaults.value.weight),
          options: [400, 500, 600, 700].map((weight) => ({
            value: String(weight),
            label: String(weight),
          })),
        },
        {
          kind: 'select' as const,
          id: 'textAlign',
          label: 'Align',
          value: textDefaults.value.alignment,
          options: [
            { value: 'start', label: 'Start' },
            { value: 'center', label: 'Center' },
            { value: 'end', label: 'End' },
          ],
        },
        {
          kind: 'select' as const,
          id: 'textLineHeight',
          label: 'Line height',
          value: String(textDefaults.value.lineHeight),
          options: [1, 1.15, 1.25, 1.5, 1.75, 2].map((lineHeight) => ({
            value: String(lineHeight),
            label: `${lineHeight}×`,
          })),
        },
        {
          kind: 'range' as const,
          id: 'textOpacity',
          label: 'Opacity',
          value: textDefaults.value.opacity,
          min: 0,
          max: 1,
          step: 0.05,
        },
        {
          kind: 'select' as const,
          id: 'textBlendMode',
          label: 'Blend',
          value: textDefaults.value.blendMode,
          options: TEXT_BLEND_OPTIONS,
        },
      ],
    }
  }
  if (tool === 'numberedMarker') {
    return {
      icon: 'plus' as const,
      title: translate('toolNumberedMarker'),
      hint: translate('canvasViewport'),
      controls: [
        {
          kind: 'select' as const,
          id: 'markerShape',
          label: 'Shape',
          value: markerShape.value,
          options: ['circle', 'square', 'diamond', 'star'].map((shape) => ({
            value: shape,
            label: shape,
          })),
        },
      ],
    }
  }
  if (isDrawingTool(tool)) {
    const selected = selectedDrawingLayer()
    return drawingControl(
      tool,
      selected?.kind === tool ? selected.payload : drawingDefaults.value[tool],
    )
  }
  const selectedImage =
    tool === 'select'
      ? activeDocument.value?.layers.find(
          (layer) => layer.id === store.selectedLayerId,
        )
      : undefined
  if (
    selectedImage?.kind === 'image' &&
    selectedImage.payload.role === 'content'
  ) {
    const border = selectedImage.payload.border
    return {
      icon: 'image' as const,
      title: 'Image',
      hint: translate('canvasViewport'),
      controls: [
        {
          kind: 'range' as const,
          id: 'imageRadius',
          label: 'Radius',
          value: selectedImage.payload.radius ?? 0,
          min: 0,
          max: Math.min(
            128,
            (selectedImage.localBounds?.width ?? 0) / 2,
            (selectedImage.localBounds?.height ?? 0) / 2,
          ),
          step: 1,
        },
        {
          kind: 'color' as const,
          id: 'imageBorderColor',
          label: 'Border',
          value: hexColor(
            border?.color ?? { red: 0, green: 0, blue: 0, alpha: 1 },
          ),
          disabled: selectedImage.locked,
          eyedropper: Boolean(activeDocument.value) && !selectedImage.locked,
        },
        {
          kind: 'range' as const,
          id: 'imageBorderWidth',
          label: 'Border width',
          value: border?.width ?? 0,
          min: 0,
          max: 16,
          step: 1,
        },
        {
          kind: 'range' as const,
          id: 'imageOpacity',
          label: 'Opacity',
          value: selectedImage.opacity,
          min: 0,
          max: 1,
          step: 0.05,
        },
      ],
    }
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
  if (id === 'saveTextPreset') {
    const storage = createBrowserTextStylePresetsStorage(browserStorage())
    storage.save(textDefaults.value)
    personalTextPreset.value = storage.load()
    if (personalTextPreset.value) activeTextPreset.value = 'personal'
    return
  }
  if (id === 'textImportTexture') {
    if (!props.textureBridge) return
    textureResolver ??= new TextureResourceResolver({
      bridge: props.textureBridge,
      correlationId: () => crypto.randomUUID(),
    })
    const imported = await textureResolver.import()
    if (imported.kind !== 'imported' || imported.format === 'svg') return
    const resource = textureResolver.get(imported.blobHash)
    if (resource?.kind === 'ready') {
      textureImages.value = new Map(textureImages.value).set(
        imported.blobHash,
        resource.image,
      )
    }
    textDefaults.value = {
      ...textDefaults.value,
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
    activeTextPreset.value = 'texture'
    return
  }
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
      drawingPreferences.value = {
        ...drawingPreferences.value,
        defaults: drawingDefaults.value,
      }
      createBrowserDrawingToolPreferencesStorage(browserStorage()).save(
        drawingPreferences.value,
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
  if (activeTool === 'text') {
    if (id === 'textPreset') {
      if (value === 'personal') {
        const preset = personalTextPreset.value
        if (!preset) return
        textDefaults.value = structuredClone(preset.values)
        activeTextPreset.value = preset.id
        return
      }
      if (value === 'texture') {
        void onContextAction('textImportTexture')
        return
      }
      applyTextPreset(value)
      return
    }
    if (id === 'textFont') {
      if (value === 'bundled:Roboto') {
        textDefaults.value = {
          ...textDefaults.value,
          font: {
            source: 'bundled',
            family: 'Roboto',
            weight: textDefaults.value.weight,
            style: textDefaults.value.italic ? 'italic' : 'normal',
          },
        }
        return
      }
      const family = value.startsWith('system:') ? value.slice(7) : ''
      if (!props.systemFonts?.some((font) => font.family === family)) return
      const face = closestSystemFontFace(
        props.systemFonts,
        family,
        textDefaults.value.weight,
        textDefaults.value.italic,
      )
      if (!face) return
      textDefaults.value = {
        ...textDefaults.value,
        font: {
          source: 'system',
          family,
          weight: face.weight,
          style: face.style,
        },
        weight: face.weight,
        italic: face.style === 'italic',
      }
    } else if (id === 'textFontSize') {
      const fontSize = Number(value)
      if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 256) return
      textDefaults.value = { ...textDefaults.value, fontSize }
    } else if (id === 'textWeight') {
      const weight = Number(value)
      if (!Number.isInteger(weight) || weight < 100 || weight > 900) return
      textDefaults.value = {
        ...textDefaults.value,
        weight: weight as TextToolDefaults['weight'],
        font: {
          ...textDefaults.value.font,
          weight: weight as TextToolDefaults['weight'],
        },
      }
    } else if (id === 'textAlign') {
      if (!['start', 'center', 'end'].includes(value)) return
      textDefaults.value = {
        ...textDefaults.value,
        alignment: value as TextToolDefaults['alignment'],
      }
    } else if (id === 'textLineHeight') {
      const lineHeight = Number(value)
      if (!Number.isFinite(lineHeight) || lineHeight < 0.8 || lineHeight > 4)
        return
      textDefaults.value = { ...textDefaults.value, lineHeight }
    } else if (id === 'textOpacity') {
      const opacity = Number(value)
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) return
      textDefaults.value = { ...textDefaults.value, opacity }
    } else if (id === 'textBlendMode') {
      if (!TEXT_BLEND_OPTIONS.some((option) => option.value === value)) return
      textDefaults.value = {
        ...textDefaults.value,
        blendMode: value as BlendMode,
      }
    } else if (id === 'textItalic') {
      if (value !== 'normal' && value !== 'italic') return
      textDefaults.value = {
        ...textDefaults.value,
        italic: value === 'italic',
        font: { ...textDefaults.value.font, style: value },
      }
    } else if (id === 'textUnderline') {
      if (value !== 'off' && value !== 'on') return
      textDefaults.value = {
        ...textDefaults.value,
        underline: value === 'on',
      }
    } else if (id === 'textLetterSpacing') {
      const letterSpacing = Number(value)
      if (
        !Number.isFinite(letterSpacing) ||
        letterSpacing < -256 ||
        letterSpacing > 256
      ) {
        return
      }
      textDefaults.value = { ...textDefaults.value, letterSpacing }
    } else if (id === 'textColor') {
      const match = /^#([0-9a-f]{6})$/iu.exec(value)
      if (!match) return
      const hex = match[1]!
      const color: SrgbColor = {
        red: Number.parseInt(hex.slice(0, 2), 16) / 255,
        green: Number.parseInt(hex.slice(2, 4), 16) / 255,
        blue: Number.parseInt(hex.slice(4, 6), 16) / 255,
        alpha: 1,
      }
      textDefaults.value = {
        ...textDefaults.value,
        color,
        fill: textFillPreset('solid', color),
      }
    } else if (id === 'textFill') {
      if (
        value !== 'solid' &&
        value !== 'linearGradient' &&
        value !== 'radialGradient' &&
        value !== 'pattern'
      ) {
        return
      }
      textDefaults.value = {
        ...textDefaults.value,
        fill: textFillPreset(value, textDefaults.value.color),
      }
    } else if (id === 'textOutline') {
      if (value !== 'none' && value !== 'white' && value !== 'black') return
      textDefaults.value = {
        ...textDefaults.value,
        outline: textOutlinePreset(value),
      }
    } else if (id === 'textBackground') {
      const background = TEXT_BACKGROUND_PRESETS[value]
      if (background === undefined) return
      textDefaults.value = {
        ...textDefaults.value,
        background: background === null ? null : structuredClone(background),
      }
    } else if (id === 'textShadow') {
      const shadows = TEXT_SHADOW_PRESETS[value]
      if (!shadows) return
      textDefaults.value = {
        ...textDefaults.value,
        shadows: structuredClone(shadows),
      }
    }
    activeTextPreset.value = 'custom'
    return
  }
  if (
    id === 'imageRadius' ||
    id === 'imageBorderColor' ||
    id === 'imageBorderWidth' ||
    id === 'imageOpacity'
  ) {
    const image = activeDocument.value?.layers.find(
      (layer) => layer.id === store.selectedLayerId,
    )
    if (
      !image ||
      image.kind !== 'image' ||
      image.payload.role !== 'content' ||
      !props.documentSession ||
      image.locked
    ) {
      return
    }
    const currentBorder = image.payload.border
    const defaultBorder = {
      color: { red: 0, green: 0, blue: 0, alpha: 1 },
      width: 2,
      style: 'solid' as const,
      cap: 'round' as const,
      join: 'round' as const,
    }
    let payload = image.payload
    let opacity = image.opacity
    if (id === 'imageRadius') {
      const radius = Number(value)
      const maxRadius =
        Math.min(
          image.localBounds?.width ?? 0,
          image.localBounds?.height ?? 0,
        ) / 2
      if (!Number.isFinite(radius) || radius < 0 || radius > maxRadius) return
      payload = { ...payload, radius }
    } else if (id === 'imageOpacity') {
      const nextOpacity = Number(value)
      if (!Number.isFinite(nextOpacity) || nextOpacity < 0 || nextOpacity > 1)
        return
      opacity = nextOpacity
    } else if (id === 'imageBorderWidth') {
      const width = Number(value)
      if (!Number.isFinite(width) || width < 0 || width > 16) return
      payload = {
        ...payload,
        border:
          width === 0 ? null : { ...(currentBorder ?? defaultBorder), width },
      }
    } else {
      const match = /^#([0-9a-f]{6})$/iu.exec(value)
      if (!match) return
      const hex = match[1]!
      payload = {
        ...payload,
        border: {
          ...(currentBorder ?? defaultBorder),
          color: {
            red: Number.parseInt(hex.slice(0, 2), 16) / 255,
            green: Number.parseInt(hex.slice(2, 4), 16) / 255,
            blue: Number.parseInt(hex.slice(4, 6), 16) / 255,
            alpha: 1,
          },
        },
      }
    }
    props.documentSession.execute({
      type: 'updateLayer',
      before: image,
      after: { ...image, payload, opacity },
    })
    return
  }
  if (activeTool === 'numberedMarker') {
    if (['circle', 'square', 'diamond', 'star'].includes(value)) {
      markerShape.value = value as typeof markerShape.value
    }
    return
  }
  const selectedCandidate = selectedDrawingLayer()
  const selected = isDrawingTool(activeTool)
    ? selectedCandidate?.kind === activeTool
      ? selectedCandidate
      : undefined
    : activeTool === 'select'
      ? selectedCandidate
      : undefined
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
      'strokeStyle',
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
    if (
      tool !== 'arrow' ||
      (value !== 'straight' && value !== 'quadratic' && value !== 'elbow')
    )
      return
    const start = current.start as {
      readonly x?: unknown
      readonly y?: unknown
    }
    const end = current.end as { readonly x?: unknown; readonly y?: unknown }
    const midpoint = {
      x:
        typeof start?.x === 'number' && typeof end?.x === 'number'
          ? (start.x + end.x) / 2
          : 0,
      y:
        typeof start?.y === 'number' && typeof end?.y === 'number'
          ? (start.y + end.y) / 2
          : 0,
    }
    const { bend: _bend, elbow: _elbow, ...pathIndependent } = current
    void _bend
    void _elbow
    payload =
      value === 'quadratic'
        ? {
            ...pathIndependent,
            path: value,
            bend:
              current.bend && typeof current.bend === 'object'
                ? current.bend
                : midpoint,
          }
        : value === 'elbow'
          ? {
              ...pathIndependent,
              path: value,
              elbow:
                current.elbow && typeof current.elbow === 'object'
                  ? current.elbow
                  : { axis: 'y', offset: 0 },
            }
          : { ...pathIndependent, path: value }
  } else if (id === 'startCap' || id === 'endCap') {
    if (
      tool !== 'arrow' ||
      ![
        'none',
        'lineArrow',
        'solidArrow',
        'triangle',
        'circle',
        'diamond',
      ].includes(value)
    )
      return
    payload = { ...current, [id]: value }
  } else if (id === 'strokeStyle') {
    if (
      tool !== 'arrow' ||
      (value !== 'solid' && value !== 'dashed' && value !== 'dotted')
    )
      return
    payload = {
      ...current,
      stroke: { ...(current.stroke as Record<string, unknown>), style: value },
    }
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
    let after: LayerNode = {
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
              value === 'darken' ? ('darken' as const) : ('multiply' as const),
          }
        : {}),
    } as LayerNode
    if (
      selected.kind === 'arrow' &&
      id !== 'layerOpacity' &&
      id !== 'blendMode'
    ) {
      after = rebaseArrowLayer(selected, payload as typeof selected.payload)
    }
    props.documentSession.execute({
      type: 'updateLayer',
      before: selected,
      after,
    })
    return
  }
  drawingDefaults.value = { ...drawingDefaults.value, [tool]: payload }
  drawingPreferences.value = {
    ...drawingPreferences.value,
    defaults: drawingDefaults.value,
  }
  if (id === 'color') {
    const candidate =
      tool === 'arrow' || tool === 'shape'
        ? (payload.stroke as Record<string, unknown> | undefined)?.color
        : payload.color
    if (candidate && typeof candidate === 'object') {
      drawingPreferences.value = rememberDrawingColor(
        drawingPreferences.value,
        candidate as import('@cute-screen/editor-renderer').SrgbColor,
      )
    }
  }
  createBrowserDrawingToolPreferencesStorage(browserStorage()).save(
    drawingPreferences.value,
  )
}
function rememberColor(value: string): void {
  const match = /^#([\da-f]{6})$/iu.exec(value)
  if (!match) return
  const hex = match[1]!
  drawingPreferences.value = rememberDrawingColor(drawingPreferences.value, {
    red: Number.parseInt(hex.slice(0, 2), 16) / 255,
    green: Number.parseInt(hex.slice(2, 4), 16) / 255,
    blue: Number.parseInt(hex.slice(4, 6), 16) / 255,
    alpha: 1,
  })
  createBrowserDrawingToolPreferencesStorage(browserStorage()).save(
    drawingPreferences.value,
  )
}
function onColorChange(id: string, value: string): void {
  onContextChange(id, value)
  rememberColor(value)
}
function eyedropperPrompt(): string {
  return state.locale.value === 'ru'
    ? 'Выберите цвет на снимке'
    : 'Choose a colour on the canvas'
}
function startEyedropper(id: string): void {
  samplingControl.value = id
  eyedropperFeedback.value = eyedropperPrompt()
}
async function onColorSample(value: string): Promise<void> {
  const target = samplingControl.value
  if (target) onColorChange(target, value)
  else rememberColor(value)
  samplingControl.value = undefined
  eyedropperFeedback.value =
    state.locale.value === 'ru'
      ? `Цвет выбран: ${value}`
      : `Colour selected: ${value}`
  try {
    if (props.clipboardBridge?.writeClipboardText) {
      await props.clipboardBridge.writeClipboardText(value, crypto.randomUUID())
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(value)
    }
  } catch (error) {
    console.warn('cute-screen eyedropper clipboard write failed', error)
    eyedropperFeedback.value =
      state.locale.value === 'ru'
        ? `Цвет выбран: ${value}. Не удалось скопировать HEX.`
        : `Colour selected: ${value}. HEX could not be copied.`
  }
}
function onColorSampleError(message: string): void {
  eyedropperFeedback.value = message
}
function onColorSampleCancel(): void {
  samplingControl.value = undefined
  eyedropperFeedback.value =
    state.locale.value === 'ru'
      ? 'Выбор цвета отменён'
      : 'Colour sampling cancelled'
}
function selectTool(id: string): void {
  store.selectTool(id)
  if (id === 'eyedropper') eyedropperFeedback.value = eyedropperPrompt()
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
async function importContentImage(origin: {
  readonly x: number
  readonly y: number
}): Promise<void> {
  if (
    contentImageImporting.value ||
    !props.contentImageBridge ||
    !props.documentSession ||
    props.readOnlyDocument
  ) {
    return
  }
  contentImageImporting.value = true
  try {
    const imported = await props.contentImageBridge.importContentImage(
      crypto.randomUUID(),
    )
    if (imported.kind !== 'imported') return
    const resource = await loadImageWithBinaryFallback({
      token: imported.resourceToken,
      correlationId: crypto.randomUUID(),
      bridge: props.contentImageBridge,
      createResource: async (image) => image,
    })
    textureImages.value = new Map(textureImages.value).set(
      imported.blobHash,
      resource.resource,
    )
    const layer = createContentImageLayer({
      id: crypto.randomUUID(),
      blobHash: imported.blobHash,
      format: imported.format,
      intrinsicWidth: imported.width,
      intrinsicHeight: imported.height,
      origin: {
        x: origin.x - imported.width / 2,
        y: origin.y - imported.height / 2,
      },
    })
    // New content deliberately remains unselected; the active Image tool stays
    // active so repeated imports retain the same interaction contract.
    props.documentSession.execute({ type: 'addLayer', layer })
  } finally {
    contentImageImporting.value = false
  }
}
async function pasteNativeClipboard(): Promise<void> {
  const bridge = props.clipboardBridge
  const document = activeDocument.value
  if (!bridge || !document || !props.documentSession || props.readOnlyDocument)
    return
  try {
    const snapshot = await bridge.readClipboardSnapshot(crypto.randomUUID())
    const center = {
      x: document.canvas.width / 2,
      y: document.canvas.height / 2,
    }
    if (snapshot.bitmap) {
      const bitmap = snapshot.bitmap
      const loaded = await loadImageWithBinaryFallback({
        token: bitmap.resourceToken,
        correlationId: crypto.randomUUID(),
        bridge,
        createResource: async (image) => image,
      })
      textureImages.value = new Map(textureImages.value).set(
        bitmap.blobHash,
        loaded.resource,
      )
      props.documentSession.execute({
        type: 'addLayer',
        layer: createContentImageLayer({
          id: crypto.randomUUID(),
          blobHash: bitmap.blobHash,
          format: bitmap.format,
          intrinsicWidth: bitmap.width,
          intrinsicHeight: bitmap.height,
          origin: {
            x: center.x - bitmap.width / 2,
            y: center.y - bitmap.height / 2,
          },
        }),
      })
      return
    }
    if (!snapshot.text) return
    const layer = createTextLayer({
      id: crypto.randomUUID(),
      text: snapshot.text,
      origin: center,
      font: textDefaults.value.font,
      fontSize: textDefaults.value.fontSize,
      weight: textDefaults.value.weight,
      italic: textDefaults.value.italic,
      underline: textDefaults.value.underline,
      letterSpacing: textDefaults.value.letterSpacing,
      alignment: textDefaults.value.alignment,
      lineHeight: textDefaults.value.lineHeight,
      color: textDefaults.value.color,
      fill: textDefaults.value.fill,
      outline: textDefaults.value.outline,
      background: textDefaults.value.background,
      opacity: textDefaults.value.opacity,
      blendMode: textDefaults.value.blendMode,
      shadows: textDefaults.value.shadows,
    })
    if (layer) props.documentSession.execute({ type: 'addLayer', layer })
  } catch (error) {
    console.warn('cute-screen native clipboard paste failed', error)
  }
}
async function copySelectedTextLayer(cut: boolean): Promise<void> {
  const bridge = props.clipboardBridge
  const document = activeDocument.value
  const layerId = store.selectedLayerId
  if (
    !bridge?.writeClipboardText ||
    !document ||
    !layerId ||
    !props.documentSession ||
    props.readOnlyDocument
  )
    return
  const index = document.layers.findIndex((layer) => layer.id === layerId)
  const layer = document.layers[index]
  if (!layer || layer.kind !== 'text' || layer.locked) return
  try {
    await bridge.writeClipboardText(
      layer.payload.content.text,
      crypto.randomUUID(),
    )
    if (cut) {
      props.documentSession.execute({ type: 'removeLayer', layer, index })
    }
  } catch (error) {
    console.warn('cute-screen native text clipboard write failed', error)
  }
}
function executeDocumentCommand(command: unknown): void {
  if (!props.documentSession || props.readOnlyDocument) return
  props.documentSession.execute(command as EditorCommand)
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
  if (!modifier && !event.altKey) {
    const shortcut = event.key.toLowerCase()
    const tool = tools.value.find(
      (candidate) =>
        !candidate.disabled && candidate.shortcut?.toLowerCase() === shortcut,
    )
    if (tool) {
      event.preventDefault()
      store.selectTool(tool.id)
      return
    }
  }
  if (modifier && event.key.toLowerCase() === 'o') {
    if (props.openImageAvailable) {
      event.preventDefault()
      void store.runAction('openImage')
    }
    return
  }
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
      props.documentSession?.execute(
        createDuplicateLayerCommand(source, {
          id: crypto.randomUUID(),
          zoom: Math.max(0.01, store.zoom / 100),
          cascadeIndex: 1,
        }),
      )
    }
    return
  }
  if (
    modifier &&
    (event.key.toLowerCase() === 'c' || event.key.toLowerCase() === 'x') &&
    store.selectedLayerId
  ) {
    if (props.clipboardBridge?.writeClipboardText) {
      event.preventDefault()
      void copySelectedTextLayer(event.key.toLowerCase() === 'x')
    }
    return
  }
  if (modifier && event.key.toLowerCase() === 'v') {
    if (
      props.clipboardBridge &&
      activeDocument.value &&
      props.documentSession
    ) {
      event.preventDefault()
      void pasteNativeClipboard()
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
  syncLayerSummaries(snapshot.core.document)
  void resolveDocumentTextures(snapshot.core.document)
}
function syncLayerSummaries(document: EditorDocumentV1): void {
  store.setLayers([
    ...(textDraft.value
      ? [
          {
            id: textDraft.value.id,
            icon: 'text' as const,
            name: 'Text · Editing…',
            visible: true,
            locked: true,
            opacity: 1,
            rotation: 0,
            transient: true,
          },
        ]
      : []),
    ...[...document.layers].reverse().map((layer) => ({
      id: layer.id,
      icon: (layer.kind === 'image' ? 'image' : 'shape') as 'image' | 'shape',
      name:
        layer.kind === 'image' && layer.payload.role === 'base'
          ? translate('baseImage')
          : layer.kind,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      rotation: layer.transform.rotation,
    })),
  ])
}
function setTextDraft(
  draft: { readonly id: string; readonly kind: 'text' | 'callout' } | undefined,
): void {
  textDraft.value = draft
  if (activeDocument.value) syncLayerSummaries(activeDocument.value)
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
    if (fallbackCopiedTimer) window.clearTimeout(fallbackCopiedTimer)
    fallbackCopiedTimer = window.setTimeout(() => {
      fallbackCopied.value = false
      fallbackCopiedTimer = undefined
    }, 3_000)
  } catch (error) {
    console.warn('cute-screen fallback command copy failed', error)
  }
}
function dismissCaptureFallback(): void {
  fallbackVisible.value = false
  fallbackCopied.value = false
  if (fallbackCopiedTimer) window.clearTimeout(fallbackCopiedTimer)
  fallbackCopiedTimer = undefined
}
function fitCanvas(): void {
  store.enableFit()
  void nextTick(() =>
    window.requestAnimationFrame(() => canvasViewport.value?.refitCanvas()),
  )
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
  const textureBlobHash = (fill: unknown): string | undefined => {
    if (!fill || typeof fill !== 'object') return undefined
    const candidate = fill as Record<string, unknown>
    return candidate.kind === 'imageTexture' &&
      typeof candidate.blobHash === 'string'
      ? candidate.blobHash
      : undefined
  }
  for (const layer of document.layers) {
    const blobHashes =
      layer.kind === 'image' && layer.payload.role === 'content'
        ? [layer.payload.blobHash]
        : layer.kind === 'shape'
          ? [textureBlobHash(layer.payload.fill)]
          : layer.kind === 'text'
            ? [
                textureBlobHash(layer.payload.fill),
                textureBlobHash(layer.payload.background?.fill),
              ]
            : []
    for (const blobHash of blobHashes) {
      if (!blobHash) continue
      const resource = await textureResolver.resolve(blobHash)
      if (resource.kind === 'ready') nextImages.set(blobHash, resource.image)
      else nextImages.delete(blobHash)
    }
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
  personalTextPreset.value =
    createBrowserTextStylePresetsStorage(browserStorage()).load()
  drawingPreferences.value = createBrowserDrawingToolPreferencesStorage(
    browserStorage(),
  ).load() as DrawingToolPreferencesV2
  drawingDefaults.value = drawingPreferences.value.defaults
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
  if (fallbackCopiedTimer) window.clearTimeout(fallbackCopiedTimer)
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
  <NConfigProvider
    :theme="naiveTheme"
    :locale="naiveLocale"
    :date-locale="naiveDateLocale"
    :theme-overrides="cuteScreenThemeOverrides"
    :abstract="false"
  >
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
        :open-image-available="props.openImageAvailable"
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
        v-if="props.captureFallbackCommand && fallbackVisible"
        class="cs-capture-fallback"
        role="status"
        aria-live="polite"
        data-placement="overlay"
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
        <button
          class="cs-capture-fallback-dismiss"
          type="button"
          :aria-label="translate('dismissCaptureFallback')"
          :title="translate('dismissCaptureFallback')"
          @click="dismissCaptureFallback"
        >
          <UiIcon name="close" />
        </button>
      </div>
      <div class="cs-workbench">
        <ToolRail
          :tools="tools"
          :active-tool-id="store.activeToolId"
          :t="translate"
          @select="selectTool"
        />
        <CanvasViewport
          ref="canvasViewport"
          :document-state="store.documentState"
          :canvas="activeDocument?.canvas"
          :image="props.sourceImage"
          :texture-images="textureImages"
          :image-layer="baseImageLayer"
          :document="activeDocument"
          :selected-layer-id="store.selectedLayerId"
          :selected-layer-ids="store.selectedLayerIds"
          :active-tool="store.activeToolId"
          :sampling="
            Boolean(samplingControl || store.activeToolId === 'eyedropper')
          "
          :drawing-defaults="drawingDefaults"
          :text-defaults="textDefaults"
          :text-style-revision="textStyleRevision"
          :next-marker-sequence="
            activeDocument
              ? nextNumberedMarkerSequence(activeDocument.layers)
              : undefined
          "
          :marker-shape="markerShape"
          :open-image-available="props.openImageAvailable"
          :zoom="store.zoom"
          :fit-mode="store.zoomMode === 'fit'"
          :t="translate"
          @hosts-ready="emit('hostsReady', $event)"
          @select-layer="selectLayer"
          @move-layer="moveLayer"
          @transform-layer="transformLayer"
          @update-layer-payload="updateLayerPayload"
          @add-layer="addLayer"
          @document-command="executeDocumentCommand"
          @text-editing="setTextDraft"
          @request-image-import="importContentImage"
          @open-image="store.runAction('openImage')"
          @select-tool="store.selectTool"
          @color-sample="onColorSample"
          @color-sample-error="onColorSampleError"
          @color-sample-cancel="onColorSampleCancel"
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
          @fit="fitCanvas"
        />
        <ContextToolbar
          :schema="contextSchema"
          :label="translate('toolSettings')"
          :recent-colors="drawingPreferences.recentColors"
          :picker-locale="state.locale.value"
          @action="onContextAction"
          @change="onColorChange"
          @eyedropper="startEyedropper"
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
      <div class="cs-overlay-root" aria-live="polite" />
      <p v-if="eyedropperFeedback" class="cs-eyedropper-feedback" role="status">
        {{ eyedropperFeedback }}
      </p>
    </div>
  </NConfigProvider>
</template>
