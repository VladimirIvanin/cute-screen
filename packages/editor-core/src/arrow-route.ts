import type {
  ArrowCap,
  ArrowLayerPayload,
  JsonObject,
  Point,
} from './document/types'

const QUADRATIC_SEGMENTS = 16

function point(value: Point): Point & JsonObject {
  return Object.freeze({ x: value.x, y: value.y })
}

/** Renderer-neutral points for every persisted arrow route. */
export function arrowPathPoints(payload: ArrowLayerPayload): readonly Point[] {
  const start = point(payload.start)
  const end = point(payload.end)
  if (payload.path === 'straight') return Object.freeze([start, end])
  if (payload.path === 'quadratic') {
    const bend = payload.bend
    if (!bend) throw new Error('quadratic arrow bend is required')
    return Object.freeze(
      Array.from({ length: QUADRATIC_SEGMENTS + 1 }, (_, index) => {
        const progress = index / QUADRATIC_SEGMENTS
        const inverse = 1 - progress
        return point({
          x: inverse * inverse * start.x + 2 * inverse * progress * bend.x + progress * progress * end.x,
          y: inverse * inverse * start.y + 2 * inverse * progress * bend.y + progress * progress * end.y,
        })
      }),
    )
  }
  const elbow = payload.elbow
  if (!elbow) throw new Error('elbow arrow routing is required')
  if (elbow.axis === 'x') {
    const middleY = (start.y + end.y) / 2 + elbow.offset
    return Object.freeze([start, point({ x: start.x, y: middleY }), point({ x: end.x, y: middleY }), end])
  }
  const middleX = (start.x + end.x) / 2 + elbow.offset
  return Object.freeze([start, point({ x: middleX, y: start.y }), point({ x: middleX, y: end.y }), end])
}

function segmentAngle(
  start: Point,
  end: Point,
): number | undefined {
  return start.x === end.x && start.y === end.y ? undefined : Math.atan2(end.y - start.y, end.x - start.x)
}

/** Cap angles skip collapsed segments instead of producing unstable NaN output. */
export function arrowEndpointAngles(points: readonly Point[]): Readonly<{
  readonly start: number
  readonly end: number
}> {
  let first = 0
  for (let index = 1; index < points.length; index += 1) {
    const angle = segmentAngle(points[index - 1]!, points[index]!)
    if (angle !== undefined) {
      first = angle
      break
    }
  }
  let last = first
  for (let index = points.length - 1; index > 0; index -= 1) {
    const angle = segmentAngle(points[index - 1]!, points[index]!)
    if (angle !== undefined) {
      last = angle
      break
    }
  }
  return Object.freeze({ start: first + Math.PI, end: last })
}

export function arrowCapSize(
  cap: ArrowCap,
  strokeWidth: number,
): number {
  return cap === 'none' ? 0 : Math.max(strokeWidth * 3, 8)
}

function capBodyInset(
  cap: ArrowCap,
  strokeWidth: number,
): number {
  return cap === 'solidArrow' || cap === 'triangle' ? arrowCapSize(cap, strokeWidth) : 0
}

export function scaledClosedArrowCapSizes(
  points: readonly Point[],
  startCap: ArrowCap,
  endCap: ArrowCap,
  strokeWidth: number,
): Readonly<{ readonly start: number; readonly end: number }> {
  const start = capBodyInset(startCap, strokeWidth)
  const end = capBodyInset(endCap, strokeWidth)
  if (start === 0 && end === 0) return Object.freeze({ start, end })
  const total = points.slice(1).reduce((sum, entry, index) => {
    const previous = points[index]!
    return sum + Math.hypot(entry.x - previous.x, entry.y - previous.y)
  }, 0)
  const scale = Math.min(1, total / Math.max(start + end, 1))
  return Object.freeze({ start: start * scale, end: end * scale })
}

/** Trims closed triangular endpoints without splitting the body contour. */
export function trimArrowBodyPoints(
  points: readonly Point[],
  startCap: ArrowCap,
  endCap: ArrowCap,
  strokeWidth: number,
): readonly Point[] {
  const requestedStartInset = capBodyInset(startCap, strokeWidth)
  const requestedEndInset = capBodyInset(endCap, strokeWidth)
  const { start: startInset, end: endInset } = scaledClosedArrowCapSizes(points, startCap, endCap, strokeWidth)
  if (
    (requestedStartInset === 0 &&
      requestedEndInset === 0) ||
      points.length < 2
  ) return points
  const lengths = points
    .slice(1)
    .map((entry, index) => Math.hypot(entry.x - points[index]!.x, entry.y - points[index]!.y))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (total === 0) return Object.freeze([])
  const bodyStart = startInset
  const bodyEnd = total - endInset
  if (bodyEnd - bodyStart <= Number.EPSILON) return Object.freeze([])

  const at = (distance: number): Point => {
    let travelled = 0
    for (let index = 0; index < lengths.length; index += 1) {
      const length = lengths[index]!
      if (length === 0) continue
      if (distance <= travelled + length) {
        const start = points[index]!
        const end = points[index + 1]!
        const ratio = (distance - travelled) / length
        return point({
          x: start.x + (end.x - start.x) * ratio,
          y: start.y + (end.y - start.y) * ratio,
        })
      }
      travelled += length
    }
    return point(points.at(-1)!)
  }

  const body: Point[] = [at(bodyStart)]
  let travelled = 0
  for (let index = 0; index < lengths.length - 1; index += 1) {
    travelled += lengths[index]!
    if (travelled > bodyStart && travelled < bodyEnd) body.push(point(points[index + 1]!))
  }
  body.push(at(bodyEnd))
  return Object.freeze(body)
}
