import {
  groupRasterScale,
  groupNeedsFullSource,
} from './group-scale'
import type { RenderNode } from '@cute-screen/editor-core'
import type {
  CanvasKitApi,
  CanvasKitCanvas,
  CanvasKitSurface,
} from '../backends/canvaskit/contracts'
import { freeformPixels } from './freeform'

export function drawGroupCanvasKit(
  kit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: Extract<RenderNode, { kind: 'group' }>,
  scale: number,
  render: (surface: CanvasKitSurface, scale: number) => void,
): void {
  // Censorship runs at native density before downsampling; offscreens stay bounded.
  const density = groupRasterScale(node.scene, node.destination.width, scale)
  const fullSource = groupNeedsFullSource(node.scene)
  const source = fullSource ? node.scene : node.scene.outputBounds
  const surface = kit.MakeSurface(Math.max(1,
    Math.round(source.width * density)),
  Math.max(1,
    Math.round(source.height * density)))
  if (!surface) throw new Error('Card content surface creation failed')
  const paint = new kit.Paint()
  let filter: ReturnType<NonNullable<CanvasKitApi['ImageFilter']>['MakeBlur']> | undefined
  canvas.save()
  try {
    render(surface, density)
    const image = surface.makeImageSnapshot()
    try {
      const c = node.clip
      canvas.clipRRect?.(kit.RRectXY(kit.XYWHRect(c.x,
        c.y,
        c.width,
        c.height),
      node.cornerRadius,
      node.cornerRadius),
      kit.ClipOp?.Intersect,
      true)
      paint.setAntiAlias(true)
      paint.setColorComponents(1, 1, 1, node.opacity)
      if (node.blur > 0 && kit.ImageFilter) {
        filter = kit.ImageFilter.MakeBlur(node.blur / 2, node.blur / 2, kit.TileMode.Clamp, null)
        paint.setImageFilter?.(filter)
      }
      const b = node.scene.outputBounds, d = node.destination
      canvas.drawImageRect(
        image,
        kit.XYWHRect(
          (fullSource ? b.x : 0) * density,
          (fullSource ? b.y : 0) * density,
          b.width * density,
          b.height * density,
        ),
        kit.XYWHRect(d.x, d.y, d.width, d.height),
        paint,
      )
    } finally {
      image.delete()
    }
  } finally {
    canvas.restore()
    filter?.delete()
    paint.delete()
    surface.dispose()
  }
}
export function drawFreeformCanvasKit(
  kit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: Extract<RenderNode, { kind: 'freeform' }>,
  scale: number,
): void {
  const width = Math.max(1, Math.round(node.bounds.width * scale))
  const height = Math.max(1, Math.round(node.bounds.height * scale))
  if (
    !kit.MakeImage ||
    !kit.AlphaType ||
    !kit.ColorType
  ) throw new Error('Freeform raster upload is unavailable')
  const image = kit.MakeImage({ width, height, alphaType: kit.AlphaType.Unpremul, colorType: kit.ColorType.RGBA_8888,
    colorSpace: kit.ColorSpace?.SRGB }, freeformPixels(node, width, height), width * 4)
  if (!image) throw new Error('Freeform raster upload failed')
  const paint = new kit.Paint()
  try {
    paint.setColorComponents(1, 1, 1, node.opacity)
    canvas.drawImageRect(image, kit.XYWHRect(0, 0, width, height),
      kit.XYWHRect(node.bounds.x, node.bounds.y, node.bounds.width, node.bounds.height), paint)
  } finally {
    paint.delete()
    image.delete()
  }
}
