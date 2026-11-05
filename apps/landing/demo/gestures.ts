import type { CanvasViewportHosts } from '@cute-screen/editor-vue'

export function installDemoGestures(
  hosts: CanvasViewportHosts,
  zoom: () => number,
  setZoom: (value: number) => void,
): () => void {
  const pointers = new Map<number, { x: number; y: number }>()
  let navigating = false
  let previous: { distance: number; x: number; y: number } | undefined
  function measure() {
    const values = [...pointers.values()]
    const a = values[0]!
    const b = values[1]!
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
  function down(event: PointerEvent) {
    if (
      event.pointerType !== 'touch' ||
      !(event.target instanceof Node) ||
      !hosts.scrollContainer.contains(event.target)
    ) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 2) {
      const first = [...pointers.keys()][0]!
      hosts.overlay.dispatchEvent(new PointerEvent('pointercancel', { pointerId: first, pointerType: 'touch', bubbles: true }))
      navigating = true
      previous = measure()
    }
    if (navigating) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  function move(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (!navigating) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (pointers.size !== 2) return
    const next = measure()
    if (previous && previous.distance > 0) {
      setZoom(Math.max(5, Math.min(800, zoom() * next.distance / previous.distance)))
      hosts.scrollContainer.scrollLeft -= next.x - previous.x
      hosts.scrollContainer.scrollTop -= next.y - previous.y
    }
    previous = next
  }
  function up(event: PointerEvent) {
    if (!pointers.delete(event.pointerId)) return
    if (navigating) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    if (!pointers.size) {
      navigating = false
      previous = undefined
    }
  }
  function cancel(event: PointerEvent) {
    if (event.isTrusted) up(event)
  }
  document.addEventListener('pointercancel', cancel, true)
  document.addEventListener('pointerdown', down, true)
  document.addEventListener('pointermove', move, { capture: true, passive: false })
  document.addEventListener('pointerup', up, true)
  // Cancellation dispatched to the renderer must reach its ordinary cancellation path.
  return () => {
    document.removeEventListener('pointercancel', cancel, true)
    document.removeEventListener('pointerdown', down, true)
    document.removeEventListener('pointermove', move, true)
    document.removeEventListener('pointerup', up, true)
  }
}
