import type {
  CensorLayer,
  LoupeLayer,
  Point,
  RulerLayer,
  SpotlightLayer,
} from '../../document/types'
import { pointInPolygon } from './polygon'
import { rulerVisualGeometry } from './ruler'
import { RULER_HIT_PADDING } from './shared'

function rulerTickHalfLength(thickness: number): number {
  return Math.max(6, Math.min(12, thickness))
}

function pointToSegmentDistance(
  point: Point,
  start: Point,
  end: Point,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const squared = dx * dx + dy * dy
  if (squared === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const progress = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / squared,
    ),
  )
  return Math.hypot(
    point.x - (start.x + dx * progress),
    point.y - (start.y + dy * progress),
  )
}

export function precisionLayerHitPart(
  layer: CensorLayer | SpotlightLayer | RulerLayer | LoupeLayer,
  point: Point,
  canvas?: Readonly<{ readonly width: number; readonly height: number }>,
): 'fill' | 'stroke' | undefined {
  const bounds = layer.localBounds
  if (layer.kind === 'censor') {
    return layer.payload.region.kind === 'rectangle' ||
      pointInPolygon(point, layer.payload.region.points)
      ? 'fill'
      : undefined
  }
  if (layer.kind === 'spotlight') {
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2
    const normalizedX = (point.x - centerX) / (bounds.width / 2)
    const normalizedY = (point.y - centerY) / (bounds.height / 2)
    const inside =
      layer.payload.shape === 'rectangle'
        ? true
        : layer.payload.shape === 'ellipse'
          ? normalizedX ** 2 + normalizedY ** 2 <= 1
          : Math.abs(normalizedX) + Math.abs(normalizedY) <= 1
    return inside ? 'fill' : undefined
  }
  if (layer.kind === 'ruler') {
    const start = layer.payload.start
    const end = layer.payload.end
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    const perpendicular = { x: -dy / length, y: dx / length }
    const tickHalf = rulerTickHalfLength(layer.payload.thickness)
    const strokePadding = Math.max(
      RULER_HIT_PADDING,
      layer.payload.thickness / 2,
    )
    if (pointToSegmentDistance(point, start, end) <= strokePadding) {
      return 'stroke'
    }
    for (const endpoint of [start, end]) {
      const tickStart = {
        x: endpoint.x - perpendicular.x * tickHalf,
        y: endpoint.y - perpendicular.y * tickHalf,
      }
      const tickEnd = {
        x: endpoint.x + perpendicular.x * tickHalf,
        y: endpoint.y + perpendicular.y * tickHalf,
      }
      if (pointToSegmentDistance(point, tickStart, tickEnd) <= strokePadding) {
        return 'stroke'
      }
    }
    if (
      canvas &&
      pointInPolygon(
        point,
        rulerVisualGeometry(layer, layer.payload, canvas).badgePolygon,
      )
    ) {
      return 'fill'
    }
    return undefined
  }
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  if (layer.payload.lens.shape === 'rectangle') return 'fill'
  const radius = layer.payload.lens.size / 2
  return Math.hypot(point.x - centerX, point.y - centerY) <= radius
    ? 'fill'
    : undefined
}
