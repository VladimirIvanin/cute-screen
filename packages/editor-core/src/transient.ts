import type { CommandManager } from './commands/manager'
import type { EditorCommand, EditorSnapshot } from './commands/types'
import type { EditorDocumentV1 } from './document/types'

/** UI-only interaction state which must never be persisted with a document. */
export interface EditorTransientState<TDraft> {
  readonly selectionIds: readonly string[]
  readonly hoveredLayerId?: string
  readonly draft: TDraft | null
}

function snapshot<TDraft>(
  selectionIds: readonly string[],
  hoveredLayerId: string | undefined,
  draft: TDraft | null,
): EditorTransientState<TDraft> {
  return Object.freeze({
    selectionIds: Object.freeze([...selectionIds]),
    ...(hoveredLayerId === undefined ? {} : { hoveredLayerId }),
    draft,
  })
}

/**
 * Owns selection, hover and an in-progress gesture separately from committed
 * document state. A draft becomes persistent only through `commitDraft`.
 */
export class TransientEditorStateController<TDraft> {
  #selectionIds: readonly string[] = Object.freeze([])
  #hoveredLayerId: string | undefined
  #draft: TDraft | null = null

  get snapshot(): EditorTransientState<TDraft> {
    return snapshot(this.#selectionIds, this.#hoveredLayerId, this.#draft)
  }

  setSelection(ids: readonly string[]): EditorTransientState<TDraft> {
    this.#selectionIds = Object.freeze([...new Set(ids)])
    return this.snapshot
  }

  setHoveredLayer(id: string | undefined): EditorTransientState<TDraft> {
    this.#hoveredLayerId = id
    return this.snapshot
  }

  beginDraft(draft: TDraft): EditorTransientState<TDraft> {
    if (this.#draft !== null)
      throw new Error('a transient draft is already active')
    this.#draft = draft
    return this.snapshot
  }

  updateDraft(draft: TDraft): EditorTransientState<TDraft> {
    if (this.#draft === null) throw new Error('no transient draft is active')
    this.#draft = draft
    return this.snapshot
  }

  cancelDraft(): EditorTransientState<TDraft> {
    this.#draft = null
    return this.snapshot
  }

  commitDraft(manager: CommandManager, command: EditorCommand): EditorSnapshot {
    if (this.#draft === null) throw new Error('no transient draft is active')
    const committed = manager.execute(command)
    this.#draft = null
    this.reconcile(committed.document)
    return committed
  }

  reconcile(document: EditorDocumentV1): EditorTransientState<TDraft> {
    const ids = new Set(document.layers.map((layer) => layer.id))
    this.#selectionIds = Object.freeze(
      this.#selectionIds.filter((id) => ids.has(id)),
    )
    if (this.#hoveredLayerId && !ids.has(this.#hoveredLayerId)) {
      this.#hoveredLayerId = undefined
    }
    return this.snapshot
  }

  reset(): EditorTransientState<TDraft> {
    this.#selectionIds = Object.freeze([])
    this.#hoveredLayerId = undefined
    this.#draft = null
    return this.snapshot
  }
}
