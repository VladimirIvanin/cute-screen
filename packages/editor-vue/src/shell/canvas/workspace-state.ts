import { ref } from 'vue'
import {
  DEFAULT_RULER_COLOR,
  DEFAULT_RULER_FONT_SIZE,
  DEFAULT_RULER_THICKNESS,
  type ArrowHandleKind,
  type BoundsResizeHandle,
  type CalloutHandleKind,
  type CalloutLayer,
  type CropResizeHandle,
  type CropSession,
  type DrawingTool,
  type IntrinsicResizeHandle,
  type LayerNode,
  type NumberedMarkerLayer,
  type RulerAngleGuide,
  type SnapCandidate,
  type StrokeStyle,
  type TextBackground,
  type TextLayer,
  type Transform2D,
} from '@cute-screen/editor-renderer'
import { RichTextEditorController } from '../../rich-text-editor'
import type { CanvasPoint, TextToolDefaults } from './contracts'
import type { PrecisionToolDefaults } from '../types'

export type EditableTextLayer = TextLayer | CalloutLayer | NumberedMarkerLayer
export type FloatingToolbarLayout = {
  readonly left: number
  readonly top: number
  readonly placement: 'above' | 'below'
}
export type ResizeHandle = BoundsResizeHandle

export type CanvasGesture =
  | {
      readonly kind: 'pan'
      readonly clientX: number
      readonly clientY: number
      readonly scrollLeft: number
      readonly scrollTop: number
    }
  | {
      readonly kind: 'move'
      readonly id: string
      readonly start: CanvasPoint
      readonly current: CanvasPoint
      readonly guides: readonly SnapCandidate[]
      readonly guidesVisible: boolean
    }
  | {
      readonly kind: 'resize'
      readonly id: string
      readonly handle: ResizeHandle
      readonly start: CanvasPoint
      readonly current: CanvasPoint
      readonly initial: Transform2D
      readonly freeResize: boolean
      readonly centerResize: boolean
    }
  | {
      readonly kind: 'intrinsicResize'
      readonly id: string
      readonly handle: IntrinsicResizeHandle
      readonly start: CanvasPoint
      readonly current: CanvasPoint
      readonly initial: LayerNode
      readonly preserveAspect: boolean
      readonly centerResize: boolean
    }
  | {
      readonly kind: 'rotate'
      readonly id: string
      readonly center: CanvasPoint
      readonly startAngle: number
      readonly initial: Transform2D
      readonly currentAngle: number
    }
  | {
      readonly kind: 'arrowHandle'
      readonly id: string
      readonly handle: ArrowHandleKind
      readonly start: CanvasPoint
      readonly current: CanvasPoint
    }
  | {
      readonly kind: 'calloutHandle'
      readonly id: string
      readonly handle: CalloutHandleKind
      readonly start: CanvasPoint
      readonly current: CanvasPoint
    }
  | {
      readonly kind: 'loupeSource'
      readonly id: string
      readonly start: CanvasPoint
      readonly current: CanvasPoint
      readonly initial: Extract<LayerNode, { readonly kind: 'loupe' }>
    }
  | {
      readonly kind: 'calloutDraw'
      readonly start: CanvasPoint
      readonly current: CanvasPoint
      readonly constrainAngle: boolean
    }
  | {
      readonly kind: 'draw'
      readonly tool: DrawingTool
      readonly start: CanvasPoint
      readonly current: CanvasPoint
      readonly constrainAngle: boolean
      readonly drawFromCenter: boolean
      readonly points: readonly CanvasPoint[]
    }
  | {
      readonly kind: 'text'
      readonly start: CanvasPoint
      readonly current: CanvasPoint
    }
  | {
      readonly kind: 'precision'
      readonly tool: 'censor' | 'spotlight' | 'ruler' | 'loupe'
      readonly start: CanvasPoint
      readonly current: CanvasPoint
      readonly points: readonly CanvasPoint[]
      readonly guidesHeld: boolean
    }
  | {
      readonly kind: 'crop'
      readonly action: 'move' | 'resize'
      readonly handle?: CropResizeHandle
      readonly start: CanvasPoint
      readonly initial: CropSession
    }
  | {
      readonly kind: 'quickSelect'
      readonly start: CanvasPoint
      readonly current: CanvasPoint
    }
  | undefined

