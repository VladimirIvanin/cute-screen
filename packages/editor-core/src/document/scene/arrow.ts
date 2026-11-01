import { mapShapePath } from '../../shapes'
import { taperedArrowNodes } from './tapered-arrow'
import { arrowCapNodes } from './arrow-caps'
export { arrowCapNodes } from './arrow-caps'
import { sketchPath } from '../../sketch-geometry'
import type { RenderVectorNode } from '../../scene/contracts'
import {
  arrowBodyGeometry,
  arrowEndpointAngles,
  arrowPathPoints,
  scaledClosedArrowCapSizes,
  trimArrowBodyPoints,
} from '../../arrow-geometry'
import type { RenderNode } from '../../scene/contracts'
import type {
  ArrowLayer,
  ArrowLayerPayload,
} from '../types'
import {
  TRANSPARENT,
  layerBlendMode,
  layerOpacity,
  pathNode,
  stroke,
} from './shared'

export function arrowNodes(layer: ArrowLayer): readonly RenderNode[] {
  const arrow = layer.payload as ArrowLayerPayload
  const style = stroke(arrow.stroke)
  if (arrow.appearance === 'tapered') return taperedArrowNodes(layer)
  const points = arrowPathPoints(arrow)
  const bodyPoints = trimArrowBodyPoints(points, arrow.startCap, arrow.endCap, style.width)
  const angles = arrowEndpointAngles(points)
  const capSizes = scaledClosedArrowCapSizes(points, arrow.startCap, arrow.endCap, style.width)
  const nodes: readonly RenderNode[] = [
    ...(bodyPoints.length >= 2 ? [pathNode(layer, `${layer.id}:body`, bodyPoints, style)] : []),
    ...arrowCapNodes(
      layer,
      `${layer.id}:start-cap`,
      arrow.start,
      angles.start,
      arrow.startCap,
      style,
      bodyPoints[0],
      arrow.startCap === 'solidArrow' || arrow.startCap === 'triangle' ? capSizes.start : undefined,
    ),
    ...arrowCapNodes(
      layer,
      `${layer.id}:end-cap`,
      arrow.end,
      angles.end,
      arrow.endCap,
      style,
      bodyPoints.at(-1),
      arrow.endCap === 'solidArrow' || arrow.endCap === 'triangle' ? capSizes.end : undefined,
    ),
  ]
  if (arrow.appearance !== 'handDrawn') return nodes
  return nodes.map((node) => handDrawnNode(node, layer))
}

function handDrawnNode(
  node: RenderNode,
  layer: ArrowLayer,
): RenderNode {
  if (
    node.kind !== 'path' &&
    node.kind !== 'polygon' &&
    node.kind !== 'ellipse'
  ) return node
  const seed = (layer.payload.sketchSeed ?? 1) + (node.id.endsWith(':start-cap') ? 104729 : 209458)
  const width = node.strokeWidth ?? layer.payload.stroke.width
  let points: readonly { x: number; y: number }[]
  if (node.kind === 'ellipse') {
    points = Array.from({ length: 25 }, (_, i) => ({
      x: node.centerX + Math.cos(i * Math.PI / 12) * node.radiusX,
      y: node.centerY + Math.sin(i * Math.PI / 12) * node.radiusY,
    }))
  } else points = node.kind === 'polygon' ? [...node.points, node.points[0]!] : node.points
  const body = node.id.endsWith(':body')
  const outline = body ? mapShapePath(
    arrowBodyGeometry(layer.payload).path, 1, 1,
    layer.transform.translateX, layer.transform.translateY,
  )
    : sketchPath(points, seed, Math.max(1, width), node.kind !== 'ellipse')
  const bounds = layer.localBounds
  const result: RenderVectorNode = {
    kind: 'vector', id: node.id,
    x: layer.transform.translateX + bounds.x, y: layer.transform.translateY + bounds.y,
    width: bounds.width, height: bounds.height,
    outline: node.kind === 'polygon' || node.kind === 'ellipse' ? [...outline, ['Z']] : outline,
    details: [], open: node.kind === 'path',
    fill: node.kind === 'path' ? TRANSPARENT : node.fill,
    stroke: node.stroke ?? TRANSPARENT, strokeWidth: width,
    lineCap: 'round', lineJoin: 'round',
    ...('dash' in node && node.dash ? { dash: node.dash } : {}),
    rotation: layer.transform.rotation, opacity: layerOpacity(layer),
    visible: layer.visible, blendMode: layerBlendMode(layer),
  }
  return result
}
