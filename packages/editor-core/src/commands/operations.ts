import { normalizeEditorDocument } from '../document/codec'
import { jsonEquals } from '../document/json'
import type { EditorDocumentV1, LayerNode } from '../document/types'
import { assertLayerEditableScale } from '../layer-resize'
import { rebaseRulerLayer } from '../tools/precision/ruler'
import type { EditorCommand } from './types'

function assertNever(value: never): never {
  throw new Error(`unsupported editor command: ${String(value)}`)
}

/** Creates one atomic document-level reflection; locked and hidden layers are intentional participants. */
export function createFlipCanvasCommand(
  document: EditorDocumentV1,
  axis: 'horizontal' | 'vertical',
): Extract<EditorCommand, { type: 'flipCanvas' }> {
  const afterLayers = document.layers.map((layer) => {
    const { transform } = layer
    const radians = (transform.rotation * Math.PI) / 180
    const scaleX = Math.hypot(
      transform.scaleX * Math.cos(radians),
      transform.scaleX * Math.sin(radians),
    )
    const nextRotation =
      axis === 'horizontal'
        ? (Math.atan2(
            transform.scaleX * Math.sin(radians),
            -transform.scaleX * Math.cos(radians),
          ) *
            180) /
          Math.PI
        : Math.atan2(
            -transform.scaleX * Math.sin(radians),
            transform.scaleX * Math.cos(radians),
          ) *
          (180 / Math.PI)
    const reflected = {
      ...layer,
      transform: {
        translateX:
          axis === 'horizontal'
            ? document.canvas.width - transform.translateX
            : transform.translateX,
        translateY:
          axis === 'vertical'
            ? document.canvas.height - transform.translateY
            : transform.translateY,
        rotation: nextRotation,
        scaleX,
        scaleY:
          -Math.sign(transform.scaleX * transform.scaleY) *
          Math.abs(transform.scaleY),
      },
    } as LayerNode
    if (reflected.kind === 'ruler') {
      return rebaseRulerLayer(reflected, reflected.payload, document.canvas)
    }
    if (reflected.kind !== 'loupe') return reflected
    const source = reflected.payload.sourceRegion
    return {
      ...reflected,
      payload: {
        ...reflected.payload,
        sourceRegion: {
          ...source,
          ...(axis === 'horizontal'
            ? { x: document.canvas.width - source.x - source.width }
            : { y: document.canvas.height - source.y - source.height }),
        },
      },
    } as LayerNode
  })
  const crop = document.crop
  const afterCrop =
    crop === null
      ? null
      : axis === 'horizontal'
        ? { ...crop, x: document.canvas.width - crop.x - crop.width }
        : { ...crop, y: document.canvas.height - crop.y - crop.height }
  return Object.freeze({
    type: 'flipCanvas',
    axis,
    beforeLayers: document.layers,
    afterLayers: Object.freeze(afterLayers),
    beforeCrop: document.crop,
    afterCrop: afterCrop === null ? null : Object.freeze(afterCrop),
  })
}

function replaceDocument(
  document: EditorDocumentV1,
  next: Pick<EditorDocumentV1, 'layers'> | Pick<EditorDocumentV1, 'crop'>,
): EditorDocumentV1 {
  return normalizeEditorDocument({ ...document, ...next })
}

function findLayer(document: EditorDocumentV1, id: string): LayerNode {
  const layer = document.layers.find((candidate) => candidate.id === id)
  if (!layer) throw new Error(`layer ${id} was not found`)
  return layer
}

function assertLayerIsUnlocked(layer: LayerNode): void {
  if (layer.locked) throw new Error(`layer ${layer.id} is locked`)
}

function assertCurrentLayer(
  current: LayerNode,
  expected: LayerNode,
  message: string,
): void {
  if (!jsonEquals(current, expected)) throw new Error(message)
}

function isUnlockOnlyChange(before: LayerNode, after: LayerNode): boolean {
  return (
    before.locked &&
    !after.locked &&
    jsonEquals({ ...before, locked: false }, after)
  )
}

