import type {
  ClipboardBridge,
  DocumentSessionController,
} from '@cute-screen/editor-vue'
import type { ShallowRef } from 'vue'
import type { AppHarnessConfig } from './app-harness-config'

export interface M08HarnessPorts {
  readonly documentSession: ShallowRef<DocumentSessionController | undefined>
  readonly sourceImage: ShallowRef<HTMLImageElement | undefined>
  readonly clipboardBridge: ShallowRef<ClipboardBridge | undefined>
  readonly correlationId: () => string
}

export class M08HarnessController {
  readonly #config: AppHarnessConfig
  readonly #ports: M08HarnessPorts
  #browserClipboardText: string | undefined

  constructor(config: AppHarnessConfig, ports: M08HarnessPorts) {
    this.#config = config
    this.#ports = ports
  }

  installFacade(): void {
    if (!this.#config.m08) return
    window.__cuteScreenE2eM08 = {
      snapshot: () => {
        const document =
          this.#ports.documentSession.value?.snapshot.core.document
        if (!document) return undefined
        const image = this.#ports.sourceImage.value
        return {
          document,
          ...(image
            ? {
                decodedSource: {
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                },
              }
            : {}),
          ...(this.#browserClipboardText
            ? { clipboardText: this.#browserClipboardText }
            : {}),
        }
      },
      readClipboardText: async () => {
        const bridge = this.#ports.clipboardBridge.value
        if (!bridge) return this.#browserClipboardText
        const snapshot = await bridge.readClipboardSnapshot(
          this.#ports.correlationId(),
        )
        return snapshot.text
      },
    }
  }

  installBrowserClipboardBridge(): void {
    if (!this.#config.m08 || !this.#config.m05) return
    this.#ports.clipboardBridge.value = {
      readClipboardSnapshot: async () => ({
        ...(this.#browserClipboardText
          ? { text: this.#browserClipboardText }
          : {}),
      }),
      writeClipboardText: async (text) => {
        if (this.#config.m08ClipboardError) throw new Error('clipboard busy')
        this.#browserClipboardText = text
      },
      stageImage: async () => {
        throw new Error('M08 browser clipboard does not provide bitmap data')
      },
      readImageBytes: async () => {
        throw new Error('M08 browser clipboard does not provide image bytes')
      },
    }
  }
}
