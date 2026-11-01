import { sketchPath } from './sketch-geometry'
import {
  flattenShapePath,
  type ShapePathCommand,
} from './shapes'
import type {
  ArrowLayer,
  ArrowLayerPayload,
  JsonObject,
  Point,
  Rect,
} from './document/types'

import {
  arrowPathPoints,
  arrowCapSize,
  trimArrowBodyPoints,
} from './arrow-route'
export {
  arrowPathPoints,
  arrowEndpointAngles,
  arrowCapSize,
  trimArrowBodyPoints,
  scaledClosedArrowCapSizes,
} from './arrow-route'
import { taperedArrowBoundsPoints } from './tapered-arrow'

function point(value: Point): Point & JsonObject {
  return Object.freeze({ x: value.x, y: value.y })
}

function arrowGeometryBounds(payload: ArrowLayerPayload): Rect {
  const tapered = payload.appearance === 'tapered'
  const points = tapered ? taperedArrowBoundsPoints(payload) : payload.appearance === 'handDrawn'
    ? [...arrowPathPoints(payload), ...arrowBodyGeometry(payload).points]
    : arrowPathPoints(payload)
  const inset = Math.max(
    payload.stroke.width / 2,
    arrowCapSize(payload.startCap, payload.stroke.width * (payload.appearance === 'tapered' ? 2 : 1)),
    arrowCapSize(payload.endCap, payload.stroke.width * (payload.appearance === 'tapered' ? 2 : 1)),
  )
  // Hand-drawn caps include curved control points; retain their entire ink
  // envelope at every orientation, including thin arrows without caps.
  const padding = tapered ? payload.stroke.width / 2 : payload.appearance === 'handDrawn' ? inset * 1.5 + payload.stroke.width / 2 + 6 : inset
  const xs = points.map((entry) => entry.x)
  const ys = points.map((entry) => entry.y)
  const minimumX = Math.min(...xs) - padding
  const minimumY = Math.min(...ys) - padding
  const maximumX = Math.max(...xs) + padding
  const maximumY = Math.max(...ys) + padding
  return Object.freeze({
    x: minimumX,
    y: minimumY,
    width: Math.max(1, maximumX - minimumX),
    height: Math.max(1, maximumY - minimumY),
  })
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

/**
 * Tightens local bounds after endpoint/route edits while compensating the
 * transform translation, so every world-space arrow point remains unchanged.
 */
export function rebaseArrowLayer(
  layer: ArrowLayer,
  payload: ArrowLayerPayload,
): ArrowLayer {
  const geometry = arrowGeometryBounds(payload)
  const origin = { x: geometry.x, y: geometry.y }
  const radians = (layer.transform.rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const deltaX = cosine * layer.transform.scaleX * origin.x - sine * layer.transform.scaleY * origin.y
  const deltaY = sine * layer.transform.scaleX * origin.x + cosine * layer.transform.scaleY * origin.y
  const nextPayload: ArrowLayerPayload = Object.freeze({
    ...payload,
    start: shifted(payload.start, origin),
    end: shifted(payload.end, origin),
    ...(payload.path === 'quadratic' && payload.bend ? { bend: shifted(payload.bend, origin) } : {}),
    ...(payload.path === 'elbow' && payload.elbow ? { elbow: Object.freeze({ ...payload.elbow }) } : {}),
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

export type ArrowHandleKind = 'start' | 'end' | 'bend' | 'elbow'

export interface ArrowSelectionHandle {
  readonly kind: ArrowHandleKind
  readonly point: Point
}

export function arrowSelectionHandles(layer: ArrowLayer): readonly ArrowSelectionHandle[] {
  const handles: ArrowSelectionHandle[] = [
    { kind: 'start', point: point(layer.payload.start) },
    { kind: 'end', point: point(layer.payload.end) },
  ]
  if (layer.payload.path === 'quadratic' && layer.payload.bend) {
    handles.push({ kind: 'bend', point: point(layer.payload.bend) })
  } else if (layer.payload.path === 'elbow') {
    const points = arrowPathPoints(layer.payload)
    handles.push({
      kind: 'elbow',
      point: point({
        x: (points[1]!.x + points[2]!.x) / 2,
        y: (points[1]!.y + points[2]!.y) / 2,
      }),
    })
  }
  return Object.freeze(handles.map((handle) => Object.freeze(handle)))
}

export function updateArrowHandle(
  layer: ArrowLayer,
  handle: ArrowHandleKind,
  nextPoint: Point,
): ArrowLayer {
  let payload: ArrowLayerPayload
  if (
    handle === 'start' ||
    handle === 'end' ||
    handle === 'bend'
  ) {
    if (handle === 'bend' && layer.payload.path !== 'quadratic') return layer
    payload = { ...layer.payload, [handle]: point(nextPoint) }
  } else {
    if (layer.payload.path !== 'elbow' || !layer.payload.elbow) return layer
    const midpoint = {
      x: (layer.payload.start.x + layer.payload.end.x) / 2,
      y: (layer.payload.start.y + layer.payload.end.y) / 2,
    }
    payload = {
      ...layer.payload,
      elbow: {
        ...layer.payload.elbow,
        offset: layer.payload.elbow.axis === 'x' ? nextPoint.y - midpoint.y : nextPoint.x - midpoint.x,
      },
    }
  }
  return rebaseArrowLayer(layer, payload)
}

/** Shared visible body, including cap trimming and hand-drawn curvature. */
export function arrowBodyGeometry(payload: ArrowLayerPayload): Readonly<{
  path: readonly ShapePathCommand[]
  points: readonly Point[]
}> {
  const base = trimArrowBodyPoints(arrowPathPoints(payload), payload.startCap, payload.endCap, payload.stroke.width)
  if (payload.appearance !== 'handDrawn') {
    return { points: base, path: base.map((p, i): ShapePathCommand => [i ? 'L' : 'M', p.x, p.y]) }
  }
  const path = sketchPath(base, payload.sketchSeed ?? 1, payload.stroke.width, payload.path === 'elbow')
  return { path, points: flattenShapePath(path, 0.05)[0] ?? [] }
}
