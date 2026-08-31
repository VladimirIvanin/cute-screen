import {
  applyCropSession,
  cancelCropSession,
  createCropSession,
  resetCrop,
  setCropPreset,
  type CropPreset,
  type CropResizeHandle,
  type CropSession,
} from '@cute-screen/editor-renderer'
import type { Ref } from 'vue'
import { drawClampedHandleSquare } from '../overlay-handle-bounds'
import { overlayVisualScale } from '../overlay-visual-scale'
import type {
  CanvasPoint,
  CanvasViewportEmit,
  CanvasViewportProps,
  ViewportOutputBounds,
} from './contracts'

export interface CropControllerContext {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly overlay: Ref<HTMLCanvasElement | undefined>
  readonly scene: Ref<HTMLCanvasElement | undefined>
  readonly rendererError: Ref<string | undefined>
}

export class CropController {
  readonly #context: CropControllerContext
  #session: CropSession | undefined
  #quickDraft:
    { x: number; y: number; width: number; height: number } | undefined

  constructor(context: CropControllerContext) {
    this.#context = context
  }

  get session(): CropSession | undefined {
    return this.#session
  }

  set session(value: CropSession | undefined) {
    this.#session = value
  }

  get quickDraft() {
    return this.#quickDraft
  }

  set quickDraft(
    value: { x: number; y: number; width: number; height: number } | undefined,
  ) {
    this.#quickDraft = value
  }

  ensureSession(): CropSession | undefined {
    const { props, rendererError } = this.#context
    if (props.quickSelectionMode) return undefined
    if (
      (props.activeTool !== 'crop' && !props.quickFrameMode) ||
      !props.document
    ) {
      return undefined
    }
    if (!this.#session) {
      try {
        this.#session = createCropSession(props.document)
      } catch (error) {
        rendererError.value =
          error instanceof Error ? error.message : String(error)
        return undefined
      }
    }
    return this.#session
  }

