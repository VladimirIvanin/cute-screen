import {
  parseEditorDocument,
  serializeEditorDocument,
  type EditorDocumentV1,
  type LayerNode,
  type Rect,
} from './document'

export interface IdGenerator {
  next(): string
}

export type EditorCommand =
  | Readonly<{ type: 'addLayer'; layer: LayerNode }>
  | Readonly<{ type: 'removeLayer'; layer: LayerNode }>
  | Readonly<{ type: 'updateLayer'; before: LayerNode; after: LayerNode }>
  | Readonly<{
      type: 'reorderLayer'
      layerId: string
      fromIndex: number
      toIndex: number
    }>
  | Readonly<{ type: 'duplicateLayer'; sourceId: string; layer: LayerNode }>
  | Readonly<{ type: 'setCrop'; before: Rect | null; after: Rect | null }>

export interface EditorSnapshot {
  readonly document: EditorDocumentV1
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly dirty: boolean
  readonly versionToken: number
}

interface Entry {
  readonly command: EditorCommand
  readonly before: EditorDocumentV1
  readonly after: EditorDocumentV1
  readonly bytes: number
  readonly beforeToken: number
  readonly afterToken: number
}

export interface CommandManagerOptions {
  readonly maxEntries?: number
  readonly maxBytes?: number
}

const DEFAULT_MAX_ENTRIES = 200
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024

function cloneDocument(
  document: EditorDocumentV1,
  next: Partial<EditorDocumentV1>,
): EditorDocumentV1 {
  const candidate = { ...document, ...next }
  const parsed = parseEditorDocument(
    JSON.parse(serializeEditorDocument(candidate)),
  )
  if (parsed.kind !== 'editable')
    throw new Error('cannot mutate unsupported schema')
  return parsed.document
}

function assertLayerMutation(layer: LayerNode): void {
  if (layer.locked) throw new Error(`layer ${layer.id} is locked`)
}

function assertSameLayer(before: LayerNode, after: LayerNode): void {
  if (before.id !== after.id || before.kind !== after.kind)
    throw new Error('updateLayer cannot change id or kind')
  if (before.locked && JSON.stringify(before) !== JSON.stringify(after))
    throw new Error(`layer ${before.id} is locked`)
}

export function applyEditorCommand(
  document: EditorDocumentV1,
  command: EditorCommand,
): EditorDocumentV1 {
  switch (command.type) {
    case 'addLayer': {
      if (document.layers.some((layer) => layer.id === command.layer.id))
        throw new Error(`duplicate layer id: ${command.layer.id}`)
      return cloneDocument(document, {
        layers: [...document.layers, command.layer],
      })
    }
    case 'removeLayer': {
      const current = document.layers.find(
        (layer) => layer.id === command.layer.id,
      )
      if (!current) throw new Error(`layer ${command.layer.id} was not found`)
      assertLayerMutation(current)
      return cloneDocument(document, {
        layers: document.layers.filter((layer) => layer.id !== current.id),
      })
    }
    case 'updateLayer': {
      const current = document.layers.find(
        (layer) => layer.id === command.before.id,
      )
      if (
        !current ||
        JSON.stringify(current) !== JSON.stringify(command.before)
      )
        throw new Error(`layer ${command.before.id} changed before update`)
      assertSameLayer(command.before, command.after)
      return cloneDocument(document, {
        layers: document.layers.map((layer) =>
          layer.id === command.before.id ? command.after : layer,
        ),
      })
    }
    case 'reorderLayer': {
      const current = document.layers[command.fromIndex]
      if (!current || current.id !== command.layerId)
        throw new Error('reorder source no longer matches')
      if (
        !Number.isInteger(command.toIndex) ||
        command.toIndex < 0 ||
        command.toIndex >= document.layers.length
      )
        throw new Error('reorder target is invalid')
      const layers = [...document.layers]
      layers.splice(command.fromIndex, 1)
      layers.splice(command.toIndex, 0, current)
      return cloneDocument(document, { layers })
    }
    case 'duplicateLayer': {
      const source = document.layers.find(
        (layer) => layer.id === command.sourceId,
      )
      if (!source) throw new Error(`layer ${command.sourceId} was not found`)
      assertLayerMutation(source)
      if (document.layers.some((layer) => layer.id === command.layer.id))
        throw new Error(`duplicate layer id: ${command.layer.id}`)
      return cloneDocument(document, {
        layers: [...document.layers, command.layer],
      })
    }
    case 'setCrop':
      if (JSON.stringify(document.crop) !== JSON.stringify(command.before))
        throw new Error('crop changed before update')
      return cloneDocument(document, { crop: command.after })
  }
}