function applyAddLayer(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'addLayer' }>,
): EditorDocumentV1 {
  assertLayerEditableScale(command.layer)
  if (document.layers.some((layer) => layer.id === command.layer.id)) {
    throw new Error(`duplicate layer id: ${command.layer.id}`)
  }
  return replaceDocument(document, {
    layers: [...document.layers, command.layer],
  })
}

function applyRemoveLayer(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'removeLayer' }>,
): EditorDocumentV1 {
  if (!Number.isInteger(command.index) || command.index < 0) {
    throw new Error('remove layer index is invalid')
  }
  const current = document.layers[command.index]
  if (!current || current.id !== command.layer.id) {
    throw new Error('remove source no longer matches')
  }
  assertCurrentLayer(
    current,
    command.layer,
    `layer ${command.layer.id} changed before removal`,
  )
  assertLayerIsUnlocked(current)
  return replaceDocument(document, {
    layers: document.layers.filter((_, index) => index !== command.index),
  })
}

function applyUpdateLayer(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'updateLayer' }>,
): EditorDocumentV1 {
  const current = findLayer(document, command.before.id)
  assertCurrentLayer(
    current,
    command.before,
    `layer ${command.before.id} changed before update`,
  )
  if (
    command.before.id !== command.after.id ||
    command.before.kind !== command.after.kind
  ) {
    throw new Error('updateLayer cannot change id or kind')
  }
  if (current.locked && !isUnlockOnlyChange(command.before, command.after)) {
    throw new Error(`layer ${current.id} is locked`)
  }
  assertLayerEditableScale(command.after)
  return replaceDocument(document, {
    layers: document.layers.map((layer) =>
      layer.id === command.before.id ? command.after : layer,
    ),
  })
}

function reorderLayers(
  document: EditorDocumentV1,
  layerId: string,
  fromIndex: number,
  toIndex: number,
  enforceLock: boolean,
): EditorDocumentV1 {
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    toIndex >= document.layers.length
  ) {
    throw new Error('reorder target is invalid')
  }
  const current = document.layers[fromIndex]
  if (!current || current.id !== layerId) {
    throw new Error('reorder source no longer matches')
  }
  if (enforceLock) assertLayerIsUnlocked(current)
  const layers = [...document.layers]
  layers.splice(fromIndex, 1)
  layers.splice(toIndex, 0, current)
  return replaceDocument(document, { layers })
}

function applyReorderLayer(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'reorderLayer' }>,
): EditorDocumentV1 {
  return reorderLayers(
    document,
    command.layerId,
    command.fromIndex,
    command.toIndex,
    true,
  )
}

function applyDuplicateLayer(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'duplicateLayer' }>,
): EditorDocumentV1 {
  const source = findLayer(document, command.sourceId)
  assertLayerIsUnlocked(source)
  if (document.layers.some((layer) => layer.id === command.layer.id)) {
    throw new Error(`duplicate layer id: ${command.layer.id}`)
  }
  assertLayerEditableScale(command.layer)
  return replaceDocument(document, {
    layers: [...document.layers, command.layer],
  })
}

function applySetCrop(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'setCrop' }>,
): EditorDocumentV1 {
  if (!jsonEquals(document.crop, command.before)) {
    throw new Error('crop changed before update')
  }
  return replaceDocument(document, { crop: command.after })
}

function applyBatch(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'batch' }>,
): EditorDocumentV1 {
  if (command.commands.length === 0) throw new Error('batch must not be empty')
  return command.commands.reduce(applyEditorCommand, document)
}

function applyFlipCanvas(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'flipCanvas' }>,
): EditorDocumentV1 {
  if (
    !jsonEquals(document.layers, command.beforeLayers) ||
    !jsonEquals(document.crop, command.beforeCrop)
  ) {
    throw new Error('flip source no longer matches')
  }
  return replaceDocument(document, {
    layers: command.afterLayers,
    crop: command.afterCrop,
  })
}