  handleAtPoint(
    session: CropSession,
    point: CanvasPoint,
  ): CropResizeHandle | undefined {
    const tolerance = 9 / this.#overlayScale()
    return this.#handlePositions(session).find(
      ([, position]) =>
        Math.hypot(position.x - point.x, position.y - point.y) <= tolerance,
    )?.[0]
  }

  draw(
    context: CanvasRenderingContext2D,
    outputBounds: ViewportOutputBounds,
  ): boolean {
    const { props } = this.#context
    const session = props.quickSelectionMode ? undefined : this.ensureSession()
    const crop = props.quickSelectionMode ? this.#quickDraft : session?.crop
    if (
      (!props.quickSelectionMode &&
        (!session || (props.activeTool !== 'crop' && !props.quickFrameMode))) ||
      !props.canvas
    ) {
      return false
    }
    context.save()
    context.fillStyle = 'rgba(8, 12, 18, 0.58)'
    if (!crop) {
      context.fillRect(0, 0, props.canvas.width, props.canvas.height)
      context.restore()
      return true
    }
    this.#drawShade(context, crop)
    const zoomScale = this.#overlayScale()
    context.strokeStyle = '#ffffff'
    context.lineWidth = 1 / zoomScale
    context.setLineDash(
      props.quickFrameMode ? [7 / zoomScale, 5 / zoomScale] : [],
    )
    context.strokeRect(crop.x, crop.y, crop.width, crop.height)
    context.setLineDash([])
    if (props.quickFrameMode) {
      this.#drawSizeBadge(context, crop, zoomScale)
    } else {
      this.#drawRuleOfThirds(context, crop)
    }
    if (session) this.#drawHandles(context, session, outputBounds, zoomScale)
    context.restore()
    return true
  }

  documentChanged(): void {
    this.#session = undefined
    if (
      this.#context.props.activeTool === 'crop' ||
      this.#context.props.quickFrameMode
    ) {
      this.ensureSession()
    }
  }

  activeToolChanged(tool: string | undefined): void {
    this.#session =
      tool === 'crop' && this.#context.props.document
        ? createCropSession(this.#context.props.document)
        : undefined
  }

  quickSelectionChanged(selecting: boolean): void {
    if (selecting) this.#session = undefined
    this.#quickDraft = undefined
    if (!selecting && this.#context.props.quickFrameMode) this.ensureSession()
  }

  setPreset(preset: CropPreset): void {
    const session = this.ensureSession()
    if (!session) return
    this.#session = setCropPreset(session, preset)
  }

  reset(): void {
    const session = this.ensureSession()
    if (!session) return
    this.#session = resetCrop(session)
  }

  apply(): void {
    const session = this.ensureSession()
    if (session)
      this.#context.emit('documentCommand', applyCropSession(session))
  }

  cancel(): void {
    const session = this.#session
    if (!session) return
    this.#session = undefined
    this.#context.emit('documentCommand', cancelCropSession(session))
  }

  #handlePositions(session: CropSession) {
    const { x, y, width, height } = session.crop
    return [
      ['northWest', { x, y }],
      ['north', { x: x + width / 2, y }],
      ['northEast', { x: x + width, y }],
      ['east', { x: x + width, y: y + height / 2 }],
      ['southEast', { x: x + width, y: y + height }],
      ['south', { x: x + width / 2, y: y + height }],
      ['southWest', { x, y: y + height }],
      ['west', { x, y: y + height / 2 }],
    ] as const
  }

  #overlayScale(): number {
    const { overlay, scene, props } = this.#context
    const canvas = overlay.value ?? scene.value
    const fallback = (props.zoom ?? 100) / 100
    if (!canvas) return fallback
    const rect = canvas.getBoundingClientRect()
    return overlayVisualScale(
      {
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        clientWidth: rect.width,
        clientHeight: rect.height,
      },
      fallback,
    )
  }

  #drawShade(
    context: CanvasRenderingContext2D,
    crop: { x: number; y: number; width: number; height: number },
  ): void {
    const canvas = this.#context.props.canvas!
    const right = crop.x + crop.width
    const bottom = crop.y + crop.height
    context.fillRect(0, 0, canvas.width, crop.y)
    context.fillRect(0, bottom, canvas.width, canvas.height - bottom)
    context.fillRect(0, crop.y, crop.x, crop.height)
    context.fillRect(right, crop.y, canvas.width - right, crop.height)
  }

  #drawRuleOfThirds(
    context: CanvasRenderingContext2D,
    crop: { x: number; y: number; width: number; height: number },
  ): void {
    const right = crop.x + crop.width
    const bottom = crop.y + crop.height
    context.strokeStyle = 'rgba(255,255,255,0.72)'
    context.beginPath()
    for (const fraction of [1 / 3, 2 / 3]) {
      context.moveTo(crop.x + crop.width * fraction, crop.y)
      context.lineTo(crop.x + crop.width * fraction, bottom)
      context.moveTo(crop.x, crop.y + crop.height * fraction)
      context.lineTo(right, crop.y + crop.height * fraction)
    }
    context.stroke()
  }

  #drawSizeBadge(
    context: CanvasRenderingContext2D,
    crop: { x: number; y: number; width: number; height: number },
    scale: number,
  ): void {
    const canvas = this.#context.props.canvas!
    const label = `${Math.round(crop.width)} × ${Math.round(crop.height)}`
    const height = 28 / scale
    const width = (label.length * 8 + 18) / scale
    const x = Math.max(
      6 / scale,
      Math.min(crop.x, canvas.width - width - 6 / scale),
    )
    const above = crop.y - height - 7 / scale
    const y = above >= 6 / scale ? above : crop.y + 7 / scale
    context.fillStyle = 'rgba(24, 26, 30, 0.94)'
    context.beginPath()
    if (typeof context.roundRect === 'function') {
      context.roundRect(x, y, width, height, 8 / scale)
      context.fill()
    } else {
      context.fillRect(x, y, width, height)
    }
    context.fillStyle = '#ffffff'
    context.font = `${13 / scale}px Roboto, sans-serif`
    context.textBaseline = 'middle'
    context.fillText(label, x + 9 / scale, y + height / 2)
  }

  #drawHandles(
    context: CanvasRenderingContext2D,
    session: CropSession,
    outputBounds: ViewportOutputBounds,
    scale: number,
  ): void {
    context.fillStyle = '#ffffff'
    context.strokeStyle = '#d9773b'
    for (const [, position] of this.#handlePositions(session)) {
      drawClampedHandleSquare(context, position, 4 / scale, outputBounds)
    }
  }
}
