import RBush from 'rbush'

import type { EditorDocumentV1, JsonObject, Point } from './document/types'
import { invertMatrix, transformPoint, transformToMatrix } from './geometry'

export type HitPart = 'fill' | 'handle' | 'stroke'

export interface HitTestResult {
  readonly nodeId: string
  readonly part: HitPart
  readonly distance: number
  readonly zOrder: number
}

interface SpatialItem {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
  readonly layerId: string
}

/** Mutable index whose `update` touches only layer IDs changed by a command. */
export class DocumentSpatialIndex {
  readonly #tree = new RBush<SpatialItem>()
  #itemsById = new Map<string, SpatialItem>()
  #document: EditorDocumentV1

  constructor(document: EditorDocumentV1) {
    this.#document = document
    this.#insertAll(document)
  }

  update(document: EditorDocumentV1, changedLayerIds: readonly string[]): void {
    this.#document = document
    for (const id of changedLayerIds) {
      const previous = this.#itemsById.get(id)
      if (previous) {
        this.#tree.remove(
          previous,
          (left, right) => left.layerId === right.layerId,
        )
        this.#itemsById.delete(id)
      }
      const layer = document.layers.find((candidate) => candidate.id === id)
      if (!layer || !layer.visible || layer.locked) continue
      const item = spatialItem(layer)
      this.#tree.insert(item)
      this.#itemsById.set(id, item)
    }
  }

  hitAll(canvasPoint: Point): readonly HitTestResult[] {
    const candidateIds = new Set(
      this.#tree
        .search({
          minX: canvasPoint.x,
          minY: canvasPoint.y,
          maxX: canvasPoint.x,
          maxY: canvasPoint.y,
        })
        .map((item) => item.layerId),
    )
    const hits: HitTestResult[] = []
    for (let index = this.#document.layers.length - 1; index >= 0; index -= 1) {
      const layer = this.#document.layers[index]
      if (!layer || !candidateIds.has(layer.id)) continue
      const hit = hitLayer(layer, canvasPoint, index)
      if (hit) hits.push(hit)
    }
    return Object.freeze(hits)
  }

  #insertAll(document: EditorDocumentV1): void {
    const items = document.layers
      .filter((layer) => layer.visible && !layer.locked)
      .map(spatialItem)
    this.#tree.load(items)
    this.#itemsById = new Map(items.map((item) => [item.layerId, item]))
  }
}

function spatialItem(layer: EditorDocumentV1['layers'][number]): SpatialItem {
  const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
  const matrix = transformToMatrix(layer.transform)
  const points = [
    transformPoint(matrix, { x: bounds.x, y: bounds.y }),
    transformPoint(matrix, { x: bounds.x + bounds.width, y: bounds.y }),
    transformPoint(matrix, { x: bounds.x, y: bounds.y + bounds.height }),
    transformPoint(matrix, {
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    }),
  ]
  return Object.freeze({
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
    layerId: layer.id,
  })
}

/**
 * Pointer hit testing intentionally excludes hidden and locked layers. Those
 * remain available through the Layers panel, preserving the locked-base rule.
 */
export function hitTestDocument(
  document: EditorDocumentV1,
  canvasPoint: Point,
): HitTestResult | undefined {
  for (let index = document.layers.length - 1; index >= 0; index -= 1) {
    const layer = document.layers[index]
    if (!layer || !layer.visible || layer.locked) continue
    const hit = hitLayer(layer, canvasPoint, index)
    if (hit) return hit
  }
  return undefined
}

/** Returns the z-ordered candidates needed by the transient overlap-cycle UI. */
export function hitTestDocumentAll(
  document: EditorDocumentV1,
  canvasPoint: Point,
): readonly HitTestResult[] {
  const hits: HitTestResult[] = []
  for (let index = document.layers.length - 1; index >= 0; index -= 1) {
    const layer = document.layers[index]
    if (!layer || !layer.visible || layer.locked) continue
    const hit = hitLayer(layer, canvasPoint, index)
    if (hit) hits.push(hit)
  }
  return Object.freeze(hits)
}

