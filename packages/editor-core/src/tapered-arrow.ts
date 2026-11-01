import type {
  ArrowLayerPayload,
  Point,
} from './document/types'
import {
  arrowPathPoints,
  trimArrowBodyPoints,
  arrowEndpointAngles,
  scaledClosedArrowCapSizes,
} from './arrow-route'
import {
  flattenShapePath,
  type ShapePathCommand,
} from './shapes'

/** A single filled silhouette prevents translucent seams between shaft and head. */
export function taperedArrowGeometry(payload: ArrowLayerPayload): readonly ShapePathCommand[] {
  const { width, length, sizes, body, angles } = taperedArrowMetrics(payload)
  if (length < .001) return []
  if (body.length < 2) {
    if (payload.startCap !== 'solidArrow' && payload.endCap !== 'solidArrow') return []
    const tip = sizes.end > 0 ? payload.end : payload.start
    const angle = sizes.end > 0 ? angles.end : angles.start
    const size = sizes.end || sizes.start
    const back = { x: tip.x - Math.cos(angle) * size, y: tip.y - Math.sin(angle) * size }
    const triangle = [offset(back, angle, size * .55), tip, offset(back, angle, -size * .55)]
    return roundedOutline(triangle, Math.min(width * .35, length * .04))
  }
  const lengths = body.slice(1).map((p, i) => Math.hypot(p.x - body[i]!.x, p.y - body[i]!.y))
  const total = lengths.reduce((sum, value) => sum + value, 0)
  const left: Point[] = [], right: Point[] = []
  let travelled = 0
  for (let i = 0; i < body.length; i++) {
    if (i > 0) travelled += lengths[i - 1]!
    const t = total > 0 ? travelled / total : 0
    const progress = sizes.start > 0 ? (sizes.end > 0 ? Math.abs(2 * t - 1) : 1 - t) : t
    const maximumHalf = Math.max(width * 1.25, Math.max(sizes.start, sizes.end) * .2)
    const half = width * .35 + (maximumHalf - width * .35) * progress
    const before = body[Math.max(0, i - 1)]!, after = body[Math.min(body.length - 1, i + 1)]!
    const angle = Math.atan2(after.y - before.y, after.x - before.x)
    left.push(offset(body[i]!, angle, half))
    right.push(offset(body[i]!, angle, -half))
  }
  if (payload.stroke.style !== 'solid') return dashedOutline(payload, body, left, right, lengths, total, sizes, angles)
  // Closed solid heads share the same outline as the variable-width shaft.
  const outline = [...left]
  if (payload.endCap === 'solidArrow') outline.push(
    offset(body.at(-1)!, angles.end, sizes.end * .55), payload.end,
    offset(body.at(-1)!, angles.end, -sizes.end * .55),
  )
  outline.push(...right.reverse())
  if (payload.startCap === 'solidArrow') outline.push(
    offset(body[0]!, angles.start, sizes.start * .55), payload.start,
    offset(body[0]!, angles.start, -sizes.start * .55),
  )
  return roundedOutline(outline, Math.min(width * .35, length * .04))
}

function offset(
  p: Point,
  angle: number,
  distance: number,
): Point {
  return { x: p.x - Math.sin(angle) * distance, y: p.y + Math.cos(angle) * distance }
}

function roundedOutline(
  points: readonly Point[],
  radius: number,
): readonly ShapePathCommand[] {
  const path: ShapePathCommand[] = []
  for (let i = 0; i < points.length; i++) {
    const previous = points[(i + points.length - 1) % points.length]!
    const p = points[i]!, next = points[(i + 1) % points.length]!
    const a = Math.hypot(p.x - previous.x, p.y - previous.y), b = Math.hypot(next.x - p.x, next.y - p.y)
    const r = Math.min(radius, a / 2, b / 2)
    const enter = { x: p.x + (previous.x - p.x) * r / (a || 1), y: p.y + (previous.y - p.y) * r / (a || 1) }
    const leave = { x: p.x + (next.x - p.x) * r / (b || 1), y: p.y + (next.y - p.y) * r / (b || 1) }
    path.push([i === 0 ? 'M' : 'L', enter.x, enter.y], ['C',
      enter.x + (p.x - enter.x) * 2 / 3, enter.y + (p.y - enter.y) * 2 / 3,
      leave.x + (p.x - leave.x) * 2 / 3, leave.y + (p.y - leave.y) * 2 / 3, leave.x, leave.y])
  }
  path.push(['Z'])
  return path
}

