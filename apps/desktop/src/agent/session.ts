import {
  createAgentEditCommand,
  type AgentEdit,
} from '@cute-screen/editor-vue'
import type { DocumentSessionController } from '@cute-screen/editor-vue'

/** Lives outside Vue reactivity. Epoch advances on Undo as well as forward edits. */
export class AgentSession {
  #live: DocumentSessionController | undefined
  #stop: (() => void) | undefined
  #epoch = 0
  #identity = crypto.randomUUID()
  #version = -1
  #requests = new Map<string, { fingerprint: string; result: Promise<ReturnType<AgentSession['snapshot']> & { applied: true }> }>()

  snapshot(live: DocumentSessionController) {
    if (this.#live !== live) {
      this.#stop?.()
      this.#live = live
      this.#identity = crypto.randomUUID()
      this.#epoch = 0
      this.#version = -1
      this.#requests.clear()
      this.#stop = live.subscribe((snapshot) => {
        if (snapshot.core.versionToken === this.#version) return
        this.#version = snapshot.core.versionToken
        this.#epoch += 1
      })
    }
    const snapshot = live.snapshot
    return { document: snapshot.core.document, stateToken: `${this.#identity}:${this.#epoch}`,
      canUndo: snapshot.core.canUndo, canRedo: snapshot.core.canRedo, saveState: snapshot.saveState,
      ...(snapshot.error ? { saveError: snapshot.error } : {}) }
  }

  assert(
    live: DocumentSessionController,
    args: { documentId: string; expectedStateToken: string },
    busy: boolean,
  ) {
    if (busy || live.snapshot.transient.draft !== null) throw new Error('busy: finish the current user interaction')
    const snapshot = this.snapshot(live)
    if (snapshot.document.id !== args.documentId || snapshot.stateToken !== args.expectedStateToken)
      throw new Error('conflict: reread get_document before editing')
    if (snapshot.saveState === 'readOnly') throw new Error('readOnly: document cannot be edited')
    return snapshot
  }

  async edit(
    live: DocumentSessionController,
    args: { documentId: string; expectedStateToken: string; requestId: string; operations: readonly AgentEdit[] },
    busy: boolean,
  ) {
    this.snapshot(live)
    if (!args.requestId || args.requestId.length > 256) throw new Error('invalid requestId')
    const fingerprint = JSON.stringify(args)
    const cached = this.#requests.get(args.requestId)
    if (cached) {
      if (cached.fingerprint !== fingerprint) throw new Error('requestId reused with different arguments')
      return cached.result
    }
    this.assert(live, args, busy)
    const command = createAgentEditCommand(live.snapshot.core.document, args.operations, () => crypto.randomUUID())
    live.execute(command, { space: 'document' })
    const after = this.snapshot(live)
    const result = live.flush().then(() => ({ ...after, saveState: live.snapshot.saveState,
      ...(live.snapshot.error ? { saveError: live.snapshot.error } : {}), applied: true as const }))
    this.#requests.set(args.requestId, { fingerprint, result })
    while (this.#requests.size > 512) {
      const key = this.#requests.keys().next().value
      if (key !== undefined) this.#requests.delete(key)
    }
    return result
  }

  dispose(): void {
    this.#stop?.()
    this.#stop = undefined
    this.#live = undefined
    this.#requests.clear()
  }
}
