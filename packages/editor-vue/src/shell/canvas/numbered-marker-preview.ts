import {
  watch,
  onBeforeUnmount,
  onMounted,
} from 'vue'
import {
  createPreparedNumberedMarker,
  createDocumentRenderScene,
  drawNodes2D,
} from '@cute-screen/editor-renderer'
import type {
  CanvasPoint,
  CanvasViewportProps,
} from './contracts'

/** The marker is the cursor; pointer position/cache/RAF stay outside Vue. */
export class NumberedMarkerPreview {
  #point: CanvasPoint | undefined
  #frame: number | undefined
  #key: string | undefined
  #shown = false
  #nodes: ReturnType<typeof createDocumentRenderScene>['nodes'] = []
  constructor(
    readonly props: CanvasViewportProps,
    readonly invalidate: () => void,
    readonly suspended: () => boolean = () => false,
  ) {}
  move(point: CanvasPoint | undefined): void {
    this.#point = point
    if (this.props.activeTool === 'numberedMarker' || this.#shown) this.#schedule()
  }
  clear(): void {
    this.move(undefined)
  }
  refresh(): void {
    this.#key = undefined
    if (
      this.#shown ||
      this.props.activeTool === 'numberedMarker' &&
      this.#point
    ) this.#schedule()
  }
  #schedule(): void {
    if (this.#frame !== undefined) return
    this.#frame = requestAnimationFrame(() => {
      this.#frame = undefined
      this.invalidate()
    })
  }
  dispose(): void {
    if (this.#frame !== undefined) cancelAnimationFrame(this.#frame)
  }
  draw(context: CanvasRenderingContext2D): void {
    const { props } = this
    const point = this.#point
    this.#shown = false
    if (
      !point ||
      !props.document ||
      props.readOnly ||
      props.markerPreviewBlocked ||
      props.sampling ||
      props.activeTool !== 'numberedMarker' ||
      this.suspended()
    ) return
    const sequence = props.nextMarkerSequence ?? 1
    if (!Number.isSafeInteger(sequence) || sequence < 1) return
    const key = JSON.stringify([sequence, props.markerShape, props.markerStyle])
    if (this.#key !== key) {
      const layer = createPreparedNumberedMarker({
        id: '__marker-preview__', sequence, origin: { x: 0, y: 0 },
        shape: props.markerShape, style: props.markerStyle,
      })
      const nodes = createDocumentRenderScene({ ...props.document, layers: [layer] }).nodes
      this.#nodes = nodes.map((node) => ({ ...node, opacity: 0.55 }))
      this.#key = key
    }
    context.save()
    context.translate(point.x, point.y)
    drawNodes2D(context, this.#nodes)
    context.restore()
    this.#shown = true
  }
}
export function useNumberedMarkerPreview(
  props: CanvasViewportProps,
  invalidate: () => void,
  suspended: () => boolean,
) {
  const preview = new NumberedMarkerPreview(props, invalidate, suspended)
  watch(() => [props.nextMarkerSequence, props.markerShape, props.markerStyle,
    props.markerPreviewBlocked, props.readOnly, props.sampling, props.activeTool], () => preview.refresh())
  watch(() => props.document?.id, () => preview.clear())
  onMounted(() => document.fonts?.addEventListener('loadingdone', refreshFonts))
  function refreshFonts(): void {
    preview.refresh()
  }
  onBeforeUnmount(() => {
    document.fonts?.removeEventListener('loadingdone', refreshFonts)
    preview.dispose()
  })
  return preview
}
