import type {
  Point,
  Rect,
} from './document/types'

/** Layout only: source pixels and intrinsic dimensions remain immutable. */
export function imagePlacement(
  width: number,
  height: number,
  bounds: Rect,
  center: Point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
): { readonly scale: number; readonly x: number; readonly y: number } {
  if (![width, height, bounds.width, bounds.height].every((value) => Number.isFinite(value) && value > 0) ||
    ![bounds.x, bounds.y, center.x, center.y].every(Number.isFinite)) {
    throw new Error('Image placement requires finite dimensions and visible bounds')
  }
  const scale = Math.min(1, bounds.width * 0.8 / width, bounds.height * 0.8 / height)
  const w = width * scale
  const h = height * scale
  return {
    scale,
    x: Math.max(bounds.x, Math.min(bounds.x + bounds.width - w, center.x - w / 2)),
    y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - h, center.y - h / 2)),
  }
}
