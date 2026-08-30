import type {
  RenderCensorNode,
  RenderLoupeNode,
  RenderSpotlightNode,
} from '@cute-screen/editor-core'
import type { CanvasKitApi, CanvasKitPath } from './contracts'

export function censorPath(
  canvasKit: CanvasKitApi,
  node: RenderCensorNode,
): CanvasKitPath {
  const builder = new canvasKit.PathBuilder()
  if (node.region.kind === 'rectangle') {
    builder.moveTo(node.region.x, node.region.y)
    builder.lineTo(node.region.x + node.region.width, node.region.y)
    builder.lineTo(
      node.region.x + node.region.width,
      node.region.y + node.region.height,
    )
    builder.lineTo(node.region.x, node.region.y + node.region.height)
  } else {
    const first = node.region.points[0]!
    builder.moveTo(first.x, first.y)
    for (const point of node.region.points.slice(1)) {
      builder.lineTo(point.x, point.y)
    }
  }
  builder.close()
  const path = builder.detach()
  builder.delete()
  return path
}

export function spotlightPath(
  canvasKit: CanvasKitApi,
  node: RenderSpotlightNode,
): CanvasKitPath {
  const aperture = node.aperture
  const builder = new canvasKit.PathBuilder()
  if (aperture.shape === 'ellipse') {
    if (builder.addOval) {
      builder.addOval(
        canvasKit.XYWHRect(
          aperture.x,
          aperture.y,
          aperture.width,
          aperture.height,
        ),
      )
    } else {
      const centerX = aperture.x + aperture.width / 2
      const centerY = aperture.y + aperture.height / 2
      const radiusX = aperture.width / 2
      const radiusY = aperture.height / 2
      const kappa = 0.552_284_75
      builder.moveTo(centerX + radiusX, centerY)
      builder.cubicTo(
        centerX + radiusX,
        centerY + radiusY * kappa,
        centerX + radiusX * kappa,
        centerY + radiusY,
        centerX,
        centerY + radiusY,
      )
      builder.cubicTo(
        centerX - radiusX * kappa,
        centerY + radiusY,
        centerX - radiusX,
        centerY + radiusY * kappa,
        centerX - radiusX,
        centerY,
      )
      builder.cubicTo(
        centerX - radiusX,
        centerY - radiusY * kappa,
        centerX - radiusX * kappa,
        centerY - radiusY,
        centerX,
        centerY - radiusY,
      )
      builder.cubicTo(
        centerX + radiusX * kappa,
        centerY - radiusY,
        centerX + radiusX,
        centerY - radiusY * kappa,
        centerX + radiusX,
        centerY,
      )
      builder.close()
    }
  } else {
    const points =
      aperture.shape === 'diamond'
        ? [
            [aperture.x + aperture.width / 2, aperture.y],
            [aperture.x + aperture.width, aperture.y + aperture.height / 2],
            [aperture.x + aperture.width / 2, aperture.y + aperture.height],
            [aperture.x, aperture.y + aperture.height / 2],
          ]
        : [
            [aperture.x, aperture.y],
            [aperture.x + aperture.width, aperture.y],
            [aperture.x + aperture.width, aperture.y + aperture.height],
            [aperture.x, aperture.y + aperture.height],
          ]
    builder.moveTo(points[0]![0]!, points[0]![1]!)
    for (const point of points.slice(1)) builder.lineTo(point[0]!, point[1]!)
    builder.close()
  }
  const path = builder.detach()
  builder.delete()
  return path
}

export function loupePath(
  canvasKit: CanvasKitApi,
  node: RenderLoupeNode,
): CanvasKitPath {
  const builder = new canvasKit.PathBuilder()
  if (node.lens.shape === 'circle' && builder.addOval) {
    builder.addOval(
      canvasKit.XYWHRect(
        node.lens.x,
        node.lens.y,
        node.lens.size,
        node.lens.size,
      ),
    )
  } else {
    const x = node.lens.x
    const y = node.lens.y
    const edgeX = x + node.lens.size
    const edgeY = y + node.lens.size
    builder.moveTo(x, y)
    builder.lineTo(edgeX, y)
    builder.lineTo(edgeX, edgeY)
    builder.lineTo(x, edgeY)
    builder.close()
  }
  const path = builder.detach()
  builder.delete()
  return path
}
