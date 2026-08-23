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
  NButton,
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
import { useEditorShellStore, type ShellStoreOptions } from '../store'
import type { CaptureProgressState } from '../../platform'
import type {
  CanvasViewportHosts,
  ContextToolbarSchema,
  FrameSummary,
  PrecisionToolDefaults,
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
  DEFAULT_RULER_COLOR,
  DEFAULT_RULER_FONT_SIZE,
  DEFAULT_RULER_THICKNESS,
  rememberDrawingColor,
  rebaseArrowLayer,
  rebaseCalloutLayer,
  rebaseRulerLayer,
  type DrawingDefaults,
  type DrawingToolPreferencesV2,
  type EditorDocumentV1,
  type EditorCommand,
  type ImageLayer,
  type JsonObject,
  type LayerNode,
  type CensorLayer,
  type SpotlightLayer,
  type RulerLayer,
  type LoupeLayer,
  type CropPreset,
  type SrgbColor,
  type TextBackground,
  type RichTextContent,
  type RichTextParagraphStyle,
  type RichTextSpanStyle,
  applyRichTextParagraphStyle,
  applyRichTextSpanStyle,
  type Transform2D,
} from '@cute-screen/editor-renderer'
import ActionFeedback from './ActionFeedback.vue'
import ArrowFormattingToolbar from './ArrowFormattingToolbar.vue'
import CanvasViewport, {
  type TextFormattingPatch,
  type TextToolbarSnapshot,
  type TextToolDefaults,
} from './CanvasViewport.vue'
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
    quickMode?: boolean
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
    quickMode: false,
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
  fontFamily: 'Roboto',
  fontSize: 24,
  weight: 400,
  italic: false,
  strikethrough: false,
  alignment: 'start',
  listKind: 'none',
  color: { red: 0, green: 0, blue: 0, alpha: 1 },
  background: null,
})
const textFormatting = shallowRef<TextFormattingPatch>()
let textFormattingRevision = 0
const textDraft = ref<
  | {
      readonly id: string
      readonly kind: 'text' | 'callout' | 'numberedMarker'
      readonly snapshot: TextToolbarSnapshot
    }
  | undefined
>()
const toolConfigure = ref<
  | {
      readonly toolId: string
      readonly anchor: HTMLElement
    }
  | undefined
>()
const toolConfigureLayout = ref<
  | {
      readonly left: number
      readonly top: number
    }
  | undefined
