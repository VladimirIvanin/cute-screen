import { arrowNodes } from './document/scene/arrow'
import {
  numberedMarkerCaptionBounds,
} from './numbered-marker'
import {
  resolveFreehandGeometry,
  freehandOutlineContains,
} from './tools/freehand'
import {
  isShapeKind,
  shapeGeometry,
  flattenShapePath,
} from './shapes'

import {
  arrowCapSize,
  arrowPathPoints,
} from './arrow-geometry'
import {
  type CalloutGeometryContext,
  calloutEndpointSize,
  calloutPathPoints,
  calloutTextRect,
} from './callout-geometry'
import type {
  ArrowLayerPayload,
  EditorDocumentV1,
  JsonObject,
  Point,
} from './document/types'
import { precisionLayerHitPart } from './tools/precision/hit-test'

import type { StrokeHitMetric } from './hit-test-metric'
import type { HitPart } from './hit-test'

function payloadStrokeWidth(
  payload: JsonObject,
  fallback = 1,
): number {
  const stroke = payload.stroke
  if (
    stroke &&
    typeof stroke === 'object' &&
    !Array.isArray(stroke)
  ) {
    const width = (stroke as Record<string, unknown>).width
    if (
      typeof width === 'number' &&
      Number.isFinite(width) &&
      width > 0
    ) return width
  }
  const width = payload.width
  return typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : fallback
}

function pointInRect(
  point: Point,
  rect: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  },
): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height
}

function pointToSegmentDistance(
  point: Point,
  start: Point,
  end: Point,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const progress = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + dx * progress), point.y - (start.y + dy * progress))
}

function pointInPolygon(
  point: Point,
  points: readonly Point[],
): boolean {
  let inside = false
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const current = points[index]!
    const before = points[previous]!
    const intersects =
      current.y > point.y !== before.y > point.y &&
      point.x < ((before.x - current.x) * (point.y - current.y)) / (before.y - current.y) + current.x
    if (intersects) inside = !inside
  }
  return inside
}