export function taperedArrowMetrics(payload: ArrowLayerPayload) {
  const route = arrowPathPoints(payload)
  const width = payload.stroke.width
  const length = route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route[i]!.x, p.y - route[i]!.y), 0)
  const heads = Number(payload.startCap === 'solidArrow' || payload.startCap === 'triangle') +
    Number(payload.endCap === 'solidArrow' || payload.endCap === 'triangle')
  const capWidth = Math.min(Math.max(width * 6, length * .24), width * 16, length * .6 / Math.max(1, heads)) / 3
  const sizes = scaledClosedArrowCapSizes(route, payload.startCap, payload.endCap, capWidth)
  const body = trimArrowBodyPoints(route, payload.startCap, payload.endCap, capWidth)
  const angles = arrowEndpointAngles(route)
  return { route, width, length, sizes, body, angles }
}

export function taperedArrowBoundsPoints(payload: ArrowLayerPayload): readonly Point[] {
  const { route, sizes } = taperedArrowMetrics(payload)
  const points = [...route, ...flattenShapePath(taperedArrowGeometry(payload), .1).flat()]
  for (const endpoint of ['start', 'end'] as const) {
    const cap = payload[`${endpoint}Cap`]
    if (cap === 'none' || cap === 'solidArrow') continue
    const radius = cap === 'triangle' ? sizes[endpoint] + payload.stroke.width : payload.stroke.width * 3 + 8
    const anchor = payload[endpoint]
    points.push({ x: anchor.x - radius, y: anchor.y - radius }, { x: anchor.x + radius, y: anchor.y + radius })
  }
  return points
}

function dashedOutline(
  payload: ArrowLayerPayload,
  body: readonly Point[],
  left: readonly Point[],
  right: readonly Point[],
  lengths: readonly number[],
  total: number,
  sizes: { start: number; end: number },
  angles: { start: number; end: number },
): readonly ShapePathCommand[] {
  const width = payload.stroke.width
  const at = (distance: number, edge: readonly Point[]): Point => {
    let travelled = 0
    for (let i = 0; i < lengths.length; i++) {
      const length = lengths[i]!
      if (length > 0 && distance <= travelled + length) {
        const t = (distance - travelled) / length
        return { x: edge[i]!.x + (edge[i + 1]!.x - edge[i]!.x) * t,
          y: edge[i]!.y + (edge[i + 1]!.y - edge[i]!.y) * t }
      }
      travelled += length
    }
    return edge.at(-1)!
  }
  const path: ShapePathCommand[] = []
  const step = Math.max(width * 5, total / 4096)
  for (let start = 0; start < total; start += step) {
    if (payload.stroke.style === 'dotted') {
      path.push(...dotOutline(at(start, left), at(start, right)))
      continue
    }
    const end = Math.min(total, start + step * .6)
    const segmentLeft = [at(start, left)], segmentRight = [at(start, right)]
    let distance = 0
    for (let i = 1; i < body.length; i++) {
      distance += lengths[i - 1]!
      if (distance > start && distance < end) {
        segmentLeft.push(left[i]!)
        segmentRight.push(right[i]!)
      }
    }
    segmentLeft.push(at(end, left))
    segmentRight.push(at(end, right))
    path.push(...roundedOutline([...segmentLeft, ...segmentRight.reverse()], width * .35))
  }
  if (payload.endCap === 'solidArrow') path.push(...roundedOutline([
    offset(body.at(-1)!, angles.end, sizes.end * .55), payload.end, offset(body.at(-1)!, angles.end, -sizes.end * .55),
  ], width * .35))
  if (payload.startCap === 'solidArrow') path.push(...roundedOutline([
    offset(body[0]!, angles.start, sizes.start * .55), payload.start,
    offset(body[0]!, angles.start, -sizes.start * .55),
  ], width * .35))
  return path
}

function dotOutline(
  left: Point,
  right: Point,
): readonly ShapePathCommand[] {
  const x = (left.x + right.x) / 2, y = (left.y + right.y) / 2
  const r = Math.hypot(left.x - right.x, left.y - right.y) / 2
  const k = r * .5522847498
  return [['M', x + r, y], ['C', x + r, y + k, x + k, y + r, x, y + r],
    ['C', x - k, y + r, x - r, y + k, x - r, y],
    ['C', x - r, y - k, x - k, y - r, x, y - r],
    ['C', x + k, y - r, x + r, y - k, x + r, y], ['Z']]
}