>()
const configureDefaultsTool = ref<'arrow' | undefined>()
/* Removed v0–v6 text presets/effects. Kept as a short-term source comment so
 * surrounding drawing-tool code remains untouched in this concurrent checkout.
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
*/
const markerShape = ref<'circle' | 'square' | 'diamond' | 'star'>('circle')
const cropPreset = ref<CropPreset>('free')
const precisionDefaults = shallowRef<PrecisionToolDefaults>({
  censor: {
    region: 'rectangle',
    mode: 'pixelate',
    blockSize: 12,
    blurStrength: 12,
    solidColor: { red: 0, green: 0, blue: 0, alpha: 1 },
  },
  spotlight: {
    shape: 'rectangle',
    dimColor: { red: 0, green: 0, blue: 0, alpha: 1 },
    dimOpacity: 0.65,
    feather: 'soft',
  },
  ruler: {
    unit: 'pixels',
    snap: true,
    snapAngleIncrementDegrees: 15,
    color: DEFAULT_RULER_COLOR,
    thickness: DEFAULT_RULER_THICKNESS,
    fontSize: DEFAULT_RULER_FONT_SIZE,
  },
  loupe: {
    zoom: 2,
    size: 120,
    shape: 'circle',
    borderColor: { red: 1, green: 1, blue: 1, alpha: 1 },
    borderWidth: 3,
    shadow: true,
  },
})
const contentImageImporting = ref(false)
const drawingPreferences = shallowRef<DrawingToolPreferencesV2>(
  defaultDrawingToolPreferences(),
)
const samplingControl = ref<string>()
const eyedropperFeedback = ref<string>()
const eyedropperColor = ref<string>()
const toolError = ref<string>()
let textureResolver: TextureResourceResolver | undefined
const textureImages = ref<ReadonlyMap<string, HTMLImageElement>>(new Map())
const activeDocument = ref<EditorDocumentV1>()
const baseImageLayer = computed(() =>
  activeDocument.value?.layers.find(
    (layer): layer is ImageLayer =>
      layer.kind === 'image' && layer.payload.role === 'base',
  ),
)
const sceneTexturesReady = computed(() => {
  const document = activeDocument.value
  if (!document) return false
  if (baseImageLayer.value && !props.sourceImage) return false
  return document.layers.every(
    (layer) =>
      layer.kind !== 'image' ||
      layer.payload.role !== 'content' ||
      textureImages.value.has(layer.payload.blobHash),
  )
})
const translate = (key: Parameters<typeof t>[1]) => t(state.locale.value, key)
const hasInteractiveDocument = computed(
  () => props.documentSession !== undefined || props.fixture === 'ready',
)
const allTools = computed<readonly ToolDescriptor[]>(() => [
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
    disabled: !activeDocument.value || props.readOnlyDocument,
    disabledReasonKey: !activeDocument.value
      ? 'toolNeedsCanvas'
      : 'readOnlyDocument',
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
    disabled: !activeDocument.value,
    disabledReasonKey: 'toolNeedsCanvas',
  },
  {
    id: 'censor',
    group: 'more',
    icon: 'privacy',
    labelKey: 'toolPrivacy',
    disabled: !activeDocument.value || props.readOnlyDocument,
    disabledReasonKey: !activeDocument.value
      ? 'toolNeedsCanvas'
      : 'readOnlyDocument',
  },
  {
    id: 'spotlight',
    group: 'more',
    icon: 'spotlight',
    labelKey: 'toolSpotlight',
    disabled: !activeDocument.value || props.readOnlyDocument,
    disabledReasonKey: !activeDocument.value
      ? 'toolNeedsCanvas'
      : 'readOnlyDocument',
  },
  {
    id: 'ruler',
    group: 'more',
    icon: 'ruler',
    labelKey: 'toolRuler',
    shortcut: 'R',
    disabled: !activeDocument.value || props.readOnlyDocument,
    disabledReasonKey: !activeDocument.value
      ? 'toolNeedsCanvas'
      : 'readOnlyDocument',
  },
  {
    id: 'loupe',
    group: 'more',
    icon: 'loupe',
    labelKey: 'toolLoupe',
    shortcut: 'L',
    disabled: !activeDocument.value || props.readOnlyDocument,
    disabledReasonKey: !activeDocument.value
      ? 'toolNeedsCanvas'
      : 'readOnlyDocument',
  },
])
const quickToolIds = new Set([
  'select',
  'arrow',
  'shape',
  'pencil',
  'marker',
  'text',
  'numberedMarker',
  'callout',
  'image',
  'eyedropper',
  'censor',
  'spotlight',
  'ruler',
  'loupe',
])
const tools = computed<readonly ToolDescriptor[]>(() =>
  props.quickMode
    ? allTools.value.filter((tool) => quickToolIds.has(tool.id))
    : allTools.value,
)
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
type PrecisionLayer = CensorLayer | SpotlightLayer | RulerLayer | LoupeLayer
type PrecisionTool = PrecisionLayer['kind']
function precisionText(english: string, russian: string): string {
  return state.locale.value === 'ru' ? russian : english
}
function selectedPrecisionLayer(): PrecisionLayer | undefined {
  if (store.selectedLayerIds.length !== 1) return undefined
  const layer = activeDocument.value?.layers.find(
    (candidate) => candidate.id === store.selectedLayerId,
  )
  return layer?.kind === 'censor' ||
    layer?.kind === 'spotlight' ||
    layer?.kind === 'ruler' ||
    layer?.kind === 'loupe'
    ? layer
    : undefined
}
function precisionToolSchema(
  tool: PrecisionTool,
  selected?: PrecisionLayer,
): ContextToolbarSchema {
  const defaults = precisionDefaults.value
  if (tool === 'censor') {
    const layer = selected?.kind === 'censor' ? selected : undefined
    const controlsDisabled =
      props.readOnlyDocument || !activeDocument.value || Boolean(layer?.locked)
    const selectedEffect = layer?.payload.effect as
      | {
          readonly mode: 'pixelate' | 'blur' | 'solid'
          readonly blockSize?: number
          readonly strength?: number
          readonly color?: SrgbColor
        }
      | undefined
    const mode = selectedEffect?.mode ?? defaults.censor.mode
    const selectedSolidColor =
      selectedEffect?.mode === 'solid' && selectedEffect.color
        ? selectedEffect.color
        : defaults.censor.solidColor
    return {
      icon: 'privacy',
      title: translate('toolPrivacy'),
      hint: precisionText(
        'Drag to hide data manually',
        'Потяните, чтобы скрыть данные вручную',
      ),
      controls: [
        {
          kind: 'select',
          id: 'censorRegion',
          label: precisionText('Region', 'Область'),
          value: layer?.payload.region.kind ?? defaults.censor.region,
          disabled: controlsDisabled,
          options: [
            {
              value: 'rectangle',
              label: precisionText('Rectangle', 'Прямоугольник'),
            },
            {
              value: 'freeform',
              label: precisionText('Freeform', 'Произвольная'),
            },
          ],
        },
        {
          kind: 'select',
          id: 'censorMode',
          label: precisionText('Effect', 'Эффект'),
          value: mode,
          disabled: controlsDisabled,
          options: [
            {
              value: 'pixelate',
              label: precisionText('Pixelate', 'Пикселизация'),
            },
            { value: 'blur', label: precisionText('Blur', 'Размытие') },
            { value: 'solid', label: precisionText('Solid', 'Сплошной цвет') },
          ],
        },
        ...(mode === 'pixelate'
          ? [
              {
                kind: 'range' as const,
                id: 'censorBlockSize',
                label: precisionText('Block size', 'Размер блока'),
                value:
                  selectedEffect?.mode === 'pixelate'
                    ? (selectedEffect.blockSize ?? defaults.censor.blockSize)
                    : defaults.censor.blockSize,
                min: 2,
                max: 128,
                step: 1,
                disabled: controlsDisabled,
              },
            ]
          : mode === 'blur'
            ? [
                {
                  kind: 'range' as const,
                  id: 'censorBlurStrength',
                  label: precisionText('Blur strength', 'Сила размытия'),
                  value:
                    selectedEffect?.mode === 'blur'
                      ? (selectedEffect.strength ??
                        defaults.censor.blurStrength)
                      : defaults.censor.blurStrength,
                  min: 0.5,
                  max: 128,
                  step: 0.5,
                  disabled: controlsDisabled,
                },
              ]
            : [
                {
                  kind: 'color' as const,
                  id: 'censorSolidColor',
                  label: precisionText('Solid color', 'Сплошной цвет'),
                  value: hexColor(selectedSolidColor),
                  disabled: controlsDisabled,
                  eyedropper:
                    Boolean(activeDocument.value) && !controlsDisabled,
                },
              ]),
      ],
    }
  }
  if (tool === 'spotlight') {
    const layer = selected?.kind === 'spotlight' ? selected : undefined
    const controlsDisabled =
      props.readOnlyDocument || !activeDocument.value || Boolean(layer?.locked)
    return {
      icon: 'spotlight',
      title: translate('toolSpotlight'),
      hint: precisionText('Drag an aperture', 'Потяните область подсветки'),
      controls: [
        {
          kind: 'select',
          id: 'spotlightShape',
          label: precisionText('Shape', 'Форма'),
          value: layer?.payload.shape ?? defaults.spotlight.shape,
          disabled: controlsDisabled,
          options: [
            {
              value: 'rectangle',
              label: precisionText('Rectangle', 'Прямоугольник'),
            },
            { value: 'ellipse', label: precisionText('Ellipse', 'Эллипс') },
            { value: 'diamond', label: precisionText('Diamond', 'Ромб') },
          ],
        },
        {
          kind: 'color',
          id: 'spotlightDimColor',
          label: precisionText('Dim color', 'Цвет затемнения'),
          value: hexColor(
            layer?.payload.dimColor ?? defaults.spotlight.dimColor,
          ),
          disabled: controlsDisabled,
          eyedropper: Boolean(activeDocument.value) && !controlsDisabled,
        },
        {
          kind: 'range',
          id: 'spotlightDimOpacity',
          label: precisionText('Dim opacity', 'Непрозрачность затемнения'),
          value:
            (layer?.payload.dimOpacity ?? defaults.spotlight.dimOpacity) * 100,
          min: 0,
          max: 100,
          step: 1,
          disabled: controlsDisabled,
        },
        {
          kind: 'select',
          id: 'spotlightFeather',
          label: precisionText('Feather', 'Растушёвка'),
          value: layer?.payload.feather ?? defaults.spotlight.feather ?? 'none',
          disabled: controlsDisabled,
          options: [
            { value: 'none', label: precisionText('None', 'Нет') },
            { value: 'soft', label: precisionText('Soft', 'Мягкая') },
            { value: 'strong', label: precisionText('Strong', 'Сильная') },
          ],
        },
      ],
    }
  }
  if (tool === 'ruler') {
    const layer = selected?.kind === 'ruler' ? selected : undefined
    const controlsDisabled =
      props.readOnlyDocument || !activeDocument.value || Boolean(layer?.locked)
    return {
      icon: 'ruler',
      title: translate('toolRuler'),
      hint: precisionText(
        'Hold Alt for angle guides',
        'Удерживайте Alt для угловых направляющих',
      ),
      controls: [
        {
          kind: 'color',
          id: 'rulerColor',
          label: precisionText('Colour', 'Цвет'),
          value: hexColor(layer?.payload.color ?? defaults.ruler.color),
          disabled: controlsDisabled,
          eyedropper: Boolean(activeDocument.value) && !controlsDisabled,
        },
        {
          kind: 'range',
          id: 'rulerThickness',
          label: precisionText('Thickness', 'Толщина'),
          value: layer?.payload.thickness ?? defaults.ruler.thickness,
          min: 1,
          max: 12,
          step: 1,
          disabled: controlsDisabled,
        },
        {
          kind: 'range',
          id: 'rulerFontSize',
          label: precisionText('Label size', 'Размер подписи'),
          value: layer?.payload.fontSize ?? defaults.ruler.fontSize,
          min: 10,
          max: 48,
          step: 1,
          disabled: controlsDisabled,
        },
        {
          kind: 'select',
          id: 'rulerUnit',
          label: precisionText('Unit', 'Единицы'),
          value: layer?.payload.unit ?? defaults.ruler.unit,
          disabled: controlsDisabled,
          options: [
            { value: 'pixels', label: precisionText('Pixels', 'Пиксели') },
            { value: 'percent', label: precisionText('Percent', 'Проценты') },
          ],
        },
        {
          kind: 'select',
          id: 'rulerSnap',
          label: precisionText('Snapping', 'Привязка'),
          value: defaults.ruler.snap ? 'on' : 'off',
          disabled: controlsDisabled || Boolean(layer),
          options: [
            { value: 'on', label: precisionText('On', 'Вкл.') },
            { value: 'off', label: precisionText('Off', 'Выкл.') },
          ],
        },
        {
          kind: 'range',
          id: 'rulerAngle',
          label: precisionText('Angle step', 'Шаг угла'),
          value:
            layer?.payload.snapAngleIncrementDegrees ??
            defaults.ruler.snapAngleIncrementDegrees,
          min: 1,
          max: 90,
          step: 1,
          disabled: controlsDisabled,
        },
      ],
    }
  }
  const layer = selected?.kind === 'loupe' ? selected : undefined
  const controlsDisabled =
    props.readOnlyDocument || !activeDocument.value || Boolean(layer?.locked)
  return {
    icon: 'loupe',
    title: translate('toolLoupe'),
    hint: precisionText(
      'Drag from source to lens',
      'Потяните от источника к линзе',
    ),
    controls: [
      {
        kind: 'range',
        id: 'loupeZoom',
        label: precisionText('Zoom', 'Увеличение'),
        value: layer?.payload.zoom ?? defaults.loupe.zoom,
        min: 1,
        max: 16,
        step: 0.5,
        disabled: controlsDisabled,
      },
      {
        kind: 'range',
        id: 'loupeSize',
        label: precisionText('Size', 'Размер'),
        value: layer?.payload.lens.size ?? defaults.loupe.size,
        min: 16,
        max: 512,
        step: 1,
        disabled: controlsDisabled,
      },
      {
        kind: 'select',
        id: 'loupeShape',
        label: precisionText('Shape', 'Форма'),
        value: layer?.payload.lens.shape ?? defaults.loupe.shape,
        disabled: controlsDisabled,
        options: [
          { value: 'circle', label: precisionText('Circle', 'Круг') },
          {
            value: 'rectangle',
            label: precisionText('Rectangle', 'Прямоугольник'),
          },
        ],
      },
      {
        kind: 'color',
        id: 'loupeBorderColor',
        label: precisionText('Border color', 'Цвет рамки'),
        value: hexColor(
          layer?.payload.border.color ?? defaults.loupe.borderColor,
        ),
        disabled: controlsDisabled,
        eyedropper: Boolean(activeDocument.value) && !controlsDisabled,
      },
      {
        kind: 'range',
        id: 'loupeBorderWidth',
        label: precisionText('Border width', 'Толщина рамки'),
        value: layer?.payload.border.width ?? defaults.loupe.borderWidth,
        min: 0,
        max: 64,
        step: 1,
        disabled: controlsDisabled,
      },
      {
        kind: 'select',
        id: 'loupeShadow',
        label: precisionText('Shadow', 'Тень'),
        value: (layer ? layer.payload.shadow !== null : defaults.loupe.shadow)
          ? 'on'
          : 'off',
        disabled: controlsDisabled,
        options: [
          { value: 'on', label: precisionText('On', 'Вкл.') },
          { value: 'off', label: precisionText('Off', 'Выкл.') },
        ],
      },
    ],
  }
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
function buildTextContextSchema(
  selectedCandidate: LayerNode | undefined,
  tool: string,
): ContextToolbarSchema | undefined {
  const selectedText =
    selectedCandidate?.kind === 'text' ||
    selectedCandidate?.kind === 'callout' ||
    selectedCandidate?.kind === 'numberedMarker'
      ? selectedCandidate
      : undefined
  const textKind =
    textDraft.value?.kind ??
    (selectedText?.kind === 'text' ||
    selectedText?.kind === 'callout' ||
    selectedText?.kind === 'numberedMarker'
      ? selectedText.kind
      : tool === 'text' || tool === 'callout' || tool === 'numberedMarker'
        ? tool
        : undefined)
  if (!textKind) return undefined
  const snapshot = textDraft.value?.snapshot
  const content: RichTextContent | undefined = selectedText
    ? selectedText.kind === 'numberedMarker'
      ? selectedText.payload.label
      : selectedText.payload.content
    : undefined
  const spans = content?.spans ?? []
  const paragraphs = content?.paragraphs ?? []
  const same = <T,>(values: readonly T[], fallback: T): T | null =>
    values.length === 0 || values.every((value) => value === values[0])
      ? (values[0] ?? fallback)
      : null
  const sameColor = (values: readonly SrgbColor[]): SrgbColor | null => {
    const firstColor = values[0]
    if (firstColor === undefined) return textDefaults.value.color
    return values.every(
      (color) =>
        color.red === firstColor.red &&
        color.green === firstColor.green &&
        color.blue === firstColor.blue &&
        color.alpha === firstColor.alpha,
    )
      ? firstColor
      : null
  }
  const first = spans[0]
  const selectedColor = sameColor(spans.map((span) => span.color))
  const background =
    selectedText?.kind === 'text'
      ? selectedText.payload.background
      : selectedText?.kind === 'callout'
        ? selectedText.payload.background
        : selectedText?.kind === 'numberedMarker'
          ? { color: selectedText.payload.badge.color, padding: 0, radius: 0 }
          : textDefaults.value.background
  const calloutStroke =
    selectedText?.kind === 'callout' ? selectedText.payload.stroke : undefined
  const textToolbar = {
    kind: textKind,
    color: snapshot
      ? snapshot.color
        ? hexColor(snapshot.color)
        : null
      : selectedColor
        ? hexColor(selectedColor)
        : null,
    fontFamily: snapshot
      ? snapshot.fontFamily
      : same(
          spans.map((span) => span.fontFamily),
          textDefaults.value.fontFamily,
        ),
    fonts: [
      ...new Set([
        'Roboto',
        'Arial',
        'Georgia',
        'monospace',
        ...(props.systemFonts ?? []).map((face) => face.family),
        snapshot?.fontFamily ??
          first?.fontFamily ??
          textDefaults.value.fontFamily,
      ]),
    ],
    fontSize: snapshot
      ? snapshot.fontSize
      : same(
          spans.map((span) => span.fontSize),
          textDefaults.value.fontSize,
        ),
    bold: snapshot
      ? snapshot.weight === null
        ? null
        : snapshot.weight >= 700
      : same(
          spans.map((span) => span.weight >= 700),
          textDefaults.value.weight >= 700,
        ),
    italic: snapshot
      ? snapshot.italic
      : same(
          spans.map((span) => span.italic),
          textDefaults.value.italic,
        ),
    strikethrough: snapshot
      ? snapshot.strikethrough
      : same(
          spans.map((span) => span.strikethrough),
          textDefaults.value.strikethrough,
        ),
    listKind: snapshot
      ? snapshot.listKind
      : same(
          paragraphs.map((paragraph) => paragraph.listKind),
          textDefaults.value.listKind,
        ),
    alignment: snapshot
      ? snapshot.alignment
      : same(
          paragraphs.map((paragraph) => paragraph.alignment),
          textDefaults.value.alignment,
        ),
    background: (snapshot ? snapshot.background : background)
      ? {
          color: hexColor((snapshot ? snapshot.background : background)!.color),
          padding: (snapshot ? snapshot.background : background)!.padding,
          radius: (snapshot ? snapshot.background : background)!.radius,
        }
      : null,
    disabled:
      textKind === 'numberedMarker'
        ? (['list', 'none', 'padding', 'radius'] as const)
        : [],
  }
  return {
    icon: 'text' as const,
    title:
      textKind === 'callout'
        ? translate('toolCallout')
        : textKind === 'numberedMarker'
          ? translate('toolNumberedMarker')
          : translate('toolText'),
    hint: translate('canvasViewport'),
    controls:
      textKind === 'callout' && calloutStroke
        ? [
            {
              kind: 'color' as const,
              id: 'color' as const,
              label: translate('color'),
              value: hexColor(calloutStroke.color),
              compact: true,
              disabled: Boolean(
                props.readOnlyDocument ||
                (selectedText?.kind === 'callout' && selectedText.locked),
              ),
              eyedropper:
                Boolean(activeDocument.value) &&
                !(
                  props.readOnlyDocument ||
                  (selectedText?.kind === 'callout' && selectedText.locked)
                ),
            },
            {
              kind: 'arrowStroke' as const,
              id: 'stroke' as const,
              label: translate('arrowStroke'),
              width: calloutStroke.width,
              style: (calloutStroke.style === 'solid' ||
              calloutStroke.style === 'dotted'
                ? calloutStroke.style
                : 'dashed') as 'solid' | 'dashed' | 'dotted',
              disabled: Boolean(
                props.readOnlyDocument ||
                (selectedText?.kind === 'callout' && selectedText.locked),
              ),
              solidLabel: translate('arrowSolid'),
              dashedLabel: translate('arrowDashed'),
              dottedLabel: translate('arrowDotted'),
            },
          ]
        : [],
    text: textToolbar,
  }
}
const floatingTextToolbarSchema = computed(() => {
  if (!textDraft.value) return undefined
  const selectedCandidate =
    store.selectedLayerIds.length === 1
      ? activeDocument.value?.layers.find(
          (layer) => layer.id === store.selectedLayerId,
        )
      : undefined
  const schema = buildTextContextSchema(
    selectedCandidate,
    state.activeToolId.value ?? 'select',
  )
  if (!schema?.text) return undefined
  return { text: schema.text, title: schema.title }
})
const floatingArrowToolbarSchema = computed(() => {
  if ((state.activeToolId.value ?? 'select') !== 'select') return undefined
  if (store.selectedLayerIds.length !== 1) return undefined
  const layer = activeDocument.value?.layers.find(
    (candidate) => candidate.id === store.selectedLayerId,
  )
  if (!layer || layer.kind !== 'arrow') return undefined
  const schema = drawingControl('arrow', layer.payload)
  return { controls: schema.controls, title: schema.title }
})
const toolConfigureArrowSchema = computed(() => {
  if (toolConfigure.value?.toolId !== 'arrow') return undefined
  const schema = drawingControl('arrow', drawingDefaults.value.arrow)
  return { controls: schema.controls, title: schema.title }
})
const contextSchema = computed(() => {
  const tool = state.activeToolId.value ?? 'select'
  const selectedCandidate =
    store.selectedLayerIds.length === 1
      ? activeDocument.value?.layers.find(
          (layer) => layer.id === store.selectedLayerId,
        )
      : undefined
  if (tool === 'crop') {
    return {
      icon: 'crop' as const,
      title: translate('toolCrop'),
      hint: precisionText(
        'Enter applies · Escape cancels',
        'Enter применяет · Escape отменяет',
      ),
      controls: [
        {
          kind: 'select' as const,
          id: 'cropPreset',
          label: precisionText('Preset', 'Пропорции'),
          value: cropPreset.value,
          options: [
            { value: 'free', label: precisionText('Free', 'Свободно') },
            { value: '1:1', label: '1:1' },
            { value: '4:3', label: '4:3' },
            { value: '16:9', label: '16:9' },
            { value: 'original', label: precisionText('Original', 'Оригинал') },
          ],
        },
        {
          kind: 'action' as const,
          id: 'cropReset',
          label: precisionText('Reset', 'Сбросить'),
        },
        {
          kind: 'action' as const,
          id: 'cropApply',
          label: precisionText('Apply', 'Применить'),
        },
        {
          kind: 'action' as const,
          id: 'cropCancel',
          label: translate('cancel'),
        },
      ],
    }
  }
  const selectedPrecision = selectedPrecisionLayer()
  const precisionTool =
    tool === 'censor' ||
    tool === 'spotlight' ||
    tool === 'ruler' ||
    tool === 'loupe'
      ? tool
      : tool === 'select'
        ? selectedPrecision?.kind
        : undefined
  if (precisionTool)
    return precisionToolSchema(precisionTool, selectedPrecision)
  const textSchema = buildTextContextSchema(selectedCandidate, tool ?? 'select')
  if (textSchema) {
    if (textDraft.value) {
      return {
        icon: textSchema.icon,
        title: textSchema.title,
        hint: textSchema.hint,
        controls: textSchema.controls,
      }
    }
    return textSchema
  }
  /* Legacy v0–v6 text controls intentionally removed from the v7 toolbar.
  if (tool === 'text' && false) {
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
  }
  */
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
    if (tool === 'arrow') return undefined
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
    if (selected.kind === 'arrow') return undefined
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
  if (id === 'cropReset') {
    cropPreset.value = 'free'
    canvasViewport.value?.resetCropDraft()
    return
  }
  if (id === 'cropApply') {
    canvasViewport.value?.applyCropDraft()
    return
  }
  if (id === 'cropCancel') {
    canvasViewport.value?.cancelCropDraft()
    return
  }
  /* Legacy style-preset and text-texture actions are intentionally absent. */
  /*
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
  */
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
function parseTextColor(value: string): SrgbColor | undefined {
  const match = /^#([0-9a-f]{6})$/iu.exec(value)
  if (!match) return undefined
  const hex = match[1]!
  return {
    red: Number.parseInt(hex.slice(0, 2), 16) / 255,
    green: Number.parseInt(hex.slice(2, 4), 16) / 255,
    blue: Number.parseInt(hex.slice(4, 6), 16) / 255,
    alpha: 1,
  }
}
function selectedTextBearingLayer():
  | Extract<LayerNode, { readonly kind: 'text' | 'callout' | 'numberedMarker' }>
  | undefined {
  if (store.selectedLayerIds.length !== 1) return undefined
  const layer = activeDocument.value?.layers.find(
    (candidate) => candidate.id === store.selectedLayerId,
  )
  return layer?.kind === 'text' ||
    layer?.kind === 'callout' ||
    layer?.kind === 'numberedMarker'
    ? layer
    : undefined
}
function updateWholeTextLayer(
  span: { -readonly [K in keyof RichTextSpanStyle]?: RichTextSpanStyle[K] },
  paragraph: {
    -readonly [K in keyof RichTextParagraphStyle]?: RichTextParagraphStyle[K]
  },
  background?: TextBackground | null,
): void {
  const layer = selectedTextBearingLayer()
  if (!layer || layer.locked || !props.documentSession || textDraft.value)
    return
  const content =
    layer.kind === 'numberedMarker'
      ? layer.payload.label
      : layer.payload.content
  const firstSpan = content.spans[0]
  const firstParagraph = content.paragraphs[0]
  if (!firstSpan || !firstParagraph) return
  const selection = { anchor: 0, focus: content.text.length }
  const styled = applyRichTextSpanStyle(
    {
      content,
      selection,
      typingStyle: firstSpan,
      paragraphStyle: firstParagraph,
    },
    span,
  )
  const formatted = applyRichTextParagraphStyle(styled, paragraph)
  const after =
    layer.kind === 'text'
      ? {
          ...layer,
          payload: {
            ...layer.payload,
            content: formatted.content,
            ...(background === undefined ? {} : { background }),
          },
        }
      : layer.kind === 'callout'
        ? {
            ...layer,
            payload: {
              ...layer.payload,
              content: formatted.content,
              ...(background === undefined
                ? {}
                : { background: background ?? layer.payload.background }),
            },
          }
        : {
            ...layer,
            payload: {
              ...layer.payload,
              label: formatted.content,
              ...(background === undefined
                ? {}
                : {
                    badge: {
                      ...layer.payload.badge,
                      color: background?.color ?? layer.payload.badge.color,
                    },
                  }),
            },
          }
  props.documentSession.execute({ type: 'updateLayer', before: layer, after })
}
function applyV7TextChange(id: string, value: string): boolean {
  const span: {
    -readonly [K in keyof RichTextSpanStyle]?: RichTextSpanStyle[K]
  } = {}
  const paragraph: {
    -readonly [K in keyof RichTextParagraphStyle]?: RichTextParagraphStyle[K]
  } = {}
  let background: TextBackground | null | undefined
  if (id === 'textColor') {
    const color = parseTextColor(value)
    if (!color) return true
    textDefaults.value = { ...textDefaults.value, color }
    span.color = color
  } else if (id === 'textFont') {
    if (!value.trim()) return true
    textDefaults.value = { ...textDefaults.value, fontFamily: value }
    span.fontFamily = value
  } else if (id === 'textFontSize') {
    const fontSize = Number(value)
    if (!Number.isInteger(fontSize) || fontSize < 8 || fontSize > 256)
      return true
    textDefaults.value = { ...textDefaults.value, fontSize }
    span.fontSize = fontSize
  } else if (id === 'textBold') {
    const weight = value === 'true' ? 700 : 400
    textDefaults.value = {
      ...textDefaults.value,
      weight: weight as TextToolDefaults['weight'],
    }
    span.weight = weight as TextToolDefaults['weight']
  } else if (id === 'textItalic' || id === 'textStrikethrough') {
    const enabled = value === 'true'
    if (id === 'textItalic') {
      textDefaults.value = { ...textDefaults.value, italic: enabled }
      span.italic = enabled
    } else {
      textDefaults.value = { ...textDefaults.value, strikethrough: enabled }
      span.strikethrough = enabled
    }
  } else if (id === 'textList') {
    if (value !== 'none' && value !== 'bullet') return true
    textDefaults.value = { ...textDefaults.value, listKind: value }
    paragraph.listKind = value
  } else if (id === 'textAlign') {
    if (value !== 'start' && value !== 'center' && value !== 'end') return true
    textDefaults.value = { ...textDefaults.value, alignment: value }
    paragraph.alignment = value
  } else if (id === 'textBackground') {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch (error) {
      console.warn('cute-screen text background draft is invalid', error)
      return true
    }
    if (parsed === null) background = null
    else if (typeof parsed === 'object' && parsed !== null) {
      const draft = parsed as {
        color?: unknown
        padding?: unknown
        radius?: unknown
      }
      const color =
        typeof draft.color === 'string'
          ? parseTextColor(draft.color)
          : undefined
      const padding = Number(draft.padding)
      const radius = Number(draft.radius)
      if (
        !color ||
        !Number.isInteger(padding) ||
        !Number.isInteger(radius) ||
        padding < 0 ||
        padding > 256 ||
        radius < 0 ||
        radius > 256
      )
        return true
      background = { color, padding, radius }
    } else return true
    textDefaults.value = { ...textDefaults.value, background }
  } else return false
  if (textDraft.value) {
    textFormatting.value = {
      revision: ++textFormattingRevision,
      ...(Object.keys(span).length > 0 ? { span } : {}),
      ...(Object.keys(paragraph).length > 0 ? { paragraph } : {}),
      ...(background === undefined ? {} : { background }),
    }
    return true
  }
  updateWholeTextLayer(span, paragraph, background)
  return true
}
function applyCalloutStrokeChange(id: string, value: string): boolean {
  if (id !== 'color' && id !== 'stroke') return false
  const selected = activeDocument.value?.layers.find(
    (layer) => layer.id === store.selectedLayerId,
  )
  if (
    selected?.kind !== 'callout' ||
    selected.locked ||
    !props.documentSession
  ) {
    return false
  }
  if (id === 'color') {
    const color = parseTextColor(value)
    if (!color) return true
    const after = rebaseCalloutLayer(selected, {
      ...selected.payload,
      stroke: { ...selected.payload.stroke, color },
    })
    props.documentSession.execute({
      type: 'updateLayer',
      before: selected,
      after,
    })
    return true
  }
  if (id === 'stroke') {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch (error) {
      console.warn('cute-screen callout stroke draft is invalid', error)
      return true
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return true
    }
    const draft = parsed as { width?: unknown; style?: unknown }
    const width = Number(draft.width)
    const style = draft.style
    if (
      !Number.isFinite(width) ||
      width < 1 ||
      width > 24 ||
      (style !== 'solid' && style !== 'dashed' && style !== 'dotted')
    ) {
      return true
    }
    const after = rebaseCalloutLayer(selected, {
      ...selected.payload,
      stroke: {
        ...selected.payload.stroke,
        width,
        style,
      },
    })
    props.documentSession.execute({
      type: 'updateLayer',
      before: selected,
      after,
    })
    return true
  }
  return false
}
function precisionToolForControl(id: string): PrecisionTool | undefined {
  return (['censor', 'spotlight', 'ruler', 'loupe'] as const).find((tool) =>
    id.startsWith(tool),
  )
}
function precisionChangeBlocked(id: string): boolean {
  const tool = precisionToolForControl(id)
  if (!tool) return false
  const selected = selectedPrecisionLayer()
  return (
    !activeDocument.value ||
    props.readOnlyDocument ||
    (selected?.kind === tool && Boolean(selected.locked))
  )
}
function applyPrecisionChange(id: string, value: string): boolean {
  const tool = precisionToolForControl(id)
  if (!tool) return false
  const selectedCandidate = selectedPrecisionLayer()
  const selected =
    selectedCandidate?.kind === tool ? selectedCandidate : undefined
  if (!activeDocument.value || props.readOnlyDocument || selected?.locked)
    return true
  let nextDefaults = precisionDefaults.value
  let after: LayerNode | undefined
  const number = Number(value)
  if (
    id === 'censorRegion' &&
    (value === 'rectangle' || value === 'freeform')
  ) {
    nextDefaults = {
      ...nextDefaults,
      censor: { ...nextDefaults.censor, region: value },
    }
    if (selected?.kind === 'censor') {
      after = {
        ...selected,
        payload: {
          ...selected.payload,
          region:
            value === 'rectangle'
              ? { kind: 'rectangle' }
              : {
                  kind: 'freeform',
                  points: [
                    { x: 0, y: 0 },
                    { x: selected.localBounds.width, y: 0 },
                    {
                      x: selected.localBounds.width,
                      y: selected.localBounds.height,
                    },
                    { x: 0, y: selected.localBounds.height },
                  ],
                },
        },
      }
    }
  } else if (
    id === 'censorMode' &&
    (value === 'pixelate' || value === 'blur' || value === 'solid')
  ) {
    nextDefaults = {
      ...nextDefaults,
      censor: { ...nextDefaults.censor, mode: value },
    }
    if (selected?.kind === 'censor') {
      after = {
        ...selected,
        payload: {
          ...selected.payload,
          effect:
            value === 'pixelate'
              ? { mode: value, blockSize: nextDefaults.censor.blockSize }
              : value === 'blur'
                ? { mode: value, strength: nextDefaults.censor.blurStrength }
                : { mode: value, color: nextDefaults.censor.solidColor },
        },
      }
    }
  } else if (
    id === 'censorBlockSize' &&
    Number.isInteger(number) &&
    number >= 2 &&
    number <= 128
  ) {
    nextDefaults = {
      ...nextDefaults,
      censor: { ...nextDefaults.censor, blockSize: number },
    }
    if (selected?.kind === 'censor') {
      after = {
        ...selected,
        payload: {
          ...selected.payload,
          effect: { mode: 'pixelate', blockSize: number },
        },
      }
    }
  } else if (
    id === 'censorBlurStrength' &&
    Number.isFinite(number) &&
    number >= 0.5 &&
    number <= 128
  ) {
    nextDefaults = {
      ...nextDefaults,
      censor: { ...nextDefaults.censor, blurStrength: number },
    }
    if (selected?.kind === 'censor') {
      after = {
        ...selected,
        payload: {
          ...selected.payload,
          effect: { mode: 'blur', strength: number },
        },
      }
    }
  } else if (id === 'censorSolidColor') {
    const color = parseTextColor(value)
    if (!color) return true
    nextDefaults = {
      ...nextDefaults,
      censor: { ...nextDefaults.censor, solidColor: color },
    }
    if (selected?.kind === 'censor') {
      after = {
        ...selected,
        payload: {
          ...selected.payload,
          effect: { mode: 'solid', color },
        },
      }
    }
  } else if (
    id === 'spotlightShape' &&
    (value === 'rectangle' || value === 'ellipse' || value === 'diamond')
  ) {
    nextDefaults = {
      ...nextDefaults,
      spotlight: { ...nextDefaults.spotlight, shape: value },
    }
    if (selected?.kind === 'spotlight') {
      after = { ...selected, payload: { ...selected.payload, shape: value } }
    }
  } else if (id === 'spotlightDimColor') {
    const dimColor = parseTextColor(value)
    if (!dimColor) return true
    nextDefaults = {
      ...nextDefaults,
      spotlight: { ...nextDefaults.spotlight, dimColor },
    }
    if (selected?.kind === 'spotlight') {
      after = { ...selected, payload: { ...selected.payload, dimColor } }
    }
  } else if (
    id === 'spotlightDimOpacity' &&
    Number.isFinite(number) &&
    number >= 0 &&
    number <= 100
  ) {
    const dimOpacity = number / 100
    nextDefaults = {
      ...nextDefaults,
      spotlight: { ...nextDefaults.spotlight, dimOpacity },
    }
    if (selected?.kind === 'spotlight') {
      after = { ...selected, payload: { ...selected.payload, dimOpacity } }
    }
  } else if (
    id === 'spotlightFeather' &&
    (value === 'none' || value === 'soft' || value === 'strong')
  ) {
    const feather = value === 'none' ? null : value
    nextDefaults = {
      ...nextDefaults,
      spotlight: { ...nextDefaults.spotlight, feather },
    }
    if (selected?.kind === 'spotlight') {
      after = { ...selected, payload: { ...selected.payload, feather } }
    }
  } else if (id === 'rulerColor') {
    const color = parseTextColor(value)
    if (!color) return true
    nextDefaults = {
      ...nextDefaults,
      ruler: { ...nextDefaults.ruler, color },
    }
    if (selected?.kind === 'ruler') {
      after = { ...selected, payload: { ...selected.payload, color } }
    }
  } else if (
    id === 'rulerThickness' &&
    Number.isFinite(number) &&
    number >= 1 &&
    number <= 12
  ) {
    nextDefaults = {
      ...nextDefaults,
      ruler: { ...nextDefaults.ruler, thickness: number },
    }
    if (selected?.kind === 'ruler') {
      after = {
        ...selected,
        payload: { ...selected.payload, thickness: number },
      }
    }
  } else if (
    id === 'rulerFontSize' &&
    Number.isFinite(number) &&
    number >= 10 &&
    number <= 48
  ) {
    nextDefaults = {
      ...nextDefaults,
      ruler: { ...nextDefaults.ruler, fontSize: number },
    }
    if (selected?.kind === 'ruler') {
      after = {
        ...selected,
        payload: { ...selected.payload, fontSize: number },
      }
    }
  } else if (
    id === 'rulerUnit' &&
    (value === 'pixels' || value === 'percent')
  ) {
    nextDefaults = {
      ...nextDefaults,
      ruler: { ...nextDefaults.ruler, unit: value },
    }
    if (selected?.kind === 'ruler') {
      after = { ...selected, payload: { ...selected.payload, unit: value } }
    }
  } else if (id === 'rulerSnap' && (value === 'on' || value === 'off')) {
    nextDefaults = {
      ...nextDefaults,
      ruler: { ...nextDefaults.ruler, snap: value === 'on' },
    }
  } else if (
    id === 'rulerAngle' &&
    Number.isFinite(number) &&
    number > 0 &&
    number <= 90
  ) {
    nextDefaults = {
      ...nextDefaults,
      ruler: { ...nextDefaults.ruler, snapAngleIncrementDegrees: number },
    }
    if (selected?.kind === 'ruler') {
      after = {
        ...selected,
        payload: { ...selected.payload, snapAngleIncrementDegrees: number },
      }
    }
  } else if (
    id === 'loupeZoom' &&
    Number.isFinite(number) &&
    number >= 1 &&
    number <= 16
  ) {
    nextDefaults = {
      ...nextDefaults,
      loupe: { ...nextDefaults.loupe, zoom: number },
    }
    if (selected?.kind === 'loupe') {
      const source = selected.payload.sourceRegion
      const side = selected.payload.lens.size / number
      const canvas = activeDocument.value?.canvas
      if (!canvas || side > Math.min(canvas.width, canvas.height)) return true
      after = {
        ...selected,
        payload: {
          ...selected.payload,
          zoom: number,
          sourceRegion: {
            x: Math.max(
              0,
              Math.min(
                canvas.width - side,
                source.x + source.width / 2 - side / 2,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                canvas.height - side,
                source.y + source.height / 2 - side / 2,
              ),
            ),
            width: side,
            height: side,
          },
        },
      }
    }
  } else if (
    id === 'loupeSize' &&
    Number.isFinite(number) &&
    number >= 16 &&
    number <= 2048
  ) {
    nextDefaults = {
      ...nextDefaults,
      loupe: { ...nextDefaults.loupe, size: number },
    }
    if (selected?.kind === 'loupe') {
      const source = selected.payload.sourceRegion
      const side = number / selected.payload.zoom
      const canvas = activeDocument.value?.canvas
      if (!canvas || side > Math.min(canvas.width, canvas.height)) return true
      after = {
        ...selected,
        localBounds: { ...selected.localBounds, width: number, height: number },
        payload: {
          ...selected.payload,
          lens: { ...selected.payload.lens, size: number },
          sourceRegion: {
            x: Math.max(
              0,
              Math.min(
                canvas.width - side,
                source.x + source.width / 2 - side / 2,
              ),
            ),
            y: Math.max(
              0,
              Math.min(
                canvas.height - side,
                source.y + source.height / 2 - side / 2,
              ),
            ),
            width: side,
            height: side,
          },
        },
      }
    }
  } else if (
    id === 'loupeShape' &&
    (value === 'circle' || value === 'rectangle')
  ) {
    nextDefaults = {
      ...nextDefaults,
      loupe: { ...nextDefaults.loupe, shape: value },
    }
    if (selected?.kind === 'loupe') {
      after = {
        ...selected,
        payload: {
          ...selected.payload,
          lens: { ...selected.payload.lens, shape: value },
        },
      }
    }
  } else if (id === 'loupeBorderColor') {
    const color = parseTextColor(value)
    if (!color) return true
    nextDefaults = {
      ...nextDefaults,
      loupe: { ...nextDefaults.loupe, borderColor: color },
    }
    if (selected?.kind === 'loupe') {
      after = {
        ...selected,
        payload: {
          ...selected.payload,
          border: { ...selected.payload.border, color },
        },
      }
    }
  } else if (
    id === 'loupeBorderWidth' &&
    Number.isFinite(number) &&
    number >= 0 &&
    number <= 64
  ) {
    nextDefaults = {
      ...nextDefaults,
      loupe: { ...nextDefaults.loupe, borderWidth: number },
    }
    if (selected?.kind === 'loupe') {
      after = {
        ...selected,
        payload: {
          ...selected.payload,
          border: { ...selected.payload.border, width: number },
        },
      }
    }
  } else if (id === 'loupeShadow' && (value === 'on' || value === 'off')) {
    const enabled = value === 'on'
    nextDefaults = {
      ...nextDefaults,
      loupe: { ...nextDefaults.loupe, shadow: enabled },
    }
    if (selected?.kind === 'loupe') {
      after = {
        ...selected,
        payload: {
          ...selected.payload,
          shadow: enabled
            ? (selected.payload.shadow ?? {
                color: { red: 0, green: 0, blue: 0, alpha: 0.35 },
                offsetX: 0,
                offsetY: 6,
                blur: 14,
              })
            : null,
        },
      }
    }
  } else {
    return true
  }
  if (!selected) precisionDefaults.value = nextDefaults
  if (
    selected?.kind === 'ruler' &&
    after?.kind === 'ruler' &&
    activeDocument.value
  ) {
    after = rebaseRulerLayer(
      selected,
      after.payload,
      activeDocument.value.canvas,
    )
  }
  if (selected && after && props.documentSession && !selected.locked) {
    props.documentSession.execute({
      type: 'updateLayer',
      before: selected,
      after,
    })
  }
  return true
}
function onContextChange(id: string, value: string): void {
  if (applyV7TextChange(id, value)) return
  if (applyCalloutStrokeChange(id, value)) return
  if (id === 'cropPreset') {
    if (!['free', '1:1', '4:3', '16:9', 'original'].includes(value)) return
    cropPreset.value = value as CropPreset
    canvasViewport.value?.setCropPresetValue(cropPreset.value)
    return
  }
  if (applyPrecisionChange(id, value)) return
  const activeTool = state.activeToolId.value
  /* Legacy text controls intentionally removed from the v7 toolbar.
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
  }
  */
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
  const selected = configureDefaultsTool.value
    ? undefined
    : isDrawingTool(activeTool)
      ? selectedCandidate?.kind === activeTool
        ? selectedCandidate
        : undefined
      : activeTool === 'select'
        ? selectedCandidate
        : undefined
  const tool = configureDefaultsTool.value
    ? configureDefaultsTool.value
    : isDrawingTool(activeTool)
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
  if (precisionChangeBlocked(id)) return
  onContextChange(id, value)
  rememberColor(value)
}
function startEyedropper(id: string): void {
  if (precisionChangeBlocked(id)) return
  samplingControl.value = id
  eyedropperColor.value = undefined
  eyedropperFeedback.value = undefined
}
async function onColorSample(value: string): Promise<void> {
  const normalized = value.toUpperCase()
  const target = samplingControl.value
  if (target && precisionChangeBlocked(target)) {
    samplingControl.value = undefined
    eyedropperColor.value = undefined
    eyedropperFeedback.value = translate('readOnlyDocument')
    return
  }
  if (target) onColorChange(target, normalized)
  else rememberColor(normalized)
  samplingControl.value = undefined
  eyedropperColor.value = normalized
  eyedropperFeedback.value =
    state.locale.value === 'ru'
      ? `Цвет выбран: ${normalized}`
      : `Colour selected: ${normalized}`
  try {
    if (props.clipboardBridge?.writeClipboardText) {
      await props.clipboardBridge.writeClipboardText(
        normalized,
        crypto.randomUUID(),
      )
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(normalized)
    }
  } catch (error) {
    console.warn('cute-screen eyedropper clipboard write failed', error)
    eyedropperFeedback.value =
      state.locale.value === 'ru'
        ? `Цвет выбран: ${normalized}. Не удалось скопировать HEX.`
        : `Colour selected: ${normalized}. HEX could not be copied.`
  }
}
function onColorSampleError(message: string): void {
  eyedropperFeedback.value = message
}
function onColorSampleCancel(): void {
  samplingControl.value = undefined
  eyedropperColor.value = undefined
  eyedropperFeedback.value =
    state.locale.value === 'ru'
      ? 'Выбор цвета отменён'
      : 'Colour sampling cancelled'
}
function onToolConfigureOutsidePointer(event: PointerEvent): void {
  if (!toolConfigure.value) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (
    toolConfigure.value.anchor.contains(target) ||
    (target instanceof HTMLElement &&
      target.closest(
        '.cs-tool-configure-popover-host, .cs-arrow-toolbar-popover',
      ))
  ) {
    return
  }
  closeToolConfigure()
}
function openToolConfigure(toolId: string, anchor: HTMLElement): void {
  if (toolId !== 'arrow') return
  const rect = anchor.getBoundingClientRect()
  toolConfigure.value = { toolId, anchor }
  toolConfigureLayout.value = {
    left: rect.left + rect.width / 2,
    top: rect.top,
  }
}
function closeToolConfigure(): void {
  toolConfigure.value = undefined
  toolConfigureLayout.value = undefined
}
function onToolConfigureChange(id: string, value: string): void {
  configureDefaultsTool.value = 'arrow'
  try {
    onContextChange(id, value)
  } finally {
    configureDefaultsTool.value = undefined
  }
}
function selectTool(id: string): void {
  toolError.value = undefined
  store.selectTool(id)
  if (id === 'eyedropper') {
    eyedropperColor.value = undefined
    eyedropperFeedback.value = undefined
  }
}
function canonicalizeLayerTransform(
  layer: LayerNode,
  transform: Transform2D,
): LayerNode {
  const canvas = activeDocument.value?.canvas
  if (layer.kind !== 'ruler' || !canvas) return { ...layer, transform }
  return rebaseRulerLayer({ ...layer, transform }, layer.payload, canvas)
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
  if (property === 'opacity') {
    if (
      layer.kind === 'text' ||
      layer.kind === 'callout' ||
      layer.kind === 'numberedMarker'
    )
      return
    props.documentSession.execute({
      type: 'updateLayer',
      before: layer,
      after: {
        ...layer,
        opacity: Math.max(0, Math.min(1, value ?? layer.opacity)),
      },
    })
    return
  }
  const after =
    property === 'visible'
      ? { ...layer, visible: !layer.visible }
      : property === 'locked'
        ? { ...layer, locked: !layer.locked }
        : canonicalizeLayerTransform(layer, {
            ...layer.transform,
            rotation: value ?? layer.transform.rotation,
          })
  props.documentSession.execute({
    type: 'updateLayer',
    before: layer,
    after,
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
function resolveLayerReorderToIndex(
  layerCount: number,
  fromIndex: number,
  targetIndex: number,
  place: 'before' | 'after',
): number {
  const sourceDisplay = layerCount - 1 - fromIndex
  const targetDisplay = layerCount - 1 - targetIndex
  let insertDisplay = place === 'before' ? targetDisplay : targetDisplay + 1
  if (sourceDisplay < insertDisplay) {
    insertDisplay -= 1
  }
  return layerCount - 1 - insertDisplay
}
function onLayerReorderTo(
  id: string,
  targetId: string,
  place: 'before' | 'after',
): void {
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
  const toIndex = resolveLayerReorderToIndex(
    layers.length,
    fromIndex,
    targetIndex,
    place,
  )
  if (fromIndex === toIndex) return
  props.documentSession.execute({
    type: 'reorderLayer',
    layerId: id,
    fromIndex,
    toIndex,
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
    after: canonicalizeLayerTransform(layer, {
      ...layer.transform,
      translateX: layer.transform.translateX + deltaX,
      translateY: layer.transform.translateY + deltaY,
    }),
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
  if (!layer || layer.locked || !props.documentSession) return
  props.documentSession.execute({
    type: 'updateLayer',
    before: layer,
    after: canonicalizeLayerTransform(layer, transform),
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
  selectAfter = false,
): void {
  if (!props.documentSession || props.readOnlyDocument) return
  props.documentSession.execute({ type: 'addLayer', layer })
  if (selectAfter && layer.kind === 'loupe') store.selectLayer(layer.id)
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
      fontFamily: textDefaults.value.fontFamily,
      fontSize: textDefaults.value.fontSize,
      weight: textDefaults.value.weight,
      italic: textDefaults.value.italic,
      strikethrough: textDefaults.value.strikethrough,
      alignment: textDefaults.value.alignment,
      listKind: textDefaults.value.listKind,
      color: textDefaults.value.color,
      background: textDefaults.value.background,
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
          opacityEditable: false,
        },
        {
          id: 'arrow-1',
          icon: 'arrow',
          name: 'Arrow to button',
          visible: true,
          locked: false,
          opacity: 1,
          rotation: 0,
          opacityEditable: true,
        },
        {
          id: 'marker-1',
          icon: 'marker',
          name: 'Title highlight',
          visible: true,
          locked: true,
          opacity: 1,
          rotation: 0,
          opacityEditable: true,
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
    (target instanceof HTMLElement &&
      (target.isContentEditable || target.closest('[role="slider"]')))
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
        after: canonicalizeLayerTransform(layer, {
          ...layer.transform,
          translateX: layer.transform.translateX + delta[0] * multiplier,
          translateY: layer.transform.translateY + delta[1] * multiplier,
        }),
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
      return !layer || !layer.visible
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
            opacityEditable: false,
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
      opacity: 'opacity' in layer ? layer.opacity : 1,
      rotation: layer.transform.rotation,
      opacityEditable:
        layer.kind !== 'text' &&
        layer.kind !== 'callout' &&
        layer.kind !== 'numberedMarker',
    })),
  ])
}
function setTextDraft(
  draft:
    | {
        readonly id: string
        readonly kind: 'text' | 'callout' | 'numberedMarker'
        readonly snapshot: TextToolbarSnapshot
      }
    | undefined,
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
watch(
  () => state.activeToolId.value,
  (tool, previous) => {
    if (tool === 'crop' && previous !== 'crop') cropPreset.value = 'free'
  },
)
onMounted(() => {
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
  document.addEventListener('pointerdown', onToolConfigureOutsidePointer, true)
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
  document.removeEventListener(
    'pointerdown',
    onToolConfigureOutsidePointer,
    true,
  )
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
        v-if="!props.quickMode"
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
        <div v-if="props.quickMode" class="cs-quick-toolrail-group">
          <ToolRail
            :tools="tools"
            :active-tool-id="store.activeToolId"
            :t="translate"
            @select="selectTool"
            @configure="openToolConfigure"
          />
          <div
            class="cs-quick-history"
            role="group"
            :aria-label="translate('undo')"
          >
            <NButton
              quaternary
              circle
              class="cs-tool-button"
              :disabled="!store.documentHistory.canUndo"
              :aria-label="translate('undo')"
              @click="undoDocument"
            >
              <UiIcon name="undo" />
            </NButton>
            <NButton
              quaternary
              circle
              class="cs-tool-button"
              :disabled="!store.documentHistory.canRedo"
              :aria-label="translate('redo')"
              @click="redoDocument"
            >
              <UiIcon name="redo" />
            </NButton>
          </div>
        </div>
        <ToolRail
          v-else
          :tools="tools"
          :active-tool-id="store.activeToolId"
          :t="translate"
          @select="selectTool"
          @configure="openToolConfigure"
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
          :sampling-blocked="!sceneTexturesReady"
          :drawing-defaults="drawingDefaults"
          :precision-defaults="precisionDefaults"
          :text-defaults="textDefaults"
          :text-formatting="textFormatting"
          :text-toolbar-schema="floatingTextToolbarSchema"
          :text-toolbar-locale="state.locale.value"
          :arrow-toolbar-schema="floatingArrowToolbarSchema"
          :arrow-toolbar-locale="state.locale.value"
          :next-marker-sequence="
            activeDocument
              ? nextNumberedMarkerSequence(activeDocument.layers)
              : undefined
          "
          :marker-shape="markerShape"
          :open-image-available="props.openImageAvailable"
          :zoom="store.zoom"
          :fit-mode="store.zoomMode === 'fit'"
          :quick-frame-mode="props.quickMode"
          :t="translate"
          @hosts-ready="emit('hostsReady', $event)"
          @select-layer="selectLayer"
          @move-layer="moveLayer"
          @transform-layer="transformLayer"
          @update-layer-payload="updateLayerPayload"
          @add-layer="addLayer"
          @document-command="executeDocumentCommand"
          @text-editing="setTextDraft"
          @text-toolbar-change="onContextChange"
          @arrow-toolbar-change="onContextChange"
          @request-image-import="importContentImage"
          @open-image="store.runAction('openImage')"
          @select-tool="store.selectTool"
          @color-sample="onColorSample"
          @color-sample-error="onColorSampleError"
          @color-sample-cancel="onColorSampleCancel"
          @tool-error="toolError = $event"
          @zoom="store.setZoom"
          @fit-zoom="store.setFitZoom"
          @retry="emit('retryLoad')"
        />
        <LayersPanel
          v-if="!props.quickMode"
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
          @reorder-to="onLayerReorderTo"
        />
        <ZoomControls
          v-if="!props.quickMode"
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
        v-if="!props.quickMode"
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
      <div class="cs-overlay-root" aria-live="polite">
        <div
          v-if="toolConfigureArrowSchema && toolConfigureLayout"
          class="cs-tool-configure-popover-host"
          :style="{
            left: `${toolConfigureLayout.left}px`,
            top: `${toolConfigureLayout.top}px`,
          }"
          @pointerdown.stop
        >
          <ArrowFormattingToolbar
            variant="popover"
            :controls="toolConfigureArrowSchema.controls"
            :recent-colors="drawingPreferences.recentColors"
            :picker-locale="state.locale.value"
            @change="onToolConfigureChange"
            @eyedropper="startEyedropper"
          />
        </div>
      </div>
      <p v-if="eyedropperFeedback" class="cs-eyedropper-feedback" role="status">
        <span
          v-if="eyedropperColor"
          class="cs-eyedropper-swatch"
          :style="{ backgroundColor: eyedropperColor }"
          :aria-label="
            state.locale.value === 'ru'
              ? `Образец цвета ${eyedropperColor}`
              : `Colour swatch ${eyedropperColor}`
          "
        />
        <span>{{ eyedropperFeedback }}</span>
      </p>
      <p v-if="toolError" class="cs-tool-error" role="alert">
        {{ toolError }}
      </p>
    </div>
  </NConfigProvider>
</template>
