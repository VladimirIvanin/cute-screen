import type { RenderSceneSnapshot } from '@cute-screen/editor-core'
export function groupNeedsFullSource(scene: RenderSceneSnapshot): boolean {
  return scene.nodes.some((node) => node.kind === 'censor' || node.kind === 'loupe' || node.kind === 'spotlight')
}
/** A tiny crop must not request a many-gigapixel offscreen of its full source. */
export function groupRasterScale(
  scene: RenderSceneSnapshot,
  destinationWidth: number,
  outputScale: number,
): number {
  const requested = outputScale * destinationWidth / scene.outputBounds.width
  const source = groupNeedsFullSource(scene) ? scene : scene.outputBounds
  const pixels = source.width * source.height
  const pixelBudget = Math.max(134217728, pixels)
  const sideBudget = Math.max(32768, source.width, source.height)
  const limit = Math.min(Math.sqrt(pixelBudget / pixels), sideBudget / Math.max(source.width, source.height))
  const minimum = scene.nodes.some((node) => node.kind === 'censor') ? 1 : 0
  return Math.min(limit, Math.max(minimum, requested))
}
