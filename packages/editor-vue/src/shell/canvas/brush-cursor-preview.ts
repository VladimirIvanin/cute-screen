import {
  watch,
  onBeforeUnmount,
} from 'vue'
import {
  createDrawingLayer,
  createDocumentRenderScene,
  drawNodes2D,
  DEFAULT_DRAWING_DEFAULTS,
} from '@cute-screen/editor-renderer'
import type {
  CanvasPoint,
  CanvasViewportProps,
} from './contracts'

type BrushTool = 'pencil' | 'marker'
type SceneNode = ReturnType<typeof createDocumentRenderScene>['nodes'][number]

/** Brush diameter is the cursor; pointer position and the dot cache stay outside Vue. */
export class BrushCursorPreview {
  #point: CanvasPoint | undefined
  #frame: number | undefined
  #key: string | undefined
  #shown = false
  #nodes: SceneNode[] = []
  #center = { x: 0, y: 0 }
  #radius = 0
  #ring = 'rgba(229, 72, 77, 1)'

  constructor(
    readonly props: CanvasViewportProps,
    readonly invalidate: () => void,
    readonly suspended: () => boolean = () => false,
  ) {}

  move(point: CanvasPoint | undefined): void {
    this.#point = point
    if (brushTool(this.props.activeTool) || this.#shown) this.#schedule()
  }

  clear(): void {
    this.move(undefined)
  }

  refresh(): void {
    this.#key = undefined
    if (
      this.#shown ||
      brushTool(this.props.activeTool) &&
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
    const tool = brushTool(props.activeTool)
    this.#shown = false
    if (
      !point ||
      !tool ||
      !props.document ||
      props.readOnly ||
      props.markerPreviewBlocked ||
      props.sampling ||
      props.quickSelectionMode ||
      this.suspended()
    ) return
    this.#ensureDot(tool)
    if (!this.#nodes.length || this.#radius <= 0) return
    const zoom = Math.max(0.01, (props.zoom ?? 100) / 100)
    const pixel = 1 / zoom
    context.save()
    context.translate(point.x, point.y)
    drawNodes2D(context, this.#nodes)
    context.beginPath()
    context.arc(this.#center.x, this.#center.y, this.#radius, 0, Math.PI * 2)
    context.lineWidth = pixel
    context.strokeStyle = this.#ring
    context.setLineDash([])
    context.stroke()
    context.translate(this.#center.x, this.#center.y)
    strokeCross(context, pixel, pixel * 4)
    context.restore()
    this.#shown = true
  }

  #ensureDot(tool: BrushTool): void {
    const defaults = this.props.drawingDefaults ?? DEFAULT_DRAWING_DEFAULTS
    const key = JSON.stringify(defaults[tool])
    if (this.#key === key && this.#nodes.length) return
    const layer = createDrawingLayer({
      id: '__brush-cursor__',
      tool,
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      points: [{ x: 0, y: 0, pressure: 0.5 }],
      defaults,
    })
    const document = this.props.document
    if (!layer || !document) {
      this.#nodes = []
      this.#key = key
      return
    }
    const ellipse = createDocumentRenderScene({ ...document, layers: [layer] }).nodes
      .find((node) => node.kind === 'ellipse')
    if (!ellipse || ellipse.kind !== 'ellipse') {
      this.#nodes = []
      this.#key = key
      return
    }
    this.#nodes = [ellipse].map((node) => ({
      ...node,
      opacity: Math.min(0.55, node.opacity),
      blendMode: 'normal',
    }))
    this.#center = { x: ellipse.centerX, y: ellipse.centerY }
    this.#radius = ellipse.radiusX
    this.#ring = ringColor(ellipse.fill)
    this.#key = key
  }
}

export function useBrushCursorPreview(
  props: CanvasViewportProps,
  invalidate: () => void,
  suspended: () => boolean,
) {
  const preview = new BrushCursorPreview(props, invalidate, suspended)
  watch(() => [
    props.drawingDefaults,
    props.markerPreviewBlocked,
    props.readOnly,
    props.sampling,
    props.activeTool,
    props.quickSelectionMode,
    props.zoom,
  ], () => preview.refresh())
  watch(() => props.document?.id, () => preview.clear())
  onBeforeUnmount(() => preview.dispose())
  return preview
}

function brushTool(tool: string | undefined): BrushTool | undefined {
  return tool === 'pencil' || tool === 'marker' ? tool : undefined
}

function ringColor(fill: unknown): string {
  if (!fill || typeof fill !== 'object') return 'rgba(229, 72, 77, 1)'
  const color = fill as {
    red?: unknown
    green?: unknown
    blue?: unknown
    alpha?: unknown
  }
  if (
    typeof color.red !== 'number' ||
    typeof color.green !== 'number' ||
    typeof color.blue !== 'number' ||
    typeof color.alpha !== 'number'
  ) return 'rgba(229, 72, 77, 1)'
  const red = Math.round(color.red * 255)
  const green = Math.round(color.green * 255)
  const blue = Math.round(color.blue * 255)
  return `rgba(${red}, ${green}, ${blue}, ${color.alpha})`
}

function strokeCross(
  context: CanvasRenderingContext2D,
  pixel: number,
  arm: number,
): void {
  context.beginPath()
  context.moveTo(-arm, 0)
  context.lineTo(arm, 0)
  context.moveTo(0, -arm)
  context.lineTo(0, arm)
  context.lineCap = 'round'
  context.lineWidth = pixel * 3
  context.strokeStyle = 'rgba(255, 255, 255, 0.92)'
  context.stroke()
  context.lineWidth = pixel
  context.strokeStyle = 'rgba(24, 26, 30, 0.92)'
  context.stroke()
}
