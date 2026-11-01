import type { LayerNode } from '../types'
import { supportsAnnotationShadow } from '../../annotation-shadow'
import type { RenderNode } from '../../scene/contracts'
import {
  transformPoint,
  transformToMatrix,
} from '../../geometry'

export function annotationShadowNodes(
  layer: LayerNode,
  nodes: readonly RenderNode[],
  canvas: { width: number; height: number },
): readonly RenderNode[] {
  if (
    !layer.annotationShadow ||
    !nodes.length ||
    !layer.visible ||
    !supportsAnnotationShadow(layer.kind)
  ) return nodes
  const blur = layer.annotationShadow === 'strong' ? 10 : 6
  const matrix = transformToMatrix(layer.transform)
  const b = layer.localBounds
  const corners = [
    { x: b.x, y: b.y }, { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height },
  ].map((p) => transformPoint(matrix, p))
  const padding = blur * 3 + 4
  const x = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x)) - padding))
  const y = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y)) - padding))
  const right = Math.min(canvas.width, Math.ceil(Math.max(...corners.map((p) => p.x)) + padding))
  const bottom = Math.min(canvas.height, Math.ceil(Math.max(...corners.map((p) => p.y)) + padding))
  if (right <= x || bottom <= y) return nodes
  const outputBounds = { x, y, width: right - x, height: bottom - y }
  return [{ kind: 'group', id: `${layer.id}:annotation-shadow`, visible: true, opacity: 1, rotation: 0,
    scene: { ...canvas, outputBounds, nodes },
    destination: { ...outputBounds, y: y + (layer.annotationShadow === 'strong' ? 4 : 2) },
    clip: { x: 0, y: 0, ...canvas }, cornerRadius: 0, blur,
    tint: { red: 0, green: 0, blue: 0, alpha: layer.annotationShadow === 'strong' ? .4 : .24 },
  }, ...nodes]
}
