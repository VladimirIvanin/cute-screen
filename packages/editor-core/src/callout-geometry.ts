import type {
  CalloutLayer,
  CalloutPayload,
  CalloutRoute,
  JsonObject,
  Point,
  Rect,
  RichTextContent,
  TextBackground,
} from './document/types'

const TEXT_LABEL_GAP = 6

function point(value: Point): Point & JsonObject {
  return Object.freeze({ x: value.x, y: value.y })
}

export function calloutMarkerRadius(strokeWidth: number): number {
  return Math.max(strokeWidth * 1.5, 5)
}

/** Renderer-neutral points for every persisted callout elbow route. */
export function calloutPathPoints(payload: CalloutPayload): readonly Point[] {
  const target = point(payload.target)
  const label = point(payload.label)
  const elbow = payload.route.elbow
  if (elbow.axis === 'x') {
    const middleY = (target.y + label.y) / 2 + elbow.offset
    return Object.freeze([
      target,
      point({ x: target.x, y: middleY }),
      point({ x: label.x, y: middleY }),
      label,
    ])
  }
  const middleX = (target.x + label.x) / 2 + elbow.offset
  return Object.freeze([
    target,
    point({ x: middleX, y: target.y }),
    point({ x: middleX, y: label.y }),
    label,
  ])
}

export function defaultCalloutRoute(target: Point, label: Point): CalloutRoute {
  const dx = Math.abs(label.x - target.x)
  const dy = Math.abs(label.y - target.y)
  return Object.freeze({
    path: 'elbow',
    elbow: Object.freeze({
      axis: dx >= dy ? ('y' as const) : ('x' as const),
      offset: 0,
    }),
  })
}

function estimateTextSize(content: RichTextContent): Readonly<{
  readonly width: number
  readonly height: number
  readonly fontSize: number
}> {
  const fontSize =
    content.spans.find((span) => span.fontSize > 0)?.fontSize ?? 24
  const lines = content.text.length === 0 ? [''] : content.text.split('\n')
  const width = Math.max(
    fontSize * 4,
    Math.max(...lines.map((line) => line.length)) * fontSize * 0.6,
  )
  return Object.freeze({
    width,
    height: lines.length * fontSize * 1.25,
    fontSize,
  })
}

export function calloutTextRect(payload: CalloutPayload): Rect & JsonObject {
  const markerRadius = calloutMarkerRadius(payload.stroke.width)
  const textSize = estimateTextSize(payload.content)
  const background = payload.background
  const padding = background?.padding ?? 0
  const width = textSize.width + padding * 2
  const height = textSize.height + padding * 2
  return Object.freeze({
    x: payload.label.x + markerRadius + TEXT_LABEL_GAP - padding,
    y: payload.label.y - height / 2,
    width,
    height,
  })
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

export function calloutGeometryBounds(payload: CalloutPayload): Rect {
  const points = calloutPathPoints(payload)
  const markerRadius = calloutMarkerRadius(payload.stroke.width)
  const strokeInset = payload.stroke.width / 2
  const xs = points.flatMap((entry) => [
    entry.x - markerRadius - strokeInset,
    entry.x + markerRadius + strokeInset,
  ])
  const ys = points.flatMap((entry) => [
    entry.y - markerRadius - strokeInset,
    entry.y + markerRadius + strokeInset,
  ])
  const pathBounds = Object.freeze({
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  })
  return unionBounds([pathBounds, calloutTextRect(payload)])
}

function shifted(value: Point, origin: Point): Point & JsonObject {
  return Object.freeze({
    x: value.x - origin.x,
    y: value.y - origin.y,
  })
}

/** Rebases local geometry after endpoint/route edits without moving world points. */
export function rebaseCalloutLayer(
  layer: CalloutLayer,
  payload: CalloutPayload,
): CalloutLayer {
  const geometry = calloutGeometryBounds(payload)
  const origin = { x: geometry.x, y: geometry.y }
  const radians = (layer.transform.rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const deltaX =
    cosine * layer.transform.scaleX * origin.x -
    sine * layer.transform.scaleY * origin.y
  const deltaY =
    sine * layer.transform.scaleX * origin.x +
    cosine * layer.transform.scaleY * origin.y
  const nextPayload: CalloutPayload = Object.freeze({
    ...payload,
    target: shifted(payload.target, origin),
    label: shifted(payload.label, origin),
    route: Object.freeze({
      path: 'elbow',
      elbow: Object.freeze({ ...payload.route.elbow }),
    }),
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

export type CalloutHandleKind = 'target' | 'label' | 'elbow'

export interface CalloutSelectionHandle {
  readonly kind: CalloutHandleKind
  readonly point: Point
}

export function calloutSelectionHandles(
  layer: CalloutLayer,
): readonly CalloutSelectionHandle[] {
  const handles: CalloutSelectionHandle[] = [
    { kind: 'target', point: point(layer.payload.target) },
    { kind: 'label', point: point(layer.payload.label) },
  ]
  const points = calloutPathPoints(layer.payload)
  handles.push({
    kind: 'elbow',
    point: point({
      x: (points[1]!.x + points[2]!.x) / 2,
      y: (points[1]!.y + points[2]!.y) / 2,
    }),
  })
  return Object.freeze(handles.map((handle) => Object.freeze(handle)))
}

export function updateCalloutHandle(
  layer: CalloutLayer,
  handle: CalloutHandleKind,
  nextPoint: Point,
): CalloutLayer {
  let payload: CalloutPayload
  if (handle === 'target' || handle === 'label') {
    payload = { ...layer.payload, [handle]: point(nextPoint) }
  } else {
    const midpoint = {
      x: (layer.payload.target.x + layer.payload.label.x) / 2,
      y: (layer.payload.target.y + layer.payload.label.y) / 2,
    }
    payload = {
      ...layer.payload,
      route: {
        path: 'elbow',
        elbow: {
          ...layer.payload.route.elbow,
          offset:
            layer.payload.route.elbow.axis === 'x'
              ? nextPoint.y - midpoint.y
              : nextPoint.x - midpoint.x,
        },
      },
    }
  }
  return rebaseCalloutLayer(layer, payload)
}

export function calloutTextLayout(payload: CalloutPayload): Readonly<{
  readonly text: Rect
  readonly background: TextBackground | null
}> {
  const textRect = calloutTextRect(payload)
  const background = payload.background
  if (!background) {
    const padding = 0
    return Object.freeze({
      text: Object.freeze({
        x: textRect.x + padding,
        y: textRect.y + padding,
        width: Math.max(1, textRect.width - padding * 2),
        height: Math.max(1, textRect.height - padding * 2),
      }),
      background: null,
    })
  }
  return Object.freeze({
    text: Object.freeze({
      x: textRect.x + background.padding,
      y: textRect.y + background.padding,
      width: Math.max(1, textRect.width - background.padding * 2),
      height: Math.max(1, textRect.height - background.padding * 2),
    }),
    background,
  })
}
