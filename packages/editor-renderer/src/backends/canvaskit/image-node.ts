import type { RenderNode } from '@cute-screen/editor-core'
import type {
  CanvasKitApi,
  CanvasKitCanvas,
  CanvasKitImageResource,
} from './contracts'
import { blendMode, configurePaint } from './paint'

type ImageNode = Extract<RenderNode, { kind: 'image' }>

function configureImageStroke(
  canvasKit: CanvasKitApi,
  node: ImageNode,
  stroke: InstanceType<CanvasKitApi['Paint']>,
): void {
  configurePaint(
    canvasKit,
    stroke,
    node.stroke!,
    node.opacity,
    'stroke',
    node.strokeWidth ?? 1,
  )
  stroke.setStrokeJoin(
    node.lineJoin === 'round'
      ? canvasKit.StrokeJoin.Round
      : node.lineJoin === 'bevel'
        ? canvasKit.StrokeJoin.Bevel
        : canvasKit.StrokeJoin.Miter,
  )
}

export function drawImageNodeCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: ImageNode,
  resources: ReadonlyMap<string, CanvasKitImageResource>,
): void {
  const resource = resources.get(node.resourceId)
  const fill = new canvasKit.Paint()
  const stroke = new canvasKit.Paint()
  canvas.save()
  try {
    canvas.translate(node.x, node.y)
    canvas.rotate(node.rotation, 0, 0)
    canvas.scale(node.scaleX, node.scaleY)
    const bounds = canvasKit.XYWHRect(0, 0, node.width, node.height)
    const rounded =
      (node.cornerRadius ?? 0) > 0
        ? canvasKit.RRectXY(
            bounds,
            node.cornerRadius ?? 0,
            node.cornerRadius ?? 0,
          )
        : undefined
    if (rounded) canvas.clipRRect?.(rounded, canvasKit.ClipOp?.Intersect, true)
    if (resource) {
      fill.setAntiAlias(true)
      fill.setColorComponents(1, 1, 1, node.opacity)
      fill.setBlendMode(blendMode(canvasKit, node.blendMode))
      canvas.drawImageRect(
        resource.image,
        canvasKit.XYWHRect(0, 0, resource.width, resource.height),
        bounds,
        fill,
        false,
      )
    } else {
      configurePaint(
        canvasKit,
        fill,
        { red: 0.72, green: 0.28, blue: 0.28, alpha: 0.16 },
        node.opacity,
        'fill',
      )
      configurePaint(
        canvasKit,
        stroke,
        { red: 0.72, green: 0.28, blue: 0.28, alpha: 0.9 },
        node.opacity,
        'stroke',
      )
      if (rounded && canvas.drawRRect) {
        canvas.drawRRect(rounded, fill)
        canvas.drawRRect(rounded, stroke)
      } else {
        canvas.drawRect(bounds, fill)
        canvas.drawRect(bounds, stroke)
      }
    }
    if (node.stroke && (node.strokeWidth ?? 0) > 0) {
      configureImageStroke(canvasKit, node, stroke)
      if (rounded && canvas.drawRRect) canvas.drawRRect(rounded, stroke)
      else canvas.drawRect(bounds, stroke)
    }
  } finally {
    canvas.restore()
    fill.delete()
    stroke.delete()
  }
}
