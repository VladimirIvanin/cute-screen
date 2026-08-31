import {
  arrowSelectionHandles,
  BOUNDS_RESIZE_HANDLES,
  calloutMarkerRadius,
  calloutSelectionHandles,
  hitTestDocument,
  layerIntrinsicResizeHandles,
  type ArrowHandleKind,
  type CalloutHandleKind,
  type LayerNode,
  type StrokeStyle,
  type Transform2D,
} from '@cute-screen/editor-renderer'
import type { ComputedRef, Ref } from 'vue'
import type {
  CanvasPoint,
  CanvasViewportProps,
  ViewportOutputBounds,
} from './contracts'
import type { ResizeHandle } from './workspace-state'

export interface PointerGeometryContext {
  readonly props: CanvasViewportProps
  readonly scene: Ref<HTMLCanvasElement | undefined>
  readonly outputBounds: ComputedRef<ViewportOutputBounds | undefined>
  readonly selectedLayer: () => LayerNode | undefined
  readonly layerBounds: (layer: LayerNode) => {
    x: number
    y: number
    width: number
    height: number
  }
  readonly worldHandlePositions: (
    layer: LayerNode,
  ) => Readonly<Record<ResizeHandle, CanvasPoint>>
  readonly transformPoint: (
    transform: Transform2D,
    point: CanvasPoint,
  ) => CanvasPoint
  readonly loupeSourceCenter: (
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
  ) => CanvasPoint
}

export function calloutTextEditorOrigin(
  label: CanvasPoint,
  stroke: StrokeStyle,
  fontSize: number,
): CanvasPoint {
  const markerRadius = calloutMarkerRadius(stroke.width)
  return {
    x: label.x + markerRadius + 6,
    y: label.y - (fontSize * 1.25) / 2,
  }
}

export class PointerGeometryController {
  readonly #context: PointerGeometryContext

  constructor(context: PointerGeometryContext) {
    this.#context = context
  }

  canvasPoint(event: {
    readonly clientX: number
    readonly clientY: number
    readonly pressure?: number
    readonly pointerType?: string
  }): CanvasPoint | undefined {
    const { scene, props, outputBounds } = this.#context
    const bounds = outputBounds.value
    if (!scene.value || !props.document || !bounds) return undefined
    const rect = scene.value.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return undefined
    return {
      x:
        bounds.x +
        ((event.clientX - rect.left) * scene.value.width) / rect.width,
      y:
        bounds.y +
        ((event.clientY - rect.top) * scene.value.height) / rect.height,
      pressure:
        event.pointerType === 'pen' &&
        typeof event.pressure === 'number' &&
        Number.isFinite(event.pressure)
          ? Math.max(0, Math.min(1, event.pressure))
          : 0.5,
    }
  }

  boundsResizeHandle(
    layer: LayerNode,
    point: CanvasPoint,
  ): ResizeHandle | undefined {
    const handles =
      layer.kind === 'image'
        ? BOUNDS_RESIZE_HANDLES
        : layerIntrinsicResizeHandles(layer).filter(
            (handle): handle is ResizeHandle =>
              handle !== 'start' && handle !== 'end',
          )
    const positions = this.#context.worldHandlePositions(layer)
    const tolerance = this.#tolerance()
    return handles.find((handle) => {
      const position = positions[handle]
      return Math.hypot(position.x - point.x, position.y - point.y) <= tolerance
    })
  }

  rotationCorner(
    layer: LayerNode,
    point: CanvasPoint,
  ): ResizeHandle | undefined {
    const positions = this.#context.worldHandlePositions(layer)
    const bounds = this.#context.layerBounds(layer)
    const center = this.#context.transformPoint(layer.transform, {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    })
    const corners = ['nw', 'ne', 'se', 'sw'] as const
    const resizeCorners = new Set(
      (layer.kind === 'image'
        ? BOUNDS_RESIZE_HANDLES
        : layerIntrinsicResizeHandles(layer)
      ).filter((handle) => corners.includes(handle as never)),
    )
    const offset = 14 / this.#zoomScale()
    return corners.find((handle) => {
      const corner = positions[handle]
      const length = Math.hypot(corner.x - center.x, corner.y - center.y) || 1
      const target = resizeCorners.has(handle)
        ? {
            x: corner.x + ((corner.x - center.x) / length) * offset,
            y: corner.y + ((corner.y - center.y) / length) * offset,
          }
        : corner
      return (
        Math.hypot(target.x - point.x, target.y - point.y) <= this.#tolerance()
      )
    })
  }

