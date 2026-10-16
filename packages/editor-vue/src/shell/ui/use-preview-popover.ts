import {
  onBeforeUnmount,
  onMounted,
  shallowRef,
  watch,
} from 'vue'
import {
  previewEnvironment,
  previewPlacement,
  type PreviewPlacement,
} from './preview-placement'

/** Only observes layout; scene gestures remain outside Vue's render loop.
 * Consumers use an external trigger and NPopover x/y + overlap + top-start.
 * In manual mode Naive UI omits its trigger slot; bottom-start translates the panel upward.
 */
export function usePreviewPopover(
  anchor: () => HTMLElement | undefined,
  panel: () => HTMLElement | undefined,
) {
  const position = shallowRef<PreviewPlacement>()
  let observer: ResizeObserver | undefined
  let frame: number | undefined
  function update(): void {
    frame = undefined
    const trigger = anchor(), content = panel()
    if (!trigger || !content) return
    const { view, obstacles } = previewEnvironment(trigger, content)
    content.style.maxWidth = `${Math.max(1, view.width - 16)}px`
    content.style.maxHeight = `${Math.max(1, view.height - 16)}px`
    const rect = { width: content.offsetWidth, height: content.offsetHeight }
    const next = previewPlacement(trigger.getBoundingClientRect(), rect, view, obstacles, position.value)
    if (JSON.stringify(next) !== JSON.stringify(position.value)) position.value = next
  }
  function schedule(): void {
    if (frame === undefined) frame = requestAnimationFrame(update)
  }
  watch([anchor, panel], ([trigger, content]) => {
    observer?.disconnect()
    if (!trigger || !content) {
      // NPopover still renders during its leave transition. Keep its last
      // measured coordinates until the next opening supplies a new placement.
      return
    }
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule)
      observer.observe(trigger)
      observer.observe(content)
    }
    schedule()
  }, { flush: 'post' })
  onMounted(() => {
    window.addEventListener('resize', schedule)
    document.addEventListener('scroll', schedule, true)
    document.addEventListener('cs-preview-layout', schedule)
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    if (frame !== undefined) cancelAnimationFrame(frame)
    window.removeEventListener('resize', schedule)
    document.removeEventListener('scroll', schedule, true)
    document.removeEventListener('cs-preview-layout', schedule)
  })
  return position
}
