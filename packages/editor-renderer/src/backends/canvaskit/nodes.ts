import type { RenderNode } from '@cute-screen/editor-core'
import type {
  CanvasKitApi,
  CanvasKitCanvas,
  CanvasKitImageResource,
} from './contracts'
import { drawRulerCanvasKit } from './effects'
import { CanvasKitTypefaceStore } from './geometry'
import {
  drawEllipseNodeCanvasKit,
  drawLineNodeCanvasKit,
  drawPathNodeCanvasKit,
  drawPolygonNodeCanvasKit,
  drawRectNodeCanvasKit,
} from './shape-nodes'
import { drawTextNodeCanvasKit } from './text-node'

export function drawNodesCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  nodes: readonly RenderNode[],
  resources: ReadonlyMap<string, CanvasKitImageResource> = new Map(),
  typefaces?: CanvasKitTypefaceStore,
): void {
  for (const node of nodes) {
    if (!node.visible || node.opacity === 0) continue
    switch (node.kind) {
      case 'rect':
        drawRectNodeCanvasKit(canvasKit, canvas, node, resources)
        break
      case 'ellipse':
        drawEllipseNodeCanvasKit(canvasKit, canvas, node, resources)
        break
      case 'line':
        drawLineNodeCanvasKit(canvasKit, canvas, node)
        break
      case 'path':
        drawPathNodeCanvasKit(canvasKit, canvas, node)
        break
      case 'polygon':
        drawPolygonNodeCanvasKit(canvasKit, canvas, node, resources)
        break
      case 'text':
        drawTextNodeCanvasKit(canvasKit, canvas, node, typefaces)
        break
      case 'ruler':
        drawRulerCanvasKit(canvasKit, canvas, node, typefaces)
        break
      case 'image':
        // Image resources require ordered scene ownership.
        break
      case 'censor':
      case 'spotlight':
      case 'loupe':
        throw new Error(
          `${node.kind} rendering requires an ordered CanvasKit surface`,
        )
    }
  }
}
