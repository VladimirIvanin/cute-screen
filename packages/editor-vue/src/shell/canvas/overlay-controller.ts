import {
  selectionFrame,
  calloutGeometryContext,
  drawNodes2D,
  type LayerNode,
  type Transform2D,
} from '@cute-screen/editor-renderer'
import type {
  ComputedRef,
  Ref,
} from 'vue'
import { drawClampedHandleSquare } from '../overlay-handle-bounds'
import type {
  CanvasPoint,
  CanvasViewportProps,
  ViewportOutputBounds,
} from './contracts'
import type { CanvasRendererController } from './renderer-controller'
import type {
  CanvasGesture,
  ResizeHandle,
} from './workspace-state'
import { canvasSelectionHandles } from './selection-controls'
import { prepareDisplayOverlay } from './display-overlay-resolution'

type PreviewNodes =
  ReturnType<CanvasRendererController['renderOverlay']> extends boolean
    ? Parameters<CanvasRendererController['renderOverlay']>[0]
    : never

export interface CanvasOverlayContext {
  readonly calloutInsertMode?: () => boolean
  readonly hoverTarget?: () => import('@cute-screen/editor-renderer').SelectionTarget
  readonly screenScale?: () => CanvasPoint
  readonly props: CanvasViewportProps
  readonly overlay: Ref<HTMLCanvasElement | undefined>
  readonly outputBounds: ComputedRef<ViewportOutputBounds | undefined>
  readonly renderer: CanvasRendererController
  readonly gesture: () => CanvasGesture
  readonly previewNodes: () => PreviewNodes
  readonly previewLayer: () => LayerNode | undefined
  readonly selectedLayer: () => LayerNode | undefined
  readonly drawDrafts: (context: CanvasRenderingContext2D) => void
  readonly drawingLayer: () => LayerNode | undefined
  readonly drawCrop: (context: CanvasRenderingContext2D, bounds: ViewportOutputBounds) => boolean
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
  readonly transformPoint: (transform: Transform2D, point: CanvasPoint) => CanvasPoint
  readonly toLocal: (layer: LayerNode, point: CanvasPoint) => CanvasPoint
  readonly loupeSourceCenter: (layer: Extract<LayerNode, { readonly kind: 'loupe' }>) => CanvasPoint
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
    if (
      !overlay.value ||
      !props.canvas ||
      !bounds
    ) return
    const context = overlay.value.getContext('2d')
    if (!context || typeof context.clearRect !== 'function') return
    const draft = this.#context.drawingLayer()
    renderer.renderHighlighterDraft(draft?.kind === 'marker' ? draft : undefined)
    const previewNodes = this.#context.previewLayer()?.kind === 'marker' ? [] : this.#context.previewNodes()
    const renderedByBackend = renderer.renderOverlay(previewNodes)
    prepareDisplayOverlay(overlay.value, context, bounds, (props.zoom ?? 100) / 100, window.devicePixelRatio || 1)
    const preview = renderer.overlaySurface
    if (
      renderedByBackend &&
      preview &&
      previewNodes.length > 0
    ) {
      context.drawImage(preview, bounds.x, bounds.y, bounds.width, bounds.height)
    }
    if (!renderedByBackend) drawNodes2D(context, previewNodes)
    this.#context.drawDrafts(context)
    const cropDrawn = this.#context.drawCrop(context, bounds)
    if (
      cropDrawn &&
      (!props.quickFrameMode ||
        props.quickSelectionMode ||
        props.activeTool === 'crop')
    ) return
    this.#drawHover(context)
    this.#drawSelection(context, bounds)
  }

  #drawSelection(
    context: CanvasRenderingContext2D,
    outputBounds: ViewportOutputBounds,
  ): void {
    const activeGesture = this.#context.gesture?.()
    const ids = activeGesture?.kind === 'move' ? activeGesture.nodeIds ?? [] : this.#context.props.selectedLayerIds ?? []
    const document = this.#context.props.document
    if (document && ids.length > 1) {
      const frame = selectionFrame(document, ids, calloutGeometryContext())
      if (!frame) return
      const gesture = this.#context.gesture()
      const moving = gesture?.kind === 'move' ? gesture : undefined
      const layer = document.layers.find((item) => frame.nodeIds.includes(item.id))!
      this.#drawSelectionFrame(context, { ...layer, localBounds: frame.bounds, transform: {
        ...frame.transform,
        translateX: frame.transform.translateX + (moving ? moving.current.x - moving.start.x : 0),
        translateY: frame.transform.translateY + (moving ? moving.current.y - moving.start.y : 0),
      } }, frame.bounds)
      this.#drawGuides(context)
      return
    }
    const committed = this.#context.selectedLayer()
    const preview = this.#context.previewLayer()
    const layer = preview?.id === committed?.id ? preview : committed
    if (!layer?.visible) return
    this.#drawSelectionFrame(context, layer)
    if (layer.locked || this.#context.props.readOnly) return
    this.#drawControls(context, layer, outputBounds)
    if (layer.kind === 'loupe') this.#drawLoupeHandles(context, layer)
    this.#drawGuides(context)
  }

  #drawSelectionFrame(
    context: CanvasRenderingContext2D,
    layer: LayerNode,
    bounds = this.#context.layerBounds(layer),
    hover = false,
  ): void {
    const transform = layer.transform
    context.save()
    context.translate(transform.translateX, transform.translateY)
    context.rotate((transform.rotation * Math.PI) / 180)
    context.scale(transform.scaleX, transform.scaleY)
    const zoom = (this.#context.props.zoom ?? 100) / 100
    const scale = zoom * Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY), 1)
    context.lineWidth = 1 / scale
    context.strokeStyle = hover ? 'rgba(13, 153, 255, 0.55)' : '#0d99ff'
    context.setLineDash(hover ? [] : [4 / scale, 3 / scale])
    context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
    context.setLineDash([])
    context.restore()
  }

  #drawHover(context: CanvasRenderingContext2D): void {
    if (!this.#context.hoverTarget || this.#context.gesture()) return
    const target = this.#context.hoverTarget()
    if (target?.kind === 'handle') {
      const point = target.target.point
      const zoom = (this.#context.props.zoom ?? 100) / 100
      context.save()
      context.fillStyle = 'rgba(13, 153, 255, 0.2)'
      context.beginPath()
      context.arc(point.x, point.y, target.target.radius / zoom, 0, Math.PI * 2)
      context.fill()
      context.restore()
      return
    }
    if (target?.kind !== 'object') return
    const layer = this.#context.props.document?.layers.find((item) => item.id === target.nodeId)
    if (!layer || layer.id === this.#context.props.selectedLayerId) return
    // Hover previews selection; it never becomes an additional pointer target.
    this.#drawSelectionFrame(context, layer, this.#context.layerBounds(layer), true)
  }

  #drawControls(
    context: CanvasRenderingContext2D,
    layer: LayerNode,
    outputBounds: ViewportOutputBounds,
  ): void {
    const zoom = (this.#context.props.zoom ?? 100) / 100
    const half = 3 / zoom
    const scale = this.#context.screenScale?.() ?? { x: zoom, y: zoom }
    const handles = canvasSelectionHandles(layer, scale, outputBounds, this.#context.calloutInsertMode?.())
    context.fillStyle = '#fff'
    context.strokeStyle = '#0d99ff'
    context.lineWidth = 1 / zoom
    for (const handle of handles) {
      if (handle.kind === 'loupeSource') continue
      if (handle.kind === 'rotate') {
        if (layer.kind !== 'numberedMarker' && !handles.some((item) => item.kind === 'resize'))
          drawClampedHandleSquare(context, handle.point, half, outputBounds)
        continue
      }
      if (handle.kind === 'resize') drawClampedHandleSquare(context, handle.point, half, outputBounds)
      else if (handle.kind === 'callout' && handle.handle === 'width') {
        context.fillRect(handle.point.x - half, handle.point.y - half * 2, half * 2, half * 4)
        context.strokeRect(handle.point.x - half, handle.point.y - half * 2, half * 2, half * 4)
      } else if (handle.kind === 'callout' && handle.handle.startsWith('insert:')) {
        this.#drawRoundHandle(context, handle.point, half * 1.3)
        context.beginPath()
        context.moveTo(handle.point.x - half, handle.point.y)
        context.lineTo(handle.point.x + half, handle.point.y)
        context.moveTo(handle.point.x, handle.point.y - half)
        context.lineTo(handle.point.x, handle.point.y + half)
        context.stroke()
      } else this.#drawRoundHandle(context, handle.point, half)
    }
  }

  #drawRoundHandle(
    context: CanvasRenderingContext2D,
    point: CanvasPoint,
    half: number,
  ): void {
    context.beginPath()
    context.arc(point.x, point.y, half * (5 / 3), 0, Math.PI * 2)
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
        ? this.#context.loupeSourceCenter(this.#context.moveLoupeSource(layer, gesture.current))
        : undefined
    this.#drawSelectedLoupe(context, layer, source)
  }

  #drawGuides(context: CanvasRenderingContext2D): void {
    const { props } = this.#context
    const gesture = this.#context.gesture()
    if (
      gesture?.kind !== 'move' ||
      !gesture.guidesVisible ||
      !props.canvas
    ) {
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
    context.fillRect(source.x - markerHalf, source.y - markerHalf, markerHalf * 2, markerHalf * 2)
    context.strokeRect(source.x - markerHalf, source.y - markerHalf, markerHalf * 2, markerHalf * 2)
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
    const labels = [`${String(layer.payload.zoom).replace(/\.0$/, '')}×`, `${Math.round(layer.payload.lens.size)}`]
    context.font = `600 ${11 / scale}px system-ui, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const height = 18 / scale
    const gap = 6 / scale
    const widths = labels.map((label) => context.measureText(label).width + 14 / scale)
    const totalWidth = widths[0]! + widths[1]! + gap
    const belowY = lensBottom.y + 8 / scale
    const y =
      belowY + height <= (this.#context.props.canvas?.height ?? Number.POSITIVE_INFINITY)
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
