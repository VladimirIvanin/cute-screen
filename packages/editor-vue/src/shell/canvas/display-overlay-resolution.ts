import type { ViewportOutputBounds } from './contracts'

/** Keep editor and Quick UI rasterization independent of document pixels. */
export function prepareDisplayOverlay(
  overlay: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  bounds: ViewportOutputBounds,
  zoom: number,
  dpr: number,
): void {
  const surface = overlay.closest('.cs-canvas-surface')?.getBoundingClientRect()
  const viewport = overlay.closest('.cs-canvas-scroll')?.getBoundingClientRect()
  const rect = surface?.width && surface.height ? surface : overlay.getBoundingClientRect()
  const fullWidth = rect.width || bounds.width * zoom
  const fullHeight = rect.height || bounds.height * zoom
  // Rasterize only visible chrome: an 8K image at large zoom must not allocate
  // a display-resolution bitmap for the entire, mostly offscreen document.
  const clipped = surface &&
    viewport &&
    viewport.width > 0 &&
    viewport.height > 0
  const left = clipped ? Math.max(0, Math.min(fullWidth, viewport.left - rect.left)) : 0
  const top = clipped ? Math.max(0, Math.min(fullHeight, viewport.top - rect.top)) : 0
  const cssWidth = clipped ? Math.max(1, Math.min(rect.right, viewport.right) - rect.left - left) : fullWidth
  const cssHeight = clipped ? Math.max(1, Math.min(rect.bottom, viewport.bottom) - rect.top - top) : fullHeight
  if (clipped) {
    Object.assign(overlay.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${cssWidth}px`,
      height: `${cssHeight}px`,
      right: 'auto',
      bottom: 'auto',
    })
  }
  const width = Math.max(1, Math.round(cssWidth * dpr))
  const height = Math.max(1, Math.round(cssHeight * dpr))
  if (overlay.width !== width) overlay.width = width
  if (overlay.height !== height) overlay.height = height
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, width, height)
  const pixelScaleX = width / cssWidth
  const pixelScaleY = height / cssHeight
  const scaleX = fullWidth / bounds.width * pixelScaleX
  const scaleY = fullHeight / bounds.height * pixelScaleY
  context.setTransform(
    scaleX,
    0,
    0,
    scaleY,
    -bounds.x * scaleX - left * pixelScaleX,
    -bounds.y * scaleY - top * pixelScaleY,
  )
}
