import type {
  Point,
  Transform2D,
} from './document/types'
import { transformToMatrix } from './geometry'

/** CSS-space stroke distance, independent of DPR and of unequal canvas/image scales. */
export function createStrokeHitMetric(
  transform: Transform2D,
  screenScale: Point,
  margin: number,
) {
  const matrix = transformToMatrix(transform)
  const a = matrix.a * screenScale.x
  const b = matrix.b * screenScale.y
  const c = matrix.c * screenScale.x
  const d = matrix.d * screenScale.y
  const screen = (p: Point): Point => ({ x: a * p.x + c * p.y, y: b * p.x + d * p.y })
  return (point: Point, start: Point, end: Point, radius: number): boolean => {
    const p = screen(point)
    const s = screen(start)
    const e = screen(end)
    const dx = e.x - s.x
    const dy = e.y - s.y
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / lengthSquared))
    const nx = p.x - s.x - t * dx
    const ny = p.y - s.y - t * dy
    const distance = Math.hypot(nx, ny)
    if (distance === 0) return true
    const widthScale = Math.hypot(a * nx + b * ny, c * nx + d * ny) / distance
    return distance <= radius * widthScale + margin + 1e-9
  }
}
export type StrokeHitMetric = ReturnType<typeof createStrokeHitMetric>
