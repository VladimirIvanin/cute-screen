import type { EditorDocumentV1 } from '@cute-screen/editor-vue'
import { e2eWindowAdapter } from './platform/tauri/e2e-window-adapter'

declare global {
  interface Window {
    __cuteScreenE2eWindow?: {
      close(): Promise<void>
      hide(): Promise<void>
      isDecorated(): Promise<boolean>
      isVisible(): Promise<boolean>
    }
    __cuteScreenE2eDocument?: {
      setCrop(): void
      snapshot():
        | {
            crop: unknown
            layers: EditorDocumentV1['layers']
            saveState: string
          }
        | undefined
    }
  }
}

/**
 * Test-only facade over the real Tauri window API. It is available exclusively
 * in the harness bundle and allows E2E to assert native window behaviour.
 */
window.__cuteScreenE2eWindow = e2eWindowAdapter
