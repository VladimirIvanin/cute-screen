import type { CanvasViewportEmit, CanvasViewportProps } from './contracts'
import { CanvasWorkspaceController } from './canvas-workspace-controller'

export function useCanvasWorkspace(
  props: CanvasViewportProps,
  emit: CanvasViewportEmit,
) {
  return new CanvasWorkspaceController(props, emit).bindings()
}
