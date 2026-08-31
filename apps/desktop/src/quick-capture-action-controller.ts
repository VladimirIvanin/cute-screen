import type {
  CanvasViewportHosts,
  QuickCaptureDraftV1,
} from '@cute-screen/editor-vue'
import type { Ref, ShallowRef } from 'vue'
import { tauriDesktopBridge } from './desktop-bridge'
import { cancelQuickCaptureAction } from './quick-capture-actions'
import type { QuickCaptureCommitController } from './quick-capture-commit-controller'
import type { useQuickCaptureCoordinator } from './use-quick-capture-coordinator'

type Coordinator = ReturnType<typeof useQuickCaptureCoordinator>

export interface QuickCaptureActionPorts {
  readonly hosts: ShallowRef<CanvasViewportHosts | undefined>
  readonly draft: ShallowRef<QuickCaptureDraftV1 | undefined>
  readonly pending: Ref<boolean>
  readonly error: Ref<string | undefined>
  readonly materialized: Ref<boolean>
  readonly selectionPending: Ref<boolean>
  readonly coordinator: Coordinator
  readonly commit: QuickCaptureCommitController
  readonly dismissWindow: () => Promise<void>
}

export class QuickCaptureActionController {
  readonly #ports: QuickCaptureActionPorts

  constructor(ports: QuickCaptureActionPorts) {
    this.#ports = ports
  }

  async copy(): Promise<void> {
    if (!this.#ports.hosts.value) return
    await this.#run(async () => {
      const selection = this.#ports.commit.physicalSelection()
      const png = await this.#ports.commit.resultPng(selection)
      await this.#ports.commit.commit('copied', png, selection)
      await tauriDesktopBridge.quickCaptureCopyPng(png)
      await this.#ports.dismissWindow()
    })
  }

  async save(): Promise<void> {
    if (!this.#ports.hosts.value) return
    await this.#run(async () => {
      const selection = this.#ports.commit.physicalSelection()
      const png = await this.#ports.commit.resultPng(selection)
      const selected = await tauriDesktopBridge.quickCaptureChooseSavePng()
      if (!selected) return
      await this.#ports.commit.commit('saved', png, selection)
      await tauriDesktopBridge.quickCaptureWriteSavePng(png)
      await this.#ports.dismissWindow()
    })
  }

  async openEditor(): Promise<void> {
    await this.#run(async () => {
      if (this.#ports.materialized.value) {
        await tauriDesktopBridge.quickCaptureOpenEditor()
      } else {
        await this.#ports.commit.commit('editor')
      }
      await this.#ports.dismissWindow()
    })
  }

  async cancel(): Promise<void> {
    if (this.#ports.pending.value) return
    const { pending, error, draft, coordinator } = this.#ports
    pending.value = true
    error.value = undefined
    try {
      await cancelQuickCaptureAction({
        draftId: draft.value?.draftId,
        cancelDraft: coordinator.cancel,
        closeWindow: this.#ports.dismissWindow,
      })
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      pending.value = false
    }
  }

  keydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || this.#ports.pending.value) return
    if (isEditableTarget(event.target)) return
    if (event.key === 'Enter' && !event.repeat) {
      if (this.#ports.selectionPending.value) return
      event.preventDefault()
      void this.copy()
    } else if (event.key === 'Escape' && !event.repeat) {
      event.preventDefault()
      void this.cancel()
    }
  }

  async #run(action: () => Promise<void>): Promise<void> {
    const { pending, error, commit } = this.#ports
    pending.value = true
    error.value = undefined
    try {
      await action()
    } catch (cause) {
      await commit.detectMaterializedAfterError()
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      pending.value = false
    }
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}
