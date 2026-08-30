import type { RenderNode } from '@cute-screen/editor-core'
import type { ImageResourceInput } from '../../types'
import type { Canvas2DRendererOptions, Context2D } from './contracts'
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
  resolveFontFamily: NonNullable<
    Canvas2DRendererOptions['resolveFontFamily']
  > = (_text, style) => style.fontFamily,
): void {
  for (const node of nodes) {
    if (!node.visible || node.opacity === 0) continue
    switch (node.kind) {
      case 'rect':
        drawRectNode2D(context, node, resources)
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
      case 'censor':
      case 'spotlight':
      case 'loupe':
        throw new Error(
          `${node.kind} rendering requires an ordered Canvas2D surface`,
        )
    }
  }
}
