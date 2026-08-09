import type { EditorDocumentV1, LayerNode, Rect } from '../document/types'

export interface IdGenerator {
  next(): string
}

export type EditorCommand =
  | Readonly<{ type: 'addLayer'; layer: LayerNode }>
  | Readonly<{ type: 'removeLayer'; layer: LayerNode; index: number }>
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
  /** Monotonic identity for a committed document state, not an undo depth. */
  readonly versionToken: number
}

export interface CommandManagerOptions {
  readonly maxEntries?: number
  readonly maxBytes?: number
}
