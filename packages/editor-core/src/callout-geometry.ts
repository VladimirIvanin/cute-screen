import {
  calloutTextRect,
  calloutMarkerRadius,
  calloutEndpointSize,
  calloutHasLabel,
  resolvedCalloutAttachment,
  type CalloutGeometryContext,
} from './callout-label-geometry'
export {
  calloutTextRect,
  calloutMarkerRadius,
  calloutEndpointSize,
  calloutHasLabel,
  resolvedCalloutAttachment,
  type CalloutGeometryContext,
} from './callout-label-geometry'
import {
  calloutPathPoints,
  calloutEndpointAngles,
  manualRoute,
  moveCalloutEndpoint,
  moveCalloutSegment,
} from './callout-route'
export {
  calloutPathPoints,
  calloutEndpointAngles,
  calloutRoutePreset,
  calloutStyleForPayload,
  defaultCalloutAttachment,
  defaultCalloutRoute,
} from './callout-route'
import type {
  CalloutLayer,
  CalloutPayload,
  CalloutFrame,
  CalloutStyle,
  JsonObject,
  Point,
  Rect,
  RichTextContent,
  TextBackground,
} from './document/types'

function point(value: Point): Point & JsonObject {
  return Object.freeze({ x: value.x, y: value.y })
}

export const DEFAULT_CALLOUT_FRAME: CalloutFrame = Object.freeze<CalloutFrame>({
  kind: 'card', fill: { red: 1, green: 1, blue: 1, alpha: 1 },
  border: { color: { red: 0.55, green: 0.55, blue: 0.55, alpha: 1 }, width: 1, style: 'solid', cap: 'round',
    join: 'round' },
  padding: 8, radius: 8,
})
export const DEFAULT_CALLOUT_STYLE: CalloutStyle = Object.freeze({
  route: 'corner', frame: DEFAULT_CALLOUT_FRAME, targetMarker: 'circle', labelMarker: 'none',
})
export function calloutFrameBackground(frame: CalloutFrame): TextBackground | null {
  if (!['card', 'capsule'].includes(frame.kind)) return null
  return { color: frame.fill, padding: frame.padding, radius: frame.kind === 'capsule' ? 16384 : frame.radius }
}
export function calloutBackground(payload: CalloutPayload): TextBackground | null {
  return payload.frame ? calloutFrameBackground(payload.frame) : payload.background
}
export function withCalloutBackground(
  payload: CalloutPayload,
  background: TextBackground | null,
): CalloutPayload {
  if (!payload.frame) return { ...payload, background }
  return { ...payload, frame: background
    ? { ...payload.frame, kind: payload.frame.kind === 'capsule' ? 'capsule' : 'card', fill: background.color,
        padding: background.padding, radius: payload.frame.kind === 'capsule' ? payload.frame.radius : background.radius }
    : { ...payload.frame, kind: payload.frame.kind === 'outline' || payload.frame.kind === 'accent'
        ? payload.frame.kind : 'text' } }
}

function unionBounds(parts: readonly Rect[]): Rect {
  const xs = parts.flatMap((part) => [part.x, part.x + part.width])
  const ys = parts.flatMap((part) => [part.y, part.y + part.height])
  const minimumX = Math.min(...xs)
  const minimumY = Math.min(...ys)
  const maximumX = Math.max(...xs)
  const maximumY = Math.max(...ys)
  return Object.freeze({
    x: minimumX,
    y: minimumY,
    width: Math.max(1, maximumX - minimumX),
    height: Math.max(1, maximumY - minimumY),
  })
}

export function calloutGeometryBounds(
  payload: CalloutPayload,
  context: CalloutGeometryContext = {},
): Rect {
  const points = calloutPathPoints(payload, context)
  const markerRadius = payload.frame || payload.attachment
    ? Math.max(calloutEndpointSize(payload, 'target'), calloutEndpointSize(payload, 'label'))
    : calloutMarkerRadius(payload.stroke.width)
  const strokeInset = payload.stroke.width / 2
  const xs = points.flatMap((entry) => [entry.x - markerRadius - strokeInset, entry.x + markerRadius + strokeInset])
  const ys = points.flatMap((entry) => [entry.y - markerRadius - strokeInset, entry.y + markerRadius + strokeInset])
  const pathBounds = Object.freeze({
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  })
  if (!calloutHasLabel(payload)) return pathBounds
  const rect = calloutTextRect(payload, context)
  const border = (payload.frame?.border?.width ?? 0) / 2
  return unionBounds([pathBounds, { x: rect.x - border, y: rect.y - border, width: rect.width + border * 2,
    height: rect.height + border * 2 }])
}

function shifted(
  value: Point,
  origin: Point,
): Point & JsonObject {
  return Object.freeze({
    x: value.x - origin.x,
    y: value.y - origin.y,
  })
}

