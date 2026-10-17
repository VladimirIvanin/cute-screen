import RBush from 'rbush'
import { numberedMarkerGeometryBounds } from './numbered-marker'
import {
  calloutGeometryBounds,
  type CalloutGeometryContext,
} from './callout-geometry'
import type {
  EditorDocumentV1,
  Point,
  Rect,
} from './document/types'
import {
  invertMatrix,
  transformPoint,
  transformToMatrix,
} from './geometry'
import { drawingHitPart } from './layer-hit-test'
import { createStrokeHitMetric } from './hit-test-metric'
import { LAYER_INTERACTION_POLICIES } from './interaction-policy'

export interface HitTestOptions {
  /** Additional CSS pixels around geometry. Omitted options retain exact legacy queries. */
  readonly margin?: number
  readonly screenScale?: Point
  readonly useInteractionPolicy?: boolean
}

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
  #layers = new Map<string, { readonly layer: EditorDocumentV1['layers'][number]; readonly zOrder: number }>()
  readonly #context: CalloutGeometryContext

  constructor(
    document: EditorDocumentV1,
    context: CalloutGeometryContext = {},
  ) {
    this.#context = context
    this.#document = document
    this.#syncLayers(document)
    this.#insertAll(document)
  }

  update(
    document: EditorDocumentV1,
    changedLayerIds: readonly string[],
  ): void {
    this.#document = document
    this.#syncLayers(document)
    for (const id of changedLayerIds) {
      const previous = this.#itemsById.get(id)
      if (previous) {
        this.#tree.remove(previous, (left, right) => left.layerId === right.layerId)
        this.#itemsById.delete(id)
      }
      const layer = this.#layers.get(id)?.layer
      if (
        !layer ||
        !layer.visible ||
        layer.locked
      ) continue
      const item = spatialItem(layer, this.#context)
      this.#tree.insert(item)
      this.#itemsById.set(id, item)
    }
  }

  hitAll(
    canvasPoint: Point,
    options: HitTestOptions = {},
  ): readonly HitTestResult[] {
    const scale = options.screenScale ?? { x: 1, y: 1 }
    const policyMargin = Math.max(...Object.values(LAYER_INTERACTION_POLICIES).map((policy) => policy.marginCss))
    const margin = options.margin ?? (options.useInteractionPolicy ? policyMargin : 0)
    const candidates = this.#tree.search({
      minX: canvasPoint.x - margin / scale.x,
      minY: canvasPoint.y - margin / scale.y,
      maxX: canvasPoint.x + margin / scale.x,
      maxY: canvasPoint.y + margin / scale.y,
    })
    const hits: HitTestResult[] = []
    for (const candidate of candidates) {
      const entry = this.#layers.get(candidate.layerId)
      if (!entry) continue
      const { layer, zOrder } = entry
      const hit = hitLayer(
        layer,
        canvasPoint,
        zOrder,
        this.#document.crop ?? this.#document.canvas,
        this.#context,
        options,
      )
      if (hit) hits.push(hit)
    }
    return Object.freeze(hits.sort((left, right) => right.zOrder - left.zOrder))
  }

  #syncLayers(document: EditorDocumentV1): void {
    this.#layers = new Map(document.layers.map((layer, zOrder) => [layer.id, { layer, zOrder }]))
  }

  #insertAll(document: EditorDocumentV1): void {
    const items = document.layers
      .filter((layer) => layer.visible && !layer.locked)
      .map((layer) => spatialItem(layer, this.#context))
    this.#tree.load(items)
    this.#itemsById = new Map(items.map((item) => [item.layerId, item]))
  }
}

function spatialItem(
  layer: EditorDocumentV1['layers'][number],
  context: CalloutGeometryContext,
): SpatialItem {
  const bounds = layerHitBounds(layer, context)
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
  context: CalloutGeometryContext = {},
  options: HitTestOptions = {},
): HitTestResult | undefined {
  for (let index = document.layers.length - 1; index >= 0; index -= 1) {
    const layer = document.layers[index]
    if (
      !layer ||
      !layer.visible ||
      layer.locked
    ) continue
    const hit = hitLayer(layer, canvasPoint, index, document.crop ?? document.canvas, context, options)
    if (hit) return hit
  }
  return undefined
}

/** Returns the z-ordered candidates needed by the transient overlap-cycle UI. */
export function hitTestDocumentAll(
  document: EditorDocumentV1,
  canvasPoint: Point,
  context: CalloutGeometryContext = {},
  options: HitTestOptions = {},
): readonly HitTestResult[] {
  const hits: HitTestResult[] = []
  for (let index = document.layers.length - 1; index >= 0; index -= 1) {
    const layer = document.layers[index]
    if (
      !layer ||
      !layer.visible ||
      layer.locked
    ) continue
    const hit = hitLayer(layer, canvasPoint, index, document.crop ?? document.canvas, context, options)
    if (hit) hits.push(hit)
  }
  return Object.freeze(hits)
}

function hitLayer(
  layer: EditorDocumentV1['layers'][number],
  canvasPoint: Point,
  zOrder: number,
  canvas: EditorDocumentV1['canvas'],
  context: CalloutGeometryContext,
  options: HitTestOptions,
): HitTestResult | undefined {
  const bounds = layerHitBounds(layer, context)
  const screenScale = options.screenScale ?? { x: 1, y: 1 }
  const margin = options.margin ?? (options.useInteractionPolicy ? LAYER_INTERACTION_POLICIES[layer.kind].marginCss : 0)
  const padding = margin /
    (Math.min(screenScale.x, screenScale.y) *
      Math.min(Math.abs(layer.transform.scaleX), Math.abs(layer.transform.scaleY)))
  const local = transformPoint(invertMatrix(transformToMatrix(layer.transform)), canvasPoint)
  if (
    local.x < bounds.x - padding ||
    local.x > bounds.x + bounds.width + padding ||
    local.y < bounds.y - padding ||
    local.y > bounds.y + bounds.height + padding
  )
    return undefined
  const precise = options.screenScale !== undefined ||
    options.margin !== undefined || options.useInteractionPolicy === true
  const boundsPolicy = options.useInteractionPolicy && LAYER_INTERACTION_POLICIES[layer.kind].primaryHit === 'bounds'
  const part = boundsPolicy ? 'fill' : drawingHitPart(layer, local, canvas, context, padding, precise,
    precise ? createStrokeHitMetric(layer.transform, screenScale, margin) : undefined)
  if (!part) return undefined
  return Object.freeze({
    nodeId: layer.id,
    part,
    distance: 0,
    zOrder,
  })
}

export function layerHitBounds(
  layer: EditorDocumentV1['layers'][number],
  context: CalloutGeometryContext = {},
): Rect {
  return layer.kind === 'callout' ? calloutGeometryBounds(layer.payload, context)
    : layer.kind === 'numberedMarker' ? numberedMarkerGeometryBounds(layer, context) : layer.localBounds
}
