import type {
  CalloutPayload,
  CalloutRoute,
  CalloutStyle,
  CalloutAttachment,
  Point,
  JsonObject,
} from './document/types'
import {
  calloutTextRect,
  type CalloutGeometryContext,
} from './callout-label-geometry'
import { calloutAttachmentRoute } from './callout-attachment-route'
function point(value: Point): Point & JsonObject {
  return Object.freeze({ x: value.x, y: value.y })
}
export function defaultCalloutAttachment(
  target: Point,
  label: Point,
): CalloutAttachment {
  if (Math.abs(label.x - target.x) + 1e-6 >= Math.abs(label.y - target.y)) return label.x >= target.x ? 'left' : 'right'
  return label.y >= target.y ? 'top' : 'bottom'
}
export function calloutStyleForPayload(payload: CalloutPayload): CalloutStyle | null {
  if (!payload.frame) return null
  return {
    frame: payload.frame,
    route: calloutRoutePreset(payload.route),
    targetMarker: payload.targetMarker,
    labelMarker: payload.labelMarker,
    ...(payload.targetMarkerStyle ? { targetMarkerStyle: payload.targetMarkerStyle } : {}),
    ...(payload.labelMarkerStyle ? { labelMarkerStyle: payload.labelMarkerStyle } : {}),
  }
}
export function calloutRoutePreset(route: CalloutRoute): CalloutStyle['route'] {
  return route.path === 'orthogonal' ? route.preset : route.path
}
/** Remove zero-length and collinear internal segments without moving endpoints. */
export function normalizeCalloutPoints(points: readonly Point[]): readonly (Point & JsonObject)[] {
  const result: (Point & JsonObject)[] = []
  for (const value of points) {
    const last = result.at(-1)
    if (
      last &&
      last.x === value.x &&
      last.y === value.y
    ) continue
    const before = result.at(-2)
    if (
      last &&
      before &&
      (before.x === last.x &&
        last.x === value.x ||
        before.y === last.y &&
        last.y === value.y)
    ) result.pop()
    result.push(point(value))
  }
  return Object.freeze(result)
}
/** One path shared by preview, export, bounds, handles and hit testing. */
function baseCalloutPathPoints(payload: CalloutPayload): readonly Point[] {
  const target = point(payload.target)
  const label = point(payload.label)
  const route = payload.route
  if (route.path === 'straight') return [target, label]
  if (route.path === 'orthogonal') return [target, ...route.points, label]
  if (route.path === 'corner') return normalizeCalloutPoints([target,
    route.axis === 'x' ? { x: label.x, y: target.y } : { x: target.x, y: label.y }, label])
  const elbow = route.elbow
  if (elbow.axis === 'x') {
    const middleY = (target.y + label.y) / 2 + elbow.offset
    return [target, point({ x: target.x, y: middleY }), point({ x: label.x, y: middleY }), label]
  }
  const middleX = (target.x + label.x) / 2 + elbow.offset
  return [target, point({ x: middleX, y: target.y }), point({ x: middleX, y: label.y }), label]
}
export function calloutPathPoints(
  payload: CalloutPayload,
  context: CalloutGeometryContext = {},
): readonly Point[] {
  const points = baseCalloutPathPoints(payload)
  if (!payload.attachment) return points
  return normalizeCalloutPoints(calloutAttachmentRoute(points, payload.attachment,
    calloutTextRect(payload, context), Math.max(12, payload.stroke.width * 2)))
}
export function defaultCalloutRoute(
  target: Point,
  label: Point,
): CalloutRoute {
  return { path: 'corner', axis: Math.abs(label.x - target.x) + 1e-6 >= Math.abs(label.y - target.y) ? 'y' : 'x' }
}
export function manualRoute(
  payload: CalloutPayload,
  points: readonly Point[],
): CalloutRoute {
  const route = payload.route
  const axis = route.path === 'elbow' ? route.elbow.axis : route.path === 'straight' ? 'y' : route.axis
  return { path: 'orthogonal', preset: calloutRoutePreset(route) === 'elbow' ? 'elbow' : 'corner', axis,
    points: normalizeCalloutPoints(points).slice(1, -1) }
}
export function moveCalloutEndpoint(
  current: CalloutPayload,
  handle: 'target' | 'label',
  nextPoint: Point,
): CalloutPayload {
  let payload = { ...current, [handle]: point(nextPoint) }
  if (current.route.path === 'orthogonal') {
    const points = current.route.points.map((p) => ({ ...p }))
    const index = handle === 'target' ? 0 : points.length - 1
    const adjacent = points[index]
    if (adjacent) {
      const old = current[handle]
      if (adjacent.x === old.x) adjacent.x = nextPoint.x
      else adjacent.y = nextPoint.y
    } else {
      // A manual route can collapse to a single segment; recreate its adjacent corner.
      const old = current[handle]
      const other = current[handle === 'target' ? 'label' : 'target']
      points.push(old.y === other.y ? { x: nextPoint.x, y: other.y } : { x: other.x, y: nextPoint.y })
    }
    payload = { ...payload, route: manualRoute(current, [payload.target, ...points, payload.label]) }
  }
  return payload
}
export function moveCalloutSegment(
  current: CalloutPayload,
  index: number,
  nextPoint: Point,
  context: CalloutGeometryContext = {},
): CalloutRoute {
  const points = calloutPathPoints(current, context).map((p) => ({ ...p }))
  const a = points[index]
  const b = points[index + 1]
  if (!a || !b) return current.route
  const horizontal = a.y === b.y
  if (index === 0 || index === points.length - 2) {
    const movedA = { ...a, [horizontal ? 'y' : 'x']: horizontal ? nextPoint.y : nextPoint.x }
    const movedB = { ...b, [horizontal ? 'y' : 'x']: horizontal ? nextPoint.y : nextPoint.x }
    if (index === 0) points.splice(1, 0, movedA)
    else points.splice(points.length - 1, 0, movedB)
    if (index === 0) Object.assign(b, movedB)
    else Object.assign(a, movedA)
  } else {
    a[horizontal ? 'y' : 'x'] = horizontal ? nextPoint.y : nextPoint.x
    b[horizontal ? 'y' : 'x'] = horizontal ? nextPoint.y : nextPoint.x
  }
  return manualRoute(current, points)
}
