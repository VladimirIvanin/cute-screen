import type {
  EditorDocumentV1,
  LayerNode,
  Point,
  Rect,
  RulerLayer,
  Transform2D,
} from './document/types'
import {
  transformPoint,
  transformToMatrix,
} from './geometry'
import {
  rebaseRulerLayer,
  rulerVisualGeometry,
  rulerVisualBoundsAreConservative,
  snapRulerEndpoint,
} from './tools/precision/ruler'

export function rulerCanvasBounds(document: EditorDocumentV1): Rect {
  return document.crop ?? { x: 0, y: 0, ...document.canvas }
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.max(minimum, Math.min(maximum, value))
}

/** Snapped drags intersect the canvas along the snapped ray, retaining the angle. */
export function constrainRulerEndpoint(
  start: Point,
  candidate: Point,
  bounds: Rect,
  snapAngleIncrementDegrees?: number,
): Point {
  const end = snapAngleIncrementDegrees ? snapRulerEndpoint(start, candidate, snapAngleIncrementDegrees).end : candidate
  if (!snapAngleIncrementDegrees) {
    return { x: clamp(end.x, bounds.x, bounds.x + bounds.width), y: clamp(end.y, bounds.y, bounds.y + bounds.height) }
  }
  const dx = end.x - start.x
  const dy = end.y - start.y
  let factor = 1
  if (dx > 0) factor = Math.min(factor, (bounds.x + bounds.width - start.x) / dx)
  if (dx < 0) factor = Math.min(factor, (bounds.x - start.x) / dx)
  if (dy > 0) factor = Math.min(factor, (bounds.y + bounds.height - start.y) / dy)
  if (dy < 0) factor = Math.min(factor, (bounds.y - start.y) / dy)
  factor = Math.max(0, factor)
  return {
    x: clamp(start.x + dx * factor, bounds.x, bounds.x + bounds.width),
    y: clamp(start.y + dy * factor, bounds.y, bounds.y + bounds.height),
  }
}

function worldEndpoints(layer: RulerLayer): readonly Point[] {
  const matrix = transformToMatrix(layer.transform)
  return [transformPoint(matrix, layer.payload.start), transformPoint(matrix, layer.payload.end)]
}

/** A single delta preserves a mixed selection's relative positions. */
export function constrainRulerMove(
  layers: readonly LayerNode[],
  delta: Point,
  bounds: Rect,
  canvas: EditorDocumentV1['canvas'] = bounds,
): Point {
  canvas = bounds
  const rulers = layers.filter((layer): layer is RulerLayer => layer.kind === 'ruler')
  const endpoints = rulers.flatMap(worldEndpoints)
  if (!endpoints.length) return delta
  const points = rulers.flatMap((layer) => {
    const matrix = transformToMatrix(layer.transform)
    return rulerVisualGeometry(layer, layer.payload, canvas).badgePolygon.map((point) => transformPoint(matrix, point))
  }).concat(endpoints)
  // Keep the badge readable whenever it fits, while retaining edge-to-edge measurement.
  const allXs = points.map((point) => point.x)
  const allYs = points.map((point) => point.y)
  const xs = Math.max(...allXs) - Math.min(...allXs) <= bounds.width + 1e-8
    ? allXs : endpoints.map((point) => point.x)
  const ys = Math.max(...allYs) - Math.min(...allYs) <= bounds.height + 1e-8
    ? allYs : endpoints.map((point) => point.y)
  const minimumX = bounds.x - Math.min(...xs)
  const maximumX = bounds.x + bounds.width - Math.max(...xs)
  const minimumY = bounds.y - Math.min(...ys)
  const maximumY = bounds.y + bounds.height - Math.max(...ys)
  // Legacy/cropped selections larger than the canvas cannot fit by translation.
  return {
    x: minimumX <= maximumX + 1e-8 ? clamp(delta.x, minimumX, maximumX) : 0,
    y: minimumY <= maximumY + 1e-8 ? clamp(delta.y, minimumY, maximumY) : 0,
  }
}

/** Keep rotated rulers inside without changing their measured length. */
export function constrainRulerTransform(
  layer: RulerLayer,
  transform: Transform2D,
  bounds: Rect,
  canvas: EditorDocumentV1['canvas'] = bounds,
): Transform2D {
  const candidate = { ...layer, transform }
  const [start, end] = worldEndpoints(candidate) as readonly [Point, Point]
  if (Math.abs(end.x - start.x) > bounds.width + 1e-8 || Math.abs(end.y - start.y) > bounds.height + 1e-8) {
    return layer.transform
  }
  const delta = constrainRulerMove([candidate], { x: 0, y: 0 }, bounds, canvas)
  if (delta.x === 0 && delta.y === 0) return transform
  return { ...transform, translateX: transform.translateX + delta.x, translateY: transform.translateY + delta.y }
}

/** Crop keeps direction and style; shorten only when translation cannot fit. */
export function fitRulerToBounds(
  layer: RulerLayer,
  bounds: Rect,
  canvas: EditorDocumentV1['canvas'],
): RulerLayer {
  const [start, end] = worldEndpoints(layer) as readonly [Point, Point]
  const dx = end.x - start.x
  const dy = end.y - start.y
  const factor = Math.min(1, dx === 0 ? 1 : bounds.width / Math.abs(dx), dy === 0 ? 1 : bounds.height / Math.abs(dy))
  let candidate = layer
  if (factor < 1) {
    const center = {
      x: (layer.payload.start.x + layer.payload.end.x) / 2,
      y: (layer.payload.start.y + layer.payload.end.y) / 2,
    }
    const point = (value: Point) => ({
      x: center.x + (value.x - center.x) * factor,
      y: center.y + (value.y - center.y) * factor,
    })
    candidate = rebaseRulerLayer(layer, {
      ...layer.payload,
      start: point(layer.payload.start),
      end: point(layer.payload.end),
    }, canvas)
  }
  const transform = constrainRulerTransform(candidate, candidate.transform, bounds, canvas)
  candidate = transform === candidate.transform ? candidate : { ...candidate, transform }
  if (candidate === layer && rulerVisualBoundsAreConservative(layer, bounds)) return layer
  return rebaseRulerLayer(candidate, candidate.payload, bounds)
}
