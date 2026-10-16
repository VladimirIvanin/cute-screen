import type {
  ComputedRef,
  Ref,
} from 'vue'
import type {
  LayerNode,
  Transform2D,
} from '@cute-screen/editor-renderer'
import type {
  CanvasPoint,
  CanvasViewportProps,
  ViewportOutputBounds,
} from './contracts'
import type { FloatingToolbarLayout } from './workspace-state'

const FLOATING_TOOLBAR_SELECTOR =
  '.cs-numbered-marker-toolbar, .cs-marker-popover, .cs-context-toolbar, .cs-text-floating-toolbar, .cs-arrow-floating-toolbar, .cs-arrow-formatting-toolbar, .cs-callout-width-popover, .cs-text-size-popover, .cs-text-background-popover, .cs-text-font-popover, .cs-color-picker-popover, .cs-arrow-toolbar-popover'

export interface FloatingToolbarContext {
  readonly props: CanvasViewportProps
  readonly textEditor: Ref<HTMLDivElement | undefined>
  readonly textFloatingToolbar: Ref<HTMLDivElement | undefined>
  readonly arrowFloatingToolbar: Ref<HTMLDivElement | undefined>
  readonly scrollContainer: Ref<HTMLDivElement | undefined>
  readonly floatingToolbarLayout: Ref<FloatingToolbarLayout | undefined>
  readonly floatingArrowToolbarLayout: Ref<FloatingToolbarLayout | undefined>
  readonly editing: () => boolean
  readonly outputBounds: ComputedRef<ViewportOutputBounds | undefined>
  readonly selectedLayer: () => LayerNode | undefined
  readonly previewLayer: () => LayerNode | undefined
  readonly layerBounds: (layer: LayerNode) => {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
  readonly transformPoint: (transform: Transform2D, point: CanvasPoint) => CanvasPoint
}

export function isFloatingToolbarTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest(FLOATING_TOOLBAR_SELECTOR) !== null
}

function canvasSurfaceElement(
  context: FloatingToolbarContext,
  host: HTMLElement | undefined,
): HTMLElement | undefined {
  if (host?.offsetParent instanceof HTMLElement) return host.offsetParent
  const surface = context.scrollContainer.value?.querySelector('.cs-canvas-surface')
  return surface instanceof HTMLElement ? surface : undefined
}

function clampedLayout(
  surface: HTMLElement,
  toolbarHost: HTMLElement | undefined,
  centerX: number,
  anchorTop: number,
  anchorBottom: number,
): FloatingToolbarLayout {
  const toolbarHeight = toolbarHost?.offsetHeight ?? 44
  const toolbarWidth = toolbarHost?.offsetWidth ?? 320
  const gap = 10
  const minLeft = toolbarWidth / 2 + 4
  const maxLeft = Math.max(minLeft, surface.clientWidth - toolbarWidth / 2 - 4)
  const left = Math.max(minLeft, Math.min(maxLeft, centerX))
  const aboveTop = anchorTop - toolbarHeight - gap
  return aboveTop < 4
    ? Object.freeze({ left, top: anchorBottom + gap, placement: 'below' })
    : Object.freeze({ left, top: aboveTop, placement: 'above' })
}

function updateTextLayout(context: FloatingToolbarContext): void {
  const editor = context.textEditor.value
  const toolbarHost = context.textFloatingToolbar.value
  const surface = canvasSurfaceElement(context, editor ?? toolbarHost)
  if (
    !editor ||
    !surface ||
    !context.editing() ||
    !context.props.textToolbarSchema
  ) {
    context.floatingToolbarLayout.value = undefined
    return
  }
  const editorRect = editor.getBoundingClientRect()
  const view = context.scrollContainer.value?.getBoundingClientRect()
  const root = editor.closest('.cs-editor-shell')
  const header = root?.querySelector('.cs-topbar')?.getBoundingClientRect()
  const dock = root?.querySelector('.cs-bottom-chrome')?.getBoundingClientRect()
  const width = toolbarHost?.offsetWidth ?? 320
  const height = toolbarHost?.offsetHeight ?? 44
  const minTop = Math.max((view?.top ?? 0) + 8, header?.height ? header.bottom + 8 : 0)
  const bottom = Math.min(view?.bottom ?? window.innerHeight, dock?.height ? dock.top - 8 : Infinity)
  const minLeft = (view?.left ?? 0) + width / 2 + 8
  const maxLeft = Math.max(minLeft, (view?.right ?? window.innerWidth) - width / 2 - 8)
  const above = editorRect.top - height - 10
  const placement = above >= minTop ? 'above' : 'below'
  context.floatingToolbarLayout.value = Object.freeze({
    left: Math.max(minLeft, Math.min(maxLeft, editorRect.left + editorRect.width / 2)),
    top: Math.max(minTop, Math.min(bottom - height - 8, placement === 'above' ? above : editorRect.bottom + 10)),
    placement,
  })
}

function arrowLayoutFor(
  context: FloatingToolbarContext,
  layer: LayerNode | undefined,
  toolbarHost: HTMLElement | undefined,
): FloatingToolbarLayout | undefined {
  const surface = canvasSurfaceElement(context, toolbarHost)
  if (
    layer?.kind !== 'arrow' ||
    !surface ||
    !context.props.arrowToolbarSchema
  ) {
    return undefined
  }
  const bounds = context.layerBounds(layer)
  const topCenter = context.transformPoint(layer.transform, {
    x: bounds.x + bounds.width / 2,
    y: bounds.y,
  })
  const output = context.outputBounds.value
  const scale = (context.props.zoom ?? 100) / 100
  const canvasX = (topCenter.x - (output?.x ?? 0)) * scale
  const canvasY = (topCenter.y - (output?.y ?? 0)) * scale
  return clampedLayout(surface, toolbarHost, canvasX, canvasY, canvasY)
}

function updateTransientArrowLayout(context: FloatingToolbarContext): void {
  const toolbarHost = context.arrowFloatingToolbar.value
  const selected = context.selectedLayer()
  const preview = context.previewLayer()
  if (
    !toolbarHost ||
    preview?.id !== selected?.id ||
    preview?.kind !== 'arrow'
  ) {
    return
  }
  const layout = arrowLayoutFor(context, preview, toolbarHost)
  if (!layout) return
  toolbarHost.style.left = `${layout.left}px`
  toolbarHost.style.top = `${layout.top}px`
  toolbarHost.style.transform = 'translateX(-50%)'
  toolbarHost.style.visibility = ''
  toolbarHost.dataset.placement = layout.placement
}

export function createFloatingToolbarController(context: FloatingToolbarContext) {
  return {
    updateFloatingToolbarLayout: () => updateTextLayout(context),
    updateFloatingArrowToolbarLayout: () => {
      context.floatingArrowToolbarLayout.value = arrowLayoutFor(
        context,
        context.selectedLayer(),
        context.arrowFloatingToolbar.value,
      )
    },
    updateTransientArrowToolbarLayout: () => updateTransientArrowLayout(context),
  }
}
