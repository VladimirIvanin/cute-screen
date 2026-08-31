import {
  arrowSelectionHandles,
  BOUNDS_RESIZE_HANDLES,
  calloutSelectionHandles,
  drawNodes2D,
  layerIntrinsicResizeHandles,
  type LayerNode,
  type Transform2D,
} from '@cute-screen/editor-renderer'
import type { ComputedRef, Ref } from 'vue'
import { drawClampedHandleSquare } from '../overlay-handle-bounds'
import type {
  CanvasPoint,
  CanvasViewportProps,
  ViewportOutputBounds,
} from './contracts'
import type { CanvasRendererController } from './renderer-controller'
import type { CanvasGesture, ResizeHandle } from './workspace-state'

type PreviewNodes =
  ReturnType<CanvasRendererController['renderOverlay']> extends boolean
    ? Parameters<CanvasRendererController['renderOverlay']>[0]
    : never

export interface CanvasOverlayContext {
  readonly props: CanvasViewportProps
  readonly overlay: Ref<HTMLCanvasElement | undefined>
  readonly outputBounds: ComputedRef<ViewportOutputBounds | undefined>
  readonly renderer: CanvasRendererController
  readonly gesture: () => CanvasGesture
  readonly previewNodes: () => PreviewNodes
  readonly previewLayer: () => LayerNode | undefined
  readonly selectedLayer: () => LayerNode | undefined
  readonly drawDrafts: (context: CanvasRenderingContext2D) => void
  readonly drawCrop: (
    context: CanvasRenderingContext2D,
    bounds: ViewportOutputBounds,
  ) => boolean
  readonly layerBounds: (layer: LayerNode) => {
    x: number
    y: number
    width: number
    height: number
  }
  readonly worldHandlePositions: (
    layer: LayerNode,
    transform?: Transform2D,
  ) => Readonly<Record<ResizeHandle, CanvasPoint>>
  readonly transformPoint: (
    transform: Transform2D,
    point: CanvasPoint,
  ) => CanvasPoint
  readonly toLocal: (layer: LayerNode, point: CanvasPoint) => CanvasPoint
  readonly loupeSourceCenter: (
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
  ) => CanvasPoint
  readonly moveLoupeSource: (
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
    point: CanvasPoint,
  ) => Extract<LayerNode, { readonly kind: 'loupe' }>
}

export class CanvasOverlayController {
  readonly #context: CanvasOverlayContext

  constructor(context: CanvasOverlayContext) {
    this.#context = context
  }

  draw(): void {
    const { props, overlay, outputBounds, renderer } = this.#context
    const bounds = outputBounds.value
    if (!overlay.value || !props.canvas || !bounds) return
    const context = overlay.value.getContext('2d')
    if (!context || typeof context.clearRect !== 'function') return
    const previewNodes = this.#context.previewNodes()
    const renderedByBackend = renderer.renderOverlay(previewNodes)
    if (!renderedByBackend) {
      context.setTransform?.(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, overlay.value.width, overlay.value.height)
    }
    context.setTransform?.(1, 0, 0, 1, -bounds.x, -bounds.y)
    if (!renderedByBackend) drawNodes2D(context, previewNodes)
    this.#context.drawDrafts(context)
    if (this.#context.drawCrop(context, bounds)) return
    this.#drawSelection(context, bounds)
  }

  #drawSelection(
    context: CanvasRenderingContext2D,
    outputBounds: ViewportOutputBounds,
  ): void {
    const committed = this.#context.selectedLayer()
    const preview = this.#context.previewLayer()
    const layer = preview?.id === committed?.id ? preview : committed
    if (!layer?.visible) return
    this.#drawSelectionFrame(context, layer)
    if (layer.locked) return
    this.#drawResizeHandles(context, layer, outputBounds)
    this.#drawKindHandles(context, layer)
    this.#drawGuides(context)
  }

