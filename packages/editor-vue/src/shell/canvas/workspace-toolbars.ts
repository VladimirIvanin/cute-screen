import {
  createFloatingToolbarController,
  type FloatingToolbarContext,
} from './floating-toolbar-controller'
import type { CanvasViewportProps } from './contracts'
import type { createCanvasWorkspaceState } from './workspace-state'

type Geometry = Pick<FloatingToolbarContext,
  'outputBounds' | 'selectedLayer' | 'previewLayer' | 'layerBounds' | 'transformPoint'>

export function createWorkspaceToolbars(
  props: CanvasViewportProps,
  state: ReturnType<typeof createCanvasWorkspaceState>,
  geometry: Geometry,
) {
  return createFloatingToolbarController({
    props,
    ...geometry,
    textEditor: state.textEditor,
    textFloatingToolbar: state.textFloatingToolbar,
    arrowFloatingToolbar: state.arrowFloatingToolbar,
    scrollContainer: state.scrollContainer,
    floatingToolbarLayout: state.floatingToolbarLayout,
    floatingArrowToolbarLayout: state.floatingArrowToolbarLayout,
    editing: () => Boolean(state.editingText.value),
  })
}
