import { mapShapePath } from '../../shapes'
import { sketchPath } from '../../sketch-geometry'
import type { RenderVectorNode } from '../../scene/contracts'
import {
  arrowBodyGeometry,
  arrowEndpointAngles,
  arrowPathPoints,
  scaledClosedArrowCapSizes,
  trimArrowBodyPoints,
  arrowCapSize,
} from '../../arrow-geometry'
import type { RenderNode } from '../../scene/contracts'
import type {
  ArrowCap,
  ArrowLayer,
  ArrowLayerPayload,
  LayerNode,
} from '../types'
import {
  TRANSPARENT,
  layerBlendMode,
  layerOpacity,
  pathNode,
  stroke,
} from './shared'

function capNodeCommon(layer: LayerNode) {
  return {
    rotation: layer.transform.rotation,
    opacity: layerOpacity(layer),
    visible: layer.visible,
    blendMode: layerBlendMode(layer),
  }
}

export function arrowCapNodes(
  layer: LayerNode,
  id: string,
  point: { readonly x: number; readonly y: number },
  angle: number,
  cap: ArrowCap | 'ring',
  style: ReturnType<typeof stroke>,
  bodyJoin?: { readonly x: number; readonly y: number },
  renderedSize?: number,
): readonly RenderNode[] {
  if (cap === 'none') return []
  const anchor = {
    x: layer.transform.translateX + point.x,
    y: layer.transform.translateY + point.y,
  }
  if (cap === 'circle' || cap === 'ring') return roundCapNodes(layer, id, anchor, cap, style, renderedSize)
  const size = renderedSize ?? arrowCapSize(cap, style.width)
  const behind =
    bodyJoin && (cap === 'solidArrow' || cap === 'triangle')
      ? {
          x: layer.transform.translateX + bodyJoin.x,
          y: layer.transform.translateY + bodyJoin.y,
        }
      : {
          x: anchor.x - Math.cos(angle) * size,
          y: anchor.y - Math.sin(angle) * size,
        }
  const capAngle =
    bodyJoin && (cap === 'solidArrow' || cap === 'triangle')
      ? Math.atan2(anchor.y - behind.y, anchor.x - behind.x)
      : angle
  const perpendicular = {
    x: Math.cos(capAngle + Math.PI / 2),
    y: Math.sin(capAngle + Math.PI / 2),
  }
  const left = {
    x: behind.x + perpendicular.x * size * 0.55,
    y: behind.y + perpendicular.y * size * 0.55,
  }
  const right = {
    x: behind.x - perpendicular.x * size * 0.55,
    y: behind.y - perpendicular.y * size * 0.55,
  }
  if (cap === 'solidArrow' || cap === 'triangle') {
    return [
      {
        ...capNodeCommon(layer),
        kind: 'polygon' as const,
        id,
        points: [anchor, left, right],
        fill: cap === 'solidArrow' ? style.color : TRANSPARENT,
        stroke: style.color,
        strokeWidth: cap === 'solidArrow' ? Math.max(1, style.width / 2) : style.width,
        lineJoin: style.join,
      },
    ]
  }
  if (cap === 'lineArrow') {
    return [
      {
        ...capNodeCommon(layer),
        kind: 'path' as const,
        id,
        points: [left, anchor, right],
        stroke: style.color,
        strokeWidth: style.width,
        lineCap: style.cap,
        lineJoin: style.join,
      },
    ]
  }
  if (cap === 'diamond') {
    const forward = {
      x: anchor.x + Math.cos(angle) * size * 0.65,
      y: anchor.y + Math.sin(angle) * size * 0.65,
    }
    const back = {
      x: anchor.x - Math.cos(angle) * size * 0.65,
      y: anchor.y - Math.sin(angle) * size * 0.65,
    }
    const diamondLeft = {
      x: anchor.x + perpendicular.x * size * 0.55,
      y: anchor.y + perpendicular.y * size * 0.55,
    }
    const diamondRight = {
      x: anchor.x - perpendicular.x * size * 0.55,
      y: anchor.y - perpendicular.y * size * 0.55,
    }
    return [
      {
        ...capNodeCommon(layer),
        kind: 'polygon' as const,
        id,
        points: [forward, diamondLeft, back, diamondRight],
        fill: style.color,
        stroke: style.color,
        strokeWidth: Math.max(1, style.width / 2),
        lineJoin: style.join,
      },
    ]
  }
  return []
}

export function arrowNodes(layer: ArrowLayer): readonly RenderNode[] {
  const arrow = layer.payload as ArrowLayerPayload
  const style = stroke(arrow.stroke)
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

function roundCapNodes(
  layer: LayerNode,
  id: string,
  anchor: { x: number; y: number },
  cap: 'circle' | 'ring',
  style: ReturnType<typeof stroke>,
  renderedSize?: number,
): readonly RenderNode[] {
  return [
    {
      ...capNodeCommon(layer),
      kind: 'ellipse' as const,
      id,
      centerX: anchor.x,
      centerY: anchor.y,
      radiusX: renderedSize === undefined ? style.width : renderedSize / 2,
      radiusY: renderedSize === undefined ? style.width : renderedSize / 2,
      fill: cap === 'ring' ? TRANSPARENT : style.color,
      stroke: style.color,
      strokeWidth: renderedSize !== undefined && cap === 'circle' ? 0 : Math.max(1, style.width / 2),
      lineJoin: style.join,
    },
  ]

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
    ...capNodeCommon(layer),
  }
  return result
}
