import { drawVectorNode2D } from './vector-node'
import { drawAnnotationShadow2D } from './annotation-shadow'
import { defaultCanvas } from './paint'
import type { RenderNode } from '@cute-screen/editor-core'
import type { ImageResourceInput } from '../../types'
import type {
  Canvas2DRendererOptions,
  Canvas2DLike,
  Context2D,
} from './contracts'
import { drawRuler2D } from './effects'
import {
  drawEllipseNode2D,
  drawLineNode2D,
  drawPathNode2D,
  drawPolygonNode2D,
  drawRectNode2D,
} from './shape-nodes'
import { drawTextNode2D } from './text-node'

export function drawNodes2D(
  context: Context2D,
  nodes: readonly RenderNode[],
  resources: ReadonlyMap<string, ImageResourceInput['source']> = new Map(),
  resolveFontFamily: NonNullable<Canvas2DRendererOptions['resolveFontFamily']> = (_text, style) => style.fontFamily,
  newCanvas?: (width: number, height: number) => Canvas2DLike,
): void {
  for (const node of nodes) {
    if (!node.visible || node.opacity === 0) continue
    switch (node.kind) {
      case 'vector':
        drawVectorNode2D(context, node, resources, newCanvas)
        break
      case 'rect':
        drawRectNode2D(context, node, resources, newCanvas)
        break
      case 'ellipse':
        drawEllipseNode2D(context, node, resources)
        break
      case 'line':
        drawLineNode2D(context, node)
        break
      case 'path':
        drawPathNode2D(context, node)
        break
      case 'polygon':
        drawPolygonNode2D(context, node, resources)
        break
      case 'text':
        drawTextNode2D(context, node, resolveFontFamily)
        break
      case 'ruler':
        drawRuler2D(context, node, resolveFontFamily)
        break
      case 'image':
        // Resources are resolved by the renderer, keeping overlays independent.
        break
      case 'group':
        if (!node.tint) throw new Error('group rendering requires an ordered Canvas2D surface')
        {
          const matrix = context.getTransform()
          const density = Math.max(.01, Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d))
          drawAnnotationShadow2D(context, node, density, newCanvas ?? defaultCanvas, (surface, scale) => {
            const b = node.scene.outputBounds
            surface.width = Math.max(1, Math.round(b.width * scale))
            surface.height = Math.max(1, Math.round(b.height * scale))
            const target = surface.getContext('2d')!
            target.setTransform(scale, 0, 0, scale, -b.x * scale, -b.y * scale)
            drawNodes2D(target, node.scene.nodes, resources, resolveFontFamily, newCanvas)
          })
        }
        break
      case 'freeform':
      case 'censor':
      case 'spotlight':
      case 'loupe':
        throw new Error(`${node.kind} rendering requires an ordered Canvas2D surface`)
    }
  }
}
