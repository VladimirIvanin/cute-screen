import type {
  DrawingDefaults,
  EditorDocumentV1,
  ImageLayer,
  JsonObject,
  LayerNode,
  RichTextParagraphStyle,
  RichTextSpanStyle,
  SrgbColor,
  TextBackground,
  Transform2D,
} from '@cute-screen/editor-renderer'
import type { PropType } from 'vue'
import type {
  CanvasViewportHosts,
  ContextToolbarSchema,
  PrecisionToolDefaults,
  ShellDocumentState,
} from '../types'

export interface TextToolDefaults {
  readonly fontFamily: string
  readonly fontSize: number
  readonly weight: RichTextSpanStyle['weight']
  readonly italic: boolean
  readonly strikethrough: boolean
  readonly alignment: RichTextParagraphStyle['alignment']
  readonly listKind: RichTextParagraphStyle['listKind']
  readonly color: SrgbColor
  readonly background: TextBackground | null
}

export interface TextToolbarSnapshot {
  readonly fontFamily: string | null
  readonly fontSize: number | null
  readonly color: SrgbColor | null
  readonly weight: RichTextSpanStyle['weight'] | null
  readonly italic: boolean | null
  readonly strikethrough: boolean | null
  readonly alignment: RichTextParagraphStyle['alignment'] | null
  readonly listKind: RichTextParagraphStyle['listKind'] | null
  readonly background: TextBackground | null
}

export interface TextFormattingPatch {
  readonly revision: number
  readonly span?: Partial<RichTextSpanStyle>
  readonly paragraph?: Partial<RichTextParagraphStyle>
  readonly background?: TextBackground | null
}

export type CanvasTranslationKey =
  | 'canvasViewport'
  | 'sceneCanvas'
  | 'interactionOverlay'
  | 'eyedropperMagnifier'
  | 'eyedropperClickToSample'
  | 'eyedropperNoOpaqueColour'
  | 'eyedropperPreviewLoading'
  | 'eyedropperPreviewUnavailable'
  | 'emptyTitle'
  | 'emptyDescription'
  | 'openImage'
  | 'loadingEditor'
  | 'retry'

export interface CanvasViewportProps {
  documentState: ShellDocumentState
  canvas?: { readonly width: number; readonly height: number } | undefined
  image?: HTMLImageElement | undefined
  textureImages?: ReadonlyMap<string, HTMLImageElement> | undefined
  imageLayer?: ImageLayer | undefined
  document?: EditorDocumentV1 | undefined
  selectedLayerId?: string | undefined
  selectedLayerIds?: readonly string[] | undefined
  activeTool?: string | undefined
  sampling?: boolean | undefined
  samplingBlocked?: boolean | undefined
  precisionDefaults?: PrecisionToolDefaults | undefined
  drawingDefaults?: DrawingDefaults | undefined
  textDefaults?: TextToolDefaults | undefined
  textFormatting?: TextFormattingPatch | undefined
  textToolbarSchema?:
    | Readonly<{
        readonly text: NonNullable<ContextToolbarSchema['text']>
        readonly title: string
      }>
    | undefined
  textToolbarLocale?: 'en' | 'ru' | undefined
  arrowToolbarSchema?:
    | Readonly<{
        readonly controls: ContextToolbarSchema['controls']
        readonly title: string
      }>
    | undefined
  arrowToolbarLocale?: 'en' | 'ru' | undefined
  nextMarkerSequence?: number | undefined
  markerShape?: 'circle' | 'square' | 'diamond' | 'star' | undefined
  openImageAvailable?: boolean | undefined
  zoom?: number | undefined
  fitMode?: boolean | undefined
  quickFrameMode?: boolean | undefined
  quickSelectionMode?: boolean | undefined
  t: (key: CanvasTranslationKey) => string
}

