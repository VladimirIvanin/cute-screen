import type { Ref, ShallowRef } from 'vue'
import type { EditorDocumentV1 } from '@cute-screen/editor-renderer'
import type { ResolvedEditorShellProps } from '../../contracts'
import type { PrecisionToolDefaults } from '../../types'
import type { PrecisionTool } from '../precision-schema'
import type { PrecisionSettingsEffect } from './contracts'
import { resolveCensorEffect } from './precision-censor'
import type { PrecisionLayer } from './precision-contracts'
import { resolveLoupeEffect } from './precision-loupe'
import { resolveRulerEffect } from './precision-ruler'
import { resolveSpotlightEffect } from './precision-spotlight'

export interface PrecisionEffectsContext {
  readonly props: ResolvedEditorShellProps
  readonly activeDocument: Ref<EditorDocumentV1 | undefined>
  readonly precisionDefaults: ShallowRef<PrecisionToolDefaults>
  readonly selectedPrecisionLayer: () => PrecisionLayer | undefined
}

export function precisionToolForControl(id: string): PrecisionTool | undefined {
  return (['censor', 'spotlight', 'ruler', 'loupe'] as const).find((tool) =>
    id.startsWith(tool),
  )
}

function resolvePrecisionEffect(
  context: PrecisionEffectsContext,
  id: string,
  value: string,
): PrecisionSettingsEffect {
  const tool = precisionToolForControl(id)
  if (!tool) return { kind: 'unhandled' }
  const document = context.activeDocument.value
  const candidate = context.selectedPrecisionLayer()
  const selected = candidate?.kind === tool ? candidate : undefined
  if (!document || context.props.readOnlyDocument || selected?.locked) {
    return { kind: 'handled' }
  }
  const common = { defaults: context.precisionDefaults.value, document }
  if (tool === 'censor') {
    return resolveCensorEffect(id, value, {
      ...common,
      selected: selected?.kind === 'censor' ? selected : undefined,
    })
  }
  if (tool === 'spotlight') {
    return resolveSpotlightEffect(id, value, {
      ...common,
      selected: selected?.kind === 'spotlight' ? selected : undefined,
    })
  }
  if (tool === 'ruler') {
    return resolveRulerEffect(id, value, {
      ...common,
      selected: selected?.kind === 'ruler' ? selected : undefined,
    })
  }
  return resolveLoupeEffect(id, value, {
    ...common,
    selected: selected?.kind === 'loupe' ? selected : undefined,
  })
}

export function createPrecisionEffects(context: PrecisionEffectsContext) {
  function applyPrecisionChange(id: string, value: string): boolean {
    const effect = resolvePrecisionEffect(context, id, value)
    if (effect.kind === 'unhandled') return false
    if (effect.kind === 'defaults') {
      context.precisionDefaults.value = effect.value
    } else if (effect.kind === 'command') {
      context.props.documentSession?.execute(effect.command)
    }
    return true
  }
  function precisionChangeBlocked(id: string): boolean {
    const tool = precisionToolForControl(id)
    if (!tool) return false
    const selected = context.selectedPrecisionLayer()
    return (
      !context.activeDocument.value ||
      context.props.readOnlyDocument ||
      (selected?.kind === tool && Boolean(selected.locked))
    )
  }
  return { applyPrecisionChange, precisionChangeBlocked }
}
