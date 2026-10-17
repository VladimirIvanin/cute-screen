import type { CalloutLayer } from '../types'
import type { RenderNode } from '../../scene/contracts'
import {
  calloutTextRect,
  calloutTextLayout,
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
  if (frame?.kind === 'accent') backgroundNodes.push({
    ...common, id: `${layer.id}:background`, kind: 'rect',
    x: layer.transform.translateX + bounds.x, y: layer.transform.translateY + bounds.y,
    width: Math.max(2, frame.border?.width ?? 3), height: bounds.height,
    fill: color(frame.border?.color ?? payload.stroke.color),
  })
  return backgroundNodes
}