function hitLayer(
  layer: EditorDocumentV1['layers'][number],
  canvasPoint: Point,
  zOrder: number,
): HitTestResult | undefined {
  const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
  const local = transformPoint(
    invertMatrix(transformToMatrix(layer.transform)),
    canvasPoint,
  )
  if (
    local.x < bounds.x ||
    local.x > bounds.x + bounds.width ||
    local.y < bounds.y ||
    local.y > bounds.y + bounds.height
  )
    return undefined
  const part = drawingHitPart(layer, local)
  if (!part) return undefined
  return Object.freeze({
    nodeId: layer.id,
    part,
    distance: 0,
    zOrder,
  })
}

function payloadPoint(value: unknown, fallback: Point): Point {
  if (!value || typeof value !== 'object') return fallback
  const point = value as Record<string, unknown>
  return typeof point.x === 'number' &&
    Number.isFinite(point.x) &&
    typeof point.y === 'number' &&
    Number.isFinite(point.y)
    ? { x: point.x, y: point.y }
    : fallback
}

function payloadStrokeWidth(payload: JsonObject, fallback = 1): number {
  const stroke = payload.stroke
  if (stroke && typeof stroke === 'object' && !Array.isArray(stroke)) {
    const width = (stroke as Record<string, unknown>).width
    if (typeof width === 'number' && Number.isFinite(width) && width > 0)
      return width
  }
  const width = payload.width
  return typeof width === 'number' && Number.isFinite(width) && width > 0
    ? width
    : fallback
}

function pointToSegmentDistance(
  point: Point,
  start: Point,
  end: Point,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0)
    return Math.hypot(point.x - start.x, point.y - start.y)
  const progress = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  )
  return Math.hypot(
    point.x - (start.x + dx * progress),
    point.y - (start.y + dy * progress),
  )
}

function pointInPolygon(point: Point, points: readonly Point[]): boolean {
  let inside = false
  for (
    let index = 0, previous = points.length - 1;
    index < points.length;
    previous = index++
  ) {
    const current = points[index]!
    const before = points[previous]!
    const intersects =
      current.y > point.y !== before.y > point.y &&
      point.x <
        ((before.x - current.x) * (point.y - current.y)) /
          (before.y - current.y) +
          current.x
    if (intersects) inside = !inside
  }
  return inside
}

function polygonStrokeHit(
  point: Point,
  vertices: readonly Point[],
  strokeWidth: number,
): boolean {
  return vertices.some(
    (vertex, index) =>
      pointToSegmentDistance(
        point,
        vertex,
        vertices[(index + 1) % vertices.length]!,
      ) <=
      strokeWidth / 2,
  )
}

