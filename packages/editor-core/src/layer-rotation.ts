import type {
  LayerNode,
  Transform2D,
} from './document/types'
import {
  transformPoint,
  transformToMatrix,
} from './geometry'

/** Set an absolute angle while preserving the bounds center in canvas coordinates. */
export function rotateLayerTransform(
  layer: Pick<LayerNode, 'localBounds' | 'transform'>,
  rotation: number,
): Transform2D {
  if (!Number.isFinite(rotation)) throw new Error('rotation must be finite')
  const initial = layer.transform
  if (initial.rotation === rotation) return initial
  const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  const before = transformPoint(transformToMatrix(initial), center)
  const rotated = { ...initial, rotation }
  const after = transformPoint(transformToMatrix(rotated), center)
  return Object.freeze({
    ...rotated,
    translateX: initial.translateX + before.x - after.x,
    translateY: initial.translateY + before.y - after.y,
  })
}
