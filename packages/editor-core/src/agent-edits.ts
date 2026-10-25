import {
  applyEditorCommand,
  createFlipCanvasCommand,
} from './commands/operations'
import { prepareCropRulers } from './commands/manager'
import type { EditorCommand } from './commands/types'
import type {
  EditorDocumentV1,
  LayerNode,
  Rect,
} from './document/types'
import { emojiReference } from './emoji'
import { findEmoji } from './emoji-catalog'
import { createDrawingLayer } from './drawing'
import { createTextLayer } from './tools/content/text'
import { createCalloutLayer } from './tools/content/callout'
import { createNumberedMarkerLayer } from './tools/content/marker'
import {
  createContentImageLayer,
  createEmojiLayer,
} from './tools/content/media'
import { createCensorLayer } from './tools/precision/censor'
import { createSpotlightLayer } from './tools/precision/spotlight'
import { createRulerLayer } from './tools/precision/ruler'
import { createLoupeLayer } from './tools/precision/loupe'
import { createDuplicateLayerCommand } from './tools/content/commands'

const factories = {
  drawing: createDrawingLayer, text: createTextLayer, callout: createCalloutLayer,
  numberedMarker: createNumberedMarkerLayer, image: createContentImageLayer, emoji: createEmojiLayer,
  censor: createCensorLayer, spotlight: createSpotlightLayer, ruler: createRulerLayer, loupe: createLoupeLayer,
}
type Factories = typeof factories
export type AgentCreateEdit = {
  [K in keyof Factories]: {
    readonly type: 'create'
    readonly tool: K
    readonly space?: 'content' | 'card'
    readonly input: Omit<Parameters<Factories[K]>[0], 'id'>
  }
}[keyof Factories]
type AgentLayerChanges = { [K in LayerNode['kind']]: Partial<Omit<Extract<LayerNode, { kind: K }>, 'id' | 'kind'>> }[LayerNode['kind']]
export type AgentEdit = AgentCreateEdit
  | { readonly type: 'update'; readonly layerId: string; readonly changes: AgentLayerChanges }
  | { readonly type: 'remove'; readonly layerId: string }
  | { readonly type: 'duplicate'; readonly layerId: string }
  | { readonly type: 'reorder'; readonly layerId: string; readonly index: number }
  | { readonly type: 'crop'; readonly bounds: Rect | null }
  | { readonly type: 'flip'; readonly axis: 'horizontal' | 'vertical' }
  | { readonly type: 'presentation'; readonly value: EditorDocumentV1['presentation'] }

function editableLayer(
  document: EditorDocumentV1,
  id: string,
): LayerNode {
  const layer = document.layers.find((candidate) => candidate.id === id)
  if (!layer) throw new Error('layer not found')
  if (layer.kind === 'image' && layer.payload.role === 'base') throw new Error('base image is immutable')
  return layer
}

function updateCommand(
  document: EditorDocumentV1,
  edit: Extract<AgentEdit, { type: 'update' }>,
): EditorCommand {
  const before = editableLayer(document, edit.layerId)
  if ('opacity' in edit.changes && edit.changes.opacity !== undefined) {
    if (
      !Number.isFinite(edit.changes.opacity) ||
      edit.changes.opacity < 0 ||
      edit.changes.opacity > 1
    )
      throw new Error('invalid opacity')
  }
  const allowed = new Set(['transform', 'localBounds', 'opacity', 'visible', 'locked', 'blendMode', 'shadows', 'payload', 'space'])
  if (Object.keys(edit.changes).some((key) => !allowed.has(key))) throw new Error('unsupported layer property')
  return { type: 'updateLayer', before, after: { ...before, ...edit.changes, id: before.id, kind: before.kind } as LayerNode }
}

function commandFor(
  document: EditorDocumentV1,
  edit: AgentEdit,
  id: () => string,
): EditorCommand {
  switch (edit.type) {
    case 'create': {
      if (!Object.hasOwn(factories, edit.tool)) throw new Error('unknown creation tool')
      // The public union pairs each tool with its own factory input. Runtime values
      // still pass the factory and the complete production document codec below.
      const factory = factories[edit.tool] as (input: unknown) => LayerNode | null | undefined
      if (edit.tool === 'emoji') {
        const reference = emojiReference(edit.input.asset.assetId)
        const entry = findEmoji(reference.assetId)
        if (reference.version !== edit.input.asset.version || entry?.grapheme !== edit.input.grapheme)
          throw new Error('emoji must match a bundled asset from list_assets')
      }
      const layer = factory({ ...edit.input, id: id() })
      if (!layer) throw new Error('creation has no geometry or content')
      if (layer.kind === 'image' && layer.payload.role === 'base') throw new Error('cannot create base image')
      return { type: 'addLayer', layer: edit.space === 'card' ? { ...layer, space: 'card' } : layer }
    }
    case 'update': {
      return updateCommand(document, edit)
    }
    case 'remove': {
      const layer = editableLayer(document, edit.layerId)
      return { type: 'removeLayer', layer, index: document.layers.indexOf(layer) }
    }
    case 'duplicate': return createDuplicateLayerCommand(editableLayer(document, edit.layerId), { id: id(), zoom: 100, cascadeIndex: 1 })
    case 'reorder': {
      const layer = editableLayer(document, edit.layerId)
      return { type: 'reorderLayer', layerId: layer.id, fromIndex: document.layers.indexOf(layer), toIndex: edit.index }
    }
    case 'crop': return { type: 'setCrop', before: document.crop, after: edit.bounds }
    case 'flip': {
      if (edit.axis !== 'horizontal' && edit.axis !== 'vertical') throw new Error('invalid flip axis')
      return createFlipCanvasCommand(document, edit.axis)
    }
    case 'presentation': return { type: 'setPresentation', before: document.presentation, after: edit.value }
    default: throw new Error('unknown edit operation')
  }
}

/** Preflight every operation without changing the live session. One batch = one Undo. */
export function createAgentEditCommand(
  document: EditorDocumentV1,
  edits: readonly AgentEdit[],
  id: () => string,
): EditorCommand {
  if (
    !Array.isArray(edits) ||
    edits.length < 1 ||
    edits.length > 100
  ) throw new Error('expected 1–100 operations')
  let candidate = document
  const commands = edits.map((edit) => {
    const command = prepareCropRulers(candidate, commandFor(candidate, edit, id))
    candidate = applyEditorCommand(candidate, command)
    return command
  })
  return { type: 'batch', commands }
}
