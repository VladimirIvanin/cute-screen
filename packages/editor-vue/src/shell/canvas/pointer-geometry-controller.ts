import {
  calloutGeometryContext,
  DocumentSpatialIndex,
  nearestSelectionHandle,
  resolveSelectionTarget,
  type SelectionHandle,
  type SelectionTarget,
  type LayerNode,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'
import type {
  ComputedRef,
  Ref,
} from 'vue'
import type {
  CanvasPoint,
  CanvasViewportProps,
  ViewportOutputBounds,
} from './contracts'
import type { ResizeHandle } from './workspace-state'
import { canvasSelectionHandles } from './selection-controls'

export interface PointerGeometryContext {
  readonly gradientEditing?: () => boolean
  readonly props: CanvasViewportProps
  readonly scene: Ref<HTMLCanvasElement | undefined>
  readonly outputBounds: ComputedRef<ViewportOutputBounds | undefined>
  readonly selectedLayer: () => LayerNode | undefined
  readonly calloutInsertMode?: () => boolean
  readonly cropCursor: (point: CanvasPoint) => string | undefined

}

export class PointerGeometryController {
  readonly #context: PointerGeometryContext
  #hitIndex: DocumentSpatialIndex | undefined
  #indexedDocument: EditorDocumentV1 | undefined
  hoverTarget: SelectionTarget = { kind: 'empty' }

  constructor(context: PointerGeometryContext) {
    this.#context = context
  }

  screenScale(): CanvasPoint {
    const rect = this.#context.scene.value?.getBoundingClientRect()
    const bounds = this.#context.outputBounds.value
    const zoom = (this.#context.props.zoom ?? 100) / 100
    return rect && bounds && rect.width > 0 && rect.height > 0
      ? { x: rect.width / bounds.width, y: rect.height / bounds.height } : { x: zoom, y: zoom }
  }

  canvasPoint(event: {
    readonly clientX: number
    readonly clientY: number
    readonly pressure?: number
    readonly pointerType?: string
  }): CanvasPoint | undefined {
    const { scene, props, outputBounds } = this.#context
    const bounds = outputBounds.value
    if (
      !scene.value ||
      !props.document ||
      !bounds
    ) return undefined
    const rect = scene.value.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return undefined
    return {
      x: bounds.x + ((event.clientX - rect.left) * bounds.width) / rect.width,
      y: bounds.y + ((event.clientY - rect.top) * bounds.height) / rect.height,
      pressure: event.pointerType === 'pen' && typeof event.pressure === 'number' && Number.isFinite(event.pressure)
        ? Math.max(0, Math.min(1, event.pressure)) : 0.5,
    }
  }

  handles(layer: LayerNode): readonly SelectionHandle[] {
    if (
      this.#context.gradientEditing?.() &&
      layer.kind === 'shape' &&
      layer.payload.annotationTool === 'gradient'
    ) return []
    return canvasSelectionHandles(layer, this.screenScale(), this.#context.outputBounds.value,
      this.#context.calloutInsertMode?.())
  }

  resolveSelectionTarget(point: CanvasPoint): SelectionTarget {
    const { props } = this.#context
    if (!props.document) return { kind: 'empty' }
    const ids = props.selectedLayerIds ?? (props.selectedLayerId ? [props.selectedLayerId] : [])
    const selected = ids.length === 1 ? this.#context.selectedLayer() : undefined
    return resolveSelectionTarget({ document: props.document, selectedIds: ids, point,
      hitIndex: this.#indexFor(props.document),
      screenScale: this.screenScale(), context: calloutGeometryContext(), readOnly: props.readOnly ?? false,
      handles: selected && !props.readOnly ? this.handles(selected) : [] })
  }

  #indexFor(document: EditorDocumentV1): DocumentSpatialIndex {
    if (!this.#hitIndex || !this.#indexedDocument) {
      this.#hitIndex = new DocumentSpatialIndex(document)
    } else if (this.#indexedDocument !== document) {
      const previous = new Map(this.#indexedDocument.layers.map((layer) => [layer.id, layer]))
      const changed = document.layers.filter((layer) => previous.get(layer.id) !== layer).map((layer) => layer.id)
      const currentIds = new Set(document.layers.map((layer) => layer.id))
      const removed = this.#indexedDocument.layers.filter((layer) => !currentIds.has(layer.id)).map((layer) => layer.id)
      this.#hitIndex.update(document, [...changed, ...removed])
    }
    this.#indexedDocument = document
    return this.#hitIndex
  }

  boundsResizeHandle(
    layer: LayerNode,
    point: CanvasPoint,
  ): ResizeHandle | undefined {
    const handle = nearestSelectionHandle(this.handles(layer).filter((item) => item.kind === 'resize'), point,
      this.screenScale())
    return handle?.kind === 'resize' ? handle.handle : undefined
  }
  setCursor(
    cursor: string,
    rotate = false,
  ): void {
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
    const { props } = this.#context
    this.hoverTarget = { kind: 'empty' }
    const crop = props.quickSelectionMode ? undefined : this.#context.cropCursor(point)
    if (crop !== undefined) {
      this.setCursor(crop)
      return
    }
    if (
      props.activeTool === 'numberedMarker' &&
      !props.sampling &&
      !props.quickSelectionMode
    ) {
      this.setCursor(props.markerPreviewBlocked || props.readOnly ? 'default' : 'none')
      return
    }
    if (props.activeTool === 'hand' || props.activeTool === 'crop') return
    if (
      props.quickSelectionMode ||
      props.activeTool &&
      props.activeTool !== 'select'
    ) {
      this.setCursor('crosshair')
      return
    }
    const target = this.resolveSelectionTarget(point)
    this.hoverTarget = target
    if (props.readOnly) {
      this.setCursor('')
      return
    }
    if (target.kind === 'handle') {
      const handle = target.target
      if (handle.kind === 'rotate') {
        this.setCursor('', true)
        return
      }
      if (handle.kind === 'resize') {
        this.setCursor(this.resizeCursor(handle.handle))
        return
      }
      this.setCursor(directHandleCursor(handle))
      return
    }
    this.setCursor(target.kind === 'empty' ? '' : 'move')
  }
}

function directHandleCursor(handle: SelectionHandle): string {
  if (handle.kind !== 'callout') return 'crosshair'
  if (handle.handle === 'width') return 'ew-resize'
  return handle.handle === 'labelBody' ? 'move' : 'crosshair'
}
