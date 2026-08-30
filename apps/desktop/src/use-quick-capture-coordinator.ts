import { readonly, ref, type Ref } from 'vue'

import type { DesktopBridge } from './desktop-bridge'
import type {
  CaptureCompletion,
  CaptureOutcomeV2,
  QuickCaptureDraftV1,
  QuickCaptureSelectionV1,
} from './generated/desktop-ipc'

export type QuickCapturePhase =
  'idle' | 'selecting' | 'editing' | 'preparing' | 'committing' | 'committed'

export interface QuickCaptureCoordinator {
  readonly phase: Readonly<Ref<QuickCapturePhase>>
  projectDraft(draft: QuickCaptureDraftV1): void
  reset(): void
  confirmSelection(
    draftId: string,
    selection: QuickCaptureSelectionV1,
  ): Promise<boolean>
  commit(
    draftId: string,
    png: Uint8Array,
    documentJson: string,
    completion: CaptureCompletion,
    selection: QuickCaptureSelectionV1,
  ): Promise<CaptureOutcomeV2>
  cancel(draftId: string): Promise<boolean>
}

/** Thin projection of the native coordinator. Rust remains authoritative; the
 * composable only prevents the WebView from presenting impossible local
 * phases while an IPC transition is in flight. */
export function useQuickCaptureCoordinator(
  bridge: Pick<
    DesktopBridge,
    | 'quickCaptureConfirmSelection'
    | 'quickCapturePreparePng'
    | 'quickCaptureCommit'
    | 'quickCaptureCancel'
  >,
): QuickCaptureCoordinator {
  const phase = ref<QuickCapturePhase>('idle')

  return {
    phase: readonly(phase),
    projectDraft(draft) {
      phase.value = draft.selectionPending ? 'selecting' : 'editing'
    },
    reset() {
      phase.value = 'idle'
    },
    async confirmSelection(draftId, selection) {
      const confirmed = await bridge.quickCaptureConfirmSelection(
        draftId,
        selection,
      )
      if (confirmed) phase.value = 'editing'
      return confirmed
    },
    async commit(draftId, png, documentJson, completion, selection) {
      phase.value = 'preparing'
      try {
        await bridge.quickCapturePreparePng(png)
        phase.value = 'committing'
        const outcome = await bridge.quickCaptureCommit(
          draftId,
          documentJson,
          completion,
          selection,
        )
        phase.value = 'committed'
        return outcome
      } catch (error) {
        phase.value = 'editing'
        throw error
      }
    },
    async cancel(draftId) {
      const cancelled = await bridge.quickCaptureCancel(draftId)
      if (cancelled) phase.value = 'idle'
      return cancelled
    },
  }
}
