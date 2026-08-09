import {
  CommandManager,
  parseEditorDocument,
  serializeEditorDocument,
  type EditorCommand,
  type EditorDocumentV1,
  type EditorSnapshot,
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
}

export interface DocumentSessionSnapshot {
  readonly core: EditorSnapshot
  readonly saveState: DocumentSaveState
  readonly error?: string
}

export interface DocumentSessionOptions {
  readonly document: EditorDocumentV1
  readonly revision: number
  readonly bridge: DocumentPersistenceBridge
  readonly correlationId: () => string
  readonly onChange?: (snapshot: DocumentSessionSnapshot) => void
  readonly debounceMs?: number
}

/** Keeps the DOM-free core object out of Pinia/Vue reactivity. */
export class DocumentSessionController {
  readonly #manager: CommandManager
  readonly #bridge: DocumentPersistenceBridge
  readonly #correlationId: () => string
  #onChange: (snapshot: DocumentSessionSnapshot) => void
  readonly #debounceMs: number
  #revision: number
  #state: DocumentSaveState = 'saved'
  #error: string | undefined
  #timer: number | undefined
  #inFlight: Promise<void> | undefined

  constructor(options: DocumentSessionOptions) {
    this.#manager = new CommandManager(options.document)
    this.#manager.markSaved()
    this.#revision = options.revision
    this.#bridge = options.bridge
    this.#correlationId = options.correlationId
    this.#onChange = options.onChange ?? (() => undefined)
    this.#debounceMs = options.debounceMs ?? 500
  }

  get snapshot(): DocumentSessionSnapshot {
    return {
      core: this.#manager.snapshot,
      saveState: this.#state,
      ...(this.#error ? { error: this.#error } : {}),
    }
  }

  execute(command: EditorCommand): DocumentSessionSnapshot {
    this.#manager.execute(command)
    this.#state = 'dirty'
    this.#error = undefined
    this.#scheduleSave()
    return this.#publish()
  }

  undo(): DocumentSessionSnapshot {
    this.#manager.undo()
    this.#state = this.#manager.snapshot.dirty ? 'dirty' : 'saved'
    this.#scheduleSave()
    return this.#publish()
  }

  redo(): DocumentSessionSnapshot {
    this.#manager.redo()
    this.#state = 'dirty'
    this.#scheduleSave()
    return this.#publish()
  }

  retry(): Promise<void> {
    return this.flush()
  }

  setOnChange(listener: (snapshot: DocumentSessionSnapshot) => void): void {
    this.#onChange = listener
    listener(this.snapshot)
  }

  async flush(): Promise<void> {
    if (this.#timer !== undefined) {
      window.clearTimeout(this.#timer)
      this.#timer = undefined
    }
    if (!this.#manager.snapshot.dirty) return
    if (!this.#inFlight) this.#inFlight = this.#save()
    await this.#inFlight
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

  async #save(): Promise<void> {
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
    } catch (error) {
      this.#state = 'error'
      this.#error = error instanceof Error ? error.message : String(error)
    } finally {
      this.#inFlight = undefined
      this.#publish()
      if (saved && this.#manager.snapshot.dirty) this.#scheduleSave()
    }
  }

  #publish(): DocumentSessionSnapshot {
    const snapshot = this.snapshot
    this.#onChange(snapshot)
    return snapshot
  }
}

export function parsePersistedDocument(
  record: PersistedDocumentRecord,
): EditorDocumentV1 | undefined {
  const parsed = parseEditorDocument(record.documentJson)
  return parsed.kind === 'editable' ? parsed.document : undefined
}
