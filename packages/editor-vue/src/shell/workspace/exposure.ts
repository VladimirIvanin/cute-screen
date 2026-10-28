import type { Ref } from 'vue'
import type { CanvasViewportExpose } from '../canvas/contracts'
import type { useEditorShellStore } from '../store'

type NavigationStore = Pick<ReturnType<typeof useEditorShellStore>, 'zoom' | 'zoomMode' | 'setZoom' | 'enableFit' | 'runAction' | 'canCopyOrExport' | 'actionState'>
export function createWorkspaceExposure(
  canvas: Ref<CanvasViewportExpose | undefined>,
  store: NavigationStore,
  props: { readonly readOnlyDocument: boolean },
) {
  return {
    isAgentBusy: () => Boolean(canvas.value?.isAgentBusy() || props.readOnlyDocument),
    prepareNavigation: () => new Promise<{ zoom: number; mode: 'fit' | 'custom' }>((resolve) => {
      const finish = () => {
        canvas.value?.applyCropDraft()
        resolve({ zoom: store.zoom, mode: store.zoomMode })
      }
      if (canvas.value) canvas.value.finishTextEditing(finish)
      else finish()
    }),
    restoreZoom: (viewport: { zoom: number; mode: string }) => {
      store.setZoom(viewport.zoom)
      if (viewport.mode === 'fit') store.enableFit()
    },
    runFileAction: (action: 'openImage' | 'export') => store.runAction(action),
    canExport: () => store.canCopyOrExport && store.actionState.status !== 'pending' && !props.readOnlyDocument,
  }
}
