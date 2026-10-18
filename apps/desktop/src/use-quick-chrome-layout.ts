import {
  onBeforeUnmount,
  onMounted,
} from 'vue'
import type { QuickCaptureLayoutController } from './quick-capture-layout-controller'
import type { QuickRect } from './quick-capture-layout'

/** Chrome follows committed frame/layout changes, never a live canvas gesture. */
export function useQuickChromeLayout(controller: QuickCaptureLayoutController) {
  let observer: ResizeObserver | undefined
  let frame: number | undefined
  let canvasGesture = false
  const observed = new WeakSet<Element>()

  function update(crop?: QuickRect): string | undefined {
    for (const element of document.querySelectorAll('.cs-quick-actions, .cs-quick-toolrail-group, .cs-tool-defaults-toolbar, .cs-quick-portal-limit')) {
      if (observed.has(element)) continue
      observed.add(element)
      observer?.observe(element)
    }
    return canvasGesture ? undefined : controller.update(crop)
  }
  function schedule(): void {
    if (frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      update()
    })
  }
  function start(event: PointerEvent): void {
    if (event.target instanceof Element && event.target.matches('.cs-canvas')) canvasGesture = true
  }
  function finish(): void {
    if (!canvasGesture) return
    canvasGesture = false
    schedule()
  }
  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined') observer = new ResizeObserver(schedule)
    document.addEventListener('cs-preview-layout', schedule)
    document.addEventListener('pointerdown', start, true)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('resize', schedule)
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    if (frame !== undefined) cancelAnimationFrame(frame)
    document.removeEventListener('cs-preview-layout', schedule)
    document.removeEventListener('pointerdown', start, true)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
    window.removeEventListener('resize', schedule)
  })
  return update
}
