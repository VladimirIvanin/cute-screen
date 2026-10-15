import type {
  RenderVectorNode,
  ShapePathCommand,
} from '@cute-screen/editor-core'
import type { ImageResourceInput } from '../../types'
import type {
  Canvas2DLike,
  Context2D,
} from './contracts'
import {
  cssColor,
  defaultCanvas,
  paintStyle,
  withTransform,
} from './paint'

function path(
  context: Context2D,
  commands: readonly ShapePathCommand[],
): void {
  for (const command of commands) {
    switch (command[0]) {
      case 'M': context.moveTo(command[1], command[2])
        break
      case 'L': context.lineTo(command[1], command[2])
        break
      case 'C': context.bezierCurveTo(command[1], command[2], command[3], command[4], command[5], command[6])
        break
      case 'Z': context.closePath()
        break
    }
  }
}

/** Isolate all parts before applying layer opacity/blend once. */
export function drawVectorNode2D(
  context: Context2D,
  node: RenderVectorNode,
  resources: ReadonlyMap<string, ImageResourceInput['source']>,
  newCanvas: (width: number, height: number) => Canvas2DLike = defaultCanvas,
): void {
  const matrix = context.getTransform()
  const scale = Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d), 1)
  // Miter joins can extend beyond the intrinsic contour bounds.
  const padding = node.strokeWidth * 5 + 2
  const left = node.x - padding
  const top = node.y - padding
  const width = node.width + padding * 2
  const height = node.height + padding * 2
  const scratch = newCanvas(Math.ceil(width * scale), Math.ceil(height * scale))
  const target = scratch.getContext('2d')
  if (!target) throw new Error('Vector composition surface is unavailable')
  target.setTransform(scale, 0, 0, scale, -left * scale, -top * scale)
  if (!node.open) {
    target.beginPath()
    path(target, node.outline)
    target.fillStyle = paintStyle(target, node.fill, resources)
    target.fill()
  }
  if (node.strokeWidth > 0) {
    target.beginPath()
    path(target, node.outline)
    path(target, node.details)
    target.strokeStyle = cssColor(node.stroke)
    target.lineWidth = node.strokeWidth
    target.lineJoin = node.lineJoin ?? 'miter'
    target.lineCap = node.lineCap ?? 'butt'
    target.setLineDash(node.dash ? [...node.dash] : [])
    target.stroke()
  }
  withTransform(context, node, node.x + node.width / 2, node.y + node.height / 2, () => {
    context.drawImage(scratch as unknown as CanvasImageSource, left, top, scratch.width / scale, scratch.height / scale)
  })
}