export function drawingHitPart(
  layer: EditorDocumentV1['layers'][number],
  point: Point,
  canvas: EditorDocumentV1['canvas'],
  context: CalloutGeometryContext,
  padding = 0,
  precise = false,
  metric?: StrokeHitMetric,
): HitPart | undefined {
  const strokeHit = (start: Point, end: Point, radius: number) => metric
    ? metric(point, start, end, radius) : pointToSegmentDistance(point, start, end) <= radius + padding
  if (layer.kind === 'image') return pointInRect(point, layer.localBounds) ? 'fill' : undefined
  if (
    layer.kind === 'censor' ||
    layer.kind === 'spotlight' ||
    layer.kind === 'ruler' ||
    layer.kind === 'loupe'
  ) {
    return precisionLayerHitPart(layer, point, canvas, padding, precise, metric)
  }
  if (layer.kind === 'numberedMarker') {
    return pointInRect(point, layer.localBounds) || pointInRect(point, numberedMarkerCaptionBounds(layer, context)) ? 'fill' : undefined
  }
  if (layer.kind === 'callout') {
    const callout = layer.payload
    const samples = calloutPathPoints(callout, context)
    const strokeWidth = callout.stroke.width
    const bodyHit = samples
      .slice(1)
      .some((sample, index) => strokeHit(samples[index]!, sample, strokeWidth / 2))
    if (bodyHit) return 'stroke'
    const markerHit = (endpoint: 'target' | 'label') => callout[`${endpoint}Marker`] !== 'none' && strokeHit(callout[endpoint], callout[endpoint], calloutEndpointSize(callout, endpoint))
    if (markerHit('target') || markerHit('label')) return 'stroke'
    const textRect = calloutTextRect(callout, context)
    return pointInRect(point, textRect) ? 'fill' : undefined
  }
  if (
    layer.kind !== 'arrow' &&
    layer.kind !== 'pencil' &&
    layer.kind !== 'marker' &&
    layer.kind !== 'shape'
  ) {
    return pointInRect(point, layer.localBounds) ? 'fill' : undefined
  }
  const payload = layer.payload
  const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
  const strokeWidth = payloadStrokeWidth(payload)
  if (layer.kind === 'arrow') {
    const arrow = payload as unknown as ArrowLayerPayload
    if (arrow.appearance === 'handDrawn' && arrow.annotationTool !== 'line') {
      const nodes = arrowNodes({
        ...layer, transform: { ...layer.transform, translateX: 0, translateY: 0, rotation: 0 },
      })
      for (const node of nodes) {
        if (node.kind !== 'vector') continue
        const contours = flattenShapePath(node.outline, 0.05)
        const filled = !node.open && 'alpha' in node.fill && node.fill.alpha > 0
        if (filled && contours.some((contour) => pointInPolygon(point, contour))) return 'fill'
        const onStroke = contours.some((contour) => contour.slice(1).some((end, i) =>
          strokeHit(contour[i]!, end, node.strokeWidth / 2)))
        if (onStroke) return 'stroke'
      }
      return undefined
    }
    const samples = arrowPathPoints(arrow)
    const bodyHit = samples
      .slice(1)
      .some((sample, index) => strokeHit(samples[index]!, sample, strokeWidth / 2))
    if (bodyHit) return 'stroke'
    const capHit = (cap: ArrowLayerPayload['startCap'], anchor: Point) =>
      cap !== 'none' && strokeHit(anchor, anchor, arrowCapSize(cap, strokeWidth))
    return capHit(arrow.startCap, arrow.start) || capHit(arrow.endCap, arrow.end) ? 'stroke' : undefined
  }
  if (layer.kind === 'pencil' || layer.kind === 'marker') {
    const geometry = resolveFreehandGeometry(payload, layer.kind === 'pencil')
    if (geometry.outline.length) return freehandOutlineContains(geometry.outline, point) || (padding > 0 && geometry.outline.some((end, index) => strokeHit(geometry.outline[(index + geometry.outline.length - 1) % geometry.outline.length]!, end, 0))) ? 'stroke' : undefined
    const samples = geometry.points
    if (samples.length === 1)
      return strokeHit(samples[0]!, samples[0]!, geometry.width * (layer.kind === 'pencil' && !geometry.modern ? samples[0]!.pressure : 1) / 2) ? 'stroke' : undefined
    return samples.slice(1).some((sample, index) => strokeHit(samples[index]!, sample, geometry.width * (layer.kind === 'pencil' && !geometry.modern ? (sample.pressure + samples[index]!.pressure) / 2 : 1) / 2)) ? 'stroke' : undefined
  }
  // Pre-v3 in-memory fixtures and third-party callers may not have a drawing
  // payload yet. Keep the historical bounds hit until they pass the codec.
  if (Object.keys(payload).length === 0) return 'fill'
  const shape = payload.shape
  const inset = strokeWidth / 2
  const geometry = {
    x: bounds.x + inset,
    y: bounds.y + inset,
    width: Math.max(1, bounds.width - inset * 2),
    height: Math.max(1, bounds.height - inset * 2),
  }
  const centerX = geometry.x + geometry.width / 2
  const centerY = geometry.y + geometry.height / 2
  const hasFill =
    payload.fill !== undefined &&
    typeof payload.fill === 'object' &&
    (payload.fill as Record<string, unknown>).kind !== 'none'
  if (!isShapeKind(shape)) return undefined
  if (
    (shape === 'circle' ||
      shape === 'oval') &&
      !precise &&
      padding === 0
  ) {
    const radiusX = geometry.width / 2
    const radiusY = geometry.height / 2
    const distance = Math.hypot((point.x - centerX) / radiusX, (point.y - centerY) / radiusY)
    if (hasFill && distance <= 1) return 'fill'
    return Math.abs(distance - 1) <= (strokeWidth / 2 + padding) / Math.min(radiusX, radiusY) ? 'stroke' : undefined
  }
  const path = shapeGeometry(shape, geometry.width, geometry.height, {
    ...(typeof payload.sketchSeed === 'number' ? { sketchSeed: payload.sketchSeed } : {}),
    cornerRadius: typeof payload.cornerRadius === 'number' ? payload.cornerRadius : 0,
    starPoints: typeof payload.starPoints === 'number' ? payload.starPoints : 5,
    starInnerRatio: typeof payload.starInnerRatio === 'number' ? payload.starInnerRatio : 0.45,
  })
  const local = { x: point.x - geometry.x, y: point.y - geometry.y }
  const outline = flattenShapePath(path.outline)
  if (
    !path.open &&
    hasFill &&
    outline.some((contour) => pointInPolygon(local, contour))
  ) return 'fill'
  const contours = [...outline, ...flattenShapePath(path.details)]
  return contours.some((contour) => contour.slice(1).some((end, i) =>
    strokeHit(
      { x: contour[i]!.x + geometry.x, y: contour[i]!.y + geometry.y },
      { x: end.x + geometry.x, y: end.y + geometry.y }, strokeWidth / 2))) ? 'stroke' : undefined
}
