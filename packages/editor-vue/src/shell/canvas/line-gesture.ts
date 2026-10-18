import {
  annotationTool,
  resolveLineEndpoint,
} from '@cute-screen/editor-renderer'
import type { CanvasGesture } from './workspace-state'
import type {
  CanvasPoint,
  CanvasViewportProps,
} from './contracts'

type LineGesture = Extract<NonNullable<CanvasGesture>, { kind: 'draw' | 'arrowHandle' }>

export function updateLineGesture(
  gesture: LineGesture,
  point: CanvasPoint,
  shift: boolean,
  alt: boolean,
  props: Pick<CanvasViewportProps, 'document' | 'drawingDefaults'>,
): LineGesture {
  if (gesture.kind === 'draw') {
    if (gesture.tool !== 'line') return gesture
    const defaults = gesture.drawingDefaults ?? props.drawingDefaults
    const result = resolveLineEndpoint(gesture.start, point, {
      enabled: defaults?.line.autoAlignAxes !== false, shift, axis: gesture.lineAxis,
    })
    return { ...gesture, current: result.point, rawCurrent: point, lineAxis: result.axis,
      constrainAngle: false, drawFromCenter: alt }
  }
  const layer = props.document?.layers.find((entry) => entry.id === gesture.id)
  if (
    !layer ||
    layer.kind !== 'arrow' ||
    annotationTool(layer) !== 'line'
  ) return gesture
  const anchor = gesture.handle === 'start' ? layer.payload.end : layer.payload.start
  const transform = layer.transform
  const radians = transform.rotation * Math.PI / 180
  const x = anchor.x * transform.scaleX
  const y = anchor.y * transform.scaleY
  const worldAnchor = { x: x * Math.cos(radians) - y * Math.sin(radians) + transform.translateX,
    y: x * Math.sin(radians) + y * Math.cos(radians) + transform.translateY }
  const result = resolveLineEndpoint(worldAnchor, point, {
    enabled: props.drawingDefaults?.line.autoAlignAxes !== false, shift, axis: gesture.lineAxis,
  })
  return { ...gesture, current: result.point, rawCurrent: point, lineAxis: result.axis }
}