  intrinsicEndpoint(
    layer: LayerNode,
    point: CanvasPoint,
  ): 'start' | 'end' | undefined {
    if (layer.kind !== 'ruler') return undefined
    return (['start', 'end'] as const).find((handle) => {
      const candidate = this.#context.transformPoint(
        layer.transform,
        layer.payload[handle],
      )
      return (
        Math.hypot(candidate.x - point.x, candidate.y - point.y) <=
        this.#tolerance()
      )
    })
  }

  setCursor(cursor: string, rotate = false): void {
    const canvas = this.#context.scene.value
    if (!canvas) return
    canvas.classList.toggle('cs-canvas-rotate-cursor', rotate)
    canvas.style.cursor = cursor
  }

  resizeCursor(handle: ResizeHandle): string {
    if (handle === 'n' || handle === 's') return 'ns-resize'
    if (handle === 'e' || handle === 'w') return 'ew-resize'
    return handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize'
  }

  updateHoverCursor(point: CanvasPoint): void {
    const { props, scene } = this.#context
    if (props.quickSelectionMode) {
      this.setCursor('crosshair')
      return
    }
    if (
      !scene.value ||
      !props.document ||
      props.activeTool === 'hand' ||
      props.activeTool === 'crop'
    ) {
      return
    }
    const layer = this.#context.selectedLayer()
    if (!layer || layer.locked || !layer.visible) {
      this.setCursor('')
      return
    }
    if (this.#isDirectHandle(layer, point)) {
      this.setCursor('crosshair')
      return
    }
    const resize = this.boundsResizeHandle(layer, point)
    if (resize) {
      this.setCursor(this.resizeCursor(resize))
      return
    }
    if (this.rotationCorner(layer, point)) {
      this.setCursor('', true)
      return
    }
    this.setCursor(hitTestDocument(props.document, point) ? 'move' : '')
  }

  calloutHandle(
    layer: LayerNode,
    point: CanvasPoint,
  ): CalloutHandleKind | undefined {
    if (layer.kind !== 'callout') return undefined
    return calloutSelectionHandles(layer).find(({ point: local }) => {
      const candidate = this.#context.transformPoint(layer.transform, local)
      return (
        Math.hypot(candidate.x - point.x, candidate.y - point.y) <=
        this.#tolerance()
      )
    })?.kind
  }

  loupeSourceHandle(layer: LayerNode, point: CanvasPoint): boolean {
    if (layer.kind !== 'loupe') return false
    const source = this.#context.loupeSourceCenter(layer)
    return (
      Math.hypot(source.x - point.x, source.y - point.y) <= this.#tolerance()
    )
  }

  arrowHandle(
    layer: LayerNode,
    point: CanvasPoint,
  ): ArrowHandleKind | undefined {
    if (layer.kind !== 'arrow') return undefined
    return arrowSelectionHandles(layer).find(({ point: local }) => {
      const candidate = this.#context.transformPoint(layer.transform, local)
      return (
        Math.hypot(candidate.x - point.x, candidate.y - point.y) <=
        this.#tolerance()
      )
    })?.kind
  }

  #isDirectHandle(layer: LayerNode, point: CanvasPoint): boolean {
    return Boolean(
      this.calloutHandle(layer, point) ||
      this.arrowHandle(layer, point) ||
      this.intrinsicEndpoint(layer, point) ||
      this.loupeSourceHandle(layer, point),
    )
  }

  #zoomScale(): number {
    return (this.#context.props.zoom ?? 100) / 100
  }

  #tolerance(): number {
    return 9 / this.#zoomScale()
  }
}
