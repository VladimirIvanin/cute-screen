import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue'
import type {
  CanvasPoint,
  CanvasViewportEmit,
  CanvasViewportProps,
  ViewportOutputBounds,
} from './contracts'
import type { CropController } from './crop-controller'
import type { EyedropperController } from './eyedropper-controller'
import type { CanvasRendererController } from './renderer-controller'
import type { createCanvasWorkspaceState } from './workspace-state'

type WorkspaceState = ReturnType<typeof createCanvasWorkspaceState>
export interface ZoomAnchor {
  readonly canvas: CanvasPoint
  readonly clientX: number
  readonly clientY: number
}

export interface RenderLifecycleContext {
  readonly props: CanvasViewportProps
  readonly emit: CanvasViewportEmit
  readonly scene: WorkspaceState['scene']
  readonly overlay: WorkspaceState['overlay']
  readonly scrollContainer: WorkspaceState['scrollContainer']
  readonly editingText: WorkspaceState['editingText']
  readonly outputBounds: ComputedRef<ViewportOutputBounds | undefined>
  readonly renderer: CanvasRendererController
  readonly crop: CropController
  readonly drawDocument: () => void | Promise<void>
  readonly invalidateOverlay: () => void
  readonly cancelGesture: () => void
  readonly setCursor: (cursor: string) => void
  readonly fitCanvas: () => void
  readonly takeZoomAnchor: () => ZoomAnchor | undefined
}

export function registerRenderLifecycle(context: RenderLifecycleContext): void {
  let resizeObserver: ResizeObserver | undefined
  onMounted(() => {
    context.renderer.mount()
    const { scene, overlay, scrollContainer } = context
    if (scene.value && overlay.value && scrollContainer.value) {
      context.emit('hostsReady', {
        scene: scene.value,
        overlay: overlay.value,
        scrollContainer: scrollContainer.value,
      })
    }
    void context.drawDocument()
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(context.fitCanvas)
      if (scrollContainer.value) resizeObserver.observe(scrollContainer.value)
    }
    void nextTick(context.fitCanvas)
  })
  watch(
    () => [
      context.props.canvas,
      context.props.image,
      context.props.imageLayer,
      context.props.document,
      context.props.textureImages,
    ],
    () => void context.drawDocument(),
  )
  registerDocumentWatches(context)
  registerViewportWatches(context)
  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    context.renderer.dispose()
  })
}

function registerDocumentWatches(context: RenderLifecycleContext): void {
  watch(
    () => context.props.document,
    () => {
      context.crop.documentChanged()
      context.invalidateOverlay()
    },
  )
  watch(
    () => context.props.activeTool,
    (tool) => {
      context.cancelGesture()
      context.crop.activeToolChanged(tool)
      context.invalidateOverlay()
      if (isCanvasTool(tool)) {
        void nextTick(() => context.scene.value?.focus({ preventScroll: true }))
      }
      void nextTick(() => {
        void context.drawDocument()
        context.fitCanvas()
      })
    },
  )
  watch(
    () => context.props.quickSelectionMode,
    (selecting) => {
      context.cancelGesture()
      context.crop.quickSelectionChanged(Boolean(selecting))
      context.setCursor(selecting ? 'crosshair' : '')
      if (selecting) {
        void nextTick(() => context.scene.value?.focus({ preventScroll: true }))
      }
      context.invalidateOverlay()
    },
    { immediate: true },
  )
  watch(
    () => context.editingText.value?.existing?.id,
    () => void context.drawDocument(),
  )
  watch(
    () => [context.props.selectedLayerId, context.props.selectedLayerIds],
    context.invalidateOverlay,
  )
}

function registerViewportWatches(context: RenderLifecycleContext): void {
  watch(
    () => [
      context.outputBounds.value?.width,
      context.outputBounds.value?.height,
      context.props.fitMode,
    ],
    () => void nextTick(context.fitCanvas),
  )
  watch(
    () => context.props.zoom,
    async (zoom) => {
      await nextTick()
      context.invalidateOverlay()
      restoreZoomAnchor(context, context.takeZoomAnchor(), zoom)
    },
  )
}

