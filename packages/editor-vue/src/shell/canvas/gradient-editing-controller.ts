import {
  onBeforeUnmount,
  onMounted,
  watch,
} from 'vue'
import {
  gradientPoints,
  isGradientLayer,
  updateGradientHandle,
  type ShapeLayer,
  type LinearGradientPaint,
  type Point,
} from '@cute-screen/editor-renderer'
import { useGradientEditing } from '../ui/gradient-editing'
import type {
  CanvasViewportEmit,
  CanvasViewportProps,
} from './contracts'

type Handle = 'start' | 'end' | 'line' | number
interface GradientEditingContext {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly scene: () => HTMLCanvasElement | undefined
  readonly point: (event: PointerEvent) => Point | undefined
  readonly render: () => void
  readonly invalidate: () => void
}
/** Pointer drafts are ordinary fields; only mode/stop selection are reactive UI state. */
export class GradientEditingController {
  readonly #context: GradientEditingContext
  readonly state = useGradientEditing()
  #drag: {
    before: ShapeLayer
    start: Point
    handle: Handle
    pointerId: number
    point: Point
    shift: boolean
  } | undefined
  #preview: ShapeLayer | undefined
  constructor(context: GradientEditingContext) {
    this.#context = context
    watch(() => [context.props.selectedLayerId, context.props.activeTool, context.props.document?.id], () => {
      this.cancel()
      this.state.mode.value = 'size'
      this.state.stop.value = 0
    })
    watch(() => [
      context.props.document, context.props.readOnly, context.props.sampling, context.props.zoom,
    ], () => this.cancel())
    watch(this.state.mode, () => {
      this.cancel()
      context.invalidate()
    })
    onMounted(() => {
      window.addEventListener('keydown', this.#keydown, true)
      window.addEventListener('keyup', this.#keydown, true)
    })
    onBeforeUnmount(() => {
      this.cancel()
      window.removeEventListener('keydown', this.#keydown, true)
      window.removeEventListener('keyup', this.#keydown, true)
    })
  }
  layer(): ShapeLayer | undefined {
    const props = this.#context.props
    if (
      props.activeTool !== 'select' ||
      (props.selectedLayerIds?.length ?? 1) !== 1 ||
      props.sampling
    ) return undefined
    const layer = props.document?.layers.find((item) => item.id === props.selectedLayerId)
    return isGradientLayer(layer) && layer.visible ? layer : undefined
  }
  active(): boolean {
    const layer = this.layer()
    return this.state.mode.value === 'transition' && Boolean(layer && !layer.locked && !this.#context.props.readOnly)
  }
  preview(): ShapeLayer | undefined {
    return this.#preview
  }
  #handle(
    point: Point,
    layer: ShapeLayer,
  ): Handle | undefined {
    const points = gradientPoints(layer)
    const zoom = (this.#context.props.zoom ?? 100) / 100
    const near = (p: Point) => Math.hypot(p.x - point.x, p.y - point.y) * zoom <= 9
    const fill = layer.payload.fill as LinearGradientPaint
    const handles: { handle: Handle; point: Point }[] = [
      { handle: 'start', point: points.start },
      { handle: 'end', point: points.end },
      ...fill.stops.map((stop, index) => ({ handle: index, point: {
        x: points.start.x + (points.end.x - points.start.x) * stop.position,
        y: points.start.y + (points.end.y - points.start.y) * stop.position,
      } })),
    ]
    const distance = (candidate: Point) => Math.hypot(candidate.x - point.x, candidate.y - point.y)
    handles.sort((a, b) => distance(a.point) - distance(b.point))
    if (handles[0] && near(handles[0].point)) return handles[0].handle
    const dx = points.end.x - points.start.x, dy = points.end.y - points.start.y
    const projection = ((point.x - points.start.x) * dx + (point.y - points.start.y) * dy) / (dx * dx + dy * dy)
    const t = Math.max(0, Math.min(1, projection))
    return near({ x: points.start.x + dx * t, y: points.start.y + dy * t }) ? 'line' : undefined
  }
  pointerDown(event: PointerEvent): boolean {
    const layer = this.layer(), point = this.#context.point(event), scene = this.#context.scene()
    if (
      !this.active() ||
      !layer ||
      !point ||
      !scene ||
      event.button !== 0
    ) return false
    const handle = this.#handle(point, layer)
    if (handle === undefined) return false
    event.preventDefault()
    scene.focus({ preventScroll: true })
    scene.setPointerCapture(event.pointerId)
    if (handle === 'start') this.state.stop.value = 0
    else if (handle === 'end') this.state.stop.value = (layer.payload.fill as LinearGradientPaint).stops.length - 1
    else if (typeof handle === 'number') this.state.stop.value = handle
    this.#drag = { before: layer, start: point, handle, pointerId: event.pointerId, point, shift: event.shiftKey }
    this.#context.invalidate()
    return true
  }
  pointerMove(event: PointerEvent): boolean {
    if (!this.#drag) {
      if (!this.active()) return false
      const point = this.#context.point(event), layer = this.layer(), scene = this.#context.scene()
      if (
        point &&
        layer &&
        scene
      ) scene.style.cursor = this.#handle(point, layer) === 'line' ? 'move' : this.#handle(point, layer) !== undefined ? 'crosshair' : 'default'
      return true
    }
    if (event.pointerId !== this.#drag.pointerId) return true
    const point = this.#context.point(event)
    if (!point) return true
    this.#drag.point = point
    this.#drag.shift = event.shiftKey
    this.#update()
    return true
  }
  #update(): void {
    const drag = this.#drag
    if (!drag) return
    const delta = { x: drag.point.x - drag.start.x, y: drag.point.y - drag.start.y }
    if (Math.hypot(delta.x, delta.y) < 1e-8) this.#preview = drag.before
    else {
      const endpoints = gradientPoints(drag.before)
      const origin = drag.handle === 'start' ? endpoints.start : endpoints.end
      const value = drag.handle === 'line' ? delta : typeof drag.handle === 'number' ? drag.point
        : { x: origin.x + delta.x, y: origin.y + delta.y }
      this.#preview = updateGradientHandle(drag.before, drag.handle, value, drag.shift)
      if (typeof drag.handle === 'number' && this.#preview !== drag.before) {
        const previous = (drag.before.payload.fill as LinearGradientPaint).stops
        const current = (this.#preview.payload.fill as LinearGradientPaint).stops
        const selected = current.findIndex((stop) => !previous.includes(stop))
        if (selected >= 0) this.state.stop.value = selected
      }
    }
    this.#context.render()
  }
  pointerUp(event: PointerEvent): boolean {
    if (!this.#drag) return false
    if (event.pointerId !== this.#drag.pointerId) return true
    this.pointerMove(event)
    const drag = this.#drag, after = this.#preview
    // Never overwrite a document that changed while a pointer was captured.
    const current = this.layer()
    this.cancel()
    if (
      current === drag.before &&
      after &&
      after !== drag.before &&
      !this.#context.props.readOnly &&
      !current.locked
    ) {
      this.#context.emit('documentCommand', { type: 'updateLayer', before: drag.before, after })
    }
    return true
  }
  cancel(): void {
    const pointerId = this.#drag?.pointerId
    const scene = this.#context.scene()
    const changed = Boolean(this.#preview)
    this.#drag = undefined
    this.#preview = undefined
    if (pointerId !== undefined && scene?.hasPointerCapture(pointerId)) scene.releasePointerCapture(pointerId)
    if (changed) this.#context.render()
  }
  readonly #keydown = (event: KeyboardEvent): void => {
    if (!this.active()) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('input, textarea, [contenteditable="true"], [role="dialog"], .cs-context-toolbar')) return
    if (event.key === 'Escape' && event.type === 'keydown') {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (this.#drag) this.cancel()
      else this.state.mode.value = 'size'
    } else if (event.key === 'Shift' && this.#drag) {
      this.#drag.shift = event.type === 'keydown'
      this.#update()
    }
  }
  draw(context: CanvasRenderingContext2D): boolean {
    if (!this.active()) return false
    const layer = this.#preview ?? this.layer()!
    const points = gradientPoints(layer), fill = layer.payload.fill as LinearGradientPaint
    const zoom = (this.#context.props.zoom ?? 100) / 100
    context.save()
    context.beginPath()
    context.moveTo(points.start.x, points.start.y)
    context.lineTo(points.end.x, points.end.y)
    context.strokeStyle = '#fff'
    context.lineWidth = 4 / zoom
    context.stroke()
    context.strokeStyle = '#0d99ff'
    context.lineWidth = 2 / zoom
    context.stroke()
    for (let i = 0; i < fill.stops.length; i++) {
      const stop = fill.stops[i]!, t = stop.position
      const x = points.start.x + (points.end.x - points.start.x) * t
      const y = points.start.y + (points.end.y - points.start.y) * t
      context.fillStyle = `rgba(${stop.color.red * 255},${stop.color.green * 255},${stop.color.blue * 255},${Math.max(.25, stop.color.alpha)})`
      context.lineWidth = (i === this.state.stop.value ? 3 : 1.5) / zoom
      context.fillRect(x - 5 / zoom, y - 5 / zoom, 10 / zoom, 10 / zoom)
      context.strokeRect(x - 5 / zoom, y - 5 / zoom, 10 / zoom, 10 / zoom)
    }
    for (const point of [points.start, points.end]) {
      context.beginPath()
      context.arc(point.x, point.y, 6 / zoom, 0, Math.PI * 2)
      context.fillStyle = '#fff'
      context.fill()
      context.stroke()
    }
    context.restore()
    return true
  }
}
