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
import { darkTheme, dateEnUS, dateRuRU, enUS, ruRU } from 'naive-ui'
import { t } from '../i18n'
import {
  createBrowserDrawingToolPreferencesStorage,
  createBrowserPreferencesStorage,
} from '../preferences'
import { useEditorShellStore, type ShellStoreOptions } from '../store'
import type { PrecisionToolDefaults, ToolDescriptor } from '../types'
import type { DocumentSessionSnapshot } from '../../document-session'
import { loadImageWithBinaryFallback } from '../../image-transport'
import { TextureResourceResolver } from '../../texture-fill'
import {
  createFlipCanvasCommand,
  createContentImageLayer,
  createDuplicateLayerCommand,
  createTextLayer,
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
  type CropPreset,
  type SrgbColor,
  type TextBackground,
  type RichTextParagraphStyle,
  type RichTextSpanStyle,
  applyRichTextParagraphStyle,
  applyRichTextSpanStyle,
  type Transform2D,
} from '@cute-screen/editor-renderer'
import CanvasViewport, {
  type TextFormattingPatch,
  type TextToolbarSnapshot,
  type TextToolDefaults,
} from '../components/CanvasViewport.vue'
import type { ResolvedEditorShellProps } from '../contracts'
import { createDrawingSchema } from '../tools/drawing-schema'
import { createPrecisionSchema } from '../tools/precision-schema'
import type { PrecisionTool } from '../tools/precision-schema'
import { createTextSchema } from '../tools/text-schema'
import { createContextSchema } from '../tools/context-schema'

export function useEditorWorkspace(props: ResolvedEditorShellProps) {
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
  const {
    hexColor,
    precisionText,
    precisionToolSchema,
    selectedPrecisionLayer,
  } = createPrecisionSchema({
    props,
    state,
    store,
    activeDocument,
    precisionDefaults,
    translate,
  })
  const { drawingControl, isDrawingTool, selectedDrawingLayer } =
    createDrawingSchema({
      props,
      store,
      activeDocument,
      drawingDefaults,
      translate,
      hexColor,
    })
  const { buildTextContextSchema, floatingTextToolbarSchema } =
    createTextSchema({
      props,
      store,
      activeToolId: state.activeToolId,
      activeDocument,
      textDefaults,
      textDraft,
      translate,
      hexColor,
    })
  const {
    contextSchema,
    floatingArrowToolbarSchema,
    toolConfigureArrowSchema,
  } = createContextSchema({
    store,
    activeToolId: state.activeToolId,
    activeDocument,
    cropPreset,
    markerShape,
    textDraft,
    drawingDefaults,
    toolConfigure,
    translate,
    precisionText,
    hexColor,
    selectedPrecisionLayer,
    precisionToolSchema,
    buildTextContextSchema,
    isDrawingTool,
    selectedDrawingLayer,
    drawingControl,
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
      if (!selected || selected.kind !== 'shape' || !props.documentSession)
        return
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
    | Extract<
        LayerNode,
        { readonly kind: 'text' | 'callout' | 'numberedMarker' }
      >
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
      if (value !== 'start' && value !== 'center' && value !== 'end')
        return true
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
          localBounds: {
            ...selected.localBounds,
            width: number,
            height: number,
          },
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
        stroke: {
          ...(current.stroke as Record<string, unknown>),
          style: value,
        },
      }
    } else if (id === 'brush') {
      if (tool !== 'pencil' || !['pen', 'pencil', 'brush'].includes(value))
        return
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
                stroke: {
                  ...(current.stroke as Record<string, unknown>),
                  width,
                },
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
                value === 'darken'
                  ? ('darken' as const)
                  : ('multiply' as const),
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
    if (
      !bridge ||
      !document ||
      !props.documentSession ||
      props.readOnlyDocument
    )
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
      if (activeDocument.value)
        void resolveDocumentTextures(activeDocument.value)
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
    document.addEventListener(
      'pointerdown',
      onToolConfigureOutsidePointer,
      true,
    )
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
  return {
    naiveTheme,
    naiveLocale,
    naiveDateLocale,
    store,
    state,
    translate,
    fallbackCopied,
    fallbackVisible,
    copyCaptureFallback,
    dismissCaptureFallback,
    tools,
    selectTool,
    openToolConfigure,
    activeDocument,
    contextSchema,
    drawingPreferences,
    onContextAction,
    onContextChange,
    onColorChange,
    startEyedropper,
    canvasViewport,
    textureImages,
    baseImageLayer,
    sceneTexturesReady,
    samplingControl,
    drawingDefaults,
    precisionDefaults,
    textDefaults,
    textFormatting,
    floatingTextToolbarSchema,
    floatingArrowToolbarSchema,
    markerShape,
    selectLayer,
    moveLayer,
    transformLayer,
    updateLayerPayload,
    addLayer,
    executeDocumentCommand,
    setTextDraft,
    importContentImage,
    onColorSample,
    onColorSampleError,
    onColorSampleCancel,
    toolError,
    updateLayerProperty,
    onLayerOpacity,
    onLayerRotation,
    onLayerReorderTo,
    toolConfigureArrowSchema,
    toolConfigureLayout,
    onToolConfigureChange,
    eyedropperFeedback,
    eyedropperColor,
    undoDocument,
    redoDocument,
    retryDocumentSave,
    exportDocumentRecovery,
    fitCanvas,
  }
}
