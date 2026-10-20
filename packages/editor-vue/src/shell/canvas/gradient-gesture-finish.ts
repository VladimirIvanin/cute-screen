import {
  gradientFrame,
  isGradientLayer,
  snapGradientPoint,
} from '@cute-screen/editor-renderer'
import { updateGradientMove } from './gradient-move-gesture'
import type {
  CanvasPoint,
  CanvasViewportProps,
} from './contracts'
import type { CanvasGesture } from './workspace-state'

export function finishGradientGeometry(
  props: CanvasViewportProps,
  completed: CanvasGesture,
  end: CanvasPoint | undefined,
  event: Pick<PointerEvent, 'ctrlKey' | 'metaKey'>,
): CanvasGesture {
  if (!end || !props.document) return completed
  if (completed?.kind === 'move' && completed.dragging) {
    return updateGradientMove(completed, end, props, !event.ctrlKey && !event.metaKey) ?? completed
  }
  const drawing = completed?.kind === 'draw' && completed.tool === 'gradient'
  const resizing = completed?.kind === 'intrinsicResize' && isGradientLayer(completed.initial) &&
    Math.abs(completed.initial.transform.rotation % 360) < 1e-8
  if (drawing || resizing) {
    return { ...completed,
      current: snapGradientPoint(end, gradientFrame(props.document), (props.zoom ?? 100) / 100) }
  }
  return completed
}
