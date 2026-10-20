/** Keep browser page zoom separate from the editor's canvas zoom. */
export function installInterfaceZoomGuard(): () => void {
  const controller = new AbortController()
  const options = { capture: true, passive: false, signal: controller.signal }

  // Pinch is delivered as Ctrl+wheel by Chromium. Do not stop propagation:
  // CanvasWorkspace must still receive the event to update its own viewport.
  window.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault()
  }, options)

  // WebKit also exposes a separate gesture stream for trackpad magnification.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    window.addEventListener(type, (event) => event.preventDefault(), options)
  }

  return () => controller.abort()
}
