import type { CanvasViewportProps } from './contracts'

/** Keep native sampling at fit zoom; bound supersampling independently of zoom. */
export function scenePreviewScale(
  canvas: NonNullable<CanvasViewportProps['canvas']>,
  zoom: number,
  dpr: number,
): number {
  const density = Math.max(1, zoom * dpr)
  const nativePixels = canvas.width * canvas.height
  const pixelBudget = Math.max(64 * 1024 * 1024, nativePixels)
  const sideBudget = Math.max(16384, canvas.width, canvas.height)
  return Math.min(density, Math.sqrt(pixelBudget / nativePixels), sideBudget / Math.max(canvas.width, canvas.height))
}
