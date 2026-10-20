import type { RenderGroupNode } from '@cute-screen/editor-core'
import type {
  CanvasKitApi,
  CanvasKitCanvas,
  CanvasKitImage,
  CanvasKitPaint,
} from '../backends/canvaskit/contracts'
import {
  groupBackdropGeometry,
  backdropEdgeCopies,
} from './group-backdrop'

export function drawBackdropCanvasKit(
  kit: CanvasKitApi,
  target: CanvasKitCanvas,
  image: CanvasKitImage,
  source: Float32Array,
  node: RenderGroupNode,
  scale: number,
  sourcePaint: CanvasKitPaint,
): void {
  const geometry = groupBackdropGeometry(node, scale)
  const surface = kit.MakeSurface(geometry.width, geometry.height)
  if (!surface) throw new Error('Group backdrop surface creation failed')
  const paint = new kit.Paint()
  try {
    const canvas = surface.getCanvas()
    const backdrop = node.backdrop!
    canvas.clear(kit.TRANSPARENT)
    canvas.save()
    try {
      const inner = kit.XYWHRect(1, 1, geometry.width - 2, geometry.height - 2)
      canvas.clipRect!(inner, kit.ClipOp?.Intersect, false)
      paint.setAntiAlias(false)
      paint.setColorComponents(backdrop.red, backdrop.green, backdrop.blue, backdrop.alpha)
      canvas.drawRect(inner, paint)
      const d = geometry.content
      sourcePaint.setColorComponents(1, 1, 1, 1)
      canvas.drawImageRect(image, source, kit.XYWHRect(d.x, d.y, d.width, d.height), sourcePaint)
    } finally {
      canvas.restore()
    }
    const screen = surface.makeImageSnapshot()
    try {
      paint.setColorComponents(1, 1, 1, 1)
      for (const [from, to] of backdropEdgeCopies(geometry.width, geometry.height)) {
        canvas.drawImageRect(screen, kit.XYWHRect(from.x, from.y, from.width, from.height),
          kit.XYWHRect(to.x, to.y, to.width, to.height), paint)
      }
    } finally {
      screen.delete()
    }
    const composite = surface.makeImageSnapshot()
    try {
      paint.setColorComponents(1, 1, 1, node.opacity)
      const d = geometry.destination
      target.drawImageRect(composite, kit.XYWHRect(0, 0, geometry.width, geometry.height),
        kit.XYWHRect(d.x, d.y, d.width, d.height), paint)
    } finally {
      composite.delete()
    }
  } finally {
    paint.delete()
    surface.dispose()
  }
}
