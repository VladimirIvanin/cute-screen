import { computed, type Ref } from 'vue'
import type {
  CanvasPoint,
  CanvasViewportEmit,
  CanvasViewportProps,
  ViewportOutputBounds,
} from './contracts'
import type { ZoomAnchor } from './workspace-lifecycle'

export interface ViewportControllerContext {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly scene: Ref<HTMLCanvasElement | undefined>
  readonly scrollContainer: Ref<HTMLDivElement | undefined>
  readonly canvasPoint: (event: {
    readonly clientX: number
    readonly clientY: number
  }) => CanvasPoint | undefined
}

export class ViewportController {
  readonly outputBounds = computed<ViewportOutputBounds | undefined>(() => {
    const canvas = this.#context.props.canvas
    if (!canvas) return undefined
    if (
      this.#context.props.activeTool === 'crop' ||
      this.#context.props.quickFrameMode
    ) {
      return { x: 0, y: 0, width: canvas.width, height: canvas.height }
    }
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

  constructor(context: ViewportControllerContext) {
    this.#context = context
  }

  fit(): void {
    const { props, scrollContainer, emit } = this.#context
    if (!props.canvas || !scrollContainer.value || !props.fitMode) return
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
    const scale = Math.min(
      availableWidth / bounds.width,
      availableHeight / bounds.height,
    )
    const nextZoom = Math.round(scale * 100)
    if (nextZoom === props.zoom) return
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
    this.#context.emit(
      'zoom',
      Math.round(current * (event.deltaY < 0 ? 1.1 : 1 / 1.1)),
    )
  }

  takeZoomAnchor(): ZoomAnchor | undefined {
    const anchor = this.#pendingZoomAnchor
    this.#pendingZoomAnchor = undefined
    return anchor
  }
}
