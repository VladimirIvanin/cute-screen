import {
  gradientFrame,
  snapGradientPoint,
} from '@cute-screen/editor-renderer'
import type {
  CanvasPoint,
  CanvasViewportProps,
} from './contracts'
import type { CanvasGesture } from './workspace-state'

export function finishGradientGeometry(
  props: CanvasViewportProps,
  completed: CanvasGesture,
  end: CanvasPoint | undefined,
): CanvasGesture {
  if (!end || !props.document) return completed
  const drawing = completed?.kind === 'draw' && completed.tool === 'gradient'
  if (drawing) {
    return { ...completed,
      current: snapGradientPoint(end, gradientFrame(props.document), (props.zoom ?? 100) / 100) }
  }
  return completed
}
