import type {
  RenderCensorNode,
  RenderLoupeNode,
  RenderSpotlightNode,
} from '@cute-screen/editor-core'
import type { Context2D } from './contracts'

export function roundedRectPath(
  context: Context2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const corner = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + corner, y)
  context.lineTo(x + width - corner, y)
  context.quadraticCurveTo(x + width, y, x + width, y + corner)
  context.lineTo(x + width, y + height - corner)
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - corner,
    y + height,
  )
  context.lineTo(x + corner, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - corner)
  context.lineTo(x, y + corner)
  context.quadraticCurveTo(x, y, x + corner, y)
  context.closePath()
}

export function censorRegionPath(
  context: Context2D,
  node: RenderCensorNode,
): void {
  context.beginPath()
  if (node.region.kind === 'rectangle') {
    context.rect(
      node.region.x,
      node.region.y,
      node.region.width,
      node.region.height,
    )
    return
  }
  const first = node.region.points[0]!
  context.moveTo(first.x, first.y)
  for (const point of node.region.points.slice(1)) {
    context.lineTo(point.x, point.y)
  }
  context.closePath()
}

export function spotlightAperturePath(
  context: Context2D,
  node: RenderSpotlightNode,
): void {
  const aperture = node.aperture
  context.beginPath()
  if (aperture.shape === 'rectangle') {
    context.rect(aperture.x, aperture.y, aperture.width, aperture.height)
  } else if (aperture.shape === 'ellipse') {
    context.ellipse(
      aperture.x + aperture.width / 2,
      aperture.y + aperture.height / 2,
      aperture.width / 2,
      aperture.height / 2,
      0,
      0,
      Math.PI * 2,
    )
  } else {
    context.moveTo(aperture.x + aperture.width / 2, aperture.y)
    context.lineTo(
      aperture.x + aperture.width,
      aperture.y + aperture.height / 2,
    )
    context.lineTo(
      aperture.x + aperture.width / 2,
      aperture.y + aperture.height,
    )
    context.lineTo(aperture.x, aperture.y + aperture.height / 2)
    context.closePath()
  }
}

export function loupeLensPath(context: Context2D, node: RenderLoupeNode): void {
  context.beginPath()
  if (node.lens.shape === 'circle') {
    const radius = node.lens.size / 2
    context.ellipse(
      node.lens.x + radius,
      node.lens.y + radius,
      radius,
      radius,
      0,
      0,
      Math.PI * 2,
    )
  } else {
    context.rect(node.lens.x, node.lens.y, node.lens.size, node.lens.size)
  }
}
