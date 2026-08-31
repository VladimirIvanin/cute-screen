import type { EditorCommand, LayerNode } from '@cute-screen/editor-renderer'
import type { PrecisionToolDefaults } from '../../types'

export type ToolSettingsEffect<TDefaults = never> =
  | { readonly kind: 'unhandled' }
  | { readonly kind: 'handled' }
  | { readonly kind: 'defaults'; readonly value: TDefaults }
  | {
      readonly kind: 'command'
      readonly command: EditorCommand
    }

export type PrecisionSettingsEffect = ToolSettingsEffect<PrecisionToolDefaults>

export function updateLayerEffect(
  before: LayerNode,
  after: LayerNode,
): ToolSettingsEffect<never> {
  return {
    kind: 'command',
    command: { type: 'updateLayer', before, after },
  }
}
