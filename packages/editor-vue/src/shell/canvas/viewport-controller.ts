import {
  computed,
  type Ref,
} from 'vue'
import type {
  CanvasPoint,
  CanvasViewportEmit,
  CanvasViewportProps,
  ViewportOutputBounds,
} from './contracts'
import type { ZoomAnchor } from './workspace-lifecycle'
import { visibleImageTarget } from './image-insertion-target'

export interface ViewportControllerContext {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly scene: Ref<HTMLCanvasElement | undefined>
  readonly scrollContainer: Ref<HTMLDivElement | undefined>
  readonly canvasPoint: (event: { readonly clientX: number; readonly clientY: number }) => CanvasPoint | undefined
}

export class ViewportController {
  readonly outputBounds = computed<ViewportOutputBounds | undefined>(() => {
    const canvas = this.#context.props.canvas
    if (!canvas) return undefined
    if (this.#context.props.activeTool === 'crop' || this.#context.props.quickFrameMode) {
      return { x: 0, y: 0, width: canvas.width, height: canvas.height }
    }
    if (this.#context.props.previewBounds) return this.#context.props.previewBounds
    if (this.#context.props.compositionBounds) return this.#context.props.compositionBounds
    return (
      this.#context.props.document?.crop ?? {
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
      }
    )
  })

  readonly #context: ViewportControllerContext
  #pendingZoomAnchor: ZoomAnchor | undefined
  #fitted: {
    readonly width: number
    readonly height: number
    readonly zoom: number
  } | undefined

  imageInsertionTarget(point?: { readonly x: number; readonly y: number }) {
    return visibleImageTarget(this.#context.scrollContainer.value, this.#context.scene.value,
      this.outputBounds.value, this.#context.props.document?.crop ?? this.outputBounds.value, point)
  }

  constructor(context: ViewportControllerContext) {
    this.#context = context
  }

  fit(): void {
    const { props, scrollContainer, emit } = this.#context
    if (
      !props.canvas ||
      !scrollContainer.value ||
      !props.fitMode
    ) return
    const bounds = this.outputBounds.value
    if (!bounds) return
    const style = getComputedStyle(scrollContainer.value)
    const availableWidth =
      scrollContainer.value.clientWidth -
      Number.parseFloat(style.paddingLeft || '0') -
      Number.parseFloat(style.paddingRight || '0')
    const availableHeight =
      scrollContainer.value.clientHeight -
      Number.parseFloat(style.paddingTop || '0') -
      Number.parseFloat(style.paddingBottom || '0')
    if (availableWidth <= 0 || availableHeight <= 0) return
    const clientWidth = scrollContainer.value.clientWidth
    const clientHeight = scrollContainer.value.clientHeight
    const scale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height)
    // Round down: an integer percent that rounds up is wider than the
    // padded viewport and shows a scrollbar after capture opens in the editor.
    let nextZoom = Math.floor(scale * 100)
    if (
      (bounds.width * nextZoom) / 100 > availableWidth ||
      (bounds.height * nextZoom) / 100 > availableHeight
    ) {
      nextZoom -= 1
    }
    if (nextZoom < 1) return
    const fitted = this.#fitted
    const growth = fitted
      ? Math.max(Math.abs(clientWidth - fitted.width), Math.abs(clientHeight - fitted.height))
      : Number.POSITIVE_INFINITY
    // A scrollbar changes the client size by a few pixels and would otherwise
    // raise the zoom, remove the scrollbar, and fit again forever.
    if (
      fitted &&
      nextZoom > fitted.zoom &&
      growth < 16
    ) return
    if (nextZoom === props.zoom) return
    this.#fitted = { width: clientWidth, height: clientHeight, zoom: nextZoom }
    emit('fitZoom', nextZoom)
  }

  wheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const point = this.#context.canvasPoint(event)
    if (point) {
      this.#pendingZoomAnchor = {
        canvas: point,
        clientX: event.clientX,
        clientY: event.clientY,
      }
    }
    const current = this.#context.props.zoom ?? 100
    this.#context.emit('zoom', Math.round(current * (event.deltaY < 0 ? 1.1 : 1 / 1.1)))
  }

  takeZoomAnchor(): ZoomAnchor | undefined {
    const anchor = this.#pendingZoomAnchor
    this.#pendingZoomAnchor = undefined
    return anchor
  }
}