  #drawSelectionFrame(
    context: CanvasRenderingContext2D,
    layer: LayerNode,
  ): void {
    const transform = layer.transform
    const bounds = this.#context.layerBounds(layer)
    context.save()
    context.translate(transform.translateX, transform.translateY)
    context.rotate((transform.rotation * Math.PI) / 180)
    context.scale(transform.scaleX, transform.scaleY)
    context.lineWidth =
      1 / Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY), 1)
    context.strokeStyle = '#d9773b'
    context.setLineDash([4, 3])
    context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
    context.setLineDash([])
    context.restore()
  }

  #drawResizeHandles(
    context: CanvasRenderingContext2D,
    layer: LayerNode,
    outputBounds: ViewportOutputBounds,
  ): void {
    const half = 3 / ((this.#context.props.zoom ?? 100) / 100)
    context.fillStyle = '#fff'
    context.strokeStyle = '#d9773b'
    const intrinsic = layerIntrinsicResizeHandles(layer).filter(
      (handle): handle is ResizeHandle =>
        handle !== 'start' && handle !== 'end',
    )
    const resizeHandles =
      layer.kind === 'image' ? BOUNDS_RESIZE_HANDLES : intrinsic
    const handles =
      resizeHandles.length > 0
        ? resizeHandles
        : (['nw', 'ne', 'se', 'sw'] as const)
    const positions = this.#context.worldHandlePositions(layer, layer.transform)
    for (const handle of handles) {
      drawClampedHandleSquare(context, positions[handle], half, outputBounds)
    }
  }

  #drawKindHandles(context: CanvasRenderingContext2D, layer: LayerNode): void {
    const half = 3 / ((this.#context.props.zoom ?? 100) / 100)
    if (layer.kind === 'callout') this.#drawCalloutHandles(context, layer, half)
    if (layer.kind === 'arrow') this.#drawArrowHandles(context, layer, half)
    if (layer.kind === 'ruler') this.#drawRulerHandles(context, layer, half)
    if (layer.kind === 'loupe') this.#drawLoupeHandles(context, layer)
  }

  #drawCalloutHandles(
    context: CanvasRenderingContext2D,
    layer: Extract<LayerNode, { readonly kind: 'callout' }>,
    half: number,
  ): void {
    const gesture = this.#context.gesture()
    for (const { kind, point } of calloutSelectionHandles(layer)) {
      const local =
        gesture?.kind === 'calloutHandle' &&
        gesture.id === layer.id &&
        gesture.handle === kind
          ? this.#context.toLocal(layer, gesture.current)
          : point
      this.#drawRoundHandle(
        context,
        this.#context.transformPoint(layer.transform, local),
        half,
      )
    }
  }

  #drawArrowHandles(
    context: CanvasRenderingContext2D,
    layer: Extract<LayerNode, { readonly kind: 'arrow' }>,
    half: number,
  ): void {
    const gesture = this.#context.gesture()
    for (const { kind, point } of arrowSelectionHandles(layer)) {
      const local =
        gesture?.kind === 'arrowHandle' &&
        gesture.id === layer.id &&
        gesture.handle === kind
          ? this.#context.toLocal(layer, gesture.current)
          : point
      this.#drawRoundHandle(
        context,
        this.#context.transformPoint(layer.transform, local),
        half,
      )
    }
  }

  #drawRulerHandles(
    context: CanvasRenderingContext2D,
    layer: Extract<LayerNode, { readonly kind: 'ruler' }>,
    half: number,
  ): void {
    for (const point of [layer.payload.start, layer.payload.end]) {
      this.#drawRoundHandle(
        context,
        this.#context.transformPoint(layer.transform, point),
        half,
      )
    }
  }

  #drawRoundHandle(
    context: CanvasRenderingContext2D,
    point: CanvasPoint,
    half: number,
  ): void {
    context.beginPath()
    context.arc(point.x, point.y, half + 2, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  }

  #drawLoupeHandles(
    context: CanvasRenderingContext2D,
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
  ): void {
    const gesture = this.#context.gesture()
    const source =
      gesture?.kind === 'loupeSource' && gesture.id === layer.id
        ? this.#context.loupeSourceCenter(
            this.#context.moveLoupeSource(layer, gesture.current),
          )
        : undefined
    this.#drawSelectedLoupe(context, layer, source)
  }

  #drawGuides(context: CanvasRenderingContext2D): void {
    const { props } = this.#context
    const gesture = this.#context.gesture()
    if (gesture?.kind !== 'move' || !gesture.guidesVisible || !props.canvas) {
      return
    }
    const scale = (props.zoom ?? 100) / 100
    context.save()
    context.strokeStyle = '#d9773b'
    context.lineWidth = 1 / scale
    context.setLineDash([3 / scale, 3 / scale])
    for (const guide of gesture.guides) {
      context.beginPath()
      context.moveTo(guide.x, 0)
      context.lineTo(guide.x, props.canvas.height)
      context.moveTo(0, guide.y)
      context.lineTo(props.canvas.width, guide.y)
      context.stroke()
    }
    context.restore()
  }

  #drawSelectedLoupe(
    context: CanvasRenderingContext2D,
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
    sourceOverride?: CanvasPoint,
  ): void {
    const scale = (this.#context.props.zoom ?? 100) / 100
    const source = sourceOverride ?? this.#context.loupeSourceCenter(layer)
    const markerHalf = 4 / scale
    context.save()
    context.fillStyle = '#ffffff'
    context.strokeStyle = '#d9773b'
    context.lineWidth = 1.5 / scale
    context.fillRect(
      source.x - markerHalf,
      source.y - markerHalf,
      markerHalf * 2,
      markerHalf * 2,
    )
    context.strokeRect(
      source.x - markerHalf,
      source.y - markerHalf,
      markerHalf * 2,
      markerHalf * 2,
    )
    this.#drawLoupeBadges(context, layer, scale)
    context.restore()
  }

  #drawLoupeBadges(
    context: CanvasRenderingContext2D,
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
    scale: number,
  ): void {
    const bounds = this.#context.layerBounds(layer)
    const lensBottom = this.#context.transformPoint(layer.transform, {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height,
    })
    const lensTop = this.#context.transformPoint(layer.transform, {
      x: bounds.x + bounds.width / 2,
      y: bounds.y,
    })
    const labels = [
      `${String(layer.payload.zoom).replace(/\.0$/, '')}×`,
      `${Math.round(layer.payload.lens.size)}`,
    ]
    context.font = `600 ${11 / scale}px system-ui, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const height = 18 / scale
    const gap = 6 / scale
    const widths = labels.map(
      (label) => context.measureText(label).width + 14 / scale,
    )
    const totalWidth = widths[0]! + widths[1]! + gap
    const belowY = lensBottom.y + 8 / scale
    const y =
      belowY + height <=
      (this.#context.props.canvas?.height ?? Number.POSITIVE_INFINITY)
        ? belowY
        : lensTop.y - 8 / scale - height
    let x = lensBottom.x - totalWidth / 2
    for (const [index, label] of labels.entries()) {
      const width = widths[index]!
      this.#roundedPath(context, x, y, width, height, height / 2)
      context.fillStyle = '#ffffff'
      context.strokeStyle = '#d9773b'
      context.fill()
      context.stroke()
      context.fillStyle = '#d9773b'
      context.fillText(label, x + width / 2, y + height / 2)
      x += width + gap
    }
  }

  #roundedPath(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    const right = x + width
    const bottom = y + height
    const safeRadius = Math.min(radius, width / 2, height / 2)
    context.beginPath()
    context.moveTo(x + safeRadius, y)
    context.lineTo(right - safeRadius, y)
    context.quadraticCurveTo(right, y, right, y + safeRadius)
    context.lineTo(right, bottom - safeRadius)
    context.quadraticCurveTo(right, bottom, right - safeRadius, bottom)
    context.lineTo(x + safeRadius, bottom)
    context.quadraticCurveTo(x, bottom, x, bottom - safeRadius)
    context.lineTo(x, y + safeRadius)
    context.quadraticCurveTo(x, y, x + safeRadius, y)
    context.closePath()
  }
}
