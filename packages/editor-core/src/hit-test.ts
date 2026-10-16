import {
  resolveFreehandGeometry,
  freehandOutlineContains,
} from './tools/freehand'
import {
  isShapeKind,
  shapeGeometry,
  flattenShapePath,
} from './shapes'
import RBush from 'rbush'

import {
  arrowCapSize,
  arrowPathPoints,
} from './arrow-geometry'
import {
  calloutMarkerRadius,
  calloutPathPoints,
  calloutTextRect,
} from './callout-geometry'
import type {
  ArrowLayerPayload,
  EditorDocumentV1,
  JsonObject,
  Point,
} from './document/types'
import {
  invertMatrix,
  transformPoint,
  transformToMatrix,
} from './geometry'
import { precisionLayerHitPart } from './tools/precision/hit-test'

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

  update(
    document: EditorDocumentV1,
    changedLayerIds: readonly string[],
  ): void {
    this.#document = document
    for (const id of changedLayerIds) {
      const previous = this.#itemsById.get(id)
      if (previous) {
        this.#tree.remove(previous, (left, right) => left.layerId === right.layerId)
        this.#itemsById.delete(id)
      }
      const layer = document.layers.find((candidate) => candidate.id === id)
      if (
        !layer ||
        !layer.visible ||
        layer.locked
      ) continue
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
      const hit = hitLayer(layer, canvasPoint, index, this.#document.canvas)
      if (hit) hits.push(hit)
    }
    return Object.freeze(hits)
  }

  #insertAll(document: EditorDocumentV1): void {
    const items = document.layers.filter((layer) => layer.visible && !layer.locked).map(spatialItem)
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
    if (
      !layer ||
      !layer.visible ||
      layer.locked
    ) continue
    const hit = hitLayer(layer, canvasPoint, index, document.canvas)
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
    if (
      !layer ||
      !layer.visible ||
      layer.locked
    ) continue
    const hit = hitLayer(layer, canvasPoint, index, document.canvas)
    if (hit) hits.push(hit)
  }
  return Object.freeze(hits)
}

function hitLayer(
  layer: EditorDocumentV1['layers'][number],
  canvasPoint: Point,
  zOrder: number,
  canvas: EditorDocumentV1['canvas'],
): HitTestResult | undefined {
  const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
  const local = transformPoint(invertMatrix(transformToMatrix(layer.transform)), canvasPoint)
  if (
    local.x < bounds.x ||
    local.x > bounds.x + bounds.width ||
    local.y < bounds.y ||
    local.y > bounds.y + bounds.height
  )
    return undefined
  const part = drawingHitPart(layer, local, canvas)
  if (!part) return undefined
  return Object.freeze({
    nodeId: layer.id,
    part,
    distance: 0,
    zOrder,
  })
}

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

function drawingHitPart(
  layer: EditorDocumentV1['layers'][number],
  point: Point,
  canvas: EditorDocumentV1['canvas'],
): HitPart | undefined {
  if (layer.kind === 'image') return 'fill'
  if (
    layer.kind === 'censor' ||
    layer.kind === 'spotlight' ||
    layer.kind === 'ruler' ||
    layer.kind === 'loupe'
  ) {
    return precisionLayerHitPart(layer, point, canvas)
  }
  if (layer.kind === 'callout') {
    const callout = layer.payload
    const samples = calloutPathPoints(callout)
    const strokeWidth = callout.stroke.width
    const bodyHit = samples
      .slice(1)
      .some((sample, index) => pointToSegmentDistance(point, samples[index]!, sample) <= strokeWidth / 2)
    if (bodyHit) return 'stroke'
    const markerRadius = calloutMarkerRadius(strokeWidth)
    const markerHit = (anchor: Point) => Math.hypot(point.x - anchor.x, point.y - anchor.y) <= markerRadius
    if (markerHit(callout.target) || markerHit(callout.label)) return 'stroke'
    const textRect = calloutTextRect(callout)
    return pointInRect(point, textRect) ? 'fill' : undefined
  }
  if (
    layer.kind !== 'arrow' &&
    layer.kind !== 'pencil' &&
    layer.kind !== 'marker' &&
    layer.kind !== 'shape'
  ) {
    return 'fill'
  }
  const payload = layer.payload
  const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
  const strokeWidth = payloadStrokeWidth(payload)
  if (layer.kind === 'arrow') {
    const arrow = payload as unknown as ArrowLayerPayload
    const samples = arrowPathPoints(arrow)
    const bodyHit = samples
      .slice(1)
      .some((sample, index) => pointToSegmentDistance(point, samples[index]!, sample) <= strokeWidth / 2)
    if (bodyHit) return 'stroke'
    const capHit = (cap: ArrowLayerPayload['startCap'], anchor: Point) =>
      cap !== 'none' && Math.hypot(point.x - anchor.x, point.y - anchor.y) <= arrowCapSize(cap, strokeWidth)
    return capHit(arrow.startCap, arrow.start) || capHit(arrow.endCap, arrow.end) ? 'stroke' : undefined
  }
  if (layer.kind === 'pencil' || layer.kind === 'marker') {
    const geometry = resolveFreehandGeometry(payload, layer.kind === 'pencil')
    if (geometry.outline.length) return freehandOutlineContains(geometry.outline, point) ? 'stroke' : undefined
    const samples = geometry.points
    if (samples.length === 1)
      return pointToSegmentDistance(point, samples[0]!, samples[0]!) <= geometry.width * (layer.kind === 'pencil' && !geometry.modern ? samples[0]!.pressure : 1) / 2 ? 'stroke' : undefined
    return samples.slice(1).some((sample, index) => pointToSegmentDistance(point, samples[index]!, sample) <= geometry.width * (layer.kind === 'pencil' && !geometry.modern ? (sample.pressure + samples[index]!.pressure) / 2 : 1) / 2) ? 'stroke' : undefined
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
  if (shape === 'circle' || shape === 'oval') {
    const radiusX = geometry.width / 2
    const radiusY = geometry.height / 2
    const distance = Math.hypot((point.x - centerX) / radiusX, (point.y - centerY) / radiusY)
    if (hasFill && distance <= 1) return 'fill'
    return Math.abs(distance - 1) <= strokeWidth / (2 * Math.min(radiusX, radiusY)) ? 'stroke' : undefined
  }
  const path = shapeGeometry(shape, geometry.width, geometry.height, {
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
    pointToSegmentDistance(local, contour[i]!, end) <= strokeWidth / 2)) ? 'stroke' : undefined
}
