import {
  moveCrop,
  resizeCrop,
  snapFrameMove,
  snapFrameResizePoint,
  type BoundsResizeHandle,
} from '@cute-screen/editor-renderer'
import type {
  CanvasPoint,
  CanvasViewportProps,
} from './contracts'
import type { CropController } from './crop-controller'
import type { CanvasGesture } from './workspace-state'

type CropGesture = Extract<CanvasGesture, { readonly kind: 'crop' }>
const handles = { north: 'n', northEast: 'ne', east: 'e', southEast: 'se', south: 's', southWest: 'sw', west: 'w', northWest: 'nw' } as const

export function updateCropGesture(
  gesture: CropGesture,
  point: CanvasPoint,
  props: CanvasViewportProps,
  crop: CropController,
  enabled: boolean,
  zoom = (props.zoom ?? 100) / 100,
): CropGesture {
  const initial = gesture.initial
  const frame = { x: 0, y: 0, ...initial.canvas }
  let delta = { x: point.x - gesture.start.x, y: point.y - gesture.start.y }
  enabled = enabled && (delta.x !== 0 || delta.y !== 0)
  if (gesture.action === 'move') {
    const result = snapFrameMove(initial.crop, delta, frame, { zoom, enabled, previous: gesture.frameSnap })
    crop.session = moveCrop(initial, result.delta)
    return { ...gesture, frameSnap: result.state }
  }
  if (enabled && gesture.handle) {
    const handle: BoundsResizeHandle = handles[gesture.handle]
    const origin = { x: initial.crop.x + (handle.includes('w') ? 0 : handle.includes('e') ? initial.crop.width : initial.crop.width / 2),
      y: initial.crop.y + (handle.includes('n') ? 0 : handle.includes('s') ? initial.crop.height : initial.crop.height / 2) }
    const snapped = snapFrameResizePoint(initial.crop, handle, { x: origin.x + delta.x, y: origin.y + delta.y },
      frame, { zoom, preserveAspect: initial.preset !== 'free' })
    delta = { x: snapped.x - origin.x, y: snapped.y - origin.y }
  }
  crop.session = resizeCrop(initial, gesture.handle!, delta)
  return gesture
}