export function revertEditorCommand(
  document: EditorDocumentV1,
  command: EditorCommand,
): EditorDocumentV1 {
  switch (command.type) {
    case 'addLayer':
      return applyEditorCommand(document, {
        type: 'removeLayer',
        layer: { ...command.layer, locked: false },
      })
    case 'removeLayer':
      return applyEditorCommand(document, {
        type: 'addLayer',
        layer: command.layer,
      })
    case 'updateLayer':
      return applyEditorCommand(document, {
        type: 'updateLayer',
        before: command.after,
        after: command.before,
      })
    case 'reorderLayer':
      return applyEditorCommand(document, {
        type: 'reorderLayer',
        layerId: command.layerId,
        fromIndex: command.toIndex,
        toIndex: command.fromIndex,
      })
    case 'duplicateLayer':
      return applyEditorCommand(document, {
        type: 'removeLayer',
        layer: { ...command.layer, locked: false },
      })
    case 'setCrop':
      return applyEditorCommand(document, {
        type: 'setCrop',
        before: command.after,
        after: command.before,
      })
  }
}

export class CommandManager {
  #document: EditorDocumentV1
  #undo: Entry[] = []
  #redo: Entry[] = []
  #token = 0
  #savedToken = 0
  readonly #maxEntries: number
  readonly #maxBytes: number
  #bytes = 0

  constructor(document: EditorDocumentV1, options: CommandManagerOptions = {}) {
    this.#document = document
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
    this.#maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  }

  get snapshot(): EditorSnapshot {
    return Object.freeze({
      document: this.#document,
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
      dirty: this.#token !== this.#savedToken,
      versionToken: this.#token,
    })
  }

  execute(command: EditorCommand): EditorSnapshot {
    const before = this.#document
    const after = applyEditorCommand(before, command)
    const entry: Entry = {
      command,
      before,
      after,
      bytes:
        JSON.stringify(command).length +
        serializeEditorDocument(before).length +
        serializeEditorDocument(after).length,
      beforeToken: this.#token,
      afterToken: this.#token + 1,
    }
    this.#document = after
    this.#token = entry.afterToken
    this.#undo.push(entry)
    this.#bytes += entry.bytes
    this.#redo = []
    this.#trim()
    return this.snapshot
  }

  undo(): EditorSnapshot {
    const entry = this.#undo.pop()
    if (!entry) return this.snapshot
    this.#document = entry.before
    this.#token = entry.beforeToken
    this.#bytes -= entry.bytes
    this.#redo.push(entry)
    return this.snapshot
  }

  redo(): EditorSnapshot {
    const entry = this.#redo.pop()
    if (!entry) return this.snapshot
    this.#document = entry.after
    this.#token = entry.afterToken
    this.#undo.push(entry)
    this.#bytes += entry.bytes
    this.#trim()
    return this.snapshot
  }

  markSaved(versionToken = this.#token): EditorSnapshot {
    this.#savedToken = versionToken
    return this.snapshot
  }

  #trim(): void {
    while (
      this.#undo.length > 1 &&
      (this.#undo.length > this.#maxEntries || this.#bytes > this.#maxBytes)
    ) {
      const entry = this.#undo.shift()
      if (entry) this.#bytes -= entry.bytes
    }
  }
}