function drawingHitPart(
  layer: EditorDocumentV1['layers'][number],
  point: Point,
): HitPart | undefined {
  if (layer.kind === 'image') return 'fill'
  const payload = layer.payload
  const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
  const strokeWidth = payloadStrokeWidth(payload)
  if (layer.kind === 'arrow') {
    const start = payloadPoint(payload.start, { x: bounds.x, y: bounds.y })
    const end = payloadPoint(payload.end, {
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    })
    const bend =
      payload.path === 'quadratic'
        ? payloadPoint(payload.bend, { x: (start.x + end.x) / 2, y: start.y })
        : undefined
    const samples = bend
      ? Array.from({ length: 17 }, (_, index) => {
          const t = index / 16
          const inverse = 1 - t
          return {
            x:
              inverse * inverse * start.x +
              2 * inverse * t * bend.x +
              t * t * end.x,
            y:
              inverse * inverse * start.y +
              2 * inverse * t * bend.y +
              t * t * end.y,
          }
        })
      : [start, end]
    return samples
      .slice(1)
      .some(
        (sample, index) =>
          pointToSegmentDistance(point, samples[index]!, sample) <=
          strokeWidth / 2,
      )
      ? 'stroke'
      : undefined
  }
  if (layer.kind === 'pencil' || layer.kind === 'marker') {
    const samples = Array.isArray(payload.points)
      ? payload.points.map((sample) => payloadPoint(sample, { x: 0, y: 0 }))
      : []
    if (samples.length === 1)
      return pointToSegmentDistance(point, samples[0]!, samples[0]!) <=
        strokeWidth / 2
        ? 'stroke'
        : undefined
    return samples
      .slice(1)
      .some(
        (sample, index) =>
          pointToSegmentDistance(point, samples[index]!, sample) <=
          strokeWidth / 2,
      )
      ? 'stroke'
      : undefined
  }
  if (layer.kind !== 'shape') return 'fill'
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
  const rectangle =
    point.x >= geometry.x &&
    point.x <= geometry.x + geometry.width &&
    point.y >= geometry.y &&
    point.y <= geometry.y + geometry.height
  const ellipse =
    ((point.x - centerX) / (geometry.width / 2)) ** 2 +
      ((point.y - centerY) / (geometry.height / 2)) ** 2 <=
    1
  const diamond =
    Math.abs((point.x - centerX) / (geometry.width / 2)) +
      Math.abs((point.y - centerY) / (geometry.height / 2)) <=
    1
  const diamondVertices: readonly Point[] = [
    { x: centerX, y: geometry.y },
    { x: geometry.x + geometry.width, y: centerY },
    { x: centerX, y: geometry.y + geometry.height },
    { x: geometry.x, y: centerY },
  ]
  const starCount =
    typeof payload.starPoints === 'number' &&
    Number.isInteger(payload.starPoints) &&
    payload.starPoints >= 3 &&
    payload.starPoints <= 32
      ? payload.starPoints
      : 5
  const starInnerRatio =
    typeof payload.starInnerRatio === 'number' &&
    Number.isFinite(payload.starInnerRatio)
      ? Math.max(0, Math.min(1, payload.starInnerRatio))
      : 0.45
  const starVertices: readonly Point[] = Array.from(
    { length: starCount * 2 },
    (_, index) => {
      const outer = index % 2 === 0
      const angle = -Math.PI / 2 + (Math.PI * index) / starCount
      return {
        x:
          centerX +
          Math.cos(angle) * (geometry.width / 2) * (outer ? 1 : starInnerRatio),
        y:
          centerY +
          Math.sin(angle) *
            (geometry.height / 2) *
            (outer ? 1 : starInnerRatio),
      }
    },
  )
  const inside =
    shape === 'circle' || shape === 'oval'
      ? ellipse
      : shape === 'diamond'
        ? diamond
        : shape === 'star'
          ? pointInPolygon(point, starVertices)
          : rectangle
  if (hasFill && inside) return 'fill'
  if (shape === 'circle' || shape === 'oval') {
    const radiusX = geometry.width / 2
    const radiusY = geometry.height / 2
    const normalizedDistance = Math.hypot(
      (point.x - centerX) / radiusX,
      (point.y - centerY) / radiusY,
    )
    const normalizedTolerance = strokeWidth / (2 * Math.min(radiusX, radiusY))
    return Math.abs(normalizedDistance - 1) <= normalizedTolerance
      ? 'stroke'
      : undefined
  }
  const rectangleVertices: readonly Point[] = [
    { x: geometry.x, y: geometry.y },
    { x: geometry.x + geometry.width, y: geometry.y },
    { x: geometry.x + geometry.width, y: geometry.y + geometry.height },
    { x: geometry.x, y: geometry.y + geometry.height },
  ]
  const vertices =
    shape === 'diamond'
      ? diamondVertices
      : shape === 'star'
        ? starVertices
        : rectangleVertices
  return polygonStrokeHit(point, vertices, strokeWidth) ? 'stroke' : undefined
}