export const DEFAULT_CALLOUT_STROKE: StrokeStyle = Object.freeze({
  color: Object.freeze({ red: 0.55, green: 0.55, blue: 0.55, alpha: 1 }),
  width: 2,
  style: 'solid',
  cap: 'round',
  join: 'round',
})

export const DEFAULT_TEXT_TOOL: TextToolDefaults = Object.freeze({
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

export const DEFAULT_PRECISION_TOOLS: PrecisionToolDefaults = Object.freeze({
  censor: Object.freeze({
    region: 'rectangle',
    mode: 'pixelate',
    blockSize: 12,
    blurStrength: 12,
    solidColor: Object.freeze({ red: 0, green: 0, blue: 0, alpha: 1 }),
  }),
  spotlight: Object.freeze({
    shape: 'rectangle',
    dimColor: Object.freeze({ red: 0, green: 0, blue: 0, alpha: 1 }),
    dimOpacity: 0.65,
    feather: 'soft',
  }),
  ruler: Object.freeze({
    unit: 'pixels',
    snap: true,
    snapAngleIncrementDegrees: 15,
    color: DEFAULT_RULER_COLOR,
    thickness: DEFAULT_RULER_THICKNESS,
    fontSize: DEFAULT_RULER_FONT_SIZE,
  }),
  loupe: Object.freeze({
    zoom: 2,
    size: 120,
    shape: 'circle',
    borderColor: Object.freeze({ red: 1, green: 1, blue: 1, alpha: 1 }),
    borderWidth: 3,
    shadow: true,
  }),
})

export function createCanvasWorkspaceState() {
  return {
    scene: ref<HTMLCanvasElement>(),
    overlay: ref<HTMLCanvasElement>(),
    viewportRoot: ref<HTMLElement>(),
    textEditor: ref<HTMLDivElement>(),
    textFloatingToolbar: ref<HTMLDivElement>(),
    arrowFloatingToolbar: ref<HTMLDivElement>(),
    scrollContainer: ref<HTMLDivElement>(),
    floatingToolbarLayout: ref<FloatingToolbarLayout>(),
    floatingArrowToolbarLayout: ref<FloatingToolbarLayout>(),
    rendererError: ref<string>(),
    isPanning: ref(false),
    editingText: ref<
      | {
          readonly origin: CanvasPoint
          readonly width: number
          readonly fixedWidth: boolean
          readonly id: string
          readonly controller: RichTextEditorController
          background: TextBackground | null
          readonly kind: 'text' | 'callout' | 'numberedMarker'
          readonly existing?: EditableTextLayer
          readonly calloutDraft?: {
            readonly target: CanvasPoint
            readonly label: CanvasPoint
          }
          calloutStroke?: StrokeStyle
        }
      | undefined
    >(),
  }
}

export interface CanvasRuntimeState {
  lastFitZoom: number | undefined
  pendingZoomAnchor:
    | {
        readonly canvas: CanvasPoint
        readonly clientX: number
        readonly clientY: number
      }
    | undefined
  spacePressed: boolean
  cycle:
    | { readonly key: string; readonly at: number; readonly index: number }
    | undefined
  cropSession: CropSession | undefined
  quickSelectionDraft:
    { x: number; y: number; width: number; height: number } | undefined
  rulerGuide: RulerAngleGuide | undefined
  gesture: CanvasGesture
  textToolbarPointerDown: boolean
}

export function createCanvasRuntimeState(): CanvasRuntimeState {
  return {
    lastFitZoom: undefined,
    pendingZoomAnchor: undefined,
    spacePressed: false,
    cycle: undefined,
    cropSession: undefined,
    quickSelectionDraft: undefined,
    rulerGuide: undefined,
    gesture: undefined,
    textToolbarPointerDown: false,
  }
}
