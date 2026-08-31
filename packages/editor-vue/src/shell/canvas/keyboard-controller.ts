import {
  nudgeCrop,
  snapRulerEndpoint,
  type RulerAngleGuide,
} from '@cute-screen/editor-renderer'
import type { ComputedRef, Ref } from 'vue'
import type {
  CanvasPoint,
  CanvasViewportEmit,
  CanvasViewportProps,
  ViewportOutputBounds,
} from './contracts'
import type { CropController } from './crop-controller'
import {
  DEFAULT_PRECISION_TOOLS,
  type CanvasGesture,
  type createCanvasWorkspaceState,
} from './workspace-state'

type EditingText = ReturnType<typeof createCanvasWorkspaceState>['editingText']

export interface KeyboardContext {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly scene: Ref<HTMLCanvasElement | undefined>
  readonly outputBounds: ComputedRef<ViewportOutputBounds | undefined>
  readonly editingText: EditingText
  readonly crop: CropController
  readonly samplingCursor: Ref<CanvasPoint | undefined>
  readonly gesture: () => CanvasGesture
  readonly setGesture: (gesture: NonNullable<CanvasGesture>) => void
  readonly setSpacePressed: (pressed: boolean) => void
  readonly setRulerGuide: (guide: RulerAngleGuide | undefined) => void
  readonly initialSamplingCursor: () => CanvasPoint | undefined
  readonly sampleScene: (point: CanvasPoint) => void
  readonly hideEyedropper: () => void
  readonly scheduleEyedropper: (point: CanvasPoint) => void
  readonly applyCrop: () => void
  readonly cancelCrop: () => void
  readonly cancelText: () => void
  readonly cancelGesture: () => void
  readonly invalidateOverlay: () => void
}

export class KeyboardController {
  readonly #context: KeyboardContext

  constructor(context: KeyboardContext) {
    this.#context = context
  }

  keydown(event: KeyboardEvent): void {
    if (this.#handleSampling(event)) return
    if (this.#handleCrop(event)) return
    this.#handleAltDown(event)
    if (event.code === 'Space' && !isEditableTarget(event.target)) {
      this.#context.setSpacePressed(true)
    }
    if (event.key === 'Escape') this.#handleEscape()
  }

  keyup(event: KeyboardEvent): void {
    if (event.code === 'Space') this.#context.setSpacePressed(false)
    const gesture = this.#context.gesture()
    if (event.key === 'Alt' && gesture?.kind === 'move') {
      this.#context.setGesture({ ...gesture, guidesVisible: false })
      this.#context.invalidateOverlay()
    }
    if (event.key === 'Alt' && gesture?.kind === 'precision') {
      this.#context.setGesture({ ...gesture, guidesHeld: false })
      this.#context.setRulerGuide(undefined)
      this.#context.invalidateOverlay()
    }
  }

  blur(): void {
    this.#context.setSpacePressed(false)
    this.#context.setRulerGuide(undefined)
    this.#context.cancelGesture()
  }

  #handleSampling(event: KeyboardEvent): boolean {
    const { props, scene, outputBounds, samplingCursor } = this.#context
    if (!props.sampling || !scene.value || !props.canvas) return false
    const bounds = outputBounds.value ?? {
      x: 0,
      y: 0,
      width: props.canvas.width,
      height: props.canvas.height,
    }
    const initial = samplingCursor.value ??
      this.#context.initialSamplingCursor() ?? {
        x: 0,
        y: 0,
      }
    if (event.key === 'Enter') {
      event.preventDefault()
      this.#context.sampleScene(initial)
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      samplingCursor.value = undefined
      this.#context.hideEyedropper()
      this.#context.emit('colorSampleCancel')
      return true
    }
    const move = samplingMove(event)
    if (!move) return false
    event.preventDefault()
    const next = {
      x: Math.max(
        bounds.x,
        Math.min(bounds.x + bounds.width - 1, initial.x + move[0]),
      ),
      y: Math.max(
        bounds.y,
        Math.min(bounds.y + bounds.height - 1, initial.y + move[1]),
      ),
    }
    samplingCursor.value = next
    this.#context.scheduleEyedropper(next)
    this.#context.invalidateOverlay()
    return true
  }

  #handleCrop(event: KeyboardEvent): boolean {
    const { props, crop } = this.#context
    if (props.activeTool !== 'crop') return false
    const session = crop.ensureSession()
    if (!session) return false
    const direction = cropDirection(event.key)
    if (direction) {
      event.preventDefault()
      crop.session = nudgeCrop(session, direction, event.shiftKey ? 10 : 1)
      this.#context.invalidateOverlay()
      return true
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      this.#context.applyCrop()
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      this.#context.cancelCrop()
      return true
    }
    return false
  }

  #handleAltDown(event: KeyboardEvent): void {
    const gesture = this.#context.gesture()
    if (event.key === 'Alt' && gesture?.kind === 'move') {
      this.#context.setGesture({ ...gesture, guidesVisible: true })
      this.#context.invalidateOverlay()
    }
    if (event.key !== 'Alt' || gesture?.kind !== 'precision') return
    let next = { ...gesture, guidesHeld: true }
    const defaults =
      this.#context.props.precisionDefaults ?? DEFAULT_PRECISION_TOOLS
    if (gesture.tool === 'ruler' && defaults.ruler.snap) {
      const snapped = snapRulerEndpoint(
        gesture.start,
        gesture.current,
        defaults.ruler.snapAngleIncrementDegrees,
      )
      next = { ...next, current: snapped.end }
      this.#context.setRulerGuide(snapped.guide)
    }
    this.#context.setGesture(next)
    this.#context.invalidateOverlay()
  }

  #handleEscape(): void {
    const { props, editingText } = this.#context
    if (editingText.value) {
      this.#context.cancelText()
      return
    }
    const gesture = this.#context.gesture()
    if (gesture?.kind === 'draw' || gesture?.kind === 'calloutDraw') {
      this.#context.cancelGesture()
      return
    }
    if (
      props.activeTool === 'arrow' ||
      props.activeTool === 'shape' ||
      props.activeTool === 'pencil' ||
      props.activeTool === 'marker' ||
      props.activeTool === 'censor' ||
      props.activeTool === 'spotlight' ||
      props.activeTool === 'ruler' ||
      props.activeTool === 'loupe'
    ) {
      this.#context.cancelGesture()
      this.#context.emit('selectTool', 'select')
    }
  }
}

function samplingMove(
  event: KeyboardEvent,
): readonly [number, number] | undefined {
  const step = event.shiftKey ? 10 : 1
  return {
    ArrowLeft: [-step, 0] as const,
    ArrowRight: [step, 0] as const,
    ArrowUp: [0, -step] as const,
    ArrowDown: [0, step] as const,
  }[event.key]
}

function cropDirection(
  key: string,
): 'left' | 'right' | 'up' | 'down' | undefined {
  return {
    ArrowLeft: 'left' as const,
    ArrowRight: 'right' as const,
    ArrowUp: 'up' as const,
    ArrowDown: 'down' as const,
  }[key]
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}
