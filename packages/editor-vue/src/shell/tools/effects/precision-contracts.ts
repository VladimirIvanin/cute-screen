import type { EditorDocumentV1, LayerNode } from '@cute-screen/editor-renderer'
import type { PrecisionToolDefaults } from '../../types'
import type { PrecisionTool } from '../precision-schema'
import type { PrecisionSettingsEffect } from './contracts'

export type PrecisionLayer = Extract<
  LayerNode,
  { readonly kind: PrecisionTool }
>

export interface PrecisionEffectState<T extends PrecisionTool> {
  readonly defaults: PrecisionToolDefaults
  readonly selected: Extract<PrecisionLayer, { readonly kind: T }> | undefined
  readonly document: EditorDocumentV1
}

export type PrecisionEffectResolver<T extends PrecisionTool> = (
  id: string,
  value: string,
  state: PrecisionEffectState<T>,
) => PrecisionSettingsEffect

export function defaultsEffect(
  value: PrecisionToolDefaults,
): PrecisionSettingsEffect {
  return { kind: 'defaults', value }
}

export const HANDLED: PrecisionSettingsEffect = { kind: 'handled' }
export const UNHANDLED: PrecisionSettingsEffect = { kind: 'unhandled' }
