import {
  calloutHasLabel,
  calloutTextLayout,
  calloutPathPoints,
  calloutGeometryContext,
  canRemoveCalloutStep,
  removeCalloutStepAt,
  type CalloutLayer,
  type SelectionTarget,
} from '@cute-screen/editor-renderer'
import { transformCanvasPoint } from './geometry-controller'
import type { CanvasGesture } from './workspace-state'
import type { CanvasPoint } from './contracts'

export function drawCalloutTextFrame(
  context: CanvasRenderingContext2D,
  layer: CalloutLayer,
  zoom: number,
): void {
  if (!calloutHasLabel(layer.payload)) return
  const rect = calloutTextLayout(layer.payload).text
  const transform = layer.transform
  const scale = zoom * Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY), 1)
  context.save()
  context.translate(transform.translateX, transform.translateY)
  context.rotate(transform.rotation * Math.PI / 180)
  context.scale(transform.scaleX, transform.scaleY)
  context.strokeStyle = '#0d99ff'
  context.lineWidth = 1 / scale
  context.setLineDash([])
  context.strokeRect(rect.x, rect.y, rect.width, rect.height)
  context.restore()
}

function removalSegment(
  layer: CalloutLayer,
  hover: SelectionTarget | undefined,
  gesture: CanvasGesture,
  alt: boolean,
): number | undefined {
  if (gesture) return gesture.kind === 'calloutHandle' && gesture.id === layer.id && !gesture.removal?.cancelled
    ? gesture.removal?.segment : undefined
  if (
    !alt ||
    hover?.kind !== 'handle' ||
    hover.target.kind !== 'callout'
  ) return undefined
  const handle = hover.target.handle
  const segment = handle.startsWith('segment:') ? Number(handle.split(':')[1]) : -1
  return canRemoveCalloutStep(layer.payload, segment, calloutGeometryContext()) ? segment : undefined
}

function strokePoints(
  context: CanvasRenderingContext2D,
  points: readonly CanvasPoint[],
): void {
  context.beginPath()
  points.forEach((p, i) => i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y))
  context.stroke()
}

export function drawCalloutRemovalPreview(
  context: CanvasRenderingContext2D,
  layer: CalloutLayer,
  hover: SelectionTarget | undefined,
  gesture: CanvasGesture,
  alt: boolean,
  zoom: number,
): void {
  const segment = removalSegment(layer, hover, gesture, alt)
  if (segment === undefined) return
  const geometry = calloutGeometryContext()
  const points = calloutPathPoints(layer.payload, geometry)
  const after = removeCalloutStepAt(layer, segment, geometry)
  const proposed = calloutPathPoints(after.payload, geometry).map((p) => transformCanvasPoint(after.transform, p))
  const a = transformCanvasPoint(layer.transform, points[segment]!)
  const b = transformCanvasPoint(layer.transform, points[segment + 1]!)
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  context.save()
  context.strokeStyle = '#f34e58'
  context.lineWidth = 4 / zoom
  strokePoints(context, points.slice(segment - 1, segment + 3).map((p) => transformCanvasPoint(layer.transform, p)))
  context.strokeStyle = '#0d99ff'
  context.lineWidth = 2 / zoom
  context.setLineDash([5 / zoom, 3 / zoom])
  strokePoints(context, proposed)
  context.setLineDash([])
  context.beginPath()
  context.arc(center.x, center.y, 7 / zoom, 0, Math.PI * 2)
  context.fillStyle = '#0d99ff'
  context.fill()
  context.strokeStyle = '#fff'
  strokePoints(context, [{ x: center.x - 4 / zoom, y: center.y }, { x: center.x + 4 / zoom, y: center.y }])
  context.restore()
}
