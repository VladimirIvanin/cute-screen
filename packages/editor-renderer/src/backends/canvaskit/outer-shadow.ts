import type { RenderRectNode } from '@cute-screen/editor-core'
import type {
  CanvasKitApi,
  CanvasKitCanvas,
} from './contracts'
import { roundedRectPath } from './geometry'

export function drawOuterShadowsCanvasKit(
  kit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: RenderRectNode,
): void {
  if (!node.outerShadows?.length) return
  if (
    !kit.MaskFilter ||
    !kit.BlurStyle ||
    !canvas.clipPath ||
    kit.ClipOp?.Difference === undefined
  ) {
    throw new Error('CanvasKit outer shadow support is unavailable')
  }
  const paint = new kit.Paint()
  const contour = roundedRectPath(kit, node)
  canvas.save()
  try {
    if (!paint.setMaskFilter) throw new Error('CanvasKit mask filter support is unavailable')
    canvas.clipPath(contour, kit.ClipOp.Difference, true)
    paint.setAntiAlias(true)
    for (const shadow of node.outerShadows) {
      const width = node.width + shadow.spread * 2
      const height = node.height + shadow.spread * 2
      if (
        width <= 0 ||
        height <= 0 ||
        shadow.color.alpha === 0
      ) continue
      const path = roundedRectPath(kit, { ...node, width, height,
        x: node.x - shadow.spread + shadow.offsetX,
        y: node.y - shadow.spread + shadow.offsetY,
        cornerRadius: Math.max(0, (node.cornerRadius ?? 0) + shadow.spread) })
      const filter = kit.MaskFilter.MakeBlur(kit.BlurStyle.Normal, Math.max(0.01, shadow.blur / 2), true)
      try {
        const color = shadow.color
        paint.setColorComponents(color.red, color.green, color.blue, color.alpha * node.opacity)
        paint.setMaskFilter(filter)
        canvas.drawPath(path, paint)
      } finally {
        paint.setMaskFilter(null)
        filter.delete()
        path.delete()
      }
    }
  } finally {
    canvas.restore()
    contour.delete()
    paint.delete()
  }
}
