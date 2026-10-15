import type { EditorDocumentV1 } from '@cute-screen/editor-vue'

/** Read-only evidence for native-input E2E; never mounts or changes a document. */
export function installQuickCaptureTestFacade(snapshot: () => EditorDocumentV1 | undefined): () => void {
  const state = window as typeof window & { __cuteScreenE2eQuick?: { snapshot(): EditorDocumentV1 | undefined } }
  state.__cuteScreenE2eQuick = { snapshot }
  return () => {
    delete state.__cuteScreenE2eQuick
  }
}
