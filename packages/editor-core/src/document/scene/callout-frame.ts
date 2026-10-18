import type {
  CalloutLayer,
  Rect,
} from '../types'
import type { RenderNode } from '../../scene/contracts'
import {
  calloutTextRect,
  calloutTextLayout,
  calloutHasLabel,
  calloutAccentSide,
  type CalloutGeometryContext,
} from '../../callout-geometry'
import {
  color,
  stroke,
} from './shared'
export function calloutFrameNodes(
  layer: CalloutLayer,
  context: CalloutGeometryContext,
): readonly RenderNode[] {
  const payload = layer.payload
  if (!calloutHasLabel(payload)) return []
  const layout = calloutTextLayout(payload, context)
  const common = { rotation: layer.transform.rotation, opacity: 1, visible: layer.visible, blendMode: 'normal' as const }
  const bounds = calloutTextRect(payload, context)
  const frame = payload.frame
  const fill = frame ? frame.kind === 'card' || frame.kind === 'capsule' ? color(frame.fill) : undefined
    : layout.background ? color(layout.background.color) : undefined
  const border = frame?.kind === 'text' || frame?.kind === 'accent' ? null : frame?.border
  const borderStyle = border ? stroke(border) : undefined
  const backgroundNodes: RenderNode[] = fill || borderStyle ? [{
    ...common, id: `${layer.id}:background`, kind: 'rect',
    x: layer.transform.translateX + bounds.x, y: layer.transform.translateY + bounds.y,
    width: bounds.width, height: bounds.height,
    cornerRadius: frame?.kind === 'capsule' ? bounds.height / 2
      : Math.min(frame?.radius ?? layout.background?.radius ?? 0, bounds.width / 2, bounds.height / 2),
    fill: fill ?? { red: 0, green: 0, blue: 0, alpha: 0 },
    ...(borderStyle ? { stroke: borderStyle.color, strokeWidth: borderStyle.width, lineJoin: borderStyle.join,
      lineCap: borderStyle.cap } : {}),
  }] : []
  if (frame?.kind === 'accent') {
    backgroundNodes.push(accentNode(layer, bounds, context))
  }
  return backgroundNodes
}

function accentNode(
  layer: CalloutLayer,
  bounds: Rect,
  context: CalloutGeometryContext,
): RenderNode {
  const side = calloutAccentSide(layer.payload, context)
  const vertical = side === 'left' || side === 'right'
  const width = Math.max(2, layer.payload.frame?.border?.width ?? 3)
  return {
    rotation: layer.transform.rotation, opacity: 1, visible: layer.visible, blendMode: 'normal',
    id: `${layer.id}:background`, kind: 'rect',
    x: layer.transform.translateX + bounds.x + (side === 'right' ? bounds.width - width : 0),
    y: layer.transform.translateY + bounds.y + (side === 'bottom' ? bounds.height - width : 0),
    width: vertical ? width : bounds.width, height: vertical ? bounds.height : width,
    fill: color(layer.payload.frame?.border?.color ?? layer.payload.stroke.color),
  }
}