function restoreZoomAnchor(
  context: RenderLifecycleContext,
  anchor: ZoomAnchor | undefined,
  zoom: number | undefined,
): void {
  const scroll = context.scrollContainer.value
  const bounds = context.outputBounds.value
  if (!anchor || !scroll || !context.scene.value || !zoom || !bounds) return
  const viewport = scroll.getBoundingClientRect()
  const scale = zoom / 100
  scroll.scrollLeft = Math.max(
    0,
    (anchor.canvas.x - bounds.x) * scale - (anchor.clientX - viewport.left),
  )
  scroll.scrollTop = Math.max(
    0,
    (anchor.canvas.y - bounds.y) * scale - (anchor.clientY - viewport.top),
  )
}

function isCanvasTool(tool: string | undefined): boolean {
  return (
    tool === 'crop' ||
    tool === 'censor' ||
    tool === 'spotlight' ||
    tool === 'ruler' ||
    tool === 'loupe'
  )
}

export interface InputLifecycleContext {
  readonly props: CanvasViewportProps
  readonly scene: Ref<HTMLCanvasElement | undefined>
  readonly outputBounds: ComputedRef<ViewportOutputBounds | undefined>
  readonly samplingCursor: Ref<CanvasPoint | undefined>
  readonly eyedropper: EyedropperController
  readonly initialSamplingCursor: () => CanvasPoint | undefined
  readonly scheduleEyedropper: (point: CanvasPoint) => void
  readonly hideEyedropper: () => void
  readonly setCursor: (cursor: string) => void
  readonly invalidateOverlay: () => void
  readonly onKeydown: (event: KeyboardEvent) => void
  readonly onKeyup: (event: KeyboardEvent) => void
  readonly onBlur: () => void
  readonly onDocumentPointerDown: (event: PointerEvent) => void
  readonly onDocumentSelectionChange: () => void
}

export function registerInputLifecycle(context: InputLifecycleContext): void {
  registerSamplingWatches(context)
  onMounted(() => {
    window.addEventListener('keydown', context.onKeydown)
    window.addEventListener('keyup', context.onKeyup)
    window.addEventListener('blur', context.onBlur)
    document.addEventListener(
      'pointerdown',
      context.onDocumentPointerDown,
      true,
    )
    document.addEventListener(
      'selectionchange',
      context.onDocumentSelectionChange,
    )
    if (context.props.sampling) initializeSampling(context)
  })
  onBeforeUnmount(() => {
    context.hideEyedropper()
    window.removeEventListener('keydown', context.onKeydown)
    window.removeEventListener('keyup', context.onKeyup)
    window.removeEventListener('blur', context.onBlur)
    document.removeEventListener(
      'pointerdown',
      context.onDocumentPointerDown,
      true,
    )
    document.removeEventListener(
      'selectionchange',
      context.onDocumentSelectionChange,
    )
  })
}

function registerSamplingWatches(context: InputLifecycleContext): void {
  watch(
    () => context.props.sampling,
    (sampling) => {
      context.setCursor('')
      if (!sampling) {
        context.samplingCursor.value = undefined
        context.hideEyedropper()
        context.invalidateOverlay()
        return
      }
      context.eyedropper.resetCache(true)
      initializeSampling(context)
    },
  )
  watch(
    () => [
      context.props.samplingBlocked,
      context.props.zoom,
      context.outputBounds.value,
    ],
    () => {
      if (!context.props.sampling || !context.samplingCursor.value) return
      context.eyedropper.resetCache()
      void nextTick(() => {
        if (context.samplingCursor.value) {
          context.scheduleEyedropper(context.samplingCursor.value)
        }
      })
    },
  )
}

function initializeSampling(context: InputLifecycleContext): void {
  const initial = context.initialSamplingCursor()
  context.samplingCursor.value = initial
  context.invalidateOverlay()
  void nextTick(() => {
    context.scene.value?.focus({ preventScroll: true })
    if (initial) context.scheduleEyedropper(initial)
  })
}
