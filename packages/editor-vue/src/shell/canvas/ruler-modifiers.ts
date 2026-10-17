import { snapRulerEndpoint } from '@cute-screen/editor-renderer'
import type { CanvasPoint } from './contracts'
import {
  DEFAULT_PRECISION_TOOLS,
  type CanvasGesture,
} from './workspace-state'

type Modifiers = Pick<KeyboardEvent, 'shiftKey' | 'altKey'>
type PrecisionGesture = Extract<CanvasGesture, { readonly kind: 'precision' }>

export function rulerAngleStep(
  modifiers: Modifiers,
  configured: number,
): number | undefined {
  return modifiers.shiftKey ? 45 : modifiers.altKey ? configured : undefined
}

export function updateRulerPointer(
  gesture: PrecisionGesture,
  point: CanvasPoint,
  modifiers: Modifiers,
  configured = DEFAULT_PRECISION_TOOLS.ruler.snapAngleIncrementDegrees,
) {
  const step = rulerAngleStep(modifiers, gesture.precisionDefaults?.ruler.snapAngleIncrementDegrees ?? configured)
  const snapped = step === undefined ? undefined : snapRulerEndpoint(gesture.start, point, step)
  return {
    gesture: { ...gesture, rawCurrent: point, current: snapped?.end ?? point,
      guidesHeld: modifiers.altKey, snapAngleIncrementDegrees: step },
    guide: snapped?.guide,
  }
}
