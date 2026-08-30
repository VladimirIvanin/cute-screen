import type { EditorCommand } from '../../commands/types'
import {
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  type CalloutLayer,
  type LayerNode,
  type NumberedMarkerLayer,
  type TextLayer,
} from '../../document/types'
import { pasteClipboardLayers } from './clipboard-route'

type EditableTextLayer = TextLayer | CalloutLayer | NumberedMarkerLayer

export function createTextCommitCommand(input: {
  readonly existing?: EditableTextLayer
  readonly next: EditableTextLayer | null
  /** Required only when removing an existing layer. */
  readonly index?: number
}): EditorCommand | null {
  if (input.existing === undefined) {
    return input.next === null
      ? null
      : Object.freeze({ type: 'addLayer', layer: input.next })
  }
  if (input.next === null) {
    const index = input.index
    if (!Number.isInteger(index) || (index as number) < 0) {
      throw new Error(
        'removing committed text requires its non-negative layer index',
      )
    }
    return Object.freeze({
      type: 'removeLayer',
      layer: input.existing,
      index: index as number,
    })
  }
  if (input.existing.id !== input.next.id) {
    throw new Error('text update must preserve the layer id')
  }
  if (input.existing.kind !== input.next.kind) {
    throw new Error('text update must preserve the container kind')
  }
  return Object.freeze({
    type: 'updateLayer',
    before: input.existing,
    after: input.next,
  })
}

export function createDuplicateLayerCommand(
  source: LayerNode,
  input: {
    readonly id: string
    readonly zoom: number
    readonly cascadeIndex: number
  },
): Extract<EditorCommand, { type: 'duplicateLayer' }> {
  const duplicated = pasteClipboardLayers(
    Object.freeze({
      version: 2,
      documentSchemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
      layers: Object.freeze([source]),
    }),
    { ...input, id: () => input.id },
  )[0]
  if (!duplicated) throw new Error('duplicate source did not produce a layer')
  return Object.freeze({
    type: 'duplicateLayer',
    sourceId: source.id,
    layer: duplicated,
  })
}

/** A multi-layer paste remains one undo/redo entry. */
export function createPasteLayersCommand(
  layers: readonly LayerNode[],
): EditorCommand | null {
  if (layers.length === 0) return null
  if (layers.length === 1) {
    const layer = layers[0]
    if (!layer) return null
    return Object.freeze({ type: 'addLayer', layer })
  }
  return Object.freeze({
    type: 'batch',
    commands: Object.freeze(
      layers.map((layer) => ({ type: 'addLayer', layer }) as const),
    ),
  })
}
