import type {
  CanvasViewportHosts,
  DocumentSessionController,
} from '@cute-screen/editor-vue'
import type { Ref, ShallowRef } from 'vue'
import {
  computeQuickCaptureLayout,
  type QuickRect,
} from './quick-capture-layout'

export interface QuickCaptureLayoutPorts {
  readonly hosts: ShallowRef<CanvasViewportHosts | undefined>
  readonly session: ShallowRef<DocumentSessionController | undefined>
  readonly currentCrop: Ref<QuickRect>
}

export class QuickCaptureLayoutController {
  readonly #ports: QuickCaptureLayoutPorts

  constructor(ports: QuickCaptureLayoutPorts) {
    this.#ports = ports
  }

  update(crop: QuickRect = this.#ports.currentCrop.value): string | undefined {
    const { hosts, session } = this.#ports
    if (!hosts.value || crop.width <= 0 || crop.height <= 0) return undefined
    const bounds = hosts.value.scene.getBoundingClientRect()
    const source = session.value?.snapshot.core.document.canvas ?? {
      width: 1,
      height: 1,
    }
    const quickRoot = document.querySelector<HTMLElement>('.cs-quick-capture')
    const actions = quickRoot?.querySelector<HTMLElement>('.cs-quick-actions')
    const toolRow = quickRoot?.querySelector<HTMLElement>(
      '.cs-quick-toolrail-group',
    )
    const context = quickRoot?.querySelector<HTMLElement>('.cs-context-toolbar')
    if (!hasMeasurableChrome(actions, toolRow, bounds)) return undefined
    const tools = toolRow!
    const contextHeight = context?.offsetHeight ?? 0
    const verticalGap = context ? 6 : 0
    const groupHeight = contextHeight + verticalGap + tools.offsetHeight
    const groupWidth = Math.max(tools.offsetWidth, context?.offsetWidth ?? 0)
    const layout = computeQuickCaptureLayout({
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scene: {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      },
      source,
      crop,
      actionSize: { width: actions.offsetWidth, height: actions.offsetHeight },
      toolSize: { width: groupWidth, height: groupHeight },
    })
    positionActions(actions, layout.actions)
    positionTools(tools, context, layout.tools, contextHeight, verticalGap)
    return layoutKey(bounds, source, crop, actions, groupWidth, groupHeight)
  }

  nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        resolve()
      }
      const timeout = window.setTimeout(finish, 32)
      requestAnimationFrame(finish)
    })
  }
}

function hasMeasurableChrome(
  actions: HTMLElement | null | undefined,
  tools: HTMLElement | null | undefined,
  bounds: DOMRect,
): actions is HTMLElement {
  return Boolean(
    actions &&
    tools &&
    bounds.width > 0 &&
    bounds.height > 0 &&
    actions.offsetWidth > 0 &&
    actions.offsetHeight > 0 &&
    tools.offsetWidth > 0 &&
    tools.offsetHeight > 0,
  )
}

function positionActions(
  element: HTMLElement,
  position: { left: number; top: number; side: string },
): void {
  element.style.left = `${Math.round(position.left)}px`
  element.style.right = 'auto'
  element.style.top = `${Math.round(position.top)}px`
  element.style.transform = 'none'
  element.dataset.placement = position.side
}

function positionTools(
  row: HTMLElement,
  context: HTMLElement | null | undefined,
  position: { left: number; top: number; side: string },
  contextHeight: number,
  gap: number,
): void {
  if (context) {
    context.style.left = `${Math.round(position.left)}px`
    context.style.top = `${Math.round(position.top)}px`
    context.style.bottom = 'auto'
    context.style.transform = 'none'
  }
  row.style.left = `${Math.round(position.left)}px`
  row.style.top = `${Math.round(position.top + contextHeight + gap)}px`
  row.style.bottom = 'auto'
  row.style.transform = 'none'
  row.dataset.placement = position.side
}

function layoutKey(
  bounds: DOMRect,
  source: { width: number; height: number },
  crop: QuickRect,
  actions: HTMLElement,
  groupWidth: number,
  groupHeight: number,
): string {
  return [
    window.innerWidth,
    window.innerHeight,
    bounds.left,
    bounds.top,
    bounds.width,
    bounds.height,
    source.width,
    source.height,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    actions.offsetWidth,
    actions.offsetHeight,
    groupWidth,
    groupHeight,
  ].join(':')
}