/** Rebases local geometry after endpoint/route edits without moving world points. */
export function rebaseCalloutLayer(
  layer: CalloutLayer,
  payload: CalloutPayload,
  context: CalloutGeometryContext = {},
): CalloutLayer {
  const geometry = calloutGeometryBounds(payload, context)
  const origin = { x: geometry.x, y: geometry.y }
  const radians = (layer.transform.rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const deltaX = cosine * layer.transform.scaleX * origin.x - sine * layer.transform.scaleY * origin.y
  const deltaY = sine * layer.transform.scaleX * origin.x + cosine * layer.transform.scaleY * origin.y
  const nextPayload: CalloutPayload = Object.freeze({
    ...payload,
    target: shifted(payload.target, origin),
    label: shifted(payload.label, origin),
    route: payload.route.path === 'orthogonal' ? { ...payload.route,
      points: payload.route.points.map((p) => shifted(p, origin)) }
      : payload.route.path === 'quadratic' ? { ...payload.route, bend: shifted(payload.route.bend, origin) } : payload.route,
  })
  return Object.freeze({
    ...layer,
    transform: Object.freeze({
      ...layer.transform,
      translateX: layer.transform.translateX + deltaX,
      translateY: layer.transform.translateY + deltaY,
    }),
    localBounds: Object.freeze({
      x: 0,
      y: 0,
      width: geometry.width,
      height: geometry.height,
    }),
    payload: nextPayload,
  })
}

export type CalloutHandleKind = 'target' | 'label' | 'labelBody' | 'elbow' | 'bend' | 'width' | `segment:${number}` | `insert:${number}`
export interface CalloutSelectionHandle { readonly kind: CalloutHandleKind; readonly point: Point }
export function calloutSelectionHandles(
  layer: CalloutLayer,
  context: CalloutGeometryContext = {},
): readonly CalloutSelectionHandle[] {
  const handles: CalloutSelectionHandle[] = [
    { kind: 'target', point: point(layer.payload.target) }, { kind: 'label', point: point(layer.payload.label) },
  ]
  const points = calloutPathPoints(layer.payload, context)
  if (layer.payload.route.path === 'straight' || layer.payload.route.path === 'quadratic') {
    handles.push({ kind: 'bend', point: layer.payload.route.path === 'quadratic' ? layer.payload.route.bend
      : point({ x: (layer.payload.target.x + layer.payload.label.x) / 2,
          y: (layer.payload.target.y + layer.payload.label.y) / 2 }) })
  } else if (layer.payload.route.path === 'elbow' && !layer.payload.attachment) {
    handles.push({ kind: 'elbow', point: point({ x: (points[1]!.x + points[2]!.x) / 2,
      y: (points[1]!.y + points[2]!.y) / 2 }) })
  } else {
    points.slice(1).forEach((p, i) => handles.push({ kind: `segment:${i}`,
      point: point({ x: (p.x + points[i]!.x) / 2, y: (p.y + points[i]!.y) / 2 }) }))
  }
  if (!calloutHasLabel(layer.payload)) return handles
  const rect = calloutTextLayout(layer.payload, context).text
  const left = resolvedCalloutAttachment(layer.payload) === 'right' || !layer.payload.attachment
    && layer.payload.label.x < layer.payload.target.x
  handles.push({ kind: 'width', point: point({ x: left ? rect.x : rect.x + rect.width, y: rect.y + rect.height / 2 }) })
  return handles
}
export function addCalloutStep(
  layer: CalloutLayer,
  segment = 0,
  offset = 32,
  context: CalloutGeometryContext = {},
): CalloutLayer {
  if (layer.payload.route.path === 'straight' || layer.payload.route.path === 'quadratic') return layer
  const points = calloutPathPoints(layer.payload, context).map((p) => ({ ...p }))
  if (
    points.length > 120 ||
    points.length < 3 ||
    offset === 0
  ) return layer
  const a = points[segment], b = points[segment + 1]
  if (
    !a ||
    !b ||
    a.x !== b.x &&
    a.y !== b.y
  ) return layer
  if (a.x === b.x && a.y === b.y) return layer
  const key = a.y === b.y ? 'y' : 'x'
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const shifted = { ...middle, [key]: middle[key] + offset }
  if (segment + 1 < points.length - 1) {
    b[key] += offset
    points.splice(segment + 1, 0, middle, shifted)
  } else {
    a[key] += offset
    points.splice(segment + 1, 0, shifted, middle)
  }
  return rebaseCalloutLayer(layer, { ...layer.payload, route: manualRoute(layer.payload, points) }, context)
}
export function removeCalloutStep(
  layer: CalloutLayer,
  context: CalloutGeometryContext = {},
): CalloutLayer {
  const points = calloutPathPoints(layer.payload, context)
  return removeCalloutStepAt(layer, points.length - 4, context)
}

export function canRemoveCalloutStep(
  payload: CalloutPayload,
  segment: number,
  context: CalloutGeometryContext = {},
): boolean {
  if (payload.route.path !== 'orthogonal' || payload.route.points.length < 3) return false
  const points = calloutPathPoints(payload, context)
  return Number.isInteger(segment) && points.length >= 5 && segment > 0 && segment < points.length - 2
}

/** Collapse the selected inner segment locally, preserving both endpoints. */
export function removeCalloutStepAt(
  layer: CalloutLayer,
  segment: number,
  context: CalloutGeometryContext = {},
): CalloutLayer {
  if (!canRemoveCalloutStep(layer.payload, segment, context)) return layer
  const points = calloutPathPoints(layer.payload, context).map((p) => ({ ...p }))
  // The final inner segment uses the same operation backwards, so neither endpoint moves.
  const reversed = segment === points.length - 3
  if (reversed) points.reverse()
  const index = reversed ? 1 : segment
  const a = points[index - 1]!, p = points[index]!, b = points[index + 2]!
  if (a.y === p.y) b.y = a.y
  else b.x = a.x
  points.splice(index, 2)
  if (reversed) points.reverse()
  return rebaseCalloutLayer(layer, { ...layer.payload, route: manualRoute(layer.payload, points) }, context)
}

export function calloutAccentSide(
  payload: CalloutPayload,
  context: CalloutGeometryContext = {},
): 'left' | 'right' | 'top' | 'bottom' {
  const angle = calloutEndpointAngles(payload, context).start
  const dx = -Math.cos(angle), dy = -Math.sin(angle)
  if (Math.abs(dx) + 1e-6 >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}
export function resetCalloutRoute(
  layer: CalloutLayer,
  context: CalloutGeometryContext = {},
): CalloutLayer {
  const route = layer.payload.route
  if (route.path !== 'orthogonal') return layer
  return rebaseCalloutLayer(layer, { ...layer.payload, route: route.preset === 'elbow'
    ? { path: 'elbow', elbow: { axis: route.axis, offset: 0 } } : { path: 'corner', axis: route.axis } }, context)
}
function resizedCalloutContent(
  current: CalloutPayload,
  nextPoint: Point,
  context: CalloutGeometryContext,
): RichTextContent {
  const fontSize = Math.max(1, ...current.content.spans.map((span) => span.fontSize))
  const rect = calloutTextLayout(current, context).text
  const attachment = resolvedCalloutAttachment(current)
  const left = attachment === 'right' || !attachment && current.label.x < current.target.x
  const oldEdge = left ? rect.x : rect.x + rect.width
  const oldWidth = rect.width
  const width = Math.max(fontSize, oldWidth + (nextPoint.x - oldEdge) * (left ? -1
    : 1) * (attachment === 'top' || attachment === 'bottom' ? 2 : 1))
  return { ...current.content, wrap: 'fixedWidth', fixedWidth: width }
}
export function updateCalloutHandle(
  layer: CalloutLayer,
  handle: CalloutHandleKind,
  nextPoint: Point,
  context: CalloutGeometryContext = {},
): CalloutLayer {
  if (handle === 'labelBody') handle = 'label'
  const current = layer.payload
  let payload = current
  if (
    handle === 'bend' &&
    (current.route.path === 'straight' ||
      current.route.path === 'quadratic')
  )
    return rebaseCalloutLayer(layer, { ...current, route: { path: 'quadratic', bend: point(nextPoint) } }, context)
  if (handle === 'width') return rebaseCalloutLayer(layer, { ...current, content: resizedCalloutContent(current, nextPoint, context) }, context)
  if (handle === 'target' || handle === 'label') return rebaseCalloutLayer(layer, moveCalloutEndpoint(current, handle, nextPoint), context)
  if (handle === 'elbow' && current.route.path === 'elbow') {
    const route = current.route
    const midpoint = { x: (current.target.x + current.label.x) / 2, y: (current.target.y + current.label.y) / 2 }
    const offset = route.elbow.axis === 'x' ? nextPoint.y - midpoint.y : nextPoint.x - midpoint.x
    payload = { ...current, route: { ...route, elbow: { ...route.elbow, offset } } }
  }
  if (handle.startsWith('insert:')) {
    const index = Number(handle.split(':')[1])
    const points = calloutPathPoints(current, context)
    const a = points[index], b = points[index + 1]
    if (a && b) return addCalloutStep(layer, index, a.y === b.y ? nextPoint.y - a.y : nextPoint.x - a.x, context)
  }
  if (handle.startsWith('segment:')) payload = { ...current, route: moveCalloutSegment(current, Number(handle.split(':')[1]), nextPoint, context) }
  return rebaseCalloutLayer(layer, payload, context)
}
export function calloutTextLayout(
  payload: CalloutPayload,
  context: CalloutGeometryContext = {},
): Readonly<{ readonly text: Rect; readonly background: TextBackground | null }> {
  const rect = calloutTextRect(payload, context)
  const padding = payload.frame?.kind === 'text' ? 0 : payload.frame?.padding ?? payload.background?.padding ?? 0
  return { text: { x: rect.x + padding, y: rect.y + padding, width: Math.max(1, rect.width - padding * 2),
    height: Math.max(1, rect.height - padding * 2) }, background: calloutBackground(payload) }
}

export function calloutLabelContains(
  payload: CalloutPayload,
  point: Point,
  context: CalloutGeometryContext = {},
): boolean {
  if (!payload.attachment || !calloutHasLabel(payload)) return false
  const rect = calloutTextRect(payload, context)
  return point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height
}