export type CanvasViewportEmits = {
  hostsReady: [hosts: CanvasViewportHosts]
  frameReady: [documentId: string]
  selectLayer: [id: string, toggle: boolean]
  moveLayer: [id: string, deltaX: number, deltaY: number]
  transformLayer: [id: string, transform: Transform2D]
  updateLayerPayload: [id: string, payload: JsonObject]
  addLayer: [layer: LayerNode, selectAfter?: boolean]
  documentCommand: [command: unknown]
  textEditing: [
    draft:
      | {
          readonly id: string
          readonly kind: 'text' | 'callout' | 'numberedMarker'
          readonly snapshot: TextToolbarSnapshot
        }
      | undefined,
  ]
  textEditingCancelled: [reason: 'escape']
  textToolbarChange: [id: string, value: string]
  arrowToolbarChange: [id: string, value: string]
  requestImageImport: [origin: { readonly x: number; readonly y: number }]
  openImage: []
  selectTool: [id: 'select']
  zoom: [value: number]
  fitZoom: [value: number]
  retry: []
  colorSample: [value: string]
  colorSampleError: [message: string]
  colorSampleCancel: []
  toolError: [message: string]
  quickFrameChange: [
    crop: { x: number; y: number; width: number; height: number },
  ]
  quickSelectionComplete: [
    crop: { x: number; y: number; width: number; height: number },
  ]
}

export type CanvasViewportEmit = <K extends keyof CanvasViewportEmits>(
  event: K,
  ...args: CanvasViewportEmits[K]
) => void

export interface CanvasViewportExpose {
  applyCropDraft(): void
  cancelCropDraft(): void
  resetCropDraft(): void
  setCropPresetValue(
    preset: import('@cute-screen/editor-renderer').CropPreset,
  ): void
  refitCanvas(): void
}

export const canvasViewportRuntimeProps = {
  documentState: {
    type: Object as PropType<CanvasViewportProps['documentState']>,
    required: true,
  },
  canvas: Object as PropType<CanvasViewportProps['canvas']>,
  image: Object as PropType<CanvasViewportProps['image']>,
  textureImages: Object as PropType<CanvasViewportProps['textureImages']>,
  imageLayer: Object as PropType<CanvasViewportProps['imageLayer']>,
  document: Object as PropType<CanvasViewportProps['document']>,
  selectedLayerId: {
    type: String as PropType<string | undefined>,
    default: undefined,
  },
  selectedLayerIds: Array as PropType<CanvasViewportProps['selectedLayerIds']>,
  activeTool: {
    type: String as PropType<string | undefined>,
    default: undefined,
  },
  sampling: Boolean,
  samplingBlocked: Boolean,
  precisionDefaults: Object as PropType<
    CanvasViewportProps['precisionDefaults']
  >,
  drawingDefaults: Object as PropType<CanvasViewportProps['drawingDefaults']>,
  textDefaults: Object as PropType<CanvasViewportProps['textDefaults']>,
  textFormatting: Object as PropType<CanvasViewportProps['textFormatting']>,
  textToolbarSchema: Object as PropType<
    CanvasViewportProps['textToolbarSchema']
  >,
  textToolbarLocale: {
    type: String as PropType<CanvasViewportProps['textToolbarLocale']>,
    default: undefined,
  },
  arrowToolbarSchema: Object as PropType<
    CanvasViewportProps['arrowToolbarSchema']
  >,
  arrowToolbarLocale: {
    type: String as PropType<CanvasViewportProps['arrowToolbarLocale']>,
    default: undefined,
  },
  nextMarkerSequence: {
    type: Number as PropType<number | undefined>,
    default: undefined,
  },
  markerShape: {
    type: String as PropType<CanvasViewportProps['markerShape']>,
    default: undefined,
  },
  openImageAvailable: Boolean,
  zoom: { type: Number as PropType<number | undefined>, default: undefined },
  fitMode: Boolean,
  quickFrameMode: Boolean,
  quickSelectionMode: Boolean,
  t: {
    type: Function as PropType<CanvasViewportProps['t']>,
    required: true,
  },
} as const

export const canvasViewportRuntimeEmits = [
  'hostsReady',
  'frameReady',
  'selectLayer',
  'moveLayer',
  'transformLayer',
  'updateLayerPayload',
  'addLayer',
  'documentCommand',
  'textEditing',
  'textEditingCancelled',
  'textToolbarChange',
  'arrowToolbarChange',
  'requestImageImport',
  'openImage',
  'selectTool',
  'zoom',
  'fitZoom',
  'retry',
  'colorSample',
  'colorSampleError',
  'colorSampleCancel',
  'toolError',
  'quickFrameChange',
  'quickSelectionComplete',
] as string[]

export type CanvasPoint = {
  readonly x: number
  readonly y: number
  readonly pressure?: number
}

export type ViewportOutputBounds = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}
