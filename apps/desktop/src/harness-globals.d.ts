import type { EditorDocumentV1 } from '@cute-screen/editor-vue'

declare global {
  interface Window {
    __cuteScreenE2eM05Save?: { complete(): void; fail(message: string): void }
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
    __cuteScreenE2eM05?: {
      snapshot(): EditorDocumentV1 | undefined
      versionToken(): number | undefined
      waitForRender(): Promise<void>
    }
    __cuteScreenE2eM08?: {
      snapshot():
        | {
          document: EditorDocumentV1
          decodedSource?: {
            width: number
            height: number
          }
          clipboardText?: string
        }
        | undefined
      readClipboardText(): Promise<string | undefined>
      waitForRender(): Promise<void>
    }
  }
}