export function applyEditorCommand(
  document: EditorDocumentV1,
  command: EditorCommand,
): EditorDocumentV1 {
  switch (command.type) {
    case 'addLayer':
      return applyAddLayer(document, command)
    case 'removeLayer':
      return applyRemoveLayer(document, command)
    case 'updateLayer':
      return applyUpdateLayer(document, command)
    case 'reorderLayer':
      return applyReorderLayer(document, command)
    case 'duplicateLayer':
      return applyDuplicateLayer(document, command)
    case 'setCrop':
      return applySetCrop(document, command)
    case 'batch':
      return applyBatch(document, command)
    case 'flipCanvas':
      return applyFlipCanvas(document, command)
    default:
      return assertNever(command)
  }
}

function revertAddLayer(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'addLayer' }>,
): EditorDocumentV1 {
  const index = document.layers.findIndex(
    (layer) => layer.id === command.layer.id,
  )
  const current = document.layers[index]
  if (index < 0 || !current)
    throw new Error(`layer ${command.layer.id} was not found`)
  assertCurrentLayer(
    current,
    command.layer,
    `layer ${command.layer.id} changed before revert`,
  )
  return replaceDocument(document, {
    layers: document.layers.filter((_, layerIndex) => layerIndex !== index),
  })
}

function revertRemoveLayer(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'removeLayer' }>,
): EditorDocumentV1 {
  if (
    !Number.isInteger(command.index) ||
    command.index < 0 ||
    command.index > document.layers.length
  ) {
    throw new Error('remove layer index is invalid')
  }
  if (document.layers.some((layer) => layer.id === command.layer.id)) {
    throw new Error(`duplicate layer id: ${command.layer.id}`)
  }
  const layers = [...document.layers]
  layers.splice(command.index, 0, command.layer)
  return replaceDocument(document, { layers })
}

function revertUpdateLayer(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'updateLayer' }>,
): EditorDocumentV1 {
  const current = findLayer(document, command.after.id)
  assertCurrentLayer(
    current,
    command.after,
    `layer ${command.after.id} changed before revert`,
  )
  return replaceDocument(document, {
    layers: document.layers.map((layer) =>
      layer.id === command.after.id ? command.before : layer,
    ),
  })
}

function revertReorderLayer(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'reorderLayer' }>,
): EditorDocumentV1 {
  return reorderLayers(
    document,
    command.layerId,
    command.toIndex,
    command.fromIndex,
    false,
  )
}

function revertDuplicateLayer(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'duplicateLayer' }>,
): EditorDocumentV1 {
  return revertAddLayer(document, { type: 'addLayer', layer: command.layer })
}

function revertSetCrop(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'setCrop' }>,
): EditorDocumentV1 {
  if (!jsonEquals(document.crop, command.after)) {
    throw new Error('crop changed before revert')
  }
  return replaceDocument(document, { crop: command.before })
}

function revertBatch(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'batch' }>,
): EditorDocumentV1 {
  return [...command.commands].reverse().reduce(revertEditorCommand, document)
}

function revertFlipCanvas(
  document: EditorDocumentV1,
  command: Extract<EditorCommand, { type: 'flipCanvas' }>,
): EditorDocumentV1 {
  if (
    !jsonEquals(document.layers, command.afterLayers) ||
    !jsonEquals(document.crop, command.afterCrop)
  ) {
    throw new Error('flip result no longer matches')
  }
  return replaceDocument(document, {
    layers: command.beforeLayers,
    crop: command.beforeCrop,
  })
}

export function revertEditorCommand(
  document: EditorDocumentV1,
  command: EditorCommand,
): EditorDocumentV1 {
  switch (command.type) {
    case 'addLayer':
      return revertAddLayer(document, command)
    case 'removeLayer':
      return revertRemoveLayer(document, command)
    case 'updateLayer':
      return revertUpdateLayer(document, command)
    case 'reorderLayer':
      return revertReorderLayer(document, command)
    case 'duplicateLayer':
      return revertDuplicateLayer(document, command)
    case 'setCrop':
      return revertSetCrop(document, command)
    case 'batch':
      return revertBatch(document, command)
    case 'flipCanvas':
      return revertFlipCanvas(document, command)
    default:
      return assertNever(command)
  }
}
