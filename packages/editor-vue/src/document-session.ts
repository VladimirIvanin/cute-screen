import {
  CommandManager,
  normalizeEditableDocumentScales,
  parseEditorDocument,
  serializeEditorDocument,
  TransientEditorStateController,
  type EditorCommand,
  type EditorDocumentV1,
  type EditorSnapshot,
  type EditorTransientState,
  type ParsedEditorDocument,
} from '@cute-screen/editor-renderer'

export type DocumentSaveState =
  'saved' | 'dirty' | 'saving' | 'error' | 'readOnly'

export interface PersistedDocumentRecord {
  readonly documentId: string
  readonly revision: number
  readonly documentJson: string
}

export interface DocumentPersistenceBridge {
  saveDocument(
    record: PersistedDocumentRecord,
    correlationId: string,
  ): Promise<number>
  exportRecoveryBundle(
    documentId: string,
    correlationId: string,
  ): Promise<DocumentRecoveryExportOutcome>
}

export type DocumentRecoveryExportOutcome =
  | { readonly kind: 'saved' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly error: string }

export interface DocumentSessionSnapshot {
  readonly core: EditorSnapshot
  readonly transient: EditorTransientState<unknown>
  readonly saveState: DocumentSaveState
  readonly error?: string
}

export type DocumentFlushOutcome =
  | { readonly kind: 'saved' }
  | { readonly kind: 'noChanges' }
  | { readonly kind: 'failed'; readonly error: string }

export interface DocumentSessionOptions {
  readonly document: EditorDocumentV1
  readonly revision: number
  readonly bridge: DocumentPersistenceBridge
  readonly correlationId: () => string
  readonly onChange?: (snapshot: DocumentSessionSnapshot) => void
  readonly debounceMs?: number
}

/** Extracts a useful message from native/Tauri rejections, which are plain objects. */
export function describeError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (typeof error === 'object' && error !== null) {
    const nativeError = error as {
      readonly message?: unknown
      readonly error?: unknown
    }
    if (typeof nativeError.message === 'string' && nativeError.message.trim()) {
      return nativeError.message
    }
    if (typeof nativeError.error === 'string' && nativeError.error.trim()) {
      return nativeError.error
    }
  }
  return fallback
}

/** Keeps the DOM-free core object out of Pinia/Vue reactivity. */
export class DocumentSessionController {
  readonly #manager: CommandManager
  readonly #transient = new TransientEditorStateController<unknown>()
  readonly #bridge: DocumentPersistenceBridge
  readonly #correlationId: () => string
  #listeners = new Set<(snapshot: DocumentSessionSnapshot) => void>()
  readonly #debounceMs: number
  #revision: number
  #state: DocumentSaveState = 'saved'
  #error: string | undefined
  #timer: number | undefined
  #inFlight: Promise<DocumentFlushOutcome> | undefined

  constructor(options: DocumentSessionOptions) {
    this.#manager = new CommandManager(
      normalizeEditableDocumentScales(options.document),
    )
    this.#manager.markSaved()
    this.#revision = options.revision
    this.#bridge = options.bridge
    this.#correlationId = options.correlationId
    if (options.onChange) this.#listeners.add(options.onChange)
    this.#debounceMs = options.debounceMs ?? 500
  }

  get snapshot(): DocumentSessionSnapshot {
    return {
      core: this.#manager.snapshot,
      transient: this.#transient.snapshot,
      saveState: this.#state,
      ...(this.#error ? { error: this.#error } : {}),
    }
  }

  execute(command: EditorCommand): DocumentSessionSnapshot {
    const before = this.#manager.snapshot
    const committed = this.#manager.execute(command)
    this.#transient.reconcile(committed.document)
    if (committed.versionToken === before.versionToken) return this.#publish()
    this.#state = 'dirty'
    this.#error = undefined
    this.#scheduleSave()
    return this.#publish()
  }

  undo(): DocumentSessionSnapshot {
    const before = this.#manager.snapshot
    const reverted = this.#manager.undo()
    this.#transient.reconcile(reverted.document)
    if (reverted.versionToken === before.versionToken) return this.#publish()
    this.#state = reverted.dirty ? 'dirty' : 'saved'
    this.#scheduleSave()
    return this.#publish()
  }

  redo(): DocumentSessionSnapshot {
    const before = this.#manager.snapshot
    const replayed = this.#manager.redo()
    this.#transient.reconcile(replayed.document)
    if (replayed.versionToken === before.versionToken) return this.#publish()
    this.#state = 'dirty'
    this.#scheduleSave()
    return this.#publish()
  }

  retry(): Promise<DocumentFlushOutcome> {
    return this.flush()
  }

  exportRecoveryBundle(): Promise<DocumentRecoveryExportOutcome> {
    return this.#bridge.exportRecoveryBundle(
      this.#manager.snapshot.document.id,
      this.#correlationId(),
    )
  }

  subscribe(listener: (snapshot: DocumentSessionSnapshot) => void): () => void {
    this.#listeners.add(listener)
    listener(this.snapshot)
    return () => this.#listeners.delete(listener)
  }

  async flush(): Promise<DocumentFlushOutcome> {
    if (this.#timer !== undefined) {
      window.clearTimeout(this.#timer)
      this.#timer = undefined
    }
    let saved = false
    while (this.#manager.snapshot.dirty) {
      if (!this.#inFlight) this.#inFlight = this.#save()
      const outcome = await this.#inFlight
      if (outcome.kind === 'failed') return outcome
      saved ||= outcome.kind === 'saved'
    }
    return saved ? { kind: 'saved' } : { kind: 'noChanges' }
  }

  dispose(): void {
    if (this.#timer !== undefined) window.clearTimeout(this.#timer)
    this.#timer = undefined
  }

  #scheduleSave(): void {
    if (this.#timer !== undefined) window.clearTimeout(this.#timer)
    this.#timer = window.setTimeout(() => {
      this.#timer = undefined
      void this.flush()
    }, this.#debounceMs)
  }

  async #save(): Promise<DocumentFlushOutcome> {
    const versionToken = this.#manager.snapshot.versionToken
    let saved = false
    this.#state = 'saving'
    this.#publish()
    try {
      const revision = await this.#bridge.saveDocument(
        {
          documentId: this.#manager.snapshot.document.id,
          revision: this.#revision,
          documentJson: serializeEditorDocument(
            this.#manager.snapshot.document,
          ),
        },
        this.#correlationId(),
      )
      this.#revision = revision
      this.#manager.markSaved(versionToken)
      this.#state = this.#manager.snapshot.dirty ? 'dirty' : 'saved'
      this.#error = undefined
      saved = true
      return { kind: 'saved' }
    } catch (error) {
      this.#state = 'error'
      this.#error = describeError(error, 'Unable to save the document.')
      return { kind: 'failed', error: this.#error }
    } finally {
      this.#inFlight = undefined
      this.#publish()
      if (saved && this.#manager.snapshot.dirty) this.#scheduleSave()
    }
  }

  #publish(): DocumentSessionSnapshot {
    const snapshot = this.snapshot
    for (const listener of this.#listeners) listener(snapshot)
    return snapshot
  }
}

export function parsePersistedDocument(
  record: PersistedDocumentRecord,
): ParsedEditorDocument {
  return parseEditorDocument(record.documentJson)
}
