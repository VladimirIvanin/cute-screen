import {
  onBeforeUnmount,
  onMounted,
  watch,
} from 'vue'
import {
  addSpotlightAperture,
  updateSpotlightAperture,
  spotlightApertureAt,
  resizeLayerGeometry,
  type SpotlightLayer,
  type LayerNode,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'
import type {
  CanvasPoint,
  CanvasViewportEmit,
  CanvasViewportProps,
} from './contracts'
import type { ResizeHandle } from './workspace-state'
interface SpotlightEditingContext {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly canvas: () => HTMLCanvasElement | undefined
  readonly canvasPoint: (event: {
    clientX: number
    clientY: number
  }) => CanvasPoint | undefined
  readonly toLocal: (layer: LayerNode, point: CanvasPoint) => CanvasPoint
  readonly resizeHandle: (layer: LayerNode, point: CanvasPoint) => ResizeHandle | undefined
  readonly invalidateOverlay: () => void
  readonly render: () => void
}
/** Imperative aperture gestures; the document only changes at pointer-up. */
export class SpotlightEditingController {
  readonly #context: SpotlightEditingContext
  #gesture: {
    initial: SpotlightLayer
    apertureId: string
    start: CanvasPoint
    handle?: ResizeHandle | undefined
    adding: boolean
    pointerId: number
  } | undefined
  #preview: SpotlightLayer | undefined
  #frame: number | undefined
  constructor(context: SpotlightEditingContext) {
    this.#context = context
    watch(() => [
      context.props.document, context.props.spotlightEditing, context.props.activeTool, context.props.readOnly,
    ], () => {
      this.cancel()
      context.invalidateOverlay()
    })
    const keydown = (event: KeyboardEvent) => this.keydown(event)
    const blur = () => this.cancel()
    onMounted(() => {
      document.addEventListener('keydown', keydown, true)
      window.addEventListener('blur', blur)
    })
    onBeforeUnmount(() => {
      if (this.#frame !== undefined)
        cancelAnimationFrame(this.#frame)
      this.#frame = undefined
      this.#gesture = undefined
      this.#preview = undefined
      document.removeEventListener('keydown', keydown, true)
      window.removeEventListener('blur', blur)
    })
  }
  layer(): SpotlightLayer | undefined {
    const { props } = this.#context
    const layer = props.document?.layers.find(
      (item) => item.id === props.spotlightEditing?.layerId && item.id === props.selectedLayerId,
    )
    return layer?.kind === 'spotlight' && props.activeTool === 'select' ? layer : undefined
  }
  selectionLayer(): SpotlightLayer | undefined {
    const layer = this.#preview ?? this.layer()
    const aperture = layer?.payload.apertures.find(
      (item) => item.id === this.#context.props.spotlightEditing?.apertureId,
    )
    return layer && aperture ? {
      ...layer, localBounds: aperture.bounds,
    } : undefined
  }
  documentForScene(document: EditorDocumentV1 | undefined): EditorDocumentV1 | undefined {
    return document && this.#preview ? {
      ...document, layers: document.layers.map((layer) => layer.id === this.#preview?.id ? this.#preview : layer),
    } : document
  }
  doubleClick(event: MouseEvent): boolean {
    const { props, canvasPoint, toLocal, emit } = this.#context
    if (
      props.activeTool !== 'select' ||
      props.readOnly ||
      props.sampling
    )
      return false
    const layer = props.document?.layers.find((item) => item.id === props.selectedLayerId)
    const point = canvasPoint(event)
    if (
      layer?.kind !== 'spotlight' ||
      layer.locked ||
      !point
    )
      return false
    const aperture = spotlightApertureAt(layer, toLocal(layer, point))
    if (!aperture)
      return false
    this.cancel()
    event.preventDefault()
    emit('spotlightEditingChange', {
      layerId: layer.id, apertureId: aperture.id,
    })
    return true
  }
  pointerDown(event: PointerEvent): boolean {
    const layer = this.layer()
    const { props, canvasPoint, toLocal, emit, resizeHandle } = this.#context
    if (
      !layer ||
      event.button !== 0 ||
      layer.locked ||
      props.readOnly ||
      props.sampling
    )
      return false
    const point = canvasPoint(event)
    if (!point)
      return false
    const local = toLocal(layer, point)
    const editing = props.spotlightEditing!
    const selection = this.selectionLayer()
    const handle = selection && !editing.adding ? resizeHandle(selection, point) : undefined
    const hit = spotlightApertureAt(layer, local)
    if (
      !editing.adding &&
      !handle &&
      !hit
    ) {
      emit('spotlightEditingChange', undefined)
      return false
    }
    if (
      hit &&
      !handle &&
      hit.id !== editing.apertureId
    ) {
      emit('spotlightEditingChange', {
        layerId: layer.id, apertureId: hit.id,
      })
      event.preventDefault()
      return true
    }
    const apertureId = editing.adding ? crypto.randomUUID() : handle ? editing.apertureId : hit!.id
    this.#gesture = {
      initial: layer, apertureId, start: local, handle, adding: Boolean(editing.adding), pointerId: event.pointerId,
    }
    this.#context.canvas()?.setPointerCapture(event.pointerId)
    event.preventDefault()
    return true
  }
  pointerMove(event: PointerEvent): boolean {
    const gesture = this.#gesture
    if (!gesture || gesture.pointerId !== event.pointerId)
      return false
    const point = this.#context.canvasPoint(event)
    if (!point)
      return true
    const local = this.#context.toLocal(gesture.initial, point)
    if (gesture.adding) {
      const width = Math.abs(local.x - gesture.start.x)
      const height = Math.abs(local.y - gesture.start.y)
      if (width < 1 || height < 1)
        return true
      this.#preview = addSpotlightAperture(gesture.initial, {
        id: gesture.apertureId, shape: this.#context.props.precisionDefaults?.spotlight.shape ?? 'rectangle', bounds: {
          x: Math.min(local.x, gesture.start.x), y: Math.min(local.y, gesture.start.y), width, height,
        },
      })
    } else {
      const aperture = gesture.initial.payload.apertures.find((item) => item.id === gesture.apertureId)!
      const bounds = gesture.handle
        ? resizeLayerGeometry({
          ...gesture.initial, localBounds: aperture.bounds, payload: {
            ...gesture.initial.payload, apertures: [aperture],
          },
        }, gesture.handle, point, {
          preserveAspect: event.shiftKey, fromCenter: event.altKey,
        }).localBounds
        : {
            ...aperture.bounds,
            x: aperture.bounds.x + local.x - gesture.start.x,
            y: aperture.bounds.y + local.y - gesture.start.y,
          }
      this.#preview = updateSpotlightAperture(gesture.initial, gesture.apertureId, {
        bounds,
      })
    }
    this.schedule()
    return true
  }
  pointerUp(event: PointerEvent): boolean {
    const gesture = this.#gesture
    if (!gesture || gesture.pointerId !== event.pointerId)
      return false
    this.pointerMove(event)
    const after = this.#preview
    this.cancel()
    if (after && JSON.stringify(after) !== JSON.stringify(gesture.initial)) {
      this.#context.emit('documentCommand', {
        type: 'updateLayer', before: gesture.initial, after,
      })
      this.#context.emit('spotlightEditingChange', {
        layerId: after.id, apertureId: gesture.apertureId,
      })
    }
    return true
  }
  cancel(): boolean {
    const gesture = this.#gesture
    const changed = Boolean(gesture || this.#preview)
    const canvas = this.#context.canvas()
    if (gesture && canvas?.hasPointerCapture(gesture.pointerId))
      canvas.releasePointerCapture(gesture.pointerId)
    this.#gesture = undefined
    this.#preview = undefined
    if (changed)
      this.schedule()
    return changed
  }
  private schedule(): void {
    if (this.#frame !== undefined)
      return
    this.#frame = requestAnimationFrame(() => {
      this.#frame = undefined
      this.#context.render()
    })
  }
  private keydown(event: KeyboardEvent): void {
    if (!this.layer() || event.defaultPrevented)
      return
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="slider"]'))
      return
    if (
      event.key !== 'Escape' &&
      event.key !== 'Delete' &&
      event.key !== 'Backspace'
    )
      return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.key === 'Escape') {
      if (!this.cancel() || this.#context.props.spotlightEditing?.adding)
        this.#context.emit('spotlightEditingChange', undefined)
    } else if (!this.#context.props.readOnly && !this.layer()?.locked)
      this.#context.emit('spotlightRemove')
  }
}
