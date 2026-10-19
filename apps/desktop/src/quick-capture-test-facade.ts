import type { EditorDocumentV1 } from '@cute-screen/editor-vue'

export interface QuickWarmupEvidence {
  document: string | null
  ready: boolean
  overlay: string
  warmupAt: number
  revealedAt?: number
}

/** Read-only evidence for native E2E; never mounts or changes a document. */
export function installQuickCaptureTestFacade(snapshot: () => EditorDocumentV1 | undefined): {
  recordWarmup(): void
  recordReveal(): void
  dispose(): void
} {
  const samples: QuickWarmupEvidence[] = []
  const state = window as typeof window & { __cuteScreenE2eQuick?: {
    snapshot(): EditorDocumentV1 | undefined
    warmups(): readonly QuickWarmupEvidence[]
  } }
  state.__cuteScreenE2eQuick = { snapshot, warmups: () => samples.map((sample) => ({ ...sample })) }
  return {
    recordWarmup() {
      const root = document.querySelector('.cs-quick-capture')
      const overlay = document.querySelector('.cs-canvas-overlay')
      samples.push({
        warmupAt: Date.now(),
        document: snapshot()?.id ?? null,
        ready: root?.classList.contains('is-layout-ready') ?? false,
        overlay: overlay ? getComputedStyle(overlay).visibility : 'missing',
      })
    },
    recordReveal() {
      const sample = samples.at(-1)
      if (sample) sample.revealedAt = Date.now()
    },
    dispose() {
      delete state.__cuteScreenE2eQuick
    },
  }
}
