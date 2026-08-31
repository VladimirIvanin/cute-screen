import type {
  ArrowHandleKind,
  CalloutHandleKind,
  LayerNode,
} from '@cute-screen/editor-renderer'
import type { Ref } from 'vue'
import type {
  CanvasPoint,
  CanvasViewportEmit,
  CanvasViewportProps,
} from './contracts'
import type { CropController } from './crop-controller'
import type { TextEditorStartInput } from './text-editor-controller'
import type {
  CanvasGesture,
  ResizeHandle,
  createCanvasWorkspaceState,
} from './workspace-state'

type WorkspaceState = ReturnType<typeof createCanvasWorkspaceState>
type Cycle = {
  readonly key: string
  readonly at: number
  readonly index: number
}

export interface PointerDownContext {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly scene: Ref<HTMLCanvasElement | undefined>
  readonly scrollContainer: Ref<HTMLDivElement | undefined>
  readonly isPanning: Ref<boolean>
  readonly editingText: WorkspaceState['editingText']
  readonly crop: CropController
  readonly spacePressed: () => boolean
  readonly cycle: () => Cycle | undefined
  readonly setCycle: (cycle: Cycle) => void
  readonly setGesture: (gesture: NonNullable<CanvasGesture>) => void
  readonly clearRulerGuide: () => void
  readonly canvasPoint: (event: PointerEvent) => CanvasPoint | undefined
  readonly commitText: () => void
  readonly samplingCursor: Ref<CanvasPoint | undefined>
  readonly hideEyedropper: () => void
  readonly scheduleEyedropper: (
    point: CanvasPoint,
    client: { clientX: number; clientY: number },
  ) => void
  readonly sampleScene: (point: CanvasPoint) => void
  readonly visibleCanvasCenter: () => CanvasPoint | undefined
  readonly selectedLayer: () => LayerNode | undefined
  readonly loupeSourceHandle: (layer: LayerNode, point: CanvasPoint) => boolean
  readonly calloutHandle: (
    layer: LayerNode,
    point: CanvasPoint,
  ) => CalloutHandleKind | undefined
  readonly arrowHandle: (
    layer: LayerNode,
    point: CanvasPoint,
  ) => ArrowHandleKind | undefined
  readonly intrinsicEndpoint: (
    layer: LayerNode,
    point: CanvasPoint,
  ) => 'start' | 'end' | undefined
  readonly resizeHandle: (
    layer: LayerNode,
    point: CanvasPoint,
  ) => ResizeHandle | undefined
  readonly rotationCorner: (
    layer: LayerNode,
    point: CanvasPoint,
  ) => ResizeHandle | undefined
  readonly resizeCursor: (handle: ResizeHandle) => string
  readonly setCursor: (cursor: string, rotate?: boolean) => void
  readonly layerBounds: (layer: LayerNode) => {
    x: number
    y: number
    width: number
    height: number
  }
  readonly transformPoint: (
    transform: LayerNode['transform'],
    point: CanvasPoint,
  ) => CanvasPoint
  readonly startText: (input: TextEditorStartInput) => void
  readonly invalidateOverlay: () => void
  readonly renderCommittedScene: () => void
}
