import type { EditorDocumentV1 } from '@cute-screen/editor-vue'

export interface QuickWarmupEvidence {
  document: string | null
  ready: boolean
  overlay: string
}

/** Read-only evidence for native E2E; never mounts or changes a document. */
export function installQuickCaptureTestFacade(snapshot: () => EditorDocumentV1 | undefined): {
  recordWarmup(): void
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
        document: snapshot()?.id ?? null,
        ready: root?.classList.contains('is-layout-ready') ?? false,
        overlay: overlay ? getComputedStyle(overlay).visibility : 'missing',
      })
    },
    dispose() {
      delete state.__cuteScreenE2eQuick
    },
  }
}
