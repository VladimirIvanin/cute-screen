import type {
  RenderVectorNode,
  ShapePathCommand,
} from '@cute-screen/editor-core'
import type {
  CanvasKitApi,
  CanvasKitCanvas,
  CanvasKitImageResource,
} from './contracts'
import { withTransform } from './geometry'
import {
  blendMode,
  configureFillPaint,
  configureStrokePaint,
} from './paint'

function buildPath(
  canvasKit: CanvasKitApi,
  commands: readonly ShapePathCommand[],
) {
  const builder = new canvasKit.PathBuilder()
  try {
    for (const command of commands) {
      switch (command[0]) {
        case 'M': builder.moveTo(command[1], command[2])
          break
        case 'L': builder.lineTo(command[1], command[2])
          break
        case 'C': builder.cubicTo(command[1], command[2], command[3], command[4], command[5], command[6])
          break
        case 'Z': builder.close()
          break
      }
    }
    return builder.detach()
  } finally {
    builder.delete()
  }
}

export function drawVectorNodeCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: RenderVectorNode,
  resources: ReadonlyMap<string, CanvasKitImageResource>,
): void {
  const outline = buildPath(canvasKit, node.outline)
  const strokes = buildPath(canvasKit, [...node.outline, ...node.details])
  const fill = new canvasKit.Paint()
  const stroke = new canvasKit.Paint()
  const group = new canvasKit.Paint()
  let shader: ReturnType<typeof configureFillPaint>
  let effect: ReturnType<typeof configureStrokePaint>
  try {
    group.setColorComponents(1, 1, 1, node.opacity)
    group.setBlendMode(blendMode(canvasKit, node.blendMode))
    withTransform(canvas, node, node.x + node.width / 2, node.y + node.height / 2, () => {
      canvas.saveLayer(group)
      try {
        if (!node.open) {
          shader = configureFillPaint(canvasKit, fill, node.fill, 1, 'normal', resources)
          canvas.drawPath(outline, fill)
        }
        if (node.strokeWidth > 0) {
          effect = configureStrokePaint(canvasKit, stroke, { ...node, opacity: 1, blendMode: 'normal' }, node.stroke, node.strokeWidth)
          canvas.drawPath(strokes, stroke)
        }
      } finally {
        canvas.restore()
      }
    })
  } finally {
    outline.delete()
    strokes.delete()
    fill.delete()
    stroke.delete()
    group.delete()
    shader?.delete()
    effect?.delete()
  }
}
