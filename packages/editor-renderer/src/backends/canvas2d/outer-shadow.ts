import type { RenderRectNode } from '@cute-screen/editor-core'
import type {
  Canvas2DLike,
  Context2D,
} from './contracts'
import { cssColor } from './paint'
import { roundedRectPath } from './paths'

type CanvasFactory = (width: number, height: number) => Canvas2DLike
interface ShadowCache {
  geometry: string
  opacity: string
  masks: Canvas2DLike[]
  composite: Canvas2DLike
}
const caches = new WeakMap<CanvasFactory, ShadowCache>()

export function releaseOuterShadowCache(factory: CanvasFactory): void {
  const cache = caches.get(factory)
  if (!cache) return
  for (const canvas of [...cache.masks, cache.composite]) {
    canvas.width = 1
    canvas.height = 1
  }
  caches.delete(factory)
}

export function drawOuterShadows2D(
  context: Context2D,
  node: RenderRectNode,
  newCanvas?: CanvasFactory,
): void {
  const shadows = node.outerShadows
  if (!shadows?.length) return
  if (!newCanvas) throw new Error('Outer shadows require an offscreen canvas factory')
  const transform = context.getTransform()
  const density = Math.max(Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d))
  const padding = Math.max(...shadows.map((shadow) =>
    shadow.blur * 2 + Math.abs(shadow.offsetX) + Math.abs(shadow.offsetY) + Math.max(0, shadow.spread))) + 2
  const width = node.width + padding * 2
  const height = node.height + padding * 2
  // Four 2048² RGBA surfaces at most for the three-layer composition recipe.
  // Geometry masks survive opacity edits; drawing an unchanged frame only blits.
  const rasterScale = Math.min(density, 1, 2048 / width, 2048 / height)
  if (rasterScale <= 0) return
  const pixelWidth = Math.max(1, Math.ceil(width * rasterScale))
  const pixelHeight = Math.max(1, Math.ceil(height * rasterScale))
  const geometry = JSON.stringify([node.width, node.height, node.cornerRadius, rasterScale,
    shadows.map(({ color, ...shape }) => [shape, color.red, color.green, color.blue])])
  const opacity = JSON.stringify(shadows.map((shadow) => shadow.color.alpha))
  let cache = caches.get(newCanvas)
  if (cache?.geometry !== geometry) {
    releaseOuterShadowCache(newCanvas)
    cache = { geometry, opacity: '', masks: [], composite: newCanvas(pixelWidth, pixelHeight) }
    caches.set(newCanvas, cache)
    try {
      for (const shadow of shadows) {
        const mask = newCanvas(pixelWidth, pixelHeight)
        cache.masks.push(mask)
        const maskContext = mask.getContext('2d')
        if (!maskContext) throw new Error('Outer shadow canvas context is unavailable')
        const casterWidth = node.width + shadow.spread * 2
        const casterHeight = node.height + shadow.spread * 2
        if (casterWidth <= 0 || casterHeight <= 0) continue
        maskContext.setTransform(rasterScale, 0, 0, rasterScale, padding * rasterScale, padding * rasterScale)
        maskContext.fillStyle = cssColor({ ...shadow.color, alpha: 1 })
        // Composite alpha afterwards: native Canvas libraries differ in shadow
        // premultiplication. The geometry mask must remain opaque for reuse.
        maskContext.shadowColor = cssColor({ ...shadow.color, alpha: 1 })
        maskContext.shadowBlur = shadow.blur * rasterScale
        // Move the opaque source offscreen and bring only its shadow back.
        // Positive spread must not expose an unblurred source silhouette.
        const displacement = width * 2
        maskContext.shadowOffsetX = (shadow.offsetX + displacement) * rasterScale
        maskContext.shadowOffsetY = shadow.offsetY * rasterScale
        roundedRectPath(maskContext, -shadow.spread - displacement, -shadow.spread, casterWidth, casterHeight,
          Math.max(0, (node.cornerRadius ?? 0) + shadow.spread))
        maskContext.fill()
      }
    } catch (error) {
      releaseOuterShadowCache(newCanvas)
      throw error
    }
  }
  if (cache.opacity !== opacity) {
    const shadowContext = cache.composite.getContext('2d')
    if (!shadowContext) throw new Error('Outer shadow canvas context is unavailable')
    shadowContext.setTransform(1, 0, 0, 1, 0, 0)
    shadowContext.globalCompositeOperation = 'source-over'
    shadowContext.clearRect(0, 0, pixelWidth, pixelHeight)
    for (const [index, shadow] of shadows.entries()) {
      shadowContext.globalAlpha = shadow.color.alpha
      shadowContext.drawImage(cache.masks[index] as unknown as CanvasImageSource, 0, 0)
    }
    // The caster must never darken transparent pixels inside the screenshot.
    shadowContext.globalAlpha = 1
    shadowContext.fillStyle = '#000'
    shadowContext.setTransform(rasterScale, 0, 0, rasterScale, padding * rasterScale, padding * rasterScale)
    shadowContext.globalCompositeOperation = 'destination-out'
    roundedRectPath(shadowContext, 0, 0, node.width, node.height, node.cornerRadius ?? 0)
    shadowContext.fill()
    cache.opacity = opacity
  }
  context.drawImage(cache.composite as unknown as CanvasImageSource, node.x - padding, node.y - padding, width, height)
}
