import type {
  Point,
  Rect,
} from '../../document/types'
import {
  GEOMETRY_EPSILON,
  assertPoint,
} from './shared'

/** Non-collinearity, not signed shoelace area: a figure-eight can have zero
 * signed area while both lobes are visibly filled with the nonzero rule. */
export function hasFreeformArea(points: readonly Point[]): boolean {
  const first = points[0]
  if (!first) return false
  const next = points.find((point) => point.x !== first.x || point.y !== first.y)
  return Boolean(next && points.some((point) => Math.abs(orientation(first, next, point)) > GEOMETRY_EPSILON))
}

function orientation(
  a: Point,
  b: Point,
  c: Point,
): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function between(
  value: number,
  start: number,
  end: number,
): boolean {
  return value >= Math.min(start, end) - GEOMETRY_EPSILON && value <= Math.max(start, end) + GEOMETRY_EPSILON
}

function pointOnSegment(
  point: Point,
  start: Point,
  end: Point,
): boolean {
  return (
    Math.abs(orientation(start, end, point)) <= GEOMETRY_EPSILON &&
    between(point.x, start.x, end.x) &&
    between(point.y, start.y, end.y)
  )
}

export function assertValidFreeformPolygon(
  points: readonly Point[],
  field = 'freeform polygon',
): void {
  if (points.length < 3 || points.length > 2_048) {
    throw new RangeError(`${field} must contain 3 to 2048 points`)
  }
  points.forEach((point, index) => assertPoint(point, `${field}[${index}]`))
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!
    const next = points[(index + 1) % points.length]!
    if (point.x === next.x && point.y === next.y) {
      throw new RangeError(`${field} has a zero-length edge`)
    }
  }
  if (!hasFreeformArea(points)) {
    throw new RangeError(`${field} must contain non-collinear points`)
  }
}

export function pointsBounds(points: readonly Point[]): Rect {
  if (points.length === 0) throw new RangeError('points must not be empty')
  points.forEach((point, index) => assertPoint(point, `points[${index}]`))
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return Object.freeze({
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  })
}

export function pointInPolygon(
  point: Point,
  points: readonly Point[],
): boolean {
  let winding = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!
    const next = points[(index + 1) % points.length]!
    if (pointOnSegment(point, current, next)) return true
    const side = orientation(current, next, point)
    if (
      current.y <= point.y &&
      next.y > point.y &&
      side > GEOMETRY_EPSILON
    ) winding++
    else if (
      current.y > point.y &&
      next.y <= point.y &&
      side < -GEOMETRY_EPSILON
    ) winding--
  }
  return winding !== 0
}
