import {
  provide,
  watch,
  onBeforeUnmount,
} from 'vue'
import {
  numericPreviewKey,
  numericLocaleKey,
} from '../ui/numeric-preview'
import { NumericPreviewController } from './numeric-preview-controller'
import type { createWorkspaceState } from './workspace-state'
import type { createWorkspaceBindings } from './workspace-bindings'
import type { ResolvedEditorShellProps } from '../contracts'
import type { useEditorShellStore } from '../store'
import { shortcutLetter } from '../../keyboard-shortcuts'

export function useNumericPreview(
  workspace: ReturnType<typeof createWorkspaceState>,
  props: ResolvedEditorShellProps,
  store: ReturnType<typeof useEditorShellStore>,
  bindings: ReturnType<typeof createWorkspaceBindings>,
): void {
  const numericPreview = new NumericPreviewController({
    document: () => workspace.activeDocument.value,
    readOnly: () => props.readOnlyDocument,
    inlineText: () => Boolean(workspace.textDraft.value),
    commands: bindings.numericCommands,
    inlinePatch: bindings.previewInline,
    showDocument: (document) => {
      workspace.numericPreviewDocument.value = document
    },
    showText: (patch) => {
      workspace.textFormatting.value = patch
    },
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
  })
  provide(numericPreviewKey, numericPreview)
  provide(numericLocaleKey, () => store.locale)
  watch([
    () => workspace.activeDocument.value,
    () => store.selectedLayerIds.join(','),
    () => store.activeToolId,
    () => workspace.toolConfigure.value?.toolId,
    () => workspace.textDraft.value?.id,
    () => props.readOnlyDocument,
  ], () => numericPreview.cancel(), { flush: 'sync' })
  watch(() => store.actionState.status, (status) => {
    if (status === 'pending') numericPreview.cancel()
  }, { flush: 'sync' })
  const cancelNumericForShortcut = (event: KeyboardEvent) => {
    if (
      !event.defaultPrevented &&
      !event.isComposing &&
      (event.ctrlKey ||
        event.metaKey) &&
        ['z', 'y', 's'].includes(shortcutLetter(event) ?? '')
    ) numericPreview.cancel()
  }
  document.addEventListener('keydown', cancelNumericForShortcut, true)
  onBeforeUnmount(() => {
    numericPreview.cancel()
    document.removeEventListener('keydown', cancelNumericForShortcut, true)
  })
}
