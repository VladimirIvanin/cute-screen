import type { ViewportOutputBounds } from './contracts'

/** Keep Quick UI rasterization independent of the frozen image's pixel size. */
export function prepareQuickOverlay(
  overlay: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  bounds: ViewportOutputBounds,
  zoom: number,
  dpr: number,
): void {
  const rect = overlay.getBoundingClientRect()
  const width = Math.max(
    1,
    Math.round((rect.width || bounds.width * zoom) * dpr),
  )
  const height = Math.max(
    1,
    Math.round((rect.height || bounds.height * zoom) * dpr),
  )
  if (overlay.width !== width) overlay.width = width
  if (overlay.height !== height) overlay.height = height
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, width, height)
  const scaleX = width / bounds.width
  const scaleY = height / bounds.height
  context.setTransform(
    scaleX,
    0,
    0,
    scaleY,
    -bounds.x * scaleX,
    -bounds.y * scaleY,
  )
}
