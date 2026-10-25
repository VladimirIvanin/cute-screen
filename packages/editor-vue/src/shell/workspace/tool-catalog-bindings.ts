import {
  computed,
  watch,
} from 'vue'
import type { ResolvedEditorShellProps } from '../contracts'
import type { useEditorShellStore } from '../store'
import type { createWorkspaceState } from './workspace-state'
import { createToolCatalog } from '../tools/catalog'

interface WorkspaceToolCatalogContext {
  readonly props: ResolvedEditorShellProps
  readonly store: ReturnType<typeof useEditorShellStore>
  readonly workspace: Pick<ReturnType<typeof createWorkspaceState>, 'contentImageImporting' | 'activeDocument'>
}

export function createWorkspaceToolCatalog(context: WorkspaceToolCatalogContext) {
  const { props, store, workspace } = context
  const hasInteractiveDocument = computed(() => props.documentSession !== undefined || props.fixture === 'ready')
  const { tools } = createToolCatalog({
    quickMode: props.quickMode,
    quickToolOrder: computed(() => store.preferences.quickToolOrder),
    quickHiddenTools: computed(() => store.preferences.quickHiddenTools),
    readOnlyDocument: computed(() => props.readOnlyDocument),
    contentImageBridgeAvailable: computed(() => Boolean(props.contentImageBridge)),
    contentImageImporting: workspace.contentImageImporting,
    hasInteractiveDocument,
    hasCanvas: computed(() => Boolean(workspace.activeDocument.value)),
  })
  watch(() => store.preferences.quickHiddenTools, () => {
    if (
      props.quickMode &&
      store.activeToolId &&
      !tools.value.some((tool) => tool.id === store.activeToolId)
    ) {
      store.selectTool('select')
    }
  })
  return { tools }
}
