import {
  gradientFrame,
  isGradientLayer,
  snapGradientMove,
} from '@cute-screen/editor-renderer'
import type {
  CanvasPoint,
  CanvasViewportProps,
} from './contracts'
import type { CanvasGesture } from './workspace-state'

type MoveGesture = Extract<CanvasGesture, { readonly kind: 'move' }>

/** Share the same magnetic delta between scene preview and pointerup commit. */
export function updateGradientMove(
  gesture: MoveGesture,
  point: CanvasPoint,
  props: CanvasViewportProps,
  enabled: boolean,
): MoveGesture | undefined {
  const document = props.document
  const selected = gesture.nodeIds ?? props.selectedLayerIds ?? [gesture.id]
  if (
    !document ||
    props.readOnly ||
    selected.length !== 1 ||
    selected[0] !== gesture.id
  ) return undefined
  const layer = document.layers.find((candidate) => candidate.id === gesture.id)
  if (
    !isGradientLayer(layer) ||
    layer.locked ||
    !layer.visible
  ) return undefined
  const result = snapGradientMove(layer, {
    x: point.x - gesture.start.x,
    y: point.y - gesture.start.y,
  }, gradientFrame(document), {
    zoom: (props.zoom ?? 100) / 100,
    previous: gesture.gradientSnap,
    enabled,
  })
  return {
    ...gesture,
    current: { x: gesture.start.x + result.delta.x, y: gesture.start.y + result.delta.y },
    gradientSnap: result.state,
    dragging: true,
    guides: [],
    guidesVisible: false,
  }
}
