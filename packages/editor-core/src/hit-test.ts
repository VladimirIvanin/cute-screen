import RBush from 'rbush'

import type { EditorDocumentV1, Point } from './document/types'
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
    return hitTestDocumentAll(this.#document, canvasPoint).filter((hit) =>
      candidateIds.has(hit.nodeId),
    )
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
    const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
    const local = transformPoint(
      invertMatrix(transformToMatrix(layer.transform)),
      canvasPoint,
    )
    if (
      local.x >= bounds.x &&
      local.x <= bounds.x + bounds.width &&
      local.y >= bounds.y &&
      local.y <= bounds.y + bounds.height
    ) {
      return Object.freeze({
        nodeId: layer.id,
        part: 'fill',
        distance: 0,
        zOrder: index,
      })
    }
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
    const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
    const local = transformPoint(
      invertMatrix(transformToMatrix(layer.transform)),
      canvasPoint,
    )
    if (
      local.x >= bounds.x &&
      local.x <= bounds.x + bounds.width &&
      local.y >= bounds.y &&
      local.y <= bounds.y + bounds.height
    ) {
      hits.push(
        Object.freeze({
          nodeId: layer.id,
          part: 'fill',
          distance: 0,
          zOrder: index,
        }),
      )
    }
  }
  return Object.freeze(hits)
}
