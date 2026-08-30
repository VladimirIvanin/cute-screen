import type { Point, Rect } from '../../document/types'
import { GEOMETRY_EPSILON, assertPoint } from './shared'

function polygonArea(points: readonly Point[]): number {
  let twiceArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!
    const next = points[(index + 1) % points.length]!
    twiceArea += point.x * next.y - next.x * point.y
  }
  return twiceArea / 2
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function between(value: number, start: number, end: number): boolean {
  return (
    value >= Math.min(start, end) - GEOMETRY_EPSILON &&
    value <= Math.max(start, end) + GEOMETRY_EPSILON
  )
}

function pointOnSegment(point: Point, start: Point, end: Point): boolean {
  return (
    Math.abs(orientation(start, end, point)) <= GEOMETRY_EPSILON &&
    between(point.x, start.x, end.x) &&
    between(point.y, start.y, end.y)
  )
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  if (
    ((abC > GEOMETRY_EPSILON && abD < -GEOMETRY_EPSILON) ||
      (abC < -GEOMETRY_EPSILON && abD > GEOMETRY_EPSILON)) &&
    ((cdA > GEOMETRY_EPSILON && cdB < -GEOMETRY_EPSILON) ||
      (cdA < -GEOMETRY_EPSILON && cdB > GEOMETRY_EPSILON))
  ) {
    return true
  }
  return (
    pointOnSegment(c, a, b) ||
    pointOnSegment(d, a, b) ||
    pointOnSegment(a, c, d) ||
    pointOnSegment(b, c, d)
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
  if (Math.abs(polygonArea(points)) <= GEOMETRY_EPSILON) {
    throw new RangeError(`${field} must enclose a non-zero area`)
  }
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length
      const adjacent =
        first === second ||
        firstNext === second ||
        secondNext === first ||
        (first === 0 && secondNext === 0)
      if (adjacent) continue
      if (
        segmentsIntersect(
          points[first]!,
          points[firstNext]!,
          points[second]!,
          points[secondNext]!,
        )
      ) {
        throw new RangeError(`${field} must be a simple polygon`)
      }
    }
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
  for (let index = 0; index < points.length; index += 1) {
    if (
      pointOnSegment(
        point,
        points[index]!,
        points[(index + 1) % points.length]!,
      )
    ) {
      return true
    }
  }
  let inside = false
  for (
    let index = 0, previous = points.length - 1;
    index < points.length;
    previous = index++
  ) {
    const current = points[index]!
    const before = points[previous]!
    if (
      current.y > point.y !== before.y > point.y &&
      point.x <
        ((before.x - current.x) * (point.y - current.y)) /
          (before.y - current.y) +
          current.x
    ) {
      inside = !inside
    }
  }
  return inside
}
