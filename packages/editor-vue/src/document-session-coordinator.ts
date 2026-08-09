import type { EditorDocumentV1 } from '@cute-screen/editor-renderer'

import {
  DocumentSessionController,
  type DocumentFlushOutcome,
  type DocumentPersistenceBridge,
} from './document-session'

export interface CoordinatedDocumentRecord {
  readonly documentId: string
  readonly revision: number
  readonly document: EditorDocumentV1
}

export type DocumentHandoffOutcome =
  | { readonly kind: 'switched' }
  | {
      readonly kind: 'failed'
      readonly flush: Extract<DocumentFlushOutcome, { kind: 'failed' }>
    }

export interface DocumentSessionCoordinatorOptions {
  readonly bridge: DocumentPersistenceBridge
  readonly correlationId: () => string
  readonly onActiveSession: (
    session: DocumentSessionController | undefined,
  ) => void
}

/** Serializes session replacement without putting editor-core into Vue reactivity. */
export class DocumentSessionCoordinator {
  readonly #bridge: DocumentPersistenceBridge
  readonly #correlationId: () => string
  readonly #onActiveSession: (
    session: DocumentSessionController | undefined,
  ) => void
  #active: DocumentSessionController | undefined
  #pending: CoordinatedDocumentRecord | undefined

  constructor(options: DocumentSessionCoordinatorOptions) {
    this.#bridge = options.bridge
    this.#correlationId = options.correlationId
    this.#onActiveSession = options.onActiveSession
  }

  get active(): DocumentSessionController | undefined {
    return this.#active
  }

  get pending(): CoordinatedDocumentRecord | undefined {
    return this.#pending
  }

  openInitial(record: CoordinatedDocumentRecord): void {
    if (this.#active) throw new Error('initial document session already exists')
    this.#install(record)
  }

  async handoff(
    record: CoordinatedDocumentRecord,
  ): Promise<DocumentHandoffOutcome> {
    if (this.#active) {
      const flush = await this.#active.flush()
      if (flush.kind === 'failed') {
        this.#pending = record
        return { kind: 'failed', flush }
      }
      this.#active.dispose()
    }
    this.#pending = undefined
    this.#install(record)
    return { kind: 'switched' }
  }

  async retryPendingHandoff(): Promise<DocumentHandoffOutcome | undefined> {
    const pending = this.#pending
    return pending ? this.handoff(pending) : undefined
  }

  dispose(): void {
    this.#active?.dispose()
    this.#active = undefined
    this.#pending = undefined
    this.#onActiveSession(undefined)
  }

  #install(record: CoordinatedDocumentRecord): void {
    const session = new DocumentSessionController({
      document: record.document,
      revision: record.revision,
      bridge: this.#bridge,
      correlationId: this.#correlationId,
    })
    this.#active = session
    this.#onActiveSession(session)
  }
}
